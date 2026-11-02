// Falešné API Kingdoms Connected pro testy: jen tolik globálů z @kingdomsconnected/types, kolik loutna a tanec
// používají, chovajících se podle jejich dokumentace. Sdílí ho test loutny i tance (tanec/kcdc/test).
import vm from "node:vm";

export type Fn = (...a: any[]) => any;

export class Vec {
  constructor(public x: number, public y: number, public z: number) {}
  distance(o: Vec) {
    return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z);
  }
}

/** změna stavu entity, jak ji dostal jeden klient: [entita, klíč, hodnota (undefined = smazaný), předchozí] */
export type StavZmena = [number, string, any, any];

/**
 * Síť falešného serveru: kolik zpráv by odešlo klientům. Událost hráči (player.emit) = 1 zpráva, Events.emitAllClients
 * = 1 zpráva každému hráči. Změna stavu entity (StateBag) = 1 zpráva každému, kdo entitu streamuje (stejný svět, do
 * dosahStreamu m, a vlastník sám sebe): horní odhad, KCDC změny jednoho ticku pro jednoho klienta posílá v jedné zprávě.
 * Pozdě příchozí dostane stav v počátečních datech entity (seed), samostatná zpráva to není.
 */
export interface FakeSit {
  dosahStreamu: number;
  udalosti: Map<string, number>;           // název události -> zpráv
  stav: Map<string, number>;               // klíč stavu -> zpráv
  bajty: number;                           // délka JSON všech zpráv (bez hlaviček)
}

export interface FakeServer {
  ctx: vm.Context;
  sit: FakeSit;
  fire: (name: string, ...args: unknown[]) => void;
  emitted: [string, any[]][];              // Events.emit (mezi resources)
  toAll: [string, any][];
  chat: [number, string][];
  dialogs: { player: number; page: any; session: number }[];
  voice: { talking: Set<number>; range: Map<number, number>; tier: Map<number, number> };
  exportsReg: Map<string, Map<string, unknown>>;
  props: any[];                            // Prop.spawn (živé)
  onClient: Map<string, Fn>;
  players: any[];
  P: any;
  client: (name: string, p: any, payload?: unknown) => void;
  load: (resource: string, code: string, config?: object) => void;
}

