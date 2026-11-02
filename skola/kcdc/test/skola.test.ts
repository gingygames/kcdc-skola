// Škola na falešném serveru KCDC (loutna/kcdc/test/fake-kcdc): panel (pohled a akce), průvodce zařízením, stavba
// z pózy náhledu, hodina, čtení s prstem, písanky, konec s XP a ochranami, háčky frameworku a export filtrText.
// Kresby jsou falešný resource (jejich API testuje kresby/kcdc/test/api.test.ts), most neběží (nativní záloha shimu:
// Dialogue, paměť).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vec, fakeResource, fakeServer, type Fn } from "../../../loutna/kcdc/test/fake-kcdc";
import { decode, encodeK3 } from "../../../kresby/kcdc/src/shared/codec";

const root = join(import.meta.dirname, "..");
const flush = () => vi.advanceTimersByTimeAsync(0);
const pohledy: Record<string, unknown> = {}; // ukázky pro tools/ui-dev (SKOLA_UI_DUMP=1)

function server(config: object = {}) {
  const s = fakeServer();
  const ctx = s.ctx as any;
  // World.raycast: deska stolu pod paprskem (nastavuje test)
  const hit = { value: null as null | { position: Vec; normal: Vec } };
  ctx.World = { raycast: async () => ({ answered: true, hit: hit.value }) };
  const spawned: any[] = [];
  ctx.SmartObject = {
    spawn: (def: any, vw: number) => {
      const so = { def, vw, destroyed: false, destroy() { this.destroyed = true; }, toJSON: () => def };
      spawned.push(so);
      return so;
    },
    blueprints: () => [{ name: "Bench/bench_2places_low", kind: "seat", seats: 2 }],
  };
  for (const p of s.players) {
    p.xpLog = [];
    p.addXp = (track: string, xp: number) => (p.xpLog.push([track, xp]), true);
  }
  // kresby: desky a listy v paměti, kreslení zachytí done
  const boards = new Map<number, { spec: any; slot: string | null; shared?: number }>();
  const prepared = new Map<number, string>();
  let nid = 100;
  const draws: { pid: number; id: number; o: any }[] = [];
  const caption: { fn: any; owner: string | null } = { fn: null, owner: null };
  const baked: number[] = [];
  fakeResource(s, "kresby", {
    drawingPrepare: (_o: string, d: string) => (prepared.set(++nid, d), nid),
    boardBake: (id: number) => (baked.push(id), true),
    boardShow: async (id: number, _slot: number, did: number) => (boards.get(id) && prepared.has(did) ? ((boards.get(id)!.slot = prepared.get(did)!), (boards.get(id)!.shared = did), true) : "není"),
    drawingReady: (did: number) => prepared.has(did),
    drawingDelete: async (did: number) => prepared.delete(did),
    boardInfo: (id: number) => (boards.has(id) ? { slots: [boards.get(id)!.slot ? { d: 1 } : null] } : null),
    setCaptionFilter: (fn: any, owner: string) => ((caption.fn = fn), (caption.owner = owner), true),
    paperCode: (id: string) => (id === "tabule" ? 31 : -1),
    boardCreate: (spec: any) => (boards.set(++nid, { spec, slot: null }), nid),
    boardRemove: (id: number, owner: string) => owner === "skola" && boards.delete(id),
    boardPut: (id: number, _slot: number, d: string) => (boards.get(id) ? ((boards.get(id)!.slot = d), (boards.get(id)!.shared = undefined), ++nid) : "není"),
    boardGet: async (id: number) => (boards.get(id)?.slot ? { id: 1, d: boards.get(id)!.slot, t: "", a: "" } : null),
    boardClear: (id: number) => !!boards.get(id)?.slot && ((boards.get(id)!.slot = null), true),
    boardDraw: async (pid: number, id: number, _slot: number, o: any) => (draws.push({ pid, id, o }), true),
  });
  s.load("skola", readFileSync(join(root, "dist/skola/server.js"), "utf8"), { admini: ["Henry"], ucitele: ["Henry"], ...config });
  const [henry, hans, far, tereza] = s.players;
  const cmd = async (p: any, line = "") => {
    s.fire("playerCommand", p, "skola", line ? line.split(" ") : []);
    await flush();
  };
  const last = (p: any, ev: string) => p.emitted.filter(([n]: any) => n === ev).at(-1)?.[1];
  const ui = (p: any) => last(p, "skola:ui");
  /** panel: otevřít (klávesa J) */
  const otevrit = async (p: any) => {
    s.client("skola:uiOtevrit", p, { web: true });
    await flush();
    return ui(p);
  };
  /** panel: akce (klik na tlačítko); akce musí v pohledu být a nesmí být vypnutá */
  const akce = async (p: any, id: string, hodnota?: string) => {
    const v = ui(p);
    const a = v?.akce.find((x: any) => x.id === id);
    if (!a) throw new Error(`akce ${id} v pohledu ${v?.obrazovka} není: ${v?.akce.map((x: any) => x.id).join(" ")}`);
    if (a.vypnuto) throw new Error(`akce ${id} je vypnutá: ${a.vypnuto}`);
    s.client("skola:uiAkce", p, JSON.stringify({ seq: v.seq, id, ...(hodnota !== undefined ? { hodnota } : {}) }));
    await vi.advanceTimersByTimeAsync(10);
    return ui(p);
  };
  /** klient potvrdil místo náhledem (nebo skončil: { konec: true }); stůl se měří paprskem až 3× po 0,5 s */
  const umistit = async (p: any, m: object) => {
    s.client("skola:umisteno", p, JSON.stringify(m));
    await vi.advanceTimersByTimeAsync(1600);
    return ui(p);
  };
  const exp = (name: string) => s.exportsReg.get("skola")!.get(name) as Fn;
  return { ...s, henry, hans, far, tereza, cmd, last, ui, otevrit, akce, umistit, exp, hit, spawned, boards, draws, prepared, caption, baked };
}

const notes = (s: any, p: any) => s.chat.filter(([id]: any) => id === p.id).map(([, t]: any) => t as string);
const dump = (k: string, v: unknown) => void (pohledy[k] = JSON.parse(JSON.stringify(v)));

/** Henry projde průvodce: tabule na zdi, školní lavice (Hans sedí na místě 1 u x=10) */
async function trida(s: ReturnType<typeof server>) {
  const v0 = await s.otevrit(s.henry);
  expect(v0).toMatchObject({ obrazovka: "vitej", ucitel: true });
  dump("vitej", v0);
  const v1 = await s.akce(s.henry, "zalozit", "Škola u brány");
  expect(v1).toMatchObject({ obrazovka: "pruvodce", krok: "tabule", titulek: "Škola u brány" });
  dump("pruvodce-tabule", v1);
  // tabule na zeď: klient dostane, co ukázat (obrys podle povrchu), a vrátí pózu
  await s.akce(s.henry, "umistit:zed");
  expect(s.last(s.henry, "skola:umistit")).toMatchObject({ druh: "zed", obrys: { w: 1.6, h: 1 }, znovu: false });
  await s.umistit(s.henry, { druh: "zed", pos: [0, 4, 1.5], n: [0, -1, 0], yaw: 0 });
  const v2 = await s.umistit(s.henry, { konec: true });
  expect(v2).toMatchObject({ obrazovka: "pruvodce", krok: "lavice" });
  // školní lavice: stůl, před ním lavice pro dva, každý žák dva listy (stavějí se jedna za druhou)
  s.henry.position = new Vec(6, 0, 0);
  await s.akce(s.henry, "umistit:stul");
  expect(s.last(s.henry, "skola:umistit")).toMatchObject({ druh: "stul", znovu: true, yaw: 180 });
  s.hit.value = { position: new Vec(10.35, 0.55, 0.8), normal: new Vec(0, 0, 1) };
  await s.umistit(s.henry, { druh: "stul", pos: [10.35, 0.75, 0], n: [0, 0, 1], yaw: 0 });
  const v3 = await s.umistit(s.henry, { konec: true });
  dump("pruvodce-lavice", v3);
  s.henry.position = new Vec(0, 0, 0);
  const v4 = await s.akce(s.henry, "pruvodce:krok:hotovo");
  expect(v4).toMatchObject({ obrazovka: "pruvodce", krok: "hotovo" });
  const v5 = await s.akce(s.henry, "pruvodce:hotovo");
  expect(v5).toMatchObject({ obrazovka: "trida" });
  dump("trida", v5);
}