export function fakeServer(): FakeServer {
  const on = new Map<string, Fn[]>();
  const onClient = new Map<string, Fn>();
  const emitted: [string, any[]][] = [];
  const toAll: [string, any][] = [];
  const chat: [number, string][] = [];
  const dialogs: { player: number; page: any; session: number }[] = [];
  const exportsReg = new Map<string, Map<string, unknown>>();
  let session = 0;
  const registered = new Map<string, any>();
  let rowId = 0;
  const voice = { talking: new Set<number>(), range: new Map<number, number>(), tier: new Map<number, number>() };
  const tierRange = [3, 25, 50];
  const fire = (name: string, ...args: unknown[]) => (on.get(name) ?? []).forEach((f) => f(...args));
  const sit: FakeSit = { dosahStreamu: 250, udalosti: new Map(), stav: new Map(), bajty: 0 };
  const zprava = (m: Map<string, number>, k: string, n: number, json: string) => {
    m.set(k, (m.get(k) ?? 0) + n);
    sit.bajty += n * json.length;
  };

  /** kdo entitu e streamuje: ona sama (vlastník) a hráči ve stejném světě do dosahStreamu */
  const streamuji = (e: Player) => Player.list.filter((o) => o === e || (o.virtualWorld === e.virtualWorld && o.position.distance(e.position) <= sit.dosahStreamu));

  // StateBag jako v KCDC (Framework ~40.1): zapisuje jen server, hodnota do 4 KB (JSON), klíč do 64 bajtů, nejvýš 128
  // klíčů; stejná hodnota se nepošle znovu (set vrátí false); onChange (klíč nebo null) a globální entityStateChange
  class StateBag {
    private data = new Map<string, { json: string; scope: string }>();
    private handlers: [string | null, Fn][] = [];
    constructor(private ent: Player) {}
    get(key: string) {
      const v = this.data.get(key);
      return v === undefined ? undefined : JSON.parse(v.json);
    }
    has(key: string) {
      return this.data.has(key);
    }
    keys() {
      return [...this.data.keys()].sort();
    }
    toObject() {
      return Object.fromEntries([...this.data].map(([k, v]) => [k, JSON.parse(v.json)]));
    }
    set(key: string, value: unknown, options: { scope?: "broadcast" | "owner" | "server" } = {}) {
      if (Buffer.byteLength(key) > 64) throw new Error("StateBag.set: key is longer than 64 bytes");
      const json = JSON.stringify(value) ?? "null";
      if (Buffer.byteLength(json) > 4096) throw new Error("StateBag.set: value is larger than 4096 bytes");
      const scope = options.scope ?? "broadcast";
      const prev = this.data.get(key);
      if (!prev && this.data.size >= 128) throw new Error("StateBag.set: entity holds 128 keys");
      if (prev && prev.json === json && prev.scope === scope) return false;
      this.data.set(key, { json, scope });
      this.zmena(key, JSON.parse(json), prev ? JSON.parse(prev.json) : undefined, scope, json);
      return true;
    }
    remove(key: string) {
      const prev = this.data.get(key);
      if (!prev) return false;
      this.data.delete(key);
      this.zmena(key, undefined, JSON.parse(prev.json), prev.scope, "null");
      return true;
    }
    onChange(key: string | null, handler: Fn) {
      const h: [string | null, Fn] = [key, handler];
      this.handlers.push(h);
      return () => void this.handlers.splice(this.handlers.indexOf(h), 1);
    }
    private zmena(key: string, value: unknown, previous: unknown, scope: string, json: string) {
      for (const [k, f] of [...this.handlers]) if (k === null || k === key) f(key, value, previous);
      fire("entityStateChange", this.ent, key, value, previous);
      if (scope === "server") return;
      const komu = scope === "owner" ? [this.ent] : streamuji(this.ent);
      for (const o of komu) o.stavy.push([this.ent.id, key, value, previous]);
      zprava(sit.stav, key, komu.length, json);
    }
  }

  class Player {
    static list: Player[] = [];
    anims: any[] = [];
    emitted: [string, any][] = [];
    items: { id: string; item: string; name: string; amount: number; metadata: any }[] = [];
    alive = true;
    mounted = false;
    carriedItem = null;
    carrying = null;
    virtualWorld = 0;
    talking: [boolean, string?][] = [];
    appearance: { gender: "male" | "female" } = { gender: "male" };
    lookDirection = new Vec(0, 1, 0);
    spawned: [any, any][] = [];
    /** změny stavu entit, které dostal klient tohoto hráče (streamuje je) */
    stavy: StavZmena[] = [];
    readonly state = new StateBag(this);
    constructor(public id: number, public nickname: string, public position: Vec) {}
    spawn(pos: any, rot: any) {
      this.spawned.push([pos, rot]);
      this.position = new Vec(pos.x, pos.y, pos.z);
      return true;
    }
    playAnimation(fragment: string, opts: any) {
      // jako server KCDC 1.7.1: "" bez tagů, rekvizity a klipu je chyba
      if (!fragment && !opts?.tags && !opts?.props?.length && !opts?.clip) throw new Error("Player.playAnimation: nothing to play: give a fragment, tags or a prop");
      const prev = this.anims.at(-1);
      this.anims.push({ fragment, ...opts });
      if (prev && !prev.stop && !prev.ended) fire("playerAnimationEnd", this, prev.fragment, "replaced");
      return true;
    }
    stopAnimation(opts: any = {}) {
      const prev = this.anims.at(-1);
      this.anims.push({ stop: true, ...opts });
      if (prev && !prev.stop && !prev.ended) fire("playerAnimationEnd", this, prev.fragment, "stopped");
      return true;
    }
    /** test: aktuální jednorázová animace doběhla */
    finish() {
      const a = this.anims.at(-1);
      a.ended = true;
      fire("playerAnimationEnd", this, a.fragment, "finished");
    }
    setTalking(on: boolean, style?: string) {
      this.talking.push([on, style]);
      return true;
    }
    emit(name: string, json?: string) {
      this.emitted.push([name, json ? JSON.parse(json) : undefined]);
      zprava(sit.udalosti, name, 1, json ?? "");
    }
    getInventory() {
      return { ready: true, revision: 1, items: this.items, harvested: false, quickslots: null };
    }
    giveItem(item: string, amount = 1) {
      const row = this.items.find((r) => r.item === item && !r.metadata?.custom);
      if (row) row.amount += amount;
      else this.items.push({ id: "r" + ++rowId, item, name: item, amount, metadata: {} });
      return true;
    }
    get anim() {
      return this.anims.at(-1);
    }
    static all() {
      return Player.list;
    }
    static getById(id: number) {
      return Player.list.find((p) => p.id === id) ?? null;
    }
  }
  const henry = new Player(1, "Henry", new Vec(0, 0, 0));
  const hans = new Player(2, "Hans", new Vec(10, 0, 0));
  const far = new Player(3, "Daleko", new Vec(500, 0, 0));
  const tereza = new Player(4, "Tereza", new Vec(3, 0, 0));
  tereza.appearance = { gender: "female" };
  Player.list = [henry, hans, far, tereza];

  // Prop: jako server - spawn vrátí handle, destroy ho odebere
  const props: any[] = [];
  class Prop {
    destroyed = false;
    constructor(public model: string, public position: any, public rotation: any, public physics: string, public virtualWorld: number) {}
    destroy() {
      this.destroyed = true;
      props.splice(props.indexOf(this), 1);
    }
    static spawn(model: string, position: any, rotation: any, _scale: unknown, physics = "static", vw = 0) {
      const p = new Prop(model, position, rotation, physics, vw);
      props.push(p);
      return p;
    }
  }

  const ctx = vm.createContext({
    Events: {
      on: (n: string, f: Fn) => (on.set(n, [...(on.get(n) ?? []), f]), () => {}),
      onClient: (n: string, f: Fn) => (onClient.set(n, f), () => {}),
      emitAllClients: (n: string, payload: unknown) => {
        toAll.push([n, payload]);
        zprava(sit.udalosti, n, Player.list.length, typeof payload === "string" ? payload : JSON.stringify(payload) ?? "");
      },
      emit: (n: string, ...args: unknown[]) => {
        emitted.push([n, args]);
        fire(n, ...args);
        return Promise.resolve();
      },
    },
    Player,
    Prop,
    Vector3: Vec,
    Chat: { sendToPlayer: (p: Player, text: string) => void chat.push([p.id, text]) },
    Dialogue: {
      open: (player: number, page: any) => (dialogs.push({ player, page, session: ++session }), session),
      close: () => true,
    },
    Items: {
      registered,
      // jako server: vzhled musí být drobnost, materiál nebo dokument (tady: cokoli kromě "apple")
      register: (id: string, def: any) => {
        if (def.visual === "apple") throw new Error("Unsupported custom item visual");
        registered.set(id, def);
        return "guid-" + id.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      },
    },
    Inventory: {
      get: (p: Player) => p.getInventory(),
      add: (p: Player, req: any) => {
        // jako server: vlastní název (metadata.custom) jen u registrovaných typů
        if (req.metadata?.custom && !String(req.item).startsWith("guid-")) return { ok: false, code: "invalidMetadata", revision: 1, items: [] };
        p.items.push({ id: "r" + ++rowId, item: req.item, name: req.item, amount: req.amount, metadata: req.metadata ?? {} });
        return { ok: true, code: "ok", revision: 1, items: [] };
      },
      remove: (p: Player, req: any) => {
        for (const u of req.units) {
          const r = p.items.find((x) => x.id === u.id);
          if (!r || r.amount < u.amount) return { ok: false, code: "missing", revision: 1, items: [] };
        }
        for (const u of req.units) {
          const r = p.items.find((x) => x.id === u.id)!;
          r.amount -= u.amount;
          if (r.amount === 0) p.items.splice(p.items.indexOf(r), 1);
        }
        return { ok: true, code: "ok", revision: 1, items: [] };
      },
    },
    Voice: {
      isPlayerTalking: (p: Player) => voice.talking.has(p.id),
      isPlayerVoiceEnabled: () => true,
      getPlayerTier: (p: Player) => voice.tier.get(p.id) ?? 1,
      getTierRange: (t: number) => tierRange[t],
      getPlayerRange: (p: Player) => voice.range.get(p.id) || tierRange[voice.tier.get(p.id) ?? 1],
      setPlayerRange: (p: Player, r: number) => void voice.range.set(p.id, r),
    },
    Exports: {
      register: (n: string, f: unknown) => (exportsReg.get(current)!.set(n, f), true),
      get: (res: string, n: string) => exportsReg.get(res)?.get(n),
    },
    ExecutionEnvironment: { modVersion: "1.7.1", isServer: true },
    console: { log: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Date,
  });
  let current = "";
  const load = (resource: string, code: string, config?: object) => {
    current = resource;
    exportsReg.set(resource, exportsReg.get(resource) ?? new Map());
    if (config) vm.runInContext(`globalThis.${resource.toUpperCase()}_CONFIG = ${JSON.stringify(config)};`, ctx);
    vm.runInContext(code, ctx);
    fire("resourceStart", resource);
  };
  const client = (name: string, p: any, payload: unknown = {}) => onClient.get(name)!(p, payload);
  return { ctx, sit, fire, emitted, toAll, chat, dialogs, voice, exportsReg, props, onClient, players: Player.list, P: Player, client, load };
}

/** falešný resource: zaregistruje exporty pod jménem (most, sprava) */
export function fakeResource(s: FakeServer, name: string, exports: Record<string, unknown>) {
  // most: moduly čtou celé API z exportu "api" (most/shim/most.ts), části zvlášť jen sprava
  if (name === "most" && !exports.api) exports = { ...exports, api: { info: () => ({ contract: 1, version: "fake", adapter: "fake", overrides: {} }), ...exports } };
  const m = new Map<string, unknown>(Object.entries(exports));
  s.exportsReg.set(name, m);
  s.fire("resourceStart", name);
}