describe("škola", () => {
  beforeEach(() => void vi.useFakeTimers({ now: Date.UTC(2026, 9, 29, 9) }));
  afterEach(() => void vi.useRealTimers());
  afterEach(() => {
    if (process.env.SKOLA_UI_DUMP) writeFileSync(join(root, "tools/ui-dev/pohledy.json"), JSON.stringify(pohledy, null, 1));
  });

  it("most naběhne po škole a restartuje se za běhu: škola jede dál a třídy načte z jeho úložiště", async () => {
    const manifest = JSON.parse(readFileSync(join(root, "dist/skola/package.json"), "utf8"));
    expect(manifest.mafiahub.resourceDependencies.map((d: any) => d.name)).toEqual(["kresby"]);
    const s = server();
    await vi.advanceTimersByTimeAsync(10);
    const cteni: string[] = [];
    const spustit = () => fakeResource(s, "most", { storage: { get: async (k: string) => void (k === "skola:tridy" && cteni.push(k)), set: async () => true } });
    spustit();
    expect(cteni).toEqual([]); // resourceStart mostu: exporty ještě nejdou číst
    await vi.advanceTimersByTimeAsync(300);
    expect(cteni).toEqual(["skola:tridy"]);
    s.fire("resourceStop", "most");
    s.exportsReg.delete("most");
    spustit();
    await vi.advanceTimersByTimeAsync(300);
    expect(cteni).toEqual(["skola:tridy", "skola:tridy"]);
  });

  it("průvodce: tabule a školní lavice z pózy náhledu; stůl je prop, lavice smart object, listy desky kreseb", async () => {
    const s = server();
    await trida(s);
    const specs = [...s.boards.values()].map((b) => b.spec);
    expect(specs).toHaveLength(5); // tabule + 2 žáci × (čítanka, písanka)
    expect(specs.every((b) => b.owner === "skola" && b.cols === 1 && b.rows === 1)).toBe(true);
    expect(specs[0]).toMatchObject({ w: 1.6, n: [0, -1, 0] }); // tabule na zdi
    expect(specs[1].n[2]).toBeGreaterThan(0.95); // listy skoro vodorovně na desce
    expect(specs[1].pos[2]).toBeCloseTo(0.806, 2); // změřená deska stolu
    expect(specs[1].w).toBe(0.3); // dva žáci u stolu: listy užší
    // čítanka vlevo od žáka, písanka vpravo; žák 1 sedí na x = 10
    expect(specs[1].pos[0]).toBeLessThan(10);
    expect(specs[2].pos[0]).toBeGreaterThan(10);
    // čítanka má ve světě obecný vzhled (pseudoznaky), písanka je čistá
    const cit = decode([...s.boards.values()][1].slot!);
    expect(cit!.strokes.length).toBeGreaterThan(20);
    expect([...s.boards.values()][1].shared).toBeGreaterThan(0); // sdílená kresba (jedna textura pro všechny stoly)
    expect([...s.boards.values()][2].slot).toBeNull();
    // stůl je Prop hry, lavice před ním smart object pro dva (0,7 m před stolem, stejně natočená)
    expect(s.props.map((p: any) => p.model)).toEqual(["objects/manmade/common_furniture/tables/table_shabby_d_160_rough.cgf"]);
    expect(s.spawned.map((x) => x.def.blueprint)).toEqual(["Bench/bench_2places_low_table"]);
    expect(s.spawned[0].def.position[1]).toBeCloseTo(0.05, 3);
    // pohled třídy: kusy k přesunutí a odebrání
    const v = s.ui(s.henry);
    expect(v.trida.vybaveni.map((k: any) => k.druh)).toEqual(["tabule", "stul"]);
    expect(v.trida.mist).toBe(2);
    expect(v.akce.map((a: any) => a.id)).toEqual(expect.arrayContaining(["hodina:zacit", "strana:0", "presunout:tabule", "odebrat:tabule", "tabule:strana", "trida:verejna", "trida:zrusit"]));
    // hráči poblíž dostanou okolí třídy (nápověda u stolu a tabule)
    await vi.advanceTimersByTimeAsync(2100);
    const ok = s.last(s.hans, "skola:okoli");
    expect(ok).toMatchObject({ dosah: 1.6, tridy: [{ id: 1, zadani: false, moje: false }] });
    expect(ok.tridy[0].mista[0][0]).toBeCloseTo(10, 3);
    expect(ok.tridy[0].tabule[1]).toBeCloseTo(3.988, 2);
    expect(s.last(s.far, "skola:okoli")).toMatchObject({ tridy: [] });
    // žák nic stavět nesmí: má jen svůj pohled
    const z = await s.otevrit(s.hans);
    expect(z.obrazovka).toBe("zak");
    expect(z.akce.map((a: any) => a.id)).toEqual(["zak:cist", "zak:psat", "zavrit"]);
    expect(z.ja).toMatchObject({ nazev: "Negramotný", xp: 0, od: 0, do: 10, dalsi: "písmeno A" });
    dump("zak", z);
    s.client("skola:uiAkce", s.hans, JSON.stringify({ seq: z.seq, id: "umistit:stul" }));
    await flush();
    expect(s.ui(s.hans).hlaska).toMatchObject({ text: "To může jen písař.", druh: "warn" });
  });

  it("umisťování: špatný povrch a místo mimo třídu se odmítnou, přesun lavice si nechá id, odebrání uklidí", async () => {
    const s = server();
    await trida(s);
    await s.akce(s.henry, "umistit:zed");
    await s.umistit(s.henry, { druh: "zed", pos: [0, 4, 0], n: [0, 0, 1], yaw: 0 });
    expect(notes(s, s.henry).at(-1)).toBe("Tabule patří na zeď: zamiř na svislou stěnu.");
    s.henry.position = new Vec(0, 8, 0);
    await s.umistit(s.henry, { druh: "zed", pos: [0, 16, 1], n: [0, -1, 0], yaw: 0 });
    expect(notes(s, s.henry).at(-1)).toBe("To je už mimo třídu (nejvýš 14 m od místa, kde jsi ji založil).");
    s.henry.position = new Vec(0, 0, 0);
    await s.umistit(s.henry, { konec: true });
    // přesun školní lavice: staré listy pryč, nové na novém místě, kus má stejné id
    const stul = s.ui(s.henry).trida.vybaveni.find((k: any) => k.druh === "stul");
    await s.akce(s.henry, "presunout:" + stul.id);
    expect(s.last(s.henry, "skola:umistit")).toMatchObject({ druh: "stul", presun: stul.id, znovu: false });
    s.hit.value = { position: new Vec(4, 4, 0.8), normal: new Vec(0, 0, 1) };
    await s.umistit(s.henry, { druh: "stul", presun: stul.id, pos: [4, 4, 0], n: [0, 0, 1], yaw: 90 });
    expect(notes(s, s.henry).at(-1)).toContain("Přesunuto. Lavice stojí");
    const v = await s.umistit(s.henry, { konec: true });
    expect(v.trida.vybaveni.filter((k: any) => k.druh === "stul").map((k: any) => k.id)).toEqual([stul.id]);
    expect(s.boards.size).toBe(5);
    expect(s.props).toHaveLength(1);
    expect(s.props[0].rotation.z).toBe(90);
    expect(s.spawned.filter((x) => !x.destroyed)).toHaveLength(1);
    // odebrat: stůl, lavice i listy pryč
    await s.akce(s.henry, "odebrat:" + stul.id);
    expect(s.ui(s.henry).hlaska.text).toBe("Lavice se stolem je pryč.");
    expect(s.boards.size).toBe(1);
    expect(s.props).toHaveLength(0);
    expect(s.spawned.every((x) => x.destroyed)).toBe(true);
    // tabule na stojanu: dřevěná tabule na sloupku; náhled je model podstavce otočený přední stranou k písaři,
    // líc leží na desce vedle sloupku (0,71 m po ose listu) a 1,225 m nad patou
    await s.akce(s.henry, "umistit:stojan");
    expect(s.last(s.henry, "skola:umistit")).toMatchObject({ druh: "stojan", models: ["objects/manmade/common_decorations/streets_deco/sign_wall_board_rustic.cgf"], yaw: 360 });
    await s.umistit(s.henry, { druh: "stojan", pos: [3, 3, 0], n: [0, 0, 1], yaw: 180 });
    const tab = [...s.boards.values()].at(-1)!.spec;
    expect(tab).toMatchObject({ kind: "stojan", model: "objects/manmade/common_decorations/streets_deco/sign_wall_board_rustic.cgf", w: 1.05, h: 0.7 });
    expect(tab.yaw).toBeCloseTo(0, 3); // model 180° = líc 0° (přední strana modelu je −Y)
    expect(tab.pos[2]).toBeCloseTo(1.225, 3);
    expect(Math.hypot(tab.pos[0] - 3, tab.pos[1] - 3)).toBeCloseTo(Math.hypot(0.711, 0.03), 2);
    expect(tab.n[1]).toBeCloseTo(1, 3); // líc 0° = k +Y
    await s.umistit(s.henry, { konec: true });
    // samotná lavice na sezení (smart object z nastavení)
    await s.akce(s.henry, "umistit:lavice");
    await s.umistit(s.henry, { druh: "lavice", pos: [2, 2, 0], n: [0, 0, 1], yaw: 90 });
    expect(s.spawned.at(-1).def).toMatchObject({ blueprint: "Bench/bench_2places_low" });
    expect(s.spawned.at(-1).def.rotation[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("hodina: čtení s prstem, písanka s předlohou, kontrola, konec jedním formulářem s XP a stropy", async () => {
    const s = server();
    await trida(s);
    const v0 = await s.akce(s.henry, "hodina:zacit");
    expect(v0.hlaska.text).toContain("Studentů: 2"); // Hans (10 m) a Tereza (3 m), Daleko ne
    expect(v0.obrazovka).toBe("hodina");
    expect(v0.hodina.zaci.map((z: any) => [z.jmeno, z.sedi])).toEqual([["Hans", true], ["Tereza", false]]);
    expect(s.last(s.hans, "skola:stav").text).toContain("Hodina u Henry: A a");

    // Hans se skloní nad čítanku: dostane text stránky a líc listu
    s.client("skola:sklonit", s.hans);
    await flush();
    const c = s.last(s.hans, "skola:cist");
    expect(c).toMatchObject({ mod: "cteni", titulek: "A a", text: "A a A a\na a a\nA A A", filtr: true, prst: false });
    expect(c.list.n[2]).toBeGreaterThan(0.95);
    // Tereza u stolu nesedí
    s.client("skola:sklonit", s.tereza);
    await flush();
    expect(s.last(s.tereza, "skola:cist")).toBeUndefined();

    // písař vyvolá Hanse ke čtení: Hans ukazuje prstem, písař vidí skutečné slovo i to, co Hans vidí
    await s.akce(s.henry, "cist:2");
    expect(s.last(s.hans, "skola:prstMod")).toEqual({ on: true });
    s.client("skola:prst", s.hans, { x: 120, y: 80, w: 0 });
    const prst = s.last(s.henry, "skola:prstUcitel");
    expect(prst).toMatchObject({ pid: 2, jmeno: "Hans", x: 120, y: 80, slovo: "A" });
    expect(prst.vidi).not.toBe("A"); // Hans zatím nečte nic
    // záplava zpráv prstu se zahodí
    for (let i = 0; i < 40; i++) s.client("skola:prst", s.hans, { x: i, y: 1, w: -1 });
    expect(s.henry.emitted.filter(([n]: any) => n === "skola:prstUcitel").length).toBeLessThan(25);
    expect(s.ui(s.henry).akce.find((a: any) => a.id === "cist:2").vypnuto).toBe("Už čte.");

    // písanky: předloha do listů, Hans píše (relace kreseb s předlohou), písař uzná
    const zad = s.ui(s.henry).akce.find((a: any) => a.id === "pisanky:zadat");
    expect(zad.vstup).toMatchObject({ value: "A a", max: 40 });
    await s.akce(s.henry, "pisanky:zadat", "A a");
    const pis = s.boards.get(103)!.slot!;
    const tahyPredlohy = decode(pis, 16)!.strokes;
    expect(tahyPredlohy.every((t) => t.a === 2)).toBe(true); // předloha i linky světlým inkoustem 2 (rovnoměrný tah, nejde jím psát)
    expect(tahyPredlohy.filter((t) => t.op === 70).length).toBeGreaterThanOrEqual(2); // linky písanky: výška malých písmen a účaří (dlouhá čára jde po kusech)
    expect(tahyPredlohy.filter((t) => t.op === 185)).toHaveLength(4); // zřetelná předloha: A (2 tahy) a a (2 tahy)
    expect(s.boards.get(103)!.shared).toBeGreaterThan(0);
    expect(s.boards.get(106)!.shared).toBe(s.boards.get(103)!.shared); // všechny písanky jedna textura
    // karta hodiny (po 1 s, jen změny): písař vidí žáky a jejich stav, žák co má dělat
    await vi.advanceTimersByTimeAsync(1100);
    expect(s.last(s.henry, "skola:karta")).toMatchObject({
      nastaveni: { zapnuto: true, strana: "vpravo" },
      hodina: { role: "ucitel", strana: "A a", zadani: "A a", cte: "Hans", zaci: [{ jmeno: "Hans", sedi: true, cte: true, pisanka: null }, { jmeno: "Tereza", sedi: false, cte: false, pisanka: null }] },
    });
    expect(s.last(s.hans, "skola:karta").hodina).toMatchObject({ role: "zak", ucitel: "Henry", ja: { sedi: true, ctu: true, pisanka: null, nazev: "Negramotný" } });
    expect(s.last(s.hans, "skola:karta").hodina.zaci).toBeUndefined(); // žák nevidí ostatní
    expect(s.last(s.far, "skola:karta")).toBeUndefined(); // kdo na hodině nebyl, nic nedostane
    const karet = s.henry.emitted.filter(([n]: any) => n === "skola:karta").length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.henry.emitted.filter(([n]: any) => n === "skola:karta").length).toBe(karet); // beze změny nic
    const zv = await s.otevrit(s.hans);
    expect(zv.akce.find((a: any) => a.id === "zak:psat")).toMatchObject({ text: "Psát do písanky („A a“)" });
    await s.akce(s.hans, "zak:psat");
    expect(s.last(s.hans, "skola:uiZavrit")).toEqual({}); // panel ustoupí plátnu
    const dr = s.draws.at(-1)!;
    expect(dr).toMatchObject({ pid: 2, id: 103, o: { owner: "skola", tools: [0], base: pis, hang: false } }); // písanka se nepeče
    expect(dr.o.inks.map((i: any) => [i.name, i.pick])).toEqual([["Duběnkový inkoust", undefined], ["Předloha", false]]);
    // Hans obtáhne předlohu výchozím (prvním) inkoustem plátna
    const base = decode(pis, 16)!;
    const moje = base.strokes.filter((t) => t.op === 185).map((t) => ({ ...t, a: 1, op: 255 })); // písmo, ne linky
    dr.o.done({ ok: true, d: encodeK3({ paper: 0, inks: [], strokes: [...base.strokes, ...moje] }), added: moje.length });
    expect(notes(s, s.henry).at(-1)).toMatch(/Hans odevzdal písanku \(pěkně, \d+ %\)/);
    await s.cmd(s.hans, "psat");
    expect(notes(s, s.hans).at(-1)).toBe("Písanku jsi odevzdal, písař ji ještě nezkontroloval.");
    // panel písaře se při hodině obnoví sám (po 5 s): u Hanse je písanka ke kontrole
    await vi.advanceTimersByTimeAsync(5100);
    expect(s.ui(s.henry).hodina.zaci[0].pisanka).toMatchObject({ stav: "odevzdano" });
    dump("hodina", s.ui(s.henry));
    await s.akce(s.henry, "pisanka:ok:2");
    expect(notes(s, s.hans).at(-1)).toBe("Písař uznal tvou písanku.");

    // tabule: písař pošle Terezu k tabuli (relace kreseb na tabuli, papír tabule, křída bez materiálu)
    const pred = s.draws.length;
    const vt = await s.akce(s.henry, "tabule:zak:4");
    expect(vt.hlaska.text).toBe("Tereza jde k tabuli.");
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.draws.length).toBe(pred);
    s.tereza.position = new Vec(0, 2.5, 0.2);
    await vi.advanceTimersByTimeAsync(1100);
    expect(s.draws.at(-1)).toMatchObject({ pid: 4, id: 101, o: { paper: 31, tools: [0, 1], base: null, hang: true, bake: false } });
    expect(s.draws.at(-1)!.o.inks.map((i: any) => i.name)).toEqual(["Bílá křída", "Žlutá křída", "Červená křída"]);
    s.draws.at(-1)!.o.done({ ok: true, added: 3 }); // dopsáno: ostatní vidí čarami, peče se až na konci hodiny
    expect(s.baked).toEqual([]);
    s.tereza.position = new Vec(3, 0, 0);

    // konec po 12 minutách: formulář s návrhem (Hans četl a má uznanou písanku), písař ho upraví
    await vi.advanceTimersByTimeAsync(12 * 60000);
    const k = await s.akce(s.henry, "hodina:konec");
    expect(k.obrazovka).toBe("konec");
    expect(k.hodina.zaci.map((z: any) => [z.jmeno, z.navrh])).toEqual([["Hans", "ucp"], ["Tereza", "u"]]);
    expect(k.hodina.xp).toEqual({ ucast: 5, cteni: 10, psani: 10 });
    dump("konec", k);
    await s.akce(s.henry, "hodina:rozdat", JSON.stringify({ 2: "ucp", 4: "u" }));
    expect(s.ui(s.henry).hlaska.text).toBe("Hodina skončila. Hans: +25 XP (písmeno A, E, stupeň Písmena); Tereza: +5 XP");
    expect(s.ui(s.henry).obrazovka).toBe("trida");
    await vi.advanceTimersByTimeAsync(1100);
    expect(s.last(s.hans, "skola:karta").hodina).toBeNull(); // po hodině karta zmizí
    expect(s.baked).toEqual([101]); // tabule z hodiny upečená jednou
    expect(s.hans.xpLog).toEqual([["scholarship", 25]]);
    expect(s.last(s.hans, "skola:xp")).toMatchObject({ xp: 25, pridano: 25, stupen: "Písmena", co: "písmeno A, E, stupeň Písmena" });
    expect(s.exp("xp")(2)).toBe(25);
    expect(s.exp("filtrText")(2, "mama a ema", 1)).toMatch(/^.a.. a e..$/); // zná A a E, víc než 2 písmena za sebou ještě nespojí

    // druhá hodina týž den: strop od jednoho učitele (30) pustí jen 5
    await s.akce(s.henry, "hodina:zacit");
    await vi.advanceTimersByTimeAsync(11 * 60000);
    await s.akce(s.henry, "hodina:konec");
    await s.akce(s.henry, "hodina:rozdat", JSON.stringify({ 2: "ucp", 4: "0" }));
    expect(s.ui(s.henry).hlaska.text).toBe("Hodina skončila. Hans: +5 XP (písmeno I)");
    expect(s.exp("xp")(2)).toBe(30);
  });

  it("krátká hodina XP nedá; háček frameworku určí písaře; cizí třídu písař jen vidí", async () => {
    const s = server({ admini: [] }); // admin smí všechno (i učit bez role z frameworku): tady Henry jen písař
    await trida(s);
    await s.akce(s.henry, "hodina:zacit");
    await vi.advanceTimersByTimeAsync(2 * 60000);
    const k = await s.akce(s.henry, "hodina:konec");
    expect(k.akce.find((a: any) => a.id === "hodina:rozdat")).toMatchObject({ text: "Ukončit hodinu" });
    await s.akce(s.henry, "hodina:rozdat");
    expect(s.ui(s.henry).hlaska.text).toContain("XP se nedává");
    expect(s.exp("xp")(2)).toBe(0);

    // framework: písař je Tereza (job), Henry už ne
    expect(s.exp("setHooks")({ jeUcitel: (pid: number) => pid === 4 }, "muj-fw")).toBe(1);
    const t = await s.otevrit(s.tereza);
    expect(t).toMatchObject({ obrazovka: "cizi", text: expect.stringContaining("Třída patří písaři Henry") });
    expect(t.akce.some((a: any) => /^(hodina|umistit|tabule|trida)/.test(a.id))).toBe(false);
    s.tereza.position = new Vec(200, 0, 0);
    expect((await s.otevrit(s.tereza)).akce.map((a: any) => a.id)).toContain("zalozit");
    s.tereza.position = new Vec(3, 0, 0);
    // Henry podle frameworku písař není: pohled žáka
    expect((await s.otevrit(s.henry)).obrazovka).toBe("zak");
    // framework skončil: zpátky práva a Henry svou třídu zase vede
    s.fire("resourceStop", "muj-fw");
    expect((await s.otevrit(s.henry)).obrazovka).toBe("trida");
  });

  it("tabule: stránka slabikáře ze sdílené kresby, připravit vše, uložit a ukázat, obrázek ke stránce", async () => {
    const s = server();
    await trida(s);
    const tabule = () => s.boards.get(101)!;
    s.henry.position = new Vec(0, 2.5, 0.2); // u tabule
    await s.akce(s.henry, "strana:5");
    expect(s.ui(s.henry).strana).toBe(5);
    await s.akce(s.henry, "strana:0");
    let v = await s.akce(s.henry, "tabule:strana");
    expect(v.hlaska.text).toContain("ostatní ji uvidí za chvíli"); // první upečení
    const prvni = tabule().shared!;
    expect(decode(tabule().slot!, 16)!.paper).toBe(31);
    // připravit celý slabikář: každá stránka jednou, ta už upečená se nepeče znovu
    const pred = s.prepared.size;
    await s.akce(s.henry, "tabule:pripravit");
    expect(s.prepared.size - pred).toBe(17);
    expect(s.ui(s.henry).slabikar.every((x: any) => x.pripravena)).toBe(true);
    v = await s.akce(s.henry, "tabule:strana");
    expect(v.hlaska.text).toBe("Na tabuli je A a."); // hned, připravená
    expect(tabule().shared).toBe(prvni);

    // text na tabuli (i příkazem), uložit a později ukázat zpátky
    await s.cmd(s.henry, "tabule Dnes: písmeno M");
    expect(tabule().shared).toBeUndefined();
    const vlastni = tabule().slot;
    await s.akce(s.henry, "tabule:ulozit", "Tabule 1");
    await s.akce(s.henry, "tabule:strana");
    v = await s.akce(s.henry, "tabule:ulozena:0");
    expect(v.hlaska.text).toBe("Na tabuli je „Tabule 1“.");
    expect(tabule().slot).toBe(vlastni);

    // obrázek ke stránce: písař kreslí u tabule na pergamen (tabule se nezmění), čítanky ho ukazují
    await s.akce(s.henry, "tabule:obrazek");
    const dr = s.draws.at(-1)!;
    expect(dr.o).toMatchObject({ paper: 0, hang: false, base: null });
    const obr = encodeK3({ paper: 0, inks: [], strokes: [{ tool: 0, a: 2, b: 0, mix: 0, size: 8, op: 255, p: [100, 100, 8, 300, 300, 8] }] });
    dr.o.done({ ok: true, d: obr, added: 1 });
    await flush();
    s.client("skola:sklonit", s.hans);
    await flush();
    expect(s.last(s.hans, "skola:cist").obrazek).toBe(obr);
    // stránka na tabuli se s obrázkem upeče znovu (stará připravená je pryč), obrázek křídou (červená)
    await s.otevrit(s.henry);
    await s.akce(s.henry, "tabule:strana");
    expect(s.prepared.has(prvni)).toBe(false);
    expect(decode(tabule().slot!, 16)!.strokes[0]).toMatchObject({ a: 3 });
    expect(s.ui(s.henry).slabikar[0].obrazek).toBe(true);
  });

  it("revize: formulář konce se nepřekresluje, stará hodina nenechá konec viset, akce míří na ukázanou třídu, limity a přesun", async () => {
    const s = server();
    await trida(s);
    // formulář konce hodiny: obnova po 5 s ho nepřekreslí (písař by přišel o zaškrtnutí)
    await s.akce(s.henry, "hodina:zacit");
    await s.akce(s.henry, "hodina:konec");
    const pred = s.henry.emitted.filter(([n]: any) => n === "skola:ui").length;
    await vi.advanceTimersByTimeAsync(16000);
    expect(s.henry.emitted.filter(([n]: any) => n === "skola:ui").length).toBe(pred);
    // hodina skončila jinak (písař odešel): další hodina začne normálně, ne formulářem konce
    s.henry.position = new Vec(100, 0, 0);
    await vi.advanceTimersByTimeAsync(5100);
    expect(notes(s, s.henry).at(-1)).toBe("Odešel jsi od třídy, hodina skončila bez XP.");
    s.henry.position = new Vec(0, 0, 0);
    await s.otevrit(s.henry);
    expect((await s.akce(s.henry, "hodina:zacit")).obrazovka).toBe("hodina");
    await s.akce(s.henry, "hodina:konec");
    await s.akce(s.henry, "hodina:bezxp");

    // druhá třída kousek vedle (třídy se můžou překrývat): akce z pohledu první míří na první
    s.henry.position = new Vec(30, 0, 0);
    await s.otevrit(s.henry);
    await s.akce(s.henry, "zalozit", "Druhá");
    s.henry.position = new Vec(0, 0, 0);
    expect((await s.otevrit(s.henry)).titulek).toBe("Škola u brány");
    s.henry.position = new Vec(25, 0, 0); // došel k druhé, panel ukazuje pořád první
    await s.akce(s.henry, "trida:verejna");
    expect((await s.otevrit(s.henry)).trida).toMatchObject({ nazev: "Druhá", verejna: true });
    s.henry.position = new Vec(0, 0, 0);
    expect((await s.otevrit(s.henry)).trida).toMatchObject({ nazev: "Škola u brány", verejna: false });

    // rychlé kliky při stavbě lavic nepřekročí limit míst (16 = 2 + 7 dalších stolů)
    await s.otevrit(s.henry);
    await s.akce(s.henry, "trida:verejna");
    await s.akce(s.henry, "umistit:stul");
    s.hit.value = { position: new Vec(3, 3, 0.8), normal: new Vec(0, 0, 1) };
    for (let i = 0; i < 9; i++) s.client("skola:umisteno", s.henry, JSON.stringify({ druh: "stul", pos: [1 + i * 0.5, 3, 0], n: [0, 0, 1], yaw: 0 }));
    await vi.advanceTimersByTimeAsync(3000);
    const v = await s.umistit(s.henry, { konec: true });
    expect(v.trida.mist).toBe(16);
    expect(notes(s, s.henry).filter((t: string) => t.startsWith("Míst je už"))).toHaveLength(2);
    expect(v.akce.find((a: any) => a.id === "umistit:stul").vypnuto).toBe("Míst je nejvýš 16.");

    // přesun místa na špatný povrch: starý kus zůstane
    const stul = v.trida.vybaveni.find((k: any) => k.druh === "stul");
    await s.akce(s.henry, "odebrat:" + stul.id);
    await s.akce(s.henry, "umistit:misto");
    s.hit.value = null;
    await s.umistit(s.henry, { druh: "misto", pos: [2, 2, 0.8], n: [0, 0, 1], yaw: 0 });
    const m = (await s.umistit(s.henry, { konec: true })).trida.vybaveni.find((k: any) => k.druh === "misto");
    await s.akce(s.henry, "presunout:" + m.id);
    await s.umistit(s.henry, { druh: "misto", presun: m.id, pos: [2, 2, 1], n: [1, 0, 0], yaw: 0 });
    expect(notes(s, s.henry).at(-1)).toBe("Zamiř na desku stolu (vodorovnou plochu).");
    expect((await s.umistit(s.henry, { konec: true })).trida.vybaveni.some((k: any) => k.id === m.id)).toBe(true);
  });

  it("bez web view: stejné akce v nativní nabídce po stránkách", async () => {
    const s = server();
    await trida(s);
    s.client("skola:uiOtevrit", s.henry, { web: false });
    await flush();
    const d = () => s.dialogs.filter((x: any) => x.player === s.henry.id).at(-1)!;
    const volby = d().page.options.map((o: any) => o.text);
    expect(volby.length).toBeLessThanOrEqual(8);
    expect(volby).toContain("Další…");
    expect(volby[0]).toBe("Začít hodinu (A a)");
    s.fire("dialogueChoice", d().session, s.henry, d().page.options[0].id);
    await flush();
    expect(notes(s, s.henry).at(-1)).toContain("Hodina začala");
    // nabídka zůstává (další kolo): teď s akcemi hodiny
    expect(d().page.options.some((o: any) => o.text.startsWith("Hans: číst nahlas"))).toBe(true);
  });

  it("oprava třídy: desky, které kresby neznají, se postaví znovu; filtr popisků kreseb je zaregistrovaný", async () => {
    const s = server();
    await trida(s);
    expect(s.caption.owner).toBe("skola");
    expect(s.caption.fn(2, "Ema mele", "x")).not.toBe("Ema mele"); // Hans nečte
    await s.exp("pridatXp")(2, 800);
    expect(s.caption.fn(2, "Ema mele", "x")).toBe("Ema mele");
    // kresby přišly o desky čítanky a tabule
    s.boards.delete(101);
    s.boards.delete(102);
    s.fire("resourceStart", "kresby");
    await vi.advanceTimersByTimeAsync(400);
    const nove = [...s.boards.entries()].filter(([id]) => id > 106);
    expect(nove.map(([, b]) => b.spec.w)).toEqual(expect.arrayContaining([1.6, 0.3]));
    const cit = nove.find(([, b]) => b.spec.w === 0.3)![1];
    expect(cit.shared).toBeGreaterThan(0); // čítanka zase s obecným vzhledem
  });

  it("export pro moduly: filtr podle XP, legibility pro nativní knihu, admin XP, nastavení", async () => {
    const s = server();
    const ex = s.exp;
    expect(ex("legibility")(2, "Pes leží u domu.")).toBe(0);
    expect(await ex("pridatXp")(2, 800, "test")).toContain("+800 XP");
    expect(ex("filtrText")(2, "Pes leží u domu.")).toBe("Pes leží u domu.");
    expect(ex("legibility")(2, "Pes leží u domu.")).toBe(1);
    expect(ex("stav")(2)).toMatchObject({ stupen: 4, nazev: "Plynné čtení" });
    // ostatní hráči nic
    expect(ex("filtrText")(4, "Pes")).not.toBe("Pes");
    // sprava: panel s gramotností hráče
    const panel = ex("spravaPanels")()[0];
    expect(panel.actions.map((a: any) => a.id)).toEqual(["panel", "profil", "dat", "nastavit", "tridy", "zrusit", "slabikarJazyka", "ladeni"]);
    expect(panel.actions[0]).toMatchObject({ perm: "skola.ucit", label: "Otevřít panel školy" });
    expect(await panel.actions[0].handler({ caller: s.henry, params: {}, panel: "skola", action: "panel" })).toMatchObject({ close: true });
    await vi.advanceTimersByTimeAsync(400);
    expect(s.ui(s.henry)).toMatchObject({ obrazovka: "vitej" }); // panel školy po zavření F10
    const r = await panel.actions[1].handler({ caller: s.henry, params: { hrac: s.hans }, panel: "skola", action: "profil" });
    expect(r.info.find((x: any) => x.label === "XP").value).toBe(800);
    // nastavení ve Správě: chyby se neuloží
    const def = ex("spravaSettings")();
    const v = def.get();
    v.pravidla.xpSlova = 10;
    const bad = await def.set(v, { caller: s.henry });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e: any) => e.path === "pravidla.xpSlova")).toBe(true);
    const good = def.get();
    good.slabikar[0].text = "Nový text";
    expect(await def.set(good, { caller: s.henry })).toBe("Uloženo, platí hned.");
  });
});

describe("škola: jazyky a oprávnění na serveru", () => {
  beforeEach(() => void vi.useFakeTimers({ now: Date.UTC(2026, 9, 29, 9) }));
  afterEach(() => void vi.useRealTimers());

  it("jazyk po hráči: /skola jazyk en přepne panel a oznámení jen jemu, klient dostane texty", async () => {
    const s = server({ ladici: ["Hans"] });
    await s.cmd(s.hans, "jazyk en");
    expect(notes(s, s.hans).at(-1)).toBe("School language: en.");
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "en", texty: { "level.0": "Illiterate" } });
    const z = await s.otevrit(s.hans);
    expect(z.ja.nazev).toBe("Illiterate");
    expect(z.akce.find((a: any) => a.id === "zavrit").text).not.toBe("Zavřít");
    // Henry zůstává česky
    expect((await s.otevrit(s.henry)).titulek).toBe("Škola písaře");
    await s.cmd(s.henry, "jazyk xx");
    expect(notes(s, s.henry).at(-1)).toContain("Jazyk „xx“ škola nezná");
    // auto = zpět na výchozí serveru
    await s.cmd(s.hans, "jazyk auto");
    expect((await s.otevrit(s.hans)).ja.nazev).toBe("Negramotný");
  });

  it("ladění jen s právem skola.debug; admin smí také; žák ne", async () => {
    const s = server({ ladici: ["Hans"] });
    await s.cmd(s.tereza, "debug stav");
    expect(notes(s, s.tereza).at(-1)).toBe("Na to nemáš oprávnění.");
    await s.cmd(s.hans, "debug stav");
    expect(notes(s, s.hans).at(-1)).toContain("tridy 0");
    await s.cmd(s.hans, "debug ja Tereza");
    expect(notes(s, s.hans).at(-1)).toContain("role student");
    await s.cmd(s.hans, "debug cteni 0 Ema mele maso");
    expect(notes(s, s.hans).at(-1)).not.toContain("Ema mele maso"); // negramotný vidí pseudoznaky
    await s.cmd(s.henry, "debug ja");
    expect(notes(s, s.henry).at(-1)).toContain("admin");
    expect(await s.exp("can")(s.hans.id, "debug.view")).toBe(true);
    expect(await s.exp("can")(s.hans.id, "lesson.run")).toBe(false);
    expect(await s.exp("can")(s.tereza.id, "school.use")).toBe(true);
  });
});

describe("škola: opravy z recenze (jazyk po startu, regionální kódy, schopnosti v F10)", () => {
  beforeEach(() => void vi.useFakeTimers({ now: Date.UTC(2026, 9, 29, 9) }));
  afterEach(() => void vi.useRealTimers());

  it("start školy pošle připojeným hráčům jazyk; háček frameworku s en-US dá angličtinu", async () => {
    const s = server();
    await flush();
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "cs" }); // bez playerReady (restart resource)
    expect(s.exp("setHooks")({ jazyk: () => "en-US" }, "muj-fw")).toBe(1);
    await flush();
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "en" });
    await s.cmd(s.hans, "jazyk en_GB");
    expect(notes(s, s.hans).at(-1)).toBe("School language: en.");
  });

  it("výchozí jazyk z úložiště po startu a reset v F10 pošlou hráčům jazyk znovu; rozbitý JSON od klienta nespadne", async () => {
    const s = server();
    await flush();
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "cs" }); // nastavení ještě nenačtené
    // most naběhne s uloženým nastavením (výchozí en): po načtení dostanou hráči angličtinu
    const ulozeno = new Map<string, unknown>([["skola:nastaveni", { jazyk: { vychozi: "en", volba: true } }]]);
    fakeResource(s, "most", {
      storage: {
        get: async (k: string) => ulozeno.get(k) ?? null,
        set: async (k: string, v: unknown) => (ulozeno.set(k, v), true),
        delete: async (k: string) => ulozeno.delete(k),
        keys: async (pre: string) => [...ulozeno.keys()].filter((k) => k.startsWith(pre)),
      },
      identity: { getCharacterId: async (pid: number) => "c" + pid },
      perms: { has: async (pid: number) => pid === s.henry.id },
      notify: () => {},
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "en", vychozi: "en" });
    // reset v F10 vrátí výchozí cs i hráčům
    expect(await s.exp("spravaSettings")().reset({ caller: s.henry })).toBe("Výchozí nastavení.");
    expect(ulozeno.has("skola:nastaveni")).toBe(false);
    await flush();
    expect(s.last(s.hans, "skola:jazyk")).toMatchObject({ jazyk: "cs", vychozi: "cs" });
    expect(() => s.client("skola:uiOtevrit", s.hans, "{rozbité")).not.toThrow();
    expect(() => s.client("skola:prst", s.hans, "{rozbité")).not.toThrow();
  });

  it("F10 akce respektují schopnosti (háček opravneni): Přidat XP bez xp.edit nejde", async () => {
    const s = server();
    s.exp("setHooks")({ opravneni: (_pid: number, sch: string) => (sch === "xp.edit" ? false : undefined) }, "muj-fw");
    const panel = s.exp("spravaPanels")()[0];
    const dat = panel.actions.find((a: any) => a.id === "dat");
    const r = await dat.handler({ caller: s.henry, params: { hrac: s.hans, xp: 10 } });
    expect(r).toMatchObject({ ok: false, message: "Na to nemáš oprávnění." });
    expect(s.exp("xp")(s.hans.id)).toBe(0);
    const profil = panel.actions.find((a: any) => a.id === "profil");
    expect(await profil.handler({ caller: s.hans, params: { hrac: s.henry } })).toMatchObject({ ok: false }); // cizí gramotnost jen s xp.view
    expect(await profil.handler({ caller: s.hans, params: { hrac: s.hans } })).toMatchObject({ ok: true }); // svou ano
  });
});

describe("škola: výkon (audit 1. 11.)", () => {
  beforeEach(() => void vi.useFakeTimers({ now: Date.UTC(2026, 9, 29, 9) }));
  afterEach(() => void vi.useRealTimers());

  it("stav hodiny (infotext) se posílá jen při změně, ne každých 5 s", async () => {
    const s = server();
    await trida(s);
    await s.akce(s.henry, "hodina:zacit");
    const pocet = () => s.hans.emitted.filter(([n]: any) => n === "skola:stav").length;
    await vi.advanceTimersByTimeAsync(6000);
    const po = pocet();
    expect(po).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30000); // 6 ticků bez změny
    expect(pocet()).toBe(po);
  });
});
