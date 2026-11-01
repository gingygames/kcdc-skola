// Škola - serverová část pro Kingdoms Connected (KCDC): výuka čtení a psaní u písaře.
//
// * Všechno ovládá panel školy (web view ui/, klávesa J nebo /skola): server skládá pohled a provádí akce, bez web
//   view se stejné akce ukážou v nativní nabídce.
// * Písař (právo skola.ucit nebo háček jeUcitel z frameworku serveru) založí třídu a průvodce ho provede zařízením:
//   tabule (deska kreseb na zdi nebo na stojanu), školní lavice (stůl a lavice pro dva, listy žáků na stole), případně
//   místa u stolů, které už stojí, a samotné lavice. Místo ukáže náhledem pod zaměřovačem (PropPlacer hry, kolečko
//   otáčí, klik staví), kusy jde přesunout a odebrat. Třídy se ukládají a po restartu se postaví znovu.
// * Hodina: kdo je ve třídě, je na hodině (veřejná třída). Písař vybere stránku slabikáře, píše na tabuli, vyvolá
//   žáka k tabuli (křída, relace kreseb) nebo ke čtení (žák skloněný nad čítankou ukazuje prstem, písař vidí kde a
//   jaké slovo to doopravdy je), zadá předlohu do písanek a písanky zkontroluje.
// * Konec hodiny: jeden formulář, kdo dostane XP gramotnosti za účast, čtení a psaní (návrh podle hodiny), s ochranami
//   (délka hodiny, přítomnost, denní stropy, ne sám sobě). XP odemyká písmena, slabiky, slova a plynné čtení
//   (shared/citelnost.ts); zrcadlí se do nativní stopy hry (Učenost).
// * Pro ostatní moduly export filtrText / legibility: text tak, jak ho hráč přečte.
//
// Napojení na framework serveru: most (identita, práva, úložiště, nabídky) a háčky školy (export setHooks nebo
// SKOLA_CONFIG.hooks): jeUcitel, progresNacti, progresUlozit, lekcePovolit. Nastavení: F10 → Nastavení → Škola.

import { createMost, type MenuOption } from "../../../loutna/kcdc/src/most";
import { registerAdminPanel, type ActionContext } from "../../../loutna/kcdc/src/sprava";
import { nactiSchopnosti, poslatNastaveni, poslatNastaveniPozdeji, type NastaveniDef } from "../../../loutna/kcdc/src/pole";
import type { SettingsObject } from "../../../sprava/src/settings-types";
import { decode } from "../../../kresby/kcdc/src/shared/codec";
import { CHALK, INK_OBRAZEK, INK_PISANKA, OWNER, hotova, inkoustyPro, kx, kxChyba, maApi, nactiSdilene, papirTabule, pripravena, sdilena, ukazat, zapomenout } from "./kresby";
import { axes, faceHeight, normalFromYaw, type V3 } from "../../../kresby/kcdc/src/shared/layout";
import { bezZnacek, filtr, klicStupne, legibility, slova, stav, type Stav } from "./shared/citelnost";
import { bodyTahu, obtazeni, slovneKlic } from "./shared/porovnani";
import { EV, type CteniMsg, type ListFace, type OkoliMsg, type PrstMsg, type XpMsg } from "./shared/protocol";
import { licStojanu } from "../../../kresby/kcdc/src/shared/stojany";
import { KARTA, LAVICE_MODEL, LIST_MODEL, STOJAN, STUL, UI, doSveta, qZ, type DruhUmisteni, type KartaMsg, type UiAkce, type UiAkceMsg, type UiJa, type UiKrok, type UiKus, type UiStrana, type UiView, type UmistenoMsg, type UmistitMsg } from "./shared/ui";
import { doplnit, kopie, overit, schema, VYCHOZI, type Nastaveni } from "./nastaveni";
import { kridouText, obecnaCitanka, predloha, tabuleStrany } from "./sazba";
import { SLABIKARE, type Strana } from "./data";
import { T, ZDROJ, jazyky, kodJazyka, maJazyk, oblast, odebratVlastnika, prekladac, pridatPreklady, tz, type Parametry, type Prekladac, type Slovnik, type Zprava } from "./shared/i18n";
import { nahratVestavene } from "./lang";
import { SEZNAM_SCHOPNOSTI, vytvoritOpravneni, type HacekOpravneni, type Role, type Schopnost } from "./opravneni";
import type { JazykMsg } from "./shared/protocol";

// ---------------------------------------------------------------------------
// nastavení a napojení

interface Hooky {
  /** je hráč písař (učitel)? výchozí: právo skola.ucit */
  jeUcitel(pid: number): boolean | Promise<boolean>;
  /** smí hráč schopnost (src/opravneni.ts)? true/false; undefined = rozhodne škola sama */
  opravneni: HacekOpravneni;
  /** jazyk hráče z frameworku ("cs", "en" …); null = výchozí serveru (volba hráče /skola jazyk má přednost) */
  jazyk(pid: number): string | null | undefined | Promise<string | null | undefined>;
  /** XP a historie postavy (null = nová); výchozí most.storage "skola:progres/<charId>" */
  progresNacti(charId: string): Progres | null | Promise<Progres | null>;
  progresUlozit(charId: string, p: Progres): boolean | Promise<boolean>;
  /** smí hodina začít? (poplatek, rozvrh, licence cechu); true nebo důvod */
  lekcePovolit(ucitelPid: number, studentPids: number[]): boolean | string | Promise<boolean | string>;
}
const HACKY: (keyof Hooky)[] = ["jeUcitel", "opravneni", "jazyk", "progresNacti", "progresUlozit", "lekcePovolit"];

interface Config {
  command: string;
  admini: string[];
  ucitele: string[]; // záloha bez mostu: přezdívky písařů ("*" = všichni)
  ladici: string[]; // záloha bez mostu: přezdívky ladičů (právo skola.debug)
  hooks?: Partial<Hooky>;
  /** přemapování schopností na role: { "lesson.xp": ["admin"] } (src/opravneni.ts SCHOPNOSTI) */
  opravneni?: Partial<Record<Schopnost, Role[]>>;
  /** další jazyky nebo úpravy textů: { de: { "view.title.school": "Schule" } } */
  jazyky?: Record<string, Slovnik>;
}

declare const SKOLA_CONFIG: Partial<Config> | undefined;

const CFG: Config = {
  command: "skola",
  admini: [],
  ucitele: [],
  ladici: [],
  ...(typeof SKOLA_CONFIG !== "undefined" ? SKOLA_CONFIG : {}),
};

let N: Nastaveni = kopie(VYCHOZI);

let podrobne = false; // /skola debug log: podrobný log (ladič)
const log = (text: string) => console.log("[skola] " + text);
const ladit = (text: string) => void (podrobne && log("[debug] " + text));
// jemná práva skola.<schopnost> musí shim mostu znát (prázdný seznam = nikdo), jinak neznámé právo pustí každého
const most = createMost({
  perms: { ...Object.fromEntries(SEZNAM_SCHOPNOSTI.map((s) => ["skola." + s, [] as string[]])), "skola.admin": CFG.admini, "skola.ucit": CFG.ucitele, "skola.debug": CFG.ladici },
  log,
});
const safely = (what: string, pr: Promise<unknown>) => pr.catch((e: unknown) => log(`${what}: ${String(e)}`));
const send = (p: Player, ev: string, m: unknown) => p.emit(ev, JSON.stringify(m));

const cizi: { h: Partial<Hooky>; owner: string | null } = { h: { ...(CFG.hooks ?? {}) }, owner: null };

/** háčky frameworku (export setHooks): přepíše jen dodané, zmizí se zastavením vlastníka */
function setHooks(h: Partial<Hooky>, owner: string) {
  const ok: Partial<Hooky> = {};
  for (const k of HACKY) {
    if (typeof h?.[k] === "function") (ok as any)[k] = h[k];
  }
  cizi.h = { ...(CFG.hooks ?? {}), ...ok };
  cizi.owner = owner ?? null;
  log(`háčky ${Object.keys(ok).join(", ") || "žádné"} od ${owner}`);
  if (ok.jazyk) for (const p of Player.all()) void safely("jazyk", nactiJazyk(p, true));
  return Object.keys(ok).length;
}

// ---------------------------------------------------------------------------
// oprávnění (src/opravneni.ts): škola se ptá jen na schopnosti, framework je může rozhodnout háčkem

const prava = vytvoritOpravneni({
  pravo: (pid, pravo) => most.perms.has(pid, pravo),
  hacky: () => ({ opravneni: cizi.h.opravneni, jeUcitel: cizi.h.jeUcitel }),
  mapa: CFG.opravneni,
  log,
});
const muze = (p: Player | number, s: Schopnost) => prava.muze(typeof p === "number" ? p : p.id, s);
const jeUcitel = (p: Player) => muze(p, "lesson.run");
const jeAdmin = (p: Player) => muze(p, "class.manage");

// ---------------------------------------------------------------------------
// jazyk hráče (src/shared/i18n.ts, slovníky src/lang/): volba hráče > háček frameworku > výchozí serveru (F10)

const KLIC_JAZYK = (c: string) => "skola:jazyk/" + c;
const jazykHracu = new Map<number, string>();
/** oblasti textů, které potřebuje klient a stránky UI (posílají se se změnou jazyka) */
const OBLASTI_KLIENTA = ["client.", "page.", "card.", "level.", "letters."];

function nahratJazyky() {
  nahratVestavene();
  for (const [j, s] of Object.entries(CFG.jazyky ?? {})) pridatPreklady(j, s);
}
nahratJazyky();

const vychoziJazyk = () => (maJazyk(N.jazyk.vychozi) ? kodJazyka(N.jazyk.vychozi) : ZDROJ);
const jazyk = (p: Player | number) => jazykHracu.get(typeof p === "number" ? p : p.id) ?? vychoziJazyk();
const tr = (p: Player | number): Prekladac => prekladac(jazyk(p), vychoziJazyk());

async function nactiJazyk(p: Player, poslat = true): Promise<string> {
  let j: string | null = null;
  if (N.jazyk.volba) {
    try {
      const v = await most.storage.get(KLIC_JAZYK(await cid(p)));
      if (typeof v === "string" && maJazyk(v)) j = kodJazyka(v);
    } catch {
      // bez úložiště
    }
  }
  if (!j && cizi.h.jazyk) {
    try {
      const v = await cizi.h.jazyk(p.id);
      if (v && maJazyk(v)) j = kodJazyka(v);
    } catch (e) {
      log(`háček jazyk: ${String(e)}`);
    }
  }
  const pred = jazykHracu.get(p.id);
  if (j) jazykHracu.set(p.id, j);
  else jazykHracu.delete(p.id);
  if (poslat && (pred !== jazyk(p) || !jazykPoslan.has(p.id))) poslatJazyk(p);
  return jazyk(p);
}

const jazykPoslan = new Set<number>();
/** klient dostane jazyk a texty své oblasti (i jazyky a úpravy přidané serverem) */
function poslatJazyk(p: Player) {
  jazykPoslan.add(p.id);
  send(p, EV.jazyk, { jazyk: jazyk(p), vychozi: vychoziJazyk(), texty: oblast(jazyk(p), OBLASTI_KLIENTA, vychoziJazyk()) } satisfies JazykMsg);
}

async function nastavitJazyk(p: Player, kod: string): Promise<Zprava> {
  const j = kodJazyka(kod);
  if (!N.jazyk.volba) return T("msg.lang.locked");
  if (j !== "auto" && !maJazyk(j)) return T("msg.lang.unknown", { lang: kod, list: jazyky().join(", ") });
  try {
    if (j === "auto") await most.storage.delete(KLIC_JAZYK(await cid(p)));
    else await most.storage.set(KLIC_JAZYK(await cid(p)), j);
  } catch {
    // jen do odpojení
  }
  if (j === "auto") jazykHracu.delete(p.id);
  else jazykHracu.set(p.id, j);
  await nactiJazyk(p, false);
  poslatJazyk(p);
  if (panelHrace(p).otevreny) await obnovit(p);
  return T("msg.lang.set", { lang: jazyk(p) });
}

/** oznámení hráči (zpráva se přeloží do jeho jazyka; hotový text projde, jak je) */
const notify = (p: Player | number, x: Zprava | string, kind: "info" | "success" | "warning" | "error" = "info") =>
  void most.notify(typeof p === "number" ? p : p.id, tz(jazyk(p), x, vychoziJazyk()), kind);
const info = (p: Player, x: Zprava | string) => p.emit(EV.info, JSON.stringify({ text: tz(jazyk(p), x, vychoziJazyk()) }));
/** překladač výchozího jazyka serveru (panel Správy, nastavení, sdílené popisky kreseb, data pro framework) */
const trServer = (): Prekladac => prekladac(vychoziJazyk(), vychoziJazyk());
/** text, který se teprve přeloží (zpráva), nebo hotový text (jména, text písaře, chyby kreseb) */
type Text = Zprava | string;
/** zprávy spojené oddělovačem v jazyce čtenáře (klíč s {a} a {b}, např. msg.join.list) */
const spojit = (casti: Text[], klic = "msg.join.list"): Text => (casti.length ? casti.reduce((a, b) => T(klic, { a, b })) : "");
/** název stupně gramotnosti a co odemkne další XP, v jazyce překladače */
const nazevStupne = (t: Prekladac, st: Stav) => t(klicStupne(st.stupen));
const dalsiText = (t: Prekladac, st: Stav) => (st.dalsi ? t(st.dalsi.klic, st.dalsi.a) : null);

// ---------------------------------------------------------------------------
// kresby (tabule a listy): src/kresby.ts; bez API kreseb se jen čte (líc listu si škola pamatuje sama)

// ---------------------------------------------------------------------------
// data: třídy a profily

interface Misto {
  k: string; // id v panelu
  stul?: string; // patří ke školní lavici (stůl + lavice)
  pos: V3; // kde student sedí / stojí
  cit: number | null; // deska kreseb: čítanka
  pis: number | null; // deska kreseb: písanka
  fc: ListFace; // líc čítanky
  fp: ListFace; // líc písanky
}

interface Trida {
  id: number;
  nazev: string;
  ucitel: string; // id postavy
  jmeno: string;
  pos: V3;
  vw: number;
  tabule: number | null;
  tabuleFace: ListFace | null;
  mista: Misto[];
  lavice: { def: any; k?: string }[]; // SmartObject definice (toJSON)
  stoly?: Stul[]; // školní lavice: stůl (Prop) + lavice (smart object), místa žáků jsou v mista
  pruvodce?: boolean; // průvodce zařízením dokončený
  verejna: boolean;
  strana: number; // stránka slabikáře
  tabuleDruh?: { kind: "deska" | "stojan"; yaw?: number }; // ke stavbě tabule znovu (oprava třídy)
  ulozene?: { nazev: string; klic: string }[]; // uložené tabule (sdílené kresby)
  neupeceno?: number; // tabule psaná bez pečení (ostatní ji vidí čarami): kdy naposledy, upeče se na konci hodiny
}

/** školní lavice: stůl a před ním lavice pro dva (shared/ui.ts STUL) */
interface Stul {
  k: string;
  pos: V3;
  yaw: number; // stupně, žáci hledí na +Y stolu
  deska: number | null; // z desky stolu (změřená)
}

export interface Progres {
  xp: number;
  den?: { d: string; celkem: number; od: Record<string, number> };
  historie?: { t: number; xp: number; od: string; co: string }[];
}

const KLIC = { tridy: "skola:tridy", nastaveni: "skola:nastaveni", progres: (c: string) => "skola:progres/" + c };
let tridy: Trida[] = [];
let dalsiId = 1;
const lavice = new Map<string, any>(); // "trida:i" -> SmartObject

const profily = new Map<number, { cid: string; p: Progres }>();

async function cid(p: Player): Promise<string> {
  try {
    return String((await most.identity.getCharacterId(p.id)) ?? "p" + p.id);
  } catch {
    return "p" + p.id;
  }
}

const nacitani = new Map<number, Promise<{ cid: string; p: Progres }>>();

/** profil hráče; souběžná volání čekají na jedno načtení (jinak by poslední uložení přepsalo XP) */
function nactiProfil(p: Player): Promise<{ cid: string; p: Progres }> {
  const bezi = nacitani.get(p.id);
  if (bezi) return bezi;
  const pr = nactiProfilTed(p).finally(() => nacitani.delete(p.id));
  nacitani.set(p.id, pr);
  return pr;
}

async function nactiProfilTed(p: Player): Promise<{ cid: string; p: Progres }> {
  const c = await cid(p);
  const old = profily.get(p.id);
  if (old && old.cid === c) return old;
  let pr: Progres | null = null;
  try {
    pr = cizi.h.progresNacti ? await cizi.h.progresNacti(c) : ((await most.storage.get(KLIC.progres(c))) as Progres | null);
  } catch (e) {
    log(`progres ${c}: ${String(e)}`);
  }
  const r = { cid: c, p: pr && typeof pr.xp === "number" ? pr : { xp: 0 } };
  profily.set(p.id, r);
  return r;
}

async function ulozProfil(c: string, pr: Progres) {
  try {
    if (cizi.h.progresUlozit) return !!(await cizi.h.progresUlozit(c, pr));
    return await most.storage.set(KLIC.progres(c), JSON.parse(JSON.stringify(pr)));
  } catch (e) {
    log(`uložit progres ${c}: ${String(e)}`);
    return false;
  }
}

const stavHrace = (pid: number): Stav => stav(profily.get(pid)?.p.xp ?? 0, N.pravidla);
const poslatProfil = (p: Player) => send(p, EV.profil, { xp: profily.get(p.id)?.p.xp ?? 0, pravidla: N.pravidla });

async function ulozTridy() {
  try {
    await most.storage.set(KLIC.tridy, JSON.parse(JSON.stringify({ dalsiId, tridy })));
  } catch (e) {
    log(`uložit třídy: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// geometrie

const dist = (a: { x: number; y: number; z: number } | V3, b: V3) => {
  const ax = Array.isArray(a) ? a[0] : a.x;
  const ay = Array.isArray(a) ? a[1] : a.y;
  const az = Array.isArray(a) ? a[2] : a.z;
  return Math.hypot(ax - b[0], ay - b[1], az - b[2]);
};
const pos3 = (p: Player): V3 => [p.position.x, p.position.y, p.position.z];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const r3 = (v: V3): V3 => v.map((x) => Math.round(x * 1000) / 1000) as V3;

/** kam se hráč dívá: povrch do 6 m (World.raycast jeho klientem) */
async function zamer(p: Player): Promise<{ pos: V3; n: V3 } | null> {
  const eye = { x: p.position.x, y: p.position.y, z: p.position.z + 1.6 };
  const d = p.lookDirection ?? { x: 0, y: 1, z: 0 };
  try {
    const r = await World.raycast(p, new Vector3(eye.x, eye.y, eye.z), new Vector3(eye.x + d.x * 6, eye.y + d.y * 6, eye.z + d.z * 6), { mode: "cover" });
    if (r.answered && r.hit) {
      const n = r.hit.normal;
      return { pos: [r.hit.position.x, r.hit.position.y, r.hit.position.z], n: norm([n.x, n.y, n.z]) };
    }
  } catch (e) {
    log("raycast: " + String(e));
  }
  return null;
}

function yawHrace(p: Player): number {
  const d = p.lookDirection ?? { x: 0, y: 1, z: 0 };
  return (Math.atan2(-d.x, d.y) * 180) / Math.PI;
}

const tridaU = (p: Player, polomer = N.hodina.polomer) =>
  tridy.filter((t) => t.vw === (p.virtualWorld ?? 0) && dist(p.position, t.pos) <= polomer).sort((a, b) => dist(p.position, a.pos) - dist(p.position, b.pos))[0] ?? null;

function mistoU(p: Player): { t: Trida; i: number; m: Misto } | null {
  let best: { t: Trida; i: number; m: Misto } | null = null;
  let bd = N.hodina.dosahStolu;
  for (const t of tridy) {
    if (t.vw !== (p.virtualWorld ?? 0)) continue;
    t.mista.forEach((m, i) => {
      const d = dist(p.position, m.pos);
      if (d <= bd) {
        bd = d;
        best = { t, i, m };
      }
    });
  }
  return best;
}

// ---------------------------------------------------------------------------
// stavba třídy: písař ukáže místo náhledem (PropPlacer u klienta, shared/ui.ts), server staví znovu z pózy

/** třídu mění jen její písař (nebo admin školy) */
async function smiTridu(p: Player, t: Trida): Promise<boolean> {
  return (t.ucitel === (await cid(p)) && (await muze(p, "class.edit"))) || (await jeAdmin(p));
}

async function mojeTridy(p: Player) {
  const c = await cid(p);
  return tridy.filter((t) => t.ucitel === c);
}

async function zalozitTridu(p: Player, nazev?: string): Promise<Vysledek> {
  if (tridaU(p, 3)) return chyba("msg.class.exists");
  if ((await mojeTridy(p)).length >= N.vybaveni.maxTrid && !(await muze(p, "class.limit.bypass"))) return chyba("msg.class.limit", { max: N.vybaveni.maxTrid });
  const t: Trida = {
    id: dalsiId++, nazev: (nazev ?? "").trim().slice(0, 40) || tr(p)("view.class.defaultName", { name: p.nickname }), ucitel: await cid(p), jmeno: p.nickname, pos: r3(pos3(p)), vw: p.virtualWorld ?? 0,
    tabule: null, tabuleFace: null, mista: [], lavice: [], stoly: [], verejna: N.hodina.verejna, strana: 0, pruvodce: false,
  };
  tridy.push(t);
  await ulozTridy();
  log(`${p.nickname}: třída ${t.id}`);
  return ok("msg.class.created");
}

let posledniKlic = Date.now() % 1e6;
const novyKlic = () => (posledniKlic++).toString(36);

/** kam až smí písař stavět: do 10 m od sebe a v poloměru třídy */
function mimoTridu(p: Player, t: Trida, pos: V3): Zprava | null {
  if (!pos.every(Number.isFinite)) return T("msg.build.cannotHere");
  if (dist(p.position, pos) > 10) return T("msg.build.tooFar");
  if (dist(pos, t.pos) > N.hodina.polomer) return T("msg.build.outsideClass", { radius: N.hodina.polomer });
  return null;
}

function postavitTabuli(t: Trida, druh: "zed" | "stojan", pos: V3, n: V3, yaw: number): Vysledek {
  const create = kx("boardCreate");
  if (!create) return chyba("msg.board.needsDrawings");
  const w = N.vybaveni.tabuleSirka;
  const h = N.vybaveni.tabuleVyska;
  let face: ListFace;
  let extra: Record<string, unknown> = {};
  if (druh === "zed") {
    if (Math.abs(n[2]) > 0.5) return chyba("msg.board.needsWall");
    const nn = norm([n[0], n[1], 0]);
    face = { pos: r3([pos[0] + nn[0] * 0.012, pos[1] + nn[1] * 0.012, pos[2]]), n: r3(nn), w, h };
  } else {
    // dřevěná tabule na sloupku: pos = pata modelu, yaw = natočení modelu (náhled); líc je deska vedle sloupku
    const yawLice = yaw - STOJAN.yaw;
    const l = licStojanu(STOJAN, pos, yawLice);
    face = { pos: r3(l.pos), n: r3(l.n), w: Math.min(w, STOJAN.sirka), h: Math.min(h, STOJAN.vyska) };
    extra = { kind: "stojan", yaw: Math.round(yawLice * 10) / 10, model: STOJAN.model };
  }
  const id = create({ owner: OWNER, pos: face.pos, n: face.n, w: face.w, h: face.h, cols: 1, rows: 1, ...extra });
  if (typeof id !== "number") return chyba("msg.board.buildFailed", { error: String(id) });
  if (t.tabule !== null) kx("boardRemove")?.(t.tabule, OWNER);
  t.tabule = id;
  t.tabuleFace = face;
  t.tabuleDruh = extra.kind === "stojan" ? { kind: "stojan", yaw: extra.yaw as number } : { kind: "deska" };
  t.neupeceno = undefined;
  return ok(druh === "zed" ? "msg.board.onWall" : "msg.board.onStand");
}

/** dva listy na desce stolu před žákem (čítanka vlevo, písanka vpravo), líc skloněný k němu o 8° */
function listyMista(stred: V3, kZakovi: V3, w: number): { fc: ListFace; fp: ListFace } {
  const k = norm([kZakovi[0], kZakovi[1], 0]);
  const tilt = (8 * Math.PI) / 180;
  const n = norm([k[0] * Math.sin(tilt), k[1] * Math.sin(tilt), Math.cos(tilt)]);
  const ax = axes(n);
  const h = faceHeight(w, 1, 1);
  const half = w / 2 + 0.012;
  const at = (s: number): V3 => r3([stred[0] + ax.u[0] * s * half, stred[1] + ax.u[1] * s * half, stred[2] + 0.006 + ax.u[2] * s * half]);
  return { fc: { pos: at(-1), n: r3(n), w, h }, fp: { pos: at(1), n: r3(n), w, h } };
}

/** místo žáka: desky kreseb pro oba listy, čítanka s obecným vzhledem; plati() = třída (a stůl) po čekání ještě stojí */
async function noveMisto(t: Trida, sedi: V3, fc: ListFace, fp: ListFace, stul?: string, plati = () => tridy.includes(t)): Promise<Misto | null> {
  const create = kx("boardCreate");
  let cit: number | null = null;
  let pis: number | null = null;
  if (create) {
    const a = create({ owner: OWNER, pos: fc.pos, n: fc.n, w: fc.w, h: fc.h, cols: 1, rows: 1 });
    const b = create({ owner: OWNER, pos: fp.pos, n: fp.n, w: fp.w, h: fp.h, cols: 1, rows: 1 });
    cit = typeof a === "number" ? a : null;
    pis = typeof b === "number" ? b : null;
    await ukazat(cit, "citanka", obecnaCitanka(), trServer()("letters.title.reader")); // jedna textura pro čítanky všech stolů
  }
  if (!plati()) {
    // třídu nebo stůl mezitím někdo zbořil: desky pryč, místo nevzniká
    for (const b of [cit, pis]) if (b !== null) kx("boardRemove")?.(b, OWNER);
    return null;
  }
  const m: Misto = { k: novyKlic(), pos: r3(sedi), cit, pis, fc, fp, ...(stul ? { stul } : {}) };
  t.mista.push(m);
  return m;
}

function odebratMisto(t: Trida, m: Misto) {
  for (const b of [m.cit, m.pis]) if (b !== null) kx("boardRemove")?.(b, OWNER);
  t.mista = t.mista.filter((x) => x !== m);
  for (const [id, c] of [...ctenari]) if (c.m === m) zvednout(Player.getById(id)!);
}

/** místo u stolu, který ve světě už stojí: písař ukázal desku stolu, žák sedí na straně, odkud písař míří */
async function postavitMisto(t: Trida, pos: V3, n: V3, yaw: number): Promise<Vysledek> {
  if (n[2] < 0.7) return chyba("msg.build.aimDesk");
  if (t.mista.length + (rezervace.get(t.id) ?? 0) >= N.vybaveni.maxMist) return chyba("msg.build.seatsFull", { n: t.mista.length });
  const kZakovi = normalFromYaw(yaw + 180);
  const sedi: V3 = [pos[0] + kZakovi[0] * 0.55, pos[1] + kZakovi[1] * 0.55, pos[2] - 0.75];
  const l = listyMista(pos, kZakovi, N.vybaveni.listSirka);
  await noveMisto(t, sedi, l.fc, l.fp);
  return ok(maApi() ? "msg.build.seatPlaced" : "msg.build.seatPlacedReadOnly", { n: t.mista.length });
}

// školní lavice: stůl (Prop) a před ním lavice pro dva (smart object hry), každý žák má na stole své dva listy
const ziveStoly = new Map<string, { prop: any; lavice: any }>(); // "trida:k"

const rezervace = new Map<number, number>(); // třída -> místa stolů, které se právě stavějí (rychlé kliky nepřekročí limit)

function spawnStul(t: Trida, s: Stul) {
  const k = t.id + ":" + s.k;
  zbouratStul(t, s); // dvojí načtení tříd: starý stůl pryč, ať po něm nezůstane prop
  let prop: any = null;
  let so: any = null;
  try {
    prop = Prop.spawn(STUL.model, new Vector3(s.pos[0], s.pos[1], s.pos[2]), new Vector3(0, 0, s.yaw), 1, "static", t.vw);
  } catch (e) {
    log(`stůl ${k}: ${String(e)}`);
  }
  try {
    const q = qZ(s.yaw);
    so = SmartObject.spawn({ blueprint: STUL.lavice, position: doSveta(s.pos, s.yaw, 0, STUL.laviceY), rotation: [q[1], q[2], q[3], q[0]], name: `skola-${t.id}-${s.k}` }, t.vw);
  } catch (e) {
    log(`lavice stolu ${k}: ${String(e)}`);
  }
  ziveStoly.set(k, { prop, lavice: so });
}

function zbouratStul(t: Trida, s: Stul) {
  const k = t.id + ":" + s.k;
  const z = ziveStoly.get(k);
  for (const x of [z?.prop, z?.lavice])
    try {
      x?.destroy();
    } catch {
      // už není
    }
  ziveStoly.delete(k);
}

/** výška desky stolu: paprsek shora klientem písaře (prop se u něj objeví až za chvíli), jinak výchozí */
async function zmeritDesku(p: Player | null, s: Stul): Promise<number> {
  const bod = doSveta(s.pos, s.yaw, 0, STUL.listY);
  for (let i = 0; p && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await World.raycast(p, new Vector3(bod[0], bod[1], s.pos[2] + 2), new Vector3(bod[0], bod[1], s.pos[2] + 0.2), { mode: "cover" });
      const z = r.answered && r.hit ? r.hit.position.z : NaN;
      if (z > s.pos[2] + 0.4 && z < s.pos[2] + 1.3) return Math.round(z * 1000) / 1000;
    } catch {
      break;
    }
  }
  return Math.round((s.pos[2] + STUL.vyska) * 1000) / 1000;
}

/** volná místa pro novou školní lavici (při přesunu se počítají i místa přesouvaného stolu jako volná) */
const volnoProStul = (t: Trida, presun?: string) =>
  N.vybaveni.maxMist - t.mista.length - (rezervace.get(t.id) ?? 0) + (presun ? t.mista.filter((m) => m.stul === presun).length : 0) >= STUL.sedadla.length;

async function postavitStul(p: Player, t: Trida, pos: V3, yaw: number, k = novyKlic()): Promise<Vysledek> {
  if (!volnoProStul(t)) return chyba("msg.build.seatsFullMax", { n: t.mista.length, max: N.vybaveni.maxMist });
  const s: Stul = { k, pos: r3(pos), yaw: Math.round(yaw * 10) / 10, deska: null };
  spawnStul(t, s);
  if (!ziveStoly.get(t.id + ":" + k)?.prop) {
    zbouratStul(t, s);
    return chyba("msg.build.tableFailed");
  }
  (t.stoly = t.stoly ?? []).push(s);
  const n = STUL.sedadla.length;
  rezervace.set(t.id, (rezervace.get(t.id) ?? 0) + n);
  try {
    s.deska = await zmeritDesku(p, s);
    const stoji = () => tridy.includes(t) && (t.stoly ?? []).includes(s);
    if (!stoji()) return NIC;
    const w = Math.min(N.vybaveni.listSirka, 0.3);
    const kZakovi = normalFromYaw(s.yaw + 180);
    for (const x of STUL.sedadla) {
      const stred = doSveta([s.pos[0], s.pos[1], s.deska], s.yaw, x, STUL.listY);
      const l = listyMista(stred, kZakovi, w);
      if (!(await noveMisto(t, doSveta(s.pos, s.yaw, x, STUL.laviceY - 0.05), l.fc, l.fp, s.k, stoji))) return NIC;
    }
  } finally {
    rezervace.set(t.id, Math.max(0, (rezervace.get(t.id) ?? 0) - n));
  }
  return ok("msg.build.deskPlaced", { pupils: STUL.sedadla.length, n: t.mista.length });
}

function odebratStul(t: Trida, s: Stul) {
  zbouratStul(t, s);
  for (const m of t.mista.filter((x) => x.stul === s.k)) odebratMisto(t, m);
  t.stoly = (t.stoly ?? []).filter((x) => x !== s);
}

function spawnLavice(t: Trida, i: number) {
  const l = t.lavice[i];
  try {
    lavice.get(t.id + ":" + i)?.destroy(); // dvojí načtení tříd: starou lavici pryč
    const so = SmartObject.spawn(l.def, t.vw);
    lavice.set(t.id + ":" + i, so);
  } catch (e) {
    log(`lavice ${t.id}:${i}: ${String(e)}`);
  }
}

/** samotná lavice na sezení (bez stolu), smart object z nastavení */
function postavitLavici(t: Trida, pos: V3, yaw: number, k = novyKlic()): Vysledek {
  const bp = N.vybaveni.lavice;
  if (!bp) return chyba("msg.build.benchesOff");
  if (t.lavice.length >= N.vybaveni.maxMist) return chyba("msg.build.benchesFull", { n: t.lavice.length });
  const q = qZ(yaw);
  const def = { blueprint: bp, position: r3(pos), rotation: [q[1], q[2], q[3], q[0]], name: `skola-${t.id}-${k}` };
  try {
    const so = SmartObject.spawn(def, t.vw);
    t.lavice.push({ def: { ...def, ...(so.toJSON() ?? {}), position: def.position, rotation: def.rotation }, k }); // poloha jako pole (toJSON může vrátit Vector3)
    lavice.set(t.id + ":" + (t.lavice.length - 1), so);
  } catch (e) {
    return chyba("msg.build.benchFailed", { error: String(e) });
  }
  return ok("msg.build.benchPlaced");
}

function respawnLavice(t: Trida) {
  respawnLaviceStop(t);
  t.lavice.forEach((_, i) => spawnLavice(t, i));
}

/** kusy třídy pro panel (přehled, přesunout, odebrat); názvy v jazyce překladače (hráče, který je uvidí) */
function kusy(t: Trida, tt: Prekladac = trServer()): UiKus[] {
  const out: UiKus[] = [];
  if (t.tabule !== null) out.push({ id: "tabule", druh: "tabule", nazev: tt(t.tabuleDruh?.kind === "stojan" ? "view.piece.boardStand" : "view.piece.boardWall"), popis: tt("view.piece.boardSize", { w: N.vybaveni.tabuleSirka, h: N.vybaveni.tabuleVyska }) });
  (t.stoly ?? []).forEach((s, i) => out.push({ id: "stul:" + s.k, druh: "stul", nazev: tt("view.piece.desk", { i: i + 1 }), popis: tt("view.piece.deskInfo", { n: t.mista.filter((m) => m.stul === s.k).length }) }));
  t.mista.filter((m) => !m.stul).forEach((m, i) => out.push({ id: "misto:" + m.k, druh: "misto", nazev: tt("view.piece.seat", { i: i + 1 }), popis: tt("view.piece.seatInfo") }));
  t.lavice.forEach((l, i) => out.push({ id: "lavice:" + (l.k ?? String(i)), druh: "lavice", nazev: tt("view.piece.bench", { i: i + 1 }), popis: tt("view.piece.benchInfo") }));
  return out;
}

/** odebrat kus podle id z panelu */
function odebratKus(t: Trida, id: string): Vysledek {
  const [druh, k] = [id.split(":")[0], id.split(":").slice(1).join(":")];
  if (druh === "tabule" && t.tabule !== null) {
    kx("boardRemove")?.(t.tabule, OWNER);
    t.tabule = null;
    t.tabuleFace = null;
    t.neupeceno = undefined;
    return ok("msg.piece.boardRemoved");
  }
  const s = (t.stoly ?? []).find((x) => x.k === k);
  if (druh === "stul" && s) return odebratStul(t, s), ok("msg.piece.deskRemoved");
  const m = t.mista.find((x) => x.k === k);
  if (druh === "misto" && m) return odebratMisto(t, m), ok("msg.piece.seatRemoved");
  const i = t.lavice.findIndex((l, j) => (l.k ?? String(j)) === k);
  if (druh === "lavice" && i >= 0) {
    t.lavice.splice(i, 1);
    respawnLavice(t); // klíče lavic jsou podle pořadí: postavit znovu
    return ok("msg.piece.benchRemoved");
  }
  return chyba("msg.piece.gone");
}

async function zrusitTridu(t: Trida): Promise<void> {
  ukoncitHodinu(t, false);
  for (const m of [...t.mista]) odebratMisto(t, m);
  for (const s of [...(t.stoly ?? [])]) zbouratStul(t, s);
  if (t.tabule !== null) kx("boardRemove")?.(t.tabule, OWNER);
  t.lavice = [];
  respawnLaviceStop(t);
  tridy = tridy.filter((x) => x !== t);
  await ulozTridy();
}
// ---------------------------------------------------------------------------
// hodina

interface Ucastnik {
  pid: number;
  jmeno: string;
  od: number;
  ms: number; // čas ve třídě
  cetl: boolean;
  psal: boolean;
}

interface Hodina {
  t: Trida;
  ucitel: number;
  zacatek: number;
  ucastnici: Map<number, Ucastnik>;
  cte: number | null; // kdo čte s prstem
  zadani: { text: string; data: string; body: [number, number][] } | null;
  pisanky: Map<number, { skore: number; d: string; stav: "odevzdano" | "uznano" | "znovu"; misto: Misto }>;
}

const hodiny = new Map<number, Hodina>(); // trida.id -> hodina
const ctenari = new Map<number, { t: Trida; m: Misto; kontrola: boolean }>(); // kdo je skloněný
const prstOkno = new Map<number, { at: number; n: number }>();

const hodinaUcitele = (p: Player) => [...hodiny.values()].find((h) => h.ucitel === p.id) ?? null;
const hodinaStudenta = (p: Player) => [...hodiny.values()].find((h) => h.ucastnici.has(p.id)) ?? null;
const strana = (t: Trida): Strana => N.slabikar[Math.max(0, Math.min(N.slabikar.length - 1, t.strana))] ?? N.slabikar[0];

function infoHodiny(h: Hodina) {
  const u = Player.getById(h.ucitel);
  const s = strana(h.t);
  if (u) {
    const t = tr(u);
    const cte = h.cte !== null ? t("msg.status.reading", { name: Player.getById(h.cte)?.nickname ?? "?" }) : "";
    send(u, EV.stav, { text: t("msg.status.teacher", { page: s.nazev, n: h.ucastnici.size, reading: cte, cmd: CFG.command }) });
  }
  for (const id of h.ucastnici.keys()) {
    const p = Player.getById(id);
    if (!p) continue;
    const t = tr(p);
    const kde = mistoU(p) ? t("msg.status.leanOver", { cmd: CFG.command }) : t("msg.status.sitDown");
    send(p, EV.stav, { text: t("msg.status.student", { teacher: u?.nickname ?? t("msg.scribeGen"), page: s.nazev, where: kde, reading: h.cte === id ? t("msg.status.readAloud") : "" }) });
  }
}

async function zacitHodinu(p: Player, t: Trida): Promise<Vysledek> {
  if (hodiny.has(t.id)) return chyba("msg.lesson.running");
  if (hodinaUcitele(p)) return chyba("msg.lesson.otherRunning");
  const kolem = Player.all().filter((x) => x.id !== p.id && x.virtualWorld === t.vw && dist(x.position, t.pos) <= N.hodina.polomer);
  try {
    if (cizi.h.lekcePovolit) {
      const r = await cizi.h.lekcePovolit(p.id, kolem.map((x) => x.id));
      if (r !== true) return typeof r === "string" ? vysl(r, "warn") : chyba("msg.lesson.cannotStart");
    }
  } catch (e) {
    log(`háček lekcePovolit: ${String(e)}`);
  }
  const h: Hodina = { t, ucitel: p.id, zacatek: Date.now(), ucastnici: new Map(), cte: null, zadani: null, pisanky: new Map() };
  hodiny.set(t.id, h);
  if (t.verejna) for (const x of kolem) pridatUcastnika(h, x);
  udalost("skola:lekce", { faze: "zacatek", trida: t.id, ucitel: p.id, studenti: [...h.ucastnici.keys()] });
  infoHodiny(h);
  log(`${p.nickname}: hodina ve třídě ${t.id}`);
  return ok("msg.lesson.started", { page: strana(t).nazev, n: h.ucastnici.size });
}

function pridatUcastnika(h: Hodina, p: Player) {
  if (h.ucastnici.has(p.id) || p.id === h.ucitel) return;
  if (hodinaStudenta(p)) return;
  h.ucastnici.set(p.id, { pid: p.id, jmeno: p.nickname, od: Date.now(), ms: 0, cetl: false, psal: false });
  void nactiProfil(p).then(() => poslatProfil(p));
  const u = Player.getById(h.ucitel)?.nickname;
  info(p, T("msg.lesson.joined", { teacher: u ?? T("msg.scribeGen") }));
}

/** po 5 s: přítomnost, noví příchozí (veřejná třída), odchod učitele */
const TICK = 5000;
function tick() {
  for (const t of tridy) if (t.neupeceno && !hodiny.has(t.id) && Date.now() - t.neupeceno > 5 * 60000) upect(t);
  for (const h of [...hodiny.values()]) {
    const u = Player.getById(h.ucitel);
    if (!u) {
      ukoncitHodinu(h.t, false);
      continue;
    }
    if (dist(u.position, h.t.pos) > N.hodina.polomer * 3) {
      notify(u, T("msg.lesson.teacherLeft"), "warning");
      ukoncitHodinu(h.t, false);
      continue;
    }
    for (const x of Player.all()) {
      const ve = x.virtualWorld === h.t.vw && dist(x.position, h.t.pos) <= N.hodina.polomer;
      const uc = h.ucastnici.get(x.id);
      if (uc && ve) uc.ms += TICK;
      else if (!uc && ve && h.t.verejna) pridatUcastnika(h, x);
    }
    infoHodiny(h);
  }
}

/** karta hodiny po 1 s (jen změny): písař vidí žáky a jejich stav, žák co má dělat a svůj postup */
const kartyPoslane = new Map<number, string>();
function kartaHrace(p: Player): KartaMsg["hodina"] {
  const h = hodinaUcitele(p) ?? hodinaStudenta(p);
  if (!h) return null;
  const s = strana(h.t);
  const t = tr(p);
  const zaklad = {
    ucitel: Player.getById(h.ucitel)?.nickname ?? t("msg.scribe"), strana: s.nazev, pismeno: s.pismeno,
    minut: Math.floor((Date.now() - h.zacatek) / 60000), minMinut: N.hodina.minMinut,
    zadani: h.zadani?.text ?? null, cte: h.cte !== null ? (Player.getById(h.cte)?.nickname ?? "?") : null,
  };
  if (h.ucitel === p.id) {
    return {
      ...zaklad, role: "ucitel",
      zaci: [...h.ucastnici.values()].map((u) => {
        const x = Player.getById(u.pid);
        return { jmeno: u.jmeno, sedi: !!x && mistoU(x)?.t === h.t, cte: h.cte === u.pid, pisanka: h.pisanky.get(u.pid)?.stav ?? null };
      }),
    };
  }
  const xp = profily.get(p.id)?.p.xp ?? 0;
  const st = stav(xp, N.pravidla);
  return {
    ...zaklad, role: "zak",
    ja: { sedi: mistoU(p)?.t === h.t, ctu: h.cte === p.id, pisanka: h.pisanky.get(p.id)?.stav ?? null, nazev: nazevStupne(t, st), xp, od: xpOd(st), do: st.dalsi?.xp ?? null, dalsi: dalsiText(t, st) },
  };
}

function poslatKarty() {
  for (const p of Player.all()) {
    const m: KartaMsg = { nastaveni: { ...N.karta }, hodina: kartaHrace(p) };
    const sig = JSON.stringify(m);
    const pred = kartyPoslane.get(p.id);
    if (pred === sig || (!pred && !m.hodina)) continue; // bez hodiny nic, dokud nějaká nebyla
    kartyPoslane.set(p.id, sig);
    send(p, KARTA.stav, m);
  }
}

/** okolí tříd po 2 s: hráčům do 60 m, kde jsou místa u stolů a tabule (klient ukazuje nápovědu akce); jen změny */
const okoliPoslane = new Map<number, string>();
function poslatOkoli() {
  for (const p of Player.all()) {
    const cid = profily.get(p.id)?.cid;
    const m: OkoliMsg = {
      dosah: N.hodina.dosahStolu,
      tridy: tridy
        .filter((t) => t.vw === (p.virtualWorld ?? 0) && dist(p.position, t.pos) <= 60)
        .map((t) => ({ id: t.id, mista: t.mista.map((x) => x.pos), tabule: t.tabuleFace?.pos ?? null, zadani: !!hodiny.get(t.id)?.zadani, moje: !!cid && t.ucitel === cid })),
    };
    const sig = JSON.stringify(m);
    if (okoliPoslane.get(p.id) === sig) continue;
    okoliPoslane.set(p.id, sig);
    send(p, EV.okoli, m);
  }
}

function ukoncitHodinu(t: Trida, oznamit = true) {
  const h = hodiny.get(t.id);
  if (!h) return;
  hodiny.delete(t.id);
  upect(t); // tabule z hodiny jednou do stínované textury
  if (h.cte !== null) prestatCist(h);
  for (const id of [...h.ucastnici.keys(), h.ucitel]) {
    const p = Player.getById(id);
    if (!p) continue;
    send(p, EV.stav, { text: null });
    if (ctenari.get(id)?.t === t) zvednout(p);
    if (oznamit && id !== h.ucitel) info(p, T("msg.lesson.ended"));
  }
  udalost("skola:lekce", { faze: "konec", trida: t.id, ucitel: h.ucitel, studenti: [...h.ucastnici.keys()] });
}

/** konec hodiny: volby z formuláře panelu ({ pid: "u" | "uc" | "up" | "ucp" | "0" }), null = návrh podle hodiny */
async function konecHodiny(p: Player, h: Hodina, volby: Record<string, string> | null): Promise<Vysledek> {
  const minut = (Date.now() - h.zacatek) / 60000;
  const kratka = minut < N.hodina.minMinut;
  const dat: { u: Ucastnik; xp: number; co: Text }[] = [];
  const x = N.xp;
  if (!kratka) {
    for (const u of h.ucastnici.values()) {
      if (!Player.getById(u.pid)) continue;
      const pritomnost = (u.ms / Math.max(1, Date.now() - h.zacatek)) * 100;
      if (pritomnost < N.hodina.minPritomnost) {
        notify(p, T("msg.lesson.lowPresence", { name: u.jmeno, pct: Math.round(pritomnost) }), "warning");
        continue;
      }
      const v = String(volby ? (volby[String(u.pid)] ?? "0") : navrh(h, u));
      if (!/^u?c?p?$/.test(v) || !v) continue;
      const xp = (v.includes("u") ? x.ucast : 0) + (v.includes("c") ? x.cteni : 0) + (v.includes("p") ? x.psani : 0);
      const co = [v.includes("u") && "msg.xp.reason.attendance", v.includes("c") && "msg.xp.reason.reading", v.includes("p") && "msg.xp.reason.writing"].filter((k): k is string => !!k);
      dat.push({ u, xp, co: spojit(co.map((k) => T(k)), "msg.join.comma") });
    }
  }
  if (hodiny.get(h.t.id) !== h) return chyba("msg.lesson.alreadyEnded");
  ukoncitHodinu(h.t);
  if (kratka) return ok("msg.lesson.tooShort", { min: Math.floor(minut), minMin: N.hodina.minMinut });
  const out: Zprava[] = [];
  for (const d of dat) {
    const s = Player.getById(d.u.pid);
    if (!s || !(d.xp > 0)) continue;
    const r = await pridatXp(s, d.xp, d.co, p);
    out.push(T("msg.xp.entry", { name: d.u.jmeno, result: r }));
  }
  return out.length ? ok("msg.lesson.endedWith", { list: spojit(out) }) : ok("msg.lesson.ended");
}

const dnes = () => new Date().toISOString().slice(0, 10);

/** přidá XP gramotnosti (učitel null = admin / framework bez stropů); co = za co (zpráva nebo text); vrací popis výsledku */
async function pridatXp(s: Player, xp: number, co: Text, ucitel: Player | null): Promise<Zprava> {
  xp = Math.floor(xp);
  if (!(xp > 0)) return T("msg.xp.nothing");
  const prof = await nactiProfil(s);
  const pr = prof.p;
  let odKoho = "admin";
  if (ucitel) {
    const uc = await cid(ucitel);
    odKoho = uc;
    if (uc === prof.cid && !N.xp.samSobe) return T("msg.xp.notSelf");
    if (!pr.den || pr.den.d !== dnes()) pr.den = { d: dnes(), celkem: 0, od: {} };
    const zbyvaS = N.xp.stropStudent > 0 ? N.xp.stropStudent - pr.den.celkem : Infinity;
    const zbyvaD = N.xp.stropDvojice > 0 ? N.xp.stropDvojice - (pr.den.od[uc] ?? 0) : Infinity;
    const lze = Math.max(0, Math.min(xp, zbyvaS, zbyvaD));
    if (lze <= 0) return T("msg.xp.capped");
    xp = lze;
    pr.den.celkem += xp;
    pr.den.od[uc] = (pr.den.od[uc] ?? 0) + xp;
  }
  // historie a události frameworku: text ve výchozím jazyce serveru (data, ne oznámení)
  const ts = trServer();
  const coText = ts.z(co);
  const pred = stav(pr.xp, N.pravidla);
  pr.xp += xp;
  pr.historie = [...(pr.historie ?? []), { t: Date.now(), xp, od: odKoho, co: coText }].slice(-20);
  const po = stav(pr.xp, N.pravidla);
  await ulozProfil(prof.cid, pr);
  const nove: Zprava[] = [];
  const novaPismena = [...po.pismena].filter((c) => !pred.pismena.includes(c));
  if (po.stupen === 1 && novaPismena.length) nove.push(T("msg.xp.unlocked.letter", { n: novaPismena.length, letters: novaPismena.map((c) => c.toUpperCase()).join(", ") }));
  if (po.stupen > pred.stupen) nove.push(T("msg.xp.unlocked.level", { level: T(klicStupne(po.stupen)) }));
  if (po.latina && !pred.latina) nove.push(T("msg.xp.unlocked.latin"));
  poslatProfil(s);
  const noveZ = spojit(nove, "msg.join.comma");
  const t = tr(s);
  const m: XpMsg = { xp: pr.xp, pridano: xp, stupen: t(klicStupne(po.stupen)), ...(nove.length ? { co: t.z(noveZ) } : {}) };
  send(s, EV.xp, m);
  zrcadlit(s, xp);
  notify(s, nove.length ? T("msg.xp.gainedNew", { xp, reason: co, new: noveZ }) : T("msg.xp.gained", { xp, reason: co }), "success");
  udalost("skola:xp", { pid: s.id, charId: prof.cid, xp, celkem: pr.xp, co: coText, od: ucitel?.id ?? null });
  if (nove.length) udalost("skola:odemceno", { pid: s.id, charId: prof.cid, co: nove.map((z) => ts.z(z)), stupen: po.stupen });
  return nove.length ? T("msg.xp.resultNew", { xp, new: noveZ }) : T("msg.xp.result", { xp });
}

function zrcadlit(p: Player, xp: number) {
  if (!N.zrcadlit.zapnuto || !(xp > 0)) return;
  try {
    p.addXp(N.zrcadlit.stopa, Math.max(1, Math.round(xp * N.zrcadlit.pomer)));
  } catch (e) {
    log(`stopa ${N.zrcadlit.stopa}: ${String(e)}`);
  }
}

function udalost(name: string, data: unknown) {
  try {
    if (typeof (Events as any).emit === "function") void Promise.resolve((Events as any).emit(name, data)).catch(() => undefined);
  } catch {
    // jen informace pro framework
  }
}

// ---------------------------------------------------------------------------
// čítanka: sklonit se, prst

async function sklonit(p: Player, kontrola?: { m: Misto; d: string; jmeno: string; t: Trida }) {
  const tt = tr(p);
  if (kontrola) {
    const msg: CteniMsg = { mod: "kontrola", list: kontrola.m.fp, titulek: tt("msg.read.copybookTitle", { name: kontrola.jmeno }), text: "", seed: "", kresba: kontrola.d, papir: 0, prst: false, filtr: false, pozn: tt("msg.read.hintBack") };
    ctenari.set(p.id, { t: kontrola.t, m: kontrola.m, kontrola: true });
    return send(p, EV.cist, msg);
  }
  const u = mistoU(p);
  if (!u) return info(p, T("msg.read.sitAtReader"));
  await nactiProfil(p);
  poslatProfil(p);
  const h = hodiny.get(u.t.id);
  const s = strana(u.t);
  const msg: CteniMsg = {
    mod: "cteni", list: u.m.fc, titulek: s.nazev, text: s.text, seed: `${s.id}`, papir: 0, prst: h?.cte === p.id, filtr: true, obrazek: obrazky.get(s.id),
    pozn: tt(h?.cte === p.id ? "msg.read.hintAloud" : "msg.read.hintLookUp"),
  };
  ctenari.set(p.id, { t: u.t, m: u.m, kontrola: false });
  send(p, EV.cist, msg);
}

function zvednout(p: Player) {
  const c = ctenari.get(p.id);
  if (!c) return;
  ctenari.delete(p.id);
  send(p, EV.prestat, {});
  const h = hodiny.get(c.t.id);
  if (h?.cte === p.id) {
    const u = Player.getById(h.ucitel);
    if (u) send(u, EV.prstUcitel, { pid: p.id, jmeno: p.nickname, list: c.m.fc, x: 0, y: 0, slovo: null, vidi: null, konec: true } as PrstMsg);
  }
}

function prst(p: Player, raw: unknown) {
  const c = ctenari.get(p.id);
  if (!c || c.kontrola) return;
  const h = hodiny.get(c.t.id);
  if (!h || h.cte !== p.id) return;
  const t = Date.now();
  const w = prstOkno.get(p.id);
  if (!w || t - w.at > 1000) prstOkno.set(p.id, { at: t, n: 1 });
  else if (++w.n > 20) return;
  const m = raw as { x?: unknown; y?: unknown; w?: unknown };
  const x = Math.max(0, Math.min(767, Math.round(Number(m?.x))));
  const y = Math.max(0, Math.min(511, Math.round(Number(m?.y))));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const wi = Math.floor(Number(m?.w));
  const s = strana(c.t);
  const prave = slova(s.text);
  const vidi = slova(filtr(s.text, stavHrace(p.id), { seed: s.id }));
  const uc = h.ucastnici.get(p.id);
  if (uc && wi >= 0) uc.cetl = true;
  const u = Player.getById(h.ucitel);
  if (u) send(u, EV.prstUcitel, { pid: p.id, jmeno: p.nickname, list: c.m.fc, x, y, slovo: prave[wi] ?? null, vidi: vidi[wi] ?? null } as PrstMsg);
}

function prestatCist(h: Hodina) {
  const id = h.cte;
  h.cte = null;
  if (id === null) return;
  const p = Player.getById(id);
  if (p) send(p, EV.prstMod, { on: false });
  const u = Player.getById(h.ucitel);
  const c = ctenari.get(id);
  if (u && c) send(u, EV.prstUcitel, { pid: id, jmeno: p?.nickname ?? "", list: c.m.fc, x: 0, y: 0, slovo: null, vidi: null, konec: true } as PrstMsg);
}

function vyvolatCteni(h: Hodina, s: Player): Vysledek {
  if (h.cte !== null) prestatCist(h);
  h.cte = s.id;
  send(s, EV.prstMod, { on: true });
  info(s, T("msg.read.called", { teacher: Player.getById(h.ucitel)?.nickname ?? T("msg.scribeCap"), cmd: CFG.command }));
  infoHodiny(h);
  return ok("msg.read.reads", { name: s.nickname });
}

// ---------------------------------------------------------------------------
// tabule a písanky (kresby)

const DOSAH_TABULE = 2.6; // m: kdo píše na tabuli, musí u ní stát
const kTabuli = new Map<number, { t: Trida; ucitel: number | null; do: number; obrazek?: Strana }>(); // čeká, až dojde k tabuli

/** písař nebo vyvolaný student píše křídou; stojí-li daleko, nejdřív k tabuli dojde (do 90 s) */
async function psatNaTabuli(kdo: Player, t: Trida, ucitel: Player | null = null, obrazek?: Strana): Promise<Vysledek> {
  if (!maApi() || t.tabule === null || !t.tabuleFace) return chyba("msg.board.noBoardApi");
  if (dist(kdo.position, t.tabuleFace.pos) > DOSAH_TABULE) {
    kTabuli.set(kdo.id, { t, ucitel: ucitel?.id ?? null, do: Date.now() + 90000, obrazek });
    info(kdo, ucitel ? T("msg.board.calledTo", { teacher: ucitel.nickname }) : T("msg.board.walkTo"));
    return ok("msg.board.goesTo", { name: kdo.nickname });
  }
  kTabuli.delete(kdo.id);
  return obrazek ? kreslitObrazek(kdo, t, obrazek) : kridou(kdo, t);
}

async function kridou(kdo: Player, t: Trida): Promise<Vysledek> {
  const draw = kx<Promise<true | string>>("boardDraw");
  if (!draw || t.tabule === null) return chyba("msg.board.noBoardRunning");
  const base = (await kx<Promise<{ d: string } | null>>("boardGet")?.(t.tabule, 0))?.d ?? null;
  const tt = tr(kdo);
  const r = await draw(kdo.id, t.tabule, 0, {
    // nepéct po každém dopsání (nová textura + přenačtení balíčku): ostatní tabuli vidí čarami, upeče se jednou
    owner: OWNER, paper: papirTabule(), inks: inkoustyPro(CHALK, tt), tools: [0, 1], base, title: tt("letters.title.board"), hang: true, bake: false,
    done: (x: { ok: boolean; added?: number }) => {
      if (x.ok && x.added) neupecena(t);
    },
  });
  return r === true ? ok("msg.board.writing", { name: kdo.nickname }) : vysl(String(r), "warn");
}

/** k tabuli (po 1 s): kdo došel, dostane křídu; kdo nedošel do 90 s, nic */
function hlidatTabuli() {
  for (const [id, k] of [...kTabuli]) {
    const p = Player.getById(id);
    if (!p || Date.now() > k.do || !tridy.includes(k.t)) {
      kTabuli.delete(id);
      if (p) info(p, T("msg.board.notReached"));
      continue;
    }
    if (k.t.tabuleFace && dist(p.position, k.t.tabuleFace.pos) <= DOSAH_TABULE) {
      kTabuli.delete(id);
      void safely("tabule", (k.obrazek ? kreslitObrazek(p, k.t, k.obrazek) : kridou(p, k.t)).then((r) => {
        const u = k.ucitel !== null ? Player.getById(k.ucitel) : null;
        if (u && u !== p) notify(u, r.text);
        else if (r.druh !== "ok") notify(p, r.text); // kdo začal psát, má plátno; hlásí se jen, co nešlo
      }));
    }
  }
}

/** tabule psaná bez pečení: ostatní ji vidí čarami; upeče se na konci hodiny (nebo 5 min po psaní mimo hodinu) */
function neupecena(t: Trida) {
  t.neupeceno = Date.now();
  void ulozTridy();
}

function upect(t: Trida): boolean {
  if (!t.neupeceno || t.tabule === null) return false;
  t.neupeceno = undefined;
  void ulozTridy();
  return !!kx<boolean>("boardBake")?.(t.tabule, 0, OWNER);
}

function napsatText(t: Trida, text: string): Vysledek {
  if (t.tabule === null) return chyba("msg.board.none");
  const put = kx("boardPut");
  if (!put) return chyba("msg.drawings.off");
  const k = kridouText(bezZnacek(text), bezZnacek(text), papirTabule());
  const r = put(t.tabule, 0, k.data, { owner: OWNER, title: trServer()("letters.title.board"), bake: false });
  if (typeof r !== "number") return vysl(String(r), "warn");
  neupecena(t);
  return ok(k.preteklo ? "msg.board.writtenOverflow" : "msg.board.written");
}

// obrázky stránek slabikáře: "k3." na pergamenu, kreslí je písař (most.storage skola:obrazek/<id stránky>)
const obrazky = new Map<string, string>();
const KLIC_OBRAZEK = (id: string) => "skola:obrazek/" + id;

async function nactiObrazky() {
  obrazky.clear();
  for (const s of N.slabikar) {
    try {
      const d = await most.storage.get(KLIC_OBRAZEK(s.id));
      if (typeof d === "string" && decode(d, 16)) obrazky.set(s.id, d);
    } catch {
      // bez obrázku
    }
  }
}

const klicStrany = (s: Strana) => "strana:" + s.id;

async function stranaNaTabuli(t: Trida, s: Strana): Promise<Vysledek> {
  if (t.tabule === null) return chyba("msg.board.none");
  if (!maApi()) return chyba("msg.drawings.off");
  const hned = hotova(klicStrany(s));
  const povedlo = await ukazat(t.tabule, klicStrany(s), tabuleStrany(s, obrazky.get(s.id), papirTabule()), s.nazev);
  if (!povedlo) return chyba("msg.board.pageFailed");
  t.neupeceno = undefined; // sdílená kresba se peče sama
  return ok(hned ? "msg.board.pageShown" : "msg.board.pageShownLater", { page: s.nazev });
}

/** upéct tabule všech stránek předem: při hodině se pak ukazují hned */
function pripravitSlabikar(): Vysledek {
  if (!kx("drawingPrepare")) return chyba("msg.drawings.noPrepared");
  let nove = 0;
  for (const s of N.slabikar) {
    const pred = pripravena(klicStrany(s))?.id;
    if (sdilena(klicStrany(s), tabuleStrany(s, obrazky.get(s.id), papirTabule()), s.nazev) !== pred) nove++;
  }
  return nove ? ok("msg.board.baking", { n: nove }) : ok("msg.board.allPrepared");
}

async function ulozitTabuli(t: Trida, nazev0: string): Promise<Vysledek> {
  if (t.tabule === null) return chyba("msg.board.none");
  const d = (await kx<Promise<{ d: string } | null>>("boardGet")?.(t.tabule, 0))?.d;
  if (!d) return chyba("msg.board.empty");
  const ulozene = (t.ulozene = t.ulozene ?? []);
  const nazev = nazev0.trim().slice(0, 40) || trServer()("view.board.savedDefault", { i: ulozene.length + 1 });
  const klic = `ulozena:${t.id}:${Date.now().toString(36)}`;
  if (sdilena(klic, d, nazev) === null) return chyba("msg.drawings.noPrepared");
  ulozene.push({ nazev, klic });
  while (ulozene.length > 6) zapomenout(ulozene.shift()!.klic);
  await ulozTridy();
  return ok("msg.board.saved", { name: nazev });
}

async function ukazatUlozenou(t: Trida, i: number): Promise<Vysledek> {
  const u = (t.ulozene ?? [])[i];
  if (!u || t.tabule === null) return chyba("msg.board.noSaved");
  const id = pripravena(u.klic)?.id;
  if (id === undefined) return chyba("msg.board.savedLost");
  const r = await kx<Promise<true | string>>("boardShow")?.(t.tabule, 0, id, OWNER);
  if (r === true) t.neupeceno = undefined;
  return r === true ? ok("msg.board.savedShown", { name: u.nazev }) : r ? vysl(String(r), "warn") : chyba("msg.drawings.offShort");
}

async function smazatUlozenou(t: Trida, i: number): Promise<Vysledek> {
  const u = (t.ulozene ?? [])[i];
  if (!u) return chyba("msg.board.noSaved");
  zapomenout(u.klic);
  t.ulozene = (t.ulozene ?? []).filter((y) => y !== u);
  await ulozTridy();
  return ok("msg.board.savedDeleted", { name: u.nazev });
}

/** písař kreslí obrázek ke stránce slabikáře (u tabule, na pergamen; tabule se nezmění) */
async function kreslitObrazek(kdo: Player, t: Trida, s: Strana): Promise<Vysledek> {
  const draw = kx<Promise<true | string>>("boardDraw");
  if (!draw || t.tabule === null) return chyba("msg.board.noBoardRunning");
  const tt = tr(kdo);
  const r = await draw(kdo.id, t.tabule, 0, {
    owner: OWNER, paper: 0, inks: inkoustyPro(INK_OBRAZEK, tt), tools: [0, 1, 2, 3], base: obrazky.get(s.id) ?? null, title: tt("letters.title.picture", { page: s.nazev }), hang: false,
    done: (x: { ok: boolean; d?: string; added?: number }) => {
      if (!x.ok || !x.d) return;
      obrazky.set(s.id, x.d);
      void most.storage.set(KLIC_OBRAZEK(s.id), x.d);
      zapomenout(klicStrany(s)); // připravená tabule stránky je bez obrázku: upeče se znovu
      info(kdo, T("msg.picture.saved", { page: s.nazev }));
    },
  });
  return r === true ? ok("msg.picture.drawing", { page: s.nazev }) : vysl(String(r), "warn");
}

async function smazatObrazek(s: Strana): Promise<Vysledek> {
  if (!obrazky.has(s.id)) return chyba("msg.picture.none");
  obrazky.delete(s.id);
  await most.storage.delete(KLIC_OBRAZEK(s.id));
  zapomenout(klicStrany(s));
  return ok("msg.picture.deleted", { page: s.nazev });
}

async function zadatPisanky(h: Hodina, text: string): Promise<Vysledek> {
  if (!maApi()) return chyba("msg.drawings.off");
  const pr = predloha(text);
  h.zadani = { text, data: pr.data, body: bodyTahu(pr.tahy) };
  h.pisanky.clear();
  let n = 0;
  // jedna sdílená textura předlohy pro všechny písanky
  for (const m of h.t.mista) if (await ukazat(m.pis, "predloha:" + text, pr.data, trServer()("letters.title.copybook"))) n++;
  for (const id of h.ucastnici.keys()) {
    const p = Player.getById(id);
    if (p) info(p, T("msg.copybook.assigned", { text, cmd: CFG.command }));
  }
  return ok("msg.copybook.inCopybooks", { text, n });
}

async function psatPisanku(p: Player): Promise<Vysledek> {
  const u = mistoU(p);
  if (!u || u.m.pis === null) return chyba("msg.copybook.sitDown");
  const h = hodiny.get(u.t.id);
  if (!h || !h.ucastnici.has(p.id)) return chyba("msg.copybook.onlyInLesson");
  if (!h.zadani) return chyba("msg.copybook.nothingAssigned");
  const draw = kx<Promise<true | string>>("boardDraw");
  if (!draw) return chyba("msg.drawings.off");
  const stara = h.pisanky.get(p.id);
  if (stara?.stav === "uznano") return chyba("msg.copybook.alreadyAccepted");
  if (stara?.stav === "odevzdano") return chyba("msg.copybook.waiting");
  if (ctenari.has(p.id)) zvednout(p);
  const zad = h.zadani;
  const m = u.m;
  const tt = tr(p);
  // písanka se nepeče do textury (ve světě zůstává předloha), písař ji kontroluje přes list
  const r = await draw(p.id, m.pis, 0, {
    owner: OWNER, paper: 0, inks: inkoustyPro(INK_PISANKA, tt), tools: [0], base: zad.data, title: tt("letters.title.copybook"), hang: false,
    done: (x: { ok: boolean; d?: string; added?: number }) => {
      if (!x.ok || !x.d || hodiny.get(u.t.id) !== h || h.zadani !== zad) return;
      const dr = decode(x.d, 16);
      const vlastni = x.added ? (dr?.strokes ?? []).slice(-x.added) : []; // nové tahy jsou za předlohou
      if (!vlastni.length) return info(p, T("msg.copybook.empty"));
      const sk = obtazeni(zad.body, bodyTahu(vlastni)).skore;
      h.pisanky.set(p.id, { skore: sk, d: x.d, stav: "odevzdano", misto: m });
      info(p, T("msg.copybook.handedIn"));
      const uc = Player.getById(h.ucitel);
      if (uc) notify(uc, T("msg.copybook.handedInTeacher", { name: p.nickname, grade: T(slovneKlic(sk)), pct: Math.round(sk * 100) }));
    },
  });
  return r === true ? ok("msg.copybook.write") : vysl(String(r), "warn");
}

/** písanka žáka: prohlédnout (písař se skloní nad jeho list), uznat, psát znovu */
async function pisanka(p: Player, h: Hodina, co: string, id: number): Promise<Vysledek> {
  const x = h.pisanky.get(id);
  if (!x || !h.ucastnici.has(id)) return chyba("msg.copybook.notHandedIn");
  const s = Player.getById(id);
  const jm = h.ucastnici.get(id)?.jmeno ?? "?";
  if (co === "ukaz") {
    zavritPanel(p);
    void sklonit(p, { m: x.misto, d: x.d, jmeno: jm, t: h.t });
    return NIC;
  }
  if (co === "ok") {
    x.stav = "uznano";
    const u = h.ucastnici.get(id);
    if (u) u.psal = true;
    if (s) notify(s, T("msg.copybook.acceptedStudent"), "success");
    return ok("msg.copybook.accepted", { name: jm });
  }
  if (co === "znovu") {
    x.stav = "znovu";
    if (s) info(s, T("msg.copybook.againStudent"));
    return ok("msg.copybook.again", { name: jm });
  }
  return NIC;
}

// ---------------------------------------------------------------------------
// panel (web view ui/): server skládá pohled (UiView) a provádí akce; bez web view stejné akce v nativní nabídce

interface Panel {
  seq: number;
  otevreny: boolean;
  web: boolean;
  krok?: UiKrok["id"]; // průvodce: vybraný krok
  konec?: Hodina; // konec hodiny: formulář XP (jen pro tuhle hodinu; další hodina začne normálně)
  trida?: number; // třída, kterou pohled ukázal: akce míří na ni, ne na tu, ke které hráč mezitím došel
  podpis?: string; // poslední poslaný obsah (obnova po 5 s jen při změně)
  umistuje?: boolean;
}
const panely = new Map<number, Panel>();
const panelHrace = (p: Player): Panel => {
  let x = panely.get(p.id);
  if (!x) panely.set(p.id, (x = { seq: 0, otevreny: false, web: true }));
  return x;
};

type Druh = NonNullable<UiView["hlaska"]>["druh"];
/** výsledek akce: text (zpráva přeložená až pro hráče, který ji uvidí) a jestli se povedla */
interface Vysledek {
  text: Text;
  druh: Druh;
}
const ok = (k: string, a?: Parametry): Vysledek => ({ text: T(k, a), druh: "ok" });
const chyba = (k: string, a?: Parametry): Vysledek => ({ text: T(k, a), druh: "warn" });
/** hotový text (chyba kreseb, důvod z háčku frameworku) nebo složená zpráva s daným druhem */
const vysl = (text: Text, druh: Druh = "ok"): Vysledek => ({ text, druh });
/** nic k ohlášení (akce otevřela jiné UI nebo ji zrušilo čekání) */
const NIC: Vysledek = { text: "", druh: "ok" };
/** druh oznámení (notify) pro výsledek: varování, nebo dané (výchozí info) */
const druhOznameni = (v: Vysledek, jinak: "info" | "success" = "info") => (v.druh === "warn" || v.druh === "err" ? "warning" : jinak);

/** začátek současného kroku gramotnosti (ukazatel postupu) */
function xpOd(st: Stav): number {
  const pr = N.pravidla;
  if (st.stupen === 4) return pr.xpPlynule;
  if (st.stupen === 3) return pr.xpSlova + (st.slov - pr.slovaZaklad) * Math.max(1, pr.slovaKrok);
  if (st.stupen === 2) return pr.xpSlabiky + (st.slabik - 1) * Math.max(1, pr.slabikKrok);
  if (st.stupen === 1) return pr.xpPrvni + (st.pismena.length - 1) * Math.max(1, pr.xpPismeno);
  return 0;
}

async function mojeJa(p: Player): Promise<UiJa> {
  const pr = (await nactiProfil(p)).p;
  const st = stav(pr.xp, N.pravidla);
  const t = tr(p);
  return {
    stupen: st.stupen, nazev: nazevStupne(t, st), xp: pr.xp, od: xpOd(st), do: st.dalsi?.xp ?? null, dalsi: dalsiText(t, st),
    pismena: st.stupen === 1 ? [...st.pismena].map((c) => c.toUpperCase()).join(" ") : st.stupen > 1 ? t("view.me.allLetters") : "",
    ukazka: filtr(t("view.me.sample"), st, { seed: 1 }),
  };
}

/** kroky průvodce zařízením; nazev = klíč překladu */
const KROKY: { id: UiKrok["id"]; nazev: string }[] = [
  { id: "tabule", nazev: "view.step.board" },
  { id: "lavice", nazev: "view.step.desks" },
  { id: "hotovo", nazev: "view.step.done" },
];
const krokHotovo = (t: Trida, id: UiKrok["id"]) => (id === "tabule" ? t.tabule !== null : id === "lavice" ? t.mista.length > 0 : t.tabule !== null && t.mista.length > 0);

function slabikarUi(): UiStrana[] {
  return N.slabikar.map((s, i) => ({
    i, nazev: s.nazev, pismeno: s.pismeno, ukazka: bezZnacek(s.text).split("\n").slice(-1)[0].slice(0, 40), obrazek: obrazky.has(s.id), pripravena: hotova(klicStrany(s)),
  }));
}

/** návrh XP na konci hodiny: účast při dost přítomnosti, čtení když četl, psaní když má uznanou písanku */
function navrh(h: Hodina, u: Ucastnik): string {
  const pritomnost = (u.ms / Math.max(1, Date.now() - h.zacatek)) * 100;
  if (pritomnost < N.hodina.minPritomnost) return "0";
  return "u" + (u.cetl ? "c" : "") + (u.psal ? "p" : "");
}

function hodinaUi(h: Hodina, tt: Prekladac): NonNullable<UiView["hodina"]> {
  const t = h.t;
  return {
    ucitel: Player.getById(h.ucitel)?.nickname ?? tt("msg.scribe"),
    minut: Math.floor((Date.now() - h.zacatek) / 60000),
    minMinut: N.hodina.minMinut,
    minPritomnost: N.hodina.minPritomnost,
    strana: t.strana,
    cte: h.cte !== null ? (Player.getById(h.cte)?.nickname ?? "?") : null,
    zadani: h.zadani?.text ?? null,
    predloha: strana(t).predloha,
    zaci: [...h.ucastnici.values()].map((u) => {
      const st = stavHrace(u.pid);
      const x = h.pisanky.get(u.pid);
      const pl = Player.getById(u.pid);
      return {
        pid: u.pid, jmeno: u.jmeno, stupen: nazevStupne(tt, st), xp: profily.get(u.pid)?.p.xp ?? 0,
        pritomnost: Math.min(100, Math.round((u.ms / Math.max(1, Date.now() - h.zacatek)) * 100)),
        sedi: !!pl && mistoU(pl)?.t === t, cte: h.cte === u.pid, cetl: u.cetl, psal: u.psal,
        pisanka: x ? { skore: Math.round(x.skore * 100) / 100, stav: x.stav } : null, navrh: navrh(h, u),
      };
    }),
    kolem: Player.all().filter((x) => x.id !== h.ucitel && !h.ucastnici.has(x.id) && x.virtualWorld === t.vw && dist(x.position, t.pos) <= N.hodina.polomer).map((x) => ({ pid: x.id, jmeno: x.nickname })),
    neupeceno: !!t.neupeceno,
    ulozene: (t.ulozene ?? []).map((u, i) => ({ i, nazev: u.nazev, hotova: hotova(u.klic) })),
    xp: { ucast: N.xp.ucast, cteni: N.xp.cteni, psani: N.xp.psani },
  };
}

/** tabule: akce mimo hodinu i při ní */
function akceTabule(t: Trida, A: (a: UiAkce) => void, h: Hodina | null, tt: Prekladac) {
  const s = strana(t);
  const bez = t.tabule === null ? tt("view.off.noBoard") : !maApi() ? tt("view.off.noDrawings") : undefined;
  A({ id: "tabule:strana", text: tt("view.action.boardPage", { page: s.nazev }), tip: tt("view.action.boardPage.tip"), vypnuto: bez });
  A({ id: "tabule:ja", text: tt("view.action.boardSelf"), tip: tt("view.action.boardSelf.tip"), vypnuto: bez });
  A({ id: "tabule:text", text: tt("view.action.boardText"), tip: tt("view.action.boardText.tip"), vypnuto: bez, vstup: { label: tt("view.action.boardText.input"), placeholder: tt("view.action.boardText.placeholder"), max: 300, radky: true, volby: bezZnacek(s.text).split("\n").filter(Boolean).slice(0, 6) } });
  A({ id: "tabule:ulozit", text: tt("view.action.boardSave"), tip: tt("view.action.boardSave.tip"), vypnuto: bez, vstup: { label: tt("view.action.boardSave.input"), value: s.nazev, max: 40 } });
  (t.ulozene ?? []).forEach((u, i) => {
    A({ id: "tabule:ulozena:" + i, text: tt("view.action.savedShow", { name: u.nazev }), vypnuto: bez });
    A({ id: "tabule:zapomenout:" + i, text: tt("view.action.savedDelete", { name: u.nazev }), nebezpecne: tt("view.action.savedDelete.confirm", { name: u.nazev }) });
  });
  A({ id: "tabule:obrazek", text: tt(obrazky.has(s.id) ? "view.action.pictureRedraw" : "view.action.pictureDraw", { page: s.nazev }), tip: tt("view.action.pictureDraw.tip"), vypnuto: bez });
  if (obrazky.has(s.id)) A({ id: "tabule:bezobrazku", text: tt("view.action.pictureDelete", { page: s.nazev }), nebezpecne: tt("view.action.pictureDelete.confirm", { page: s.nazev }) });
  A({ id: "tabule:pripravit", text: tt("view.action.prepare"), tip: tt("view.action.prepare.tip"), vypnuto: !kx("drawingPrepare") ? tt("view.off.noPrepared") : undefined });
  if (t.neupeceno) A({ id: "tabule:upect", text: tt("view.action.bake"), tip: tt("view.action.bake.tip") });
  A({ id: "tabule:smazat", text: tt("view.action.boardClear"), vypnuto: bez, nebezpecne: tt("view.action.boardClear.confirm") });
  void h;
}

async function pohled(p: Player, pn: Panel): Promise<UiView> {
  const ucitel = await jeUcitel(p);
  const ja = await mojeJa(p);
  const tt = tr(p);
  const akce: UiAkce[] = [];
  const A = (a: UiAkce) => void akce.push(a);
  const zav = { id: "zavrit", text: tt("view.action.close") };
  const base = { seq: pn.seq, ucitel, ja, akce };
  const hs = hodinaStudenta(p);

  if (!ucitel) {
    const u = mistoU(p);
    A({ id: "zak:cist", text: tt("view.action.leanOver"), hlavni: true, vypnuto: u ? undefined : tt("view.off.sitAtClassDesk") });
    A({ id: "zak:psat", text: hs?.zadani ? tt("view.action.writeCopybookText", { text: hs.zadani.text }) : tt("view.action.writeCopybook"), vypnuto: !u ? tt("view.off.sitAtClassDesk") : !hs?.zadani ? tt("view.off.nothingAssigned") : undefined });
    A(zav);
    return {
      ...base, obrazovka: "zak", titulek: hs ? tt("view.student.title", { teacher: Player.getById(hs.ucitel)?.nickname ?? tt("msg.scribeGen") }) : tt("view.student.titleNone"),
      text: hs ? tt(hs.cte === p.id ? "view.student.todayRead" : "view.student.today", { page: strana(hs.t).nazev }) : tt("view.student.noLesson"),
    };
  }

  const h = hodinaUcitele(p);
  const t = h?.t ?? tridaU(p);
  if (!t) {
    const moje = await mojeTridy(p);
    A({ id: "zalozit", text: tt("view.action.found"), hlavni: true, vstup: { label: tt("view.action.found.input"), value: tt("view.class.defaultName", { name: p.nickname }), max: 40 } });
    A(zav);
    return {
      ...base, obrazovka: "vitej", titulek: tt("view.welcome.title"),
      text: moje.length ? tt("view.welcome.yourClasses", { list: moje.map((x) => x.nazev).join(", "), max: N.vybaveni.maxTrid }) : tt("view.welcome.text"),
    };
  }
  pn.trida = undefined;
  if (!(await smiTridu(p, t))) {
    A({ id: "zak:cist", text: tt("view.action.leanOver"), vypnuto: mistoU(p) ? undefined : tt("view.off.sitAtDesk") });
    A(zav);
    return { ...base, obrazovka: "cizi", titulek: t.nazev, text: tt("view.foreign.text", { teacher: t.jmeno }) };
  }

  pn.trida = t.id;
  const trida = { nazev: t.nazev, verejna: t.verejna, mist: t.mista.length, vybaveni: kusy(t, tt), tabule: t.tabule !== null };
  const stavba = () => {
    A({ id: "umistit:zed", text: tt("view.action.placeWall"), tip: tt("view.action.placeWall.tip"), vypnuto: !maApi() ? tt("view.off.noDrawings") : undefined });
    A({ id: "umistit:stojan", text: tt("view.action.placeStand"), tip: tt("view.action.placeStand.tip"), vypnuto: !maApi() ? tt("view.off.noDrawings") : undefined });
    A({ id: "umistit:stul", text: tt("view.action.placeDesk"), tip: tt("view.action.placeDesk.tip"), vypnuto: t.mista.length + STUL.sedadla.length > N.vybaveni.maxMist ? tt("view.off.seatsMax", { max: N.vybaveni.maxMist }) : undefined });
    A({ id: "umistit:misto", text: tt("view.action.placeSeat"), tip: tt("view.action.placeSeat.tip"), vypnuto: t.mista.length >= N.vybaveni.maxMist ? tt("view.off.seatsMax", { max: N.vybaveni.maxMist }) : undefined });
    A({ id: "umistit:lavice", text: tt("view.action.placeBench"), tip: tt("view.action.placeBench.tip"), vypnuto: !N.vybaveni.lavice ? tt("view.off.benchesOff") : t.lavice.length >= N.vybaveni.maxMist ? tt("view.off.benchesMax", { max: N.vybaveni.maxMist }) : undefined });
    for (const k of trida.vybaveni) {
      A({ id: "presunout:" + k.id, text: tt("view.action.move", { name: k.nazev }) });
      A({ id: "odebrat:" + k.id, text: tt("view.action.remove", { name: k.nazev }), nebezpecne: k.druh === "tabule" ? tt("view.action.removeBoard.confirm") : tt("view.action.remove.confirm", { name: k.nazev }) });
    }
  };

  if (h && pn.konec === h) {
    const hu = hodinaUi(h, tt);
    const kratka = hu.minut < N.hodina.minMinut;
    A({ id: "hodina:rozdat", text: tt(kratka ? "view.action.endLesson" : "view.action.endAndGive"), hlavni: true, tip: kratka ? tt("view.action.endLesson.tipShort", { min: N.hodina.minMinut }) : undefined });
    A({ id: "hodina:bezxp", text: tt("view.action.endNoXp"), nebezpecne: tt("view.action.endNoXp.confirm") });
    A({ id: "konec:zpet", text: tt("view.action.backToLesson") });
    return { ...base, obrazovka: "konec", titulek: tt("view.end.title"), text: kratka ? tt("view.end.short", { min: hu.minut, minMin: N.hodina.minMinut }) : tt("view.end.text"), trida, hodina: hu };
  }

  if (h) {
    const hu = hodinaUi(h, tt);
    for (const z of hu.zaci) {
      A({ id: "cist:" + z.pid, text: tt("view.action.readAloud", { name: z.jmeno }), vypnuto: z.cte ? tt("view.off.reading") : undefined });
      A({ id: "tabule:zak:" + z.pid, text: tt("view.action.toBoard", { name: z.jmeno }), vypnuto: t.tabule === null ? tt("view.off.noBoard") : undefined });
      if (z.pisanka) {
        A({ id: "pisanka:ukaz:" + z.pid, text: tt("view.action.copybookView", { name: z.jmeno }) });
        A({ id: "pisanka:ok:" + z.pid, text: tt("view.action.copybookAccept", { name: z.jmeno }), vypnuto: z.pisanka.stav === "uznano" ? tt("view.off.accepted") : undefined });
        A({ id: "pisanka:znovu:" + z.pid, text: tt("view.action.copybookAgain", { name: z.jmeno }), vypnuto: z.pisanka.stav === "znovu" ? tt("view.off.toldAgain") : undefined });
      }
    }
    if (h.cte !== null) A({ id: "cist:stop", text: tt("view.action.stopReading") });
    A({ id: "pisanky:zadat", text: tt(h.zadani ? "view.action.assignNew" : "view.action.assign"), vypnuto: !maApi() ? tt("view.off.noDrawings") : !t.mista.length ? tt("view.off.noSeats") : undefined, vstup: { label: tt("view.action.assign.input"), value: strana(t).predloha, max: 40, volby: [strana(t).predloha].filter(Boolean) } });
    for (const x of hu.kolem) A({ id: "pridat:" + x.pid, text: tt("view.action.addToLesson", { name: x.jmeno }) });
    A({ id: "hodina:konec", text: tt("view.action.endLessonForm"), hlavni: true });
    N.slabikar.forEach((s, i) => A({ id: "strana:" + i, text: tt("view.action.page", { page: s.nazev }) }));
    akceTabule(t, A, h, tt);
    A(zav);
    return { ...base, obrazovka: "hodina", titulek: tt("view.lesson.title", { page: strana(t).nazev }), text: t.nazev, trida, hodina: hu, slabikar: slabikarUi(), strana: t.strana };
  }

  if (!t.pruvodce) {
    const kroky: UiKrok[] = KROKY.map((k) => ({ ...k, nazev: tt(k.nazev), hotovo: krokHotovo(t, k.id) }));
    const krok = pn.krok ?? kroky.find((k) => !k.hotovo)?.id ?? "hotovo";
    for (const k of kroky) A({ id: "pruvodce:krok:" + k.id, text: tt("view.action.guideStep", { step: k.nazev }) });
    stavba();
    A({ id: "pruvodce:hotovo", text: tt("view.action.guideDone"), hlavni: krok === "hotovo", vypnuto: !t.mista.length ? tt("view.off.buildDesk") : undefined });
    A(zav);
    return { ...base, obrazovka: "pruvodce", titulek: t.nazev, trida, kroky, krok };
  }

  A({ id: "hodina:zacit", text: tt("view.action.startLesson", { page: strana(t).nazev }), hlavni: true, vypnuto: hodiny.has(t.id) ? tt("view.off.lessonRunning") : undefined });
  N.slabikar.forEach((s, i) => A({ id: "strana:" + i, text: tt("view.action.page", { page: s.nazev }) }));
  stavba();
  akceTabule(t, A, null, tt);
  A({ id: "trida:nazev", text: tt("view.action.rename"), vstup: { label: tt("view.action.rename.input"), value: t.nazev, max: 40 } });
  A({ id: "trida:verejna", text: tt(t.verejna ? "view.action.publicOn" : "view.action.publicOff") });
  A({ id: "pruvodce:znovu", text: tt("view.action.guide") });
  A({ id: "trida:zrusit", text: tt("view.action.cancelClass"), nebezpecne: tt("view.action.cancelClass.confirm", { name: t.nazev }) });
  A(zav);
  return { ...base, obrazovka: "trida", titulek: t.nazev, text: tt(t.verejna ? "view.class.textPublic" : "view.class.textInvited", { n: t.mista.length }), trida, slabikar: slabikarUi(), strana: t.strana };
}

/** pošle hráči pohled (otevře panel); hláška = výsledek poslední akce */
async function obnovit(p: Player, hlaska?: Vysledek, otevrit = false): Promise<void> {
  const pn = panelHrace(p);
  if (otevrit) pn.otevreny = true;
  if (!pn.otevreny || pn.umistuje) return;
  pn.seq++;
  const v = await pohled(p, pn);
  if (!Player.getById(p.id) || !pn.otevreny || pn.umistuje) return; // hráč mezitím panel zavřel nebo začal stavět
  pn.podpis = JSON.stringify({ ...v, seq: 0 });
  if (hlaska?.text) v.hlaska = { text: tr(p).z(hlaska.text), druh: hlaska.druh }; // přeložená pro tohoto hráče
  send(p, UI.stav, v);
}

/** po 5 s: otevřené panely při hodině (příchody, přítomnost, písanky) jen při změně */
async function obnovitPanely() {
  for (const [id, pn] of panely) {
    if (!pn.otevreny || pn.umistuje || !pn.web || pn.konec) continue; // formulář konce hodiny se nepřekresluje pod rukama
    const p = Player.getById(id);
    if (!p || !(hodinaUcitele(p) || hodinaStudenta(p))) continue;
    const v = await pohled(p, pn);
    if (!pn.otevreny || pn.umistuje) continue;
    const sig = JSON.stringify({ ...v, seq: 0 });
    if (sig === pn.podpis) continue;
    pn.podpis = sig;
    pn.seq++;
    send(p, UI.stav, { ...v, seq: pn.seq });
  }
}

function zavritPanel(p: Player) {
  const pn = panelHrace(p);
  pn.otevreny = false;
  send(p, UI.zavrit, {});
}

const cislo = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

/** jedna akce z panelu (nebo nativní nabídky); vrací výsledek pro hlášku */
async function provest(p: Player, id: string, hodnota?: string): Promise<Vysledek | null> {
  const i = id.indexOf(":");
  const sloveso = i < 0 ? id : id.slice(0, i);
  const arg = i < 0 ? "" : id.slice(i + 1);
  const pn = panelHrace(p);

  if (sloveso === "zavrit") return zavritPanel(p), null;
  if (sloveso === "zak") {
    if (arg === "cist") {
      zavritPanel(p);
      await sklonit(p);
      return null;
    }
    if (arg === "psat") {
      const r = await psatPisanku(p);
      if (r.druh === "ok") zavritPanel(p); // otevřelo se plátno písanky
      return r;
    }
    return null;
  }
  if (!(await jeUcitel(p))) return chyba("msg.onlyScribe");
  if (sloveso === "zalozit") {
    if (!(await muze(p, "class.create"))) return chyba("msg.onlyScribe");
    pn.krok = undefined;
    return zalozitTridu(p, hodnota);
  }

  const h = hodinaUcitele(p);
  // třída z ukázaného pohledu (ne ta, ke které hráč mezitím došel; třídy se můžou překrývat)
  const t = h?.t ?? (pn.trida !== undefined ? tridy.find((x) => x.id === pn.trida) : undefined);
  if (!t) return chyba("msg.class.noneHere");
  if (!(await smiTridu(p, t))) return chyba("msg.class.notYours");
  if (!h && (t.vw !== (p.virtualWorld ?? 0) || dist(p.position, t.pos) > N.hodina.polomer * 3)) return chyba("msg.class.tooFar");
  const plati = () => !h || hodiny.get(h.t.id) === h; // hodina mohla mezitím skončit
  const ulozit = async (r: Vysledek) => (await ulozTridy(), r);

  switch (sloveso) {
    case "umistit":
    case "presunout":
      return zacitUmistovat(p, t, sloveso === "presunout" ? arg : null, sloveso === "umistit" ? arg : null);
    case "odebrat":
      return ulozit(odebratKus(t, arg));
    case "pruvodce":
      if (arg.startsWith("krok:")) pn.krok = arg.slice(5) as UiKrok["id"];
      else if (arg === "hotovo") {
        if (!t.mista.length) return chyba("msg.guide.needDesk");
        t.pruvodce = true;
        pn.krok = undefined;
        return ulozit(ok("msg.guide.done"));
      } else if (arg === "znovu") {
        t.pruvodce = false;
        pn.krok = "tabule";
        await ulozTridy();
      }
      return null;
    case "trida":
      if (arg === "nazev" && hodnota?.trim()) {
        t.nazev = hodnota.trim().slice(0, 40);
        return ulozit(ok("msg.class.renamed", { name: t.nazev }));
      }
      if (arg === "verejna") {
        t.verejna = !t.verejna;
        return ulozit(ok(t.verejna ? "msg.class.public" : "msg.class.invited"));
      }
      if (arg === "zrusit") {
        await zrusitTridu(t);
        return ok("msg.class.cancelled");
      }
      return null;
    case "strana": {
      const n = cislo(arg);
      if (!(n >= 0 && n < N.slabikar.length)) return null;
      t.strana = n;
      await ulozTridy();
      if (h) {
        infoHodiny(h);
        for (const [pid, c] of ctenari) if (c.t === t && !c.kontrola) void sklonit(Player.getById(pid)!);
      }
      return null;
    }
    case "hodina":
      if (arg === "zacit") return zacitHodinu(p, t);
      if (!h) return chyba("msg.lesson.notRunning");
      if (arg === "konec") return (pn.konec = h), null;
      if (arg === "rozdat" || arg === "bezxp") {
        let volby: Record<string, string> | null = null;
        try {
          // bez schopnosti lesson.xp (např. pomocný písař frameworku) hodina skončí bez XP
          volby = arg === "bezxp" || !(await muze(p, "lesson.xp")) ? {} : hodnota ? (JSON.parse(hodnota) as Record<string, string>) : null;
        } catch {
          volby = null;
        }
        pn.konec = undefined;
        return konecHodiny(p, h, volby);
      }
      return null;
    case "konec":
      pn.konec = undefined;
      return null;
  }

  // akce s hodinou nebo tabulí
  const kdo = (s: string) => {
    const x = Player.getById(cislo(s));
    return x && h?.ucastnici.has(x.id) ? x : null;
  };
  if (sloveso === "tabule") {
    const [co, kde] = [arg.split(":")[0], arg.split(":")[1] ?? ""];
    switch (co) {
      case "ja":
        zavritPanel(p);
        return psatNaTabuli(p, t);
      case "zak": {
        const s = kdo(kde);
        return s && plati() ? psatNaTabuli(s, t, p) : chyba("msg.lesson.studentGone");
      }
      case "strana":
        return stranaNaTabuli(t, strana(t));
      case "text":
        return hodnota?.trim() ? napsatText(t, hodnota.replace(/\\n/g, "\n")) : null;
      case "ulozit":
        return ulozitTabuli(t, hodnota ?? strana(t).nazev);
      case "ulozena":
        return ukazatUlozenou(t, cislo(kde));
      case "zapomenout":
        return smazatUlozenou(t, cislo(kde));
      case "pripravit":
        return pripravitSlabikar();
      case "obrazek":
        zavritPanel(p);
        return psatNaTabuli(p, t, null, strana(t));
      case "bezobrazku":
        return smazatObrazek(strana(t));
      case "upect":
        return ok(upect(t) ? "msg.board.bakingNow" : "msg.board.alreadyBaked");
      case "smazat":
        if (t.tabule === null) return chyba("msg.board.none");
        t.neupeceno = undefined;
        return ok(kx("boardClear")?.(t.tabule, 0, OWNER) ? "msg.board.cleared" : "msg.board.clean");
    }
    return null;
  }
  if (!h || !plati()) return chyba("msg.lesson.alreadyEnded");
  switch (sloveso) {
    case "cist": {
      if (arg === "stop") {
        prestatCist(h);
        infoHodiny(h);
        return ok("msg.read.stopped");
      }
      const s = kdo(arg);
      return s ? vyvolatCteni(h, s) : chyba("msg.lesson.studentGone");
    }
    case "pisanky":
      return hodnota?.trim() ? zadatPisanky(h, hodnota.trim().slice(0, 40)) : null;
    case "pisanka": {
      const [co, kde] = [arg.split(":")[0], arg.split(":")[1] ?? ""];
      return pisanka(p, h, co, cislo(kde));
    }
    case "pridat": {
      const s = Player.getById(cislo(arg));
      if (!s || s.virtualWorld !== t.vw || dist(s.position, t.pos) > N.hodina.polomer) return chyba("msg.lesson.playerNotInClass");
      pridatUcastnika(h, s);
      return h.ucastnici.has(s.id) ? ok("msg.lesson.added", { name: s.nickname }) : chyba("msg.lesson.inOtherLesson", { name: s.nickname });
    }
  }
  return null;
}

/** akce z panelu: provést, ukázat výsledek, panel obnovit (když ho akce nezavřela) */
async function akceZPanelu(p: Player, raw: unknown) {
  const m = (typeof raw === "string" ? JSON.parse(raw) : raw) as UiAkceMsg | null;
  if (!m || typeof m.id !== "string") return;
  const pn = panelHrace(p);
  pn.web = true;
  const r = await provest(p, m.id.slice(0, 80), typeof m.hodnota === "string" ? m.hodnota.slice(0, 2000) : undefined);
  if (pn.otevreny) await obnovit(p, r ?? undefined);
  else if (r?.text) notify(p, r.text, druhOznameni(r));
}

/** klávesa nebo /skola: panel; bez web view nativní nabídka se stejnými akcemi */
async function otevritPanel(p: Player, web = panelHrace(p).web) {
  const pn = panelHrace(p);
  pn.web = web;
  pn.umistuje = false;
  if (web) return obnovit(p, undefined, true);
  return nabidkaZaloha(p);
}

/** nabídka s víc než 8 volbami po stránkách (nativní záloha mostu ukáže nejvýš 8 voleb) */
async function menu(p: Player, spec: { title?: string; text?: string; options: MenuOption[] }): Promise<string | null> {
  if (spec.options.length <= 8) return most.ui.menu(p.id, spec);
  const konec = spec.options.filter((o) => o.id === "#zpet" || o.id === "#zavrit");
  const volby = spec.options.filter((o) => !konec.includes(o));
  let od = 0;
  for (;;) {
    const o: MenuOption[] = [
      ...(od > 0 ? [{ id: "#pred", text: tr(p)("view.menu.previous") }] : []),
      ...volby.slice(od, od + 5),
      ...(od + 5 < volby.length ? [{ id: "#dalsi", text: tr(p)("view.menu.next") }] : []),
      ...konec,
    ];
    const v = await most.ui.menu(p.id, { ...spec, options: o });
    if (v === "#dalsi") od += 5;
    else if (v === "#pred") od = Math.max(0, od - 5);
    else return v;
  }
}

/** záloha bez web view: akce pohledu jako nativní nabídka (vstup přes prompt, nebezpečné s potvrzením) */
async function nabidkaZaloha(p: Player) {
  const pn = panelHrace(p);
  for (let kolo = 0; kolo < 30; kolo++) {
    const v = await pohled(p, pn);
    const volby = v.akce.filter((a) => !a.vypnuto && a.id !== "zavrit");
    const id = await menu(p, { title: v.titulek, text: v.text, options: [...volby.map((a) => ({ id: a.id, text: a.text })), { id: "#zavrit", text: tr(p)("view.action.close") }] });
    const a = volby.find((x) => x.id === id);
    if (!a) return;
    if (a.nebezpecne && !(await most.ui.confirm(p.id, a.nebezpecne))) continue;
    let hodnota: string | undefined;
    if (a.vstup) {
      hodnota = (await most.ui.prompt(p.id, { text: a.vstup.label, placeholder: a.vstup.placeholder, choices: a.vstup.volby?.length ? a.vstup.volby : a.vstup.value ? [a.vstup.value] : undefined })) ?? undefined;
      if (!hodnota) continue;
    }
    const r = await provest(p, a.id, hodnota);
    if (r?.text) notify(p, r.text, druhOznameni(r));
    // akce, které otevřou jiné UI (umisťování, plátno, čítanka), nabídku ukončí
    if (/^(umistit|presunout|zak:|tabule:(ja|obrazek)|pisanka:ukaz)/.test(a.id) || a.id === "trida:zrusit") return;
  }
}

// ---------------------------------------------------------------------------
// umisťování (PropPlacer u klienta)

const MODEL_PRAZDNY = LIST_MODEL; // zmenšený list: náhled je jen obrys (tabule na zeď, místo na stole)

function zacitUmistovat(p: Player, t: Trida, presun: string | null, druh0: string | null): Vysledek | null {
  const druh = (presun ? ({ tabule: t.tabuleDruh?.kind === "stojan" ? "stojan" : "zed", stul: "stul", misto: "misto", lavice: "lavice" } as Record<string, DruhUmisteni>)[presun.split(":")[0]] : druh0) as DruhUmisteni | undefined;
  if (!druh || !["zed", "stojan", "stul", "misto", "lavice"].includes(druh)) return chyba("msg.build.unknown");
  if (presun && !kusy(t).some((k) => k.id === presun)) return chyba("msg.piece.gone");
  const tt = tr(p);
  const base = { druh, presun: presun ?? undefined, yaw: 0, znovu: false, maxDalka: 10 };
  let msg: UmistitMsg;
  switch (druh) {
    case "zed":
      msg = { ...base, nazev: tt("view.place.wall"), models: [MODEL_PRAZDNY], scale: 0.01, obrys: { w: N.vybaveni.tabuleSirka, h: N.vybaveni.tabuleVyska } };
      break;
    case "stojan":
      // náhled: přední strana modelu k písaři (PropPlacer staví +Y od hráče; přední strana je yaw − STOJAN.yaw)
      msg = { ...base, nazev: tt("view.place.stand"), models: [STOJAN.model], yaw: 180 + STOJAN.yaw };
      break;
    case "stul":
      msg = { ...base, nazev: tt("view.place.desk"), models: [STUL.model, STUL.lavicePrefabModel], offsets: [[0, 0, 0], [0, STUL.laviceY, 0]], rotations: [[1, 0, 0, 0], [0, 0, 0, 1]], yaw: 180, znovu: !presun };
      break;
    case "lavice":
      msg = { ...base, nazev: tt("view.place.bench"), models: [LAVICE_MODEL], rotations: [[0, 0, 0, 1]], yaw: 180, znovu: !presun };
      break;
    default:
      msg = { ...base, nazev: tt("view.place.seat"), models: [MODEL_PRAZDNY], scale: 0.01, obrys: { w: N.vybaveni.listSirka * 2 + 0.03, h: faceHeight(N.vybaveni.listSirka, 1, 1) }, znovu: !presun };
  }
  const pn = panelHrace(p);
  pn.umistuje = true;
  // průvodce: po tabuli dál na lavice, u lavic zůstat (staví se jich víc, dál se jde tlačítkem)
  if (!t.pruvodce) pn.krok = druh === "zed" || druh === "stojan" ? undefined : "lavice";
  umistovani.set(p.id, { t, presun, druh });
  send(p, UI.umistit, msg);
  return null;
}

const umistovani = new Map<number, { t: Trida; presun: string | null; druh: DruhUmisteni }>();

/** klient potvrdil místo (nebo skončil: konec = true) */
async function umisteno(p: Player, raw: unknown) {
  const m = (typeof raw === "string" ? JSON.parse(raw) : raw) as (UmistenoMsg & { konec?: boolean }) | null;
  const u = umistovani.get(p.id);
  const pn = panelHrace(p);
  if (!m || m.konec || !u) {
    umistovani.delete(p.id);
    pn.umistuje = false;
    if (pn.web) await obnovit(p, undefined, true);
    else void nabidkaZaloha(p);
    return;
  }
  const t = u.t;
  if (!tridy.includes(t) || !(await smiTridu(p, t))) return notify(p, T("msg.class.gone"), "warning");
  const v3 = (a: unknown): V3 | null => (Array.isArray(a) && a.length === 3 && a.every((x) => Number.isFinite(Number(x))) ? (a.map(Number) as V3) : null);
  const pos = v3(m.pos);
  const n = v3(m.n) ?? [0, 0, 1];
  const yaw = Number(m.yaw) || 0;
  if (!pos) return;
  const mimo = mimoTridu(p, t, pos);
  if (mimo) return notify(p, mimo, "warning");
  let r: Vysledek;
  // přesun: nejdřív ověřit, že nový kus půjde postavit (jinak by starý zmizel nadarmo)
  const predem =
    u.druh === "zed" && Math.abs(n[2]) > 0.5 ? T("msg.board.needsWall")
    : u.druh === "misto" && n[2] < 0.7 ? T("msg.build.aimDesk")
    : u.druh === "lavice" && !N.vybaveni.lavice ? T("msg.build.benchesOff")
    : u.druh === "stul" && !volnoProStul(t, u.presun?.startsWith("stul:") ? u.presun.slice(5) : undefined) ? T("msg.build.seatsFullMax", { n: t.mista.length, max: N.vybaveni.maxMist })
    : null;
  if (predem) return notify(p, predem, "warning");
  if (u.presun && !kusy(t).some((k) => k.id === u.presun)) return notify(p, T("msg.piece.gone"), "warning");
  // starý kus pryč, nový na novém místě (tabule si nese, co na ní bylo)
  let obsah: string | null = null;
  if (u.presun) {
    if (u.presun === "tabule" && t.tabule !== null) obsah = (await kx<Promise<{ d: string } | null>>("boardGet")?.(t.tabule, 0))?.d ?? null;
    if (u.presun !== "tabule") odebratKus(t, u.presun);
  }
  switch (u.druh) {
    case "zed":
    case "stojan":
      r = postavitTabuli(t, u.druh, pos, n, yaw);
      if (obsah && t.tabule !== null) kx("boardPut")?.(t.tabule, 0, obsah, { owner: OWNER, title: trServer()("letters.title.board"), bake: true });
      break;
    case "stul":
      r = await postavitStul(p, t, pos, yaw, u.presun ? u.presun.split(":")[1] : undefined);
      break;
    case "lavice":
      r = postavitLavici(t, pos, yaw, u.presun ? u.presun.split(":")[1] : undefined);
      break;
    default:
      r = await postavitMisto(t, pos, n, yaw);
  }
  await ulozTridy();
  if (r.text) notify(p, u.presun && r.druh === "ok" ? T("msg.build.moved", { result: r.text }) : r.text, druhOznameni(r, "success"));
  // stavba (měření stolu) mohla doběhnout až po konci umisťování: otevřený panel ať ukáže nový stav
  if (pn.otevreny && !pn.umistuje && pn.web) await obnovit(p);
  // přesun a tabule jsou jednorázové: klient po potvrzení končí sám (znovu = false)
}

// ---------------------------------------------------------------------------
// příkazy, události

async function prikaz(p: Player, args: string[]) {
  const sub = (args[0] ?? "").toLowerCase();
  if (!sub) return otevritPanel(p);
  if (sub === "nabidka") return otevritPanel(p, false); // nativní nabídka místo panelu
  if (sub === "cist") return ctenari.has(p.id) ? zvednout(p) : sklonit(p); // podruhé zvedne hlavu
  if (sub === "zvednout") return zvednout(p);
  if (sub === "jazyk" || sub === "lang") {
    if (!args[1]) return notify(p, T("msg.lang.current", { lang: jazyk(p), list: jazyky().join(", "), cmd: CFG.command }));
    return notify(p, await nastavitJazyk(p, String(args[1])));
  }
  if (sub === "debug") return ladeni(p, args.slice(1));
  if (sub === "psat") return notify(p, (await psatPisanku(p)).text);
  if (sub === "ja") {
    const j = await mojeJa(p);
    const pismena = j.pismena && j.stupen === 1 ? T("msg.me.letters", { letters: j.pismena }) : "";
    const dalsi = j.dalsi ? T("msg.me.next", { next: j.dalsi, xp: j.do }) : "";
    return notify(p, T("msg.me.literacy", { level: j.nazev, xp: j.xp, letters: pismena, next: dalsi }));
  }
  if (sub === "tabule" || sub === "pisanka") {
    const text = args.slice(1).join(" ").replace(/\\n/g, "\n").trim();
    const h = hodinaUcitele(p);
    const t = h?.t ?? tridaU(p);
    if (!(await jeUcitel(p)) || !t || !(await smiTridu(p, t))) return notify(p, T("msg.onlyOwnClass"), "error");
    if (!text) return notify(p, T("cmd.usage.text", { cmd: CFG.command, sub }), "error");
    if (sub === "tabule") return notify(p, napsatText(t, text).text);
    return notify(p, h ? (await zadatPisanky(h, text.slice(0, 40))).text : T("msg.copybook.assignInLesson"));
  }
  if (sub === "lavice" && (await jeUcitel(p))) {
    try {
      return notify(p, T("msg.benches.list", { list: SmartObject.blueprints().filter((b) => b.kind === "seat").map((b) => b.name).slice(0, 30).join(", ") }));
    } catch (e) {
      return notify(p, String(e), "error");
    }
  }
  if ((sub === "xp" || sub === "dat") && (await muze(p, "xp.edit"))) {
    const kdo = Player.all().find((x) => x.nickname.toLowerCase() === String(args[1] ?? "").toLowerCase());
    const n = Number(args[2]);
    if (!kdo || !Number.isFinite(n)) return notify(p, T("cmd.usage.xp", { cmd: CFG.command, sub }), "error");
    if (sub === "dat") return notify(p, T("msg.xp.entry", { name: kdo.nickname, result: await pridatXp(kdo, n, T("msg.xp.reason.admin"), null) }));
    return notify(p, T("msg.xp.entry", { name: kdo.nickname, result: await nastavitXp(kdo, n) }));
  }
  notify(p, T("cmd.usage.main", { cmd: CFG.command, admin: (await muze(p, "xp.edit")) ? T("cmd.usage.mainAdmin") : "" }), "error");
}

// ---------------------------------------------------------------------------
// ladění (/skola debug …, právo skola.debug): stav modulu, role, náhled čitelnosti, pohled panelu, oprava

/** hráč podle přezdívky (bez = sám) */
const hracJmenem = (jmeno: string | undefined, ja: Player) => (jmeno ? Player.all().find((x) => x.nickname.toLowerCase() === jmeno.toLowerCase()) ?? null : ja);

async function ladeni(p: Player, args: string[]) {
  const co = (args[0] ?? "stav").toLowerCase();
  const smi = async (s: Schopnost) => (await muze(p, s)) || (notify(p, T("msg.noPermission"), "error"), false);
  const vypsat = (radky: string[]) => {
    for (const r of radky) log(`[debug ${p.nickname}] ${r}`);
    notify(p, radky.join(" · "));
  };
  switch (co) {
    case "stav": {
      if (!(await smi("debug.view"))) return;
      const hk = HACKY.filter((k) => typeof cizi.h[k] === "function");
      return vypsat([
        `tridy ${tridy.length}, hodiny ${hodiny.size}, ctenari ${ctenari.size}, panely ${[...panely.values()].filter((x) => x.otevreny).length}`,
        `most ${most.running() ? "on" : "off"}, kresby ${maApi() ? "on" : "off"}`,
        `hooks ${hk.join(",") || "-"}${cizi.owner ? " (" + cizi.owner + ")" : ""}`,
        `lang ${vychoziJazyk()} [${jazyky().join(",")}], hrac ${jazyk(p)}`,
        `ui ${panelHrace(p).web ? "panel" : "native"}`,
      ]);
    }
    case "ja":
    case "hrac":
    case "role": {
      if (!(await smi("debug.view"))) return;
      const kdo = hracJmenem(args[1], p);
      if (!kdo) return notify(p, T("msg.playerOffline"), "error");
      const pr = (await nactiProfil(kdo)).p;
      return vypsat([
        `${kdo.nickname} (pid ${kdo.id}, char ${await cid(kdo)})`,
        `role ${(await prava.roleHrace(kdo.id)).join(",")}`,
        `smi ${(await prava.schopnostiHrace(kdo.id)).join(",")}`,
        `xp ${pr.xp}, stupen ${stav(pr.xp, N.pravidla).stupen}, lang ${jazyk(kdo)}`,
      ]);
    }
    case "cteni":
    case "nahled": {
      if (!(await smi("debug.preview"))) return;
      // stupeň 0..4 nebo XP; bez textu první stránka slabikáře
      const n = Number(args[1]);
      if (!Number.isFinite(n)) return notify(p, T("cmd.usage.debugRead", { cmd: CFG.command }), "error");
      const pr = N.pravidla;
      const xp = n <= 4 && Number.isInteger(n) ? [0, pr.xpPrvni + pr.xpPismeno * 3, pr.xpSlabiky, pr.xpSlova, Math.max(pr.xpPlynule, pr.xpLatina)][n] : n;
      const text = args.slice(2).join(" ") || bezZnacek(N.slabikar[0]?.text ?? "").replace(/\n/g, " / ");
      return vypsat([`xp ${xp}: ${filtr(text, stav(xp, pr), { seed: text })}`]);
    }
    case "pohled":
    case "ui": {
      if (!(await smi("debug.view"))) return;
      const v = await pohled(p, panelHrace(p));
      log(`[debug ${p.nickname}] UiView ${JSON.stringify(v)}`);
      return notify(p, T("msg.debug.viewLogged", { screen: v.obrazovka, actions: v.akce.length }));
    }
    case "log": {
      if (!(await smi("debug.tools"))) return;
      podrobne = args[1] ? args[1] === "on" || args[1] === "1" : !podrobne;
      return notify(p, T("msg.debug.verbose", { on: podrobne ? "on" : "off" }));
    }
    case "opravit": {
      if (!(await smi("debug.tools"))) return;
      return notify(p, T("msg.debug.repaired", { n: await opravitTridy() }));
    }
    case "nacist": {
      if (!(await smi("debug.tools"))) return;
      await nacist();
      return notify(p, T("msg.debug.reloaded", { classes: tridy.length }));
    }
    default:
      return notify(p, T("cmd.usage.debug", { cmd: CFG.command }), "error");
  }
}

async function nastavitXp(p: Player, xp: number): Promise<Zprava> {
  const prof = await nactiProfil(p);
  const pred = prof.p.xp;
  prof.p.xp = Math.max(0, Math.floor(xp));
  prof.p.historie = [...(prof.p.historie ?? []), { t: Date.now(), xp: prof.p.xp - pred, od: "admin", co: trServer()("msg.xp.reason.set") }].slice(-20);
  await ulozProfil(prof.cid, prof.p);
  poslatProfil(p);
  return T("msg.xp.setTo", { xp: prof.p.xp, level: T(klicStupne(stav(prof.p.xp, N.pravidla).stupen)) });
}

/** příkazy pro nápovědu a našeptávání v konzoli Správy (`;`): škola nemá klávesy, jen příkazy */
function popsatPrikazy() {
  try {
    const reg = Exports.get("sprava", "registerChatCommands") as ((owner: string, defs: unknown[]) => void) | undefined;
    if (typeof reg !== "function") return;
    const t = trServer(); // nápověda konzole Správy je společná: výchozí jazyk serveru
    reg("skola", [
      {
        name: CFG.command, usage: t("cmd.chat.usage", { cmd: CFG.command }),
        help: t("cmd.chat.help"),
        sub: ["cist", "zvednout", "psat", "ja", "nabidka", "tabule", "pisanka", "lavice", "dat", "xp", "jazyk", "debug"],
      },
    ]);
  } catch {
    // Správa neběží
  }
}

Events.on("playerCommand", (p, cmd, args) => {
  if (cmd.toLowerCase().replace(/^\//, "") === CFG.command) safely("/" + CFG.command, prikaz(p, args ?? []));
});
Events.onClient(EV.menu, (p: unknown) => void safely("panel", otevritPanel(p as Player)));
Events.onClient(UI.otevrit, (p: unknown, m: unknown) => {
  const x = (typeof m === "string" ? JSON.parse(m || "{}") : m) as { web?: boolean } | null;
  void safely("panel", otevritPanel(p as Player, x?.web !== false));
});
Events.onClient(UI.hello, (p: unknown) => {
  // stránka se (znovu) nahrála: otevřený panel dostane stav znovu
  const pn = panelHrace(p as Player);
  pn.web = true;
  if (pn.otevreny) void safely("panel", obnovit(p as Player));
});
Events.onClient(UI.pryc, (p: unknown) => void (panelHrace(p as Player).otevreny = false));
Events.onClient(UI.akce, (p: unknown, m: unknown) => void safely("akce panelu", akceZPanelu(p as Player, m)));
Events.onClient(UI.umisteno, (p: unknown, m: unknown) => void safely("umístění", umisteno(p as Player, m)));
Events.onClient(EV.sklonit, (p: unknown) => void safely("čítanka", sklonit(p as Player)));
Events.onClient(EV.zvednout, (p: unknown) => zvednout(p as Player));
Events.onClient(EV.prst, (p: unknown, m: unknown) => prst(p as Player, typeof m === "string" ? JSON.parse(m) : m));
Events.onClient(EV.psat, (p: unknown) => void safely("písanka", psatPisanku(p as Player).then((r) => notify(p as Player, r.text))));

Events.on("playerReady", (p: Player) => {
  void safely("jazyk", nactiJazyk(p));
  void safely("profil", nactiProfil(p).then(() => poslatProfil(p)));
});
Events.on("playerDisconnect", (p: Player) => {
  for (const h of [...hodiny.values()]) {
    if (h.ucitel === p.id) ukoncitHodinu(h.t);
    if (h.cte === p.id) prestatCist(h); // učiteli zmizí značka prstu
    h.ucastnici.delete(p.id);
  }
  ctenari.delete(p.id);
  profily.delete(p.id);
  prstOkno.delete(p.id);
  kTabuli.delete(p.id);
  okoliPoslane.delete(p.id);
  kartyPoslane.delete(p.id);
  panely.delete(p.id);
  umistovani.delete(p.id);
  jazykHracu.delete(p.id);
  jazykPoslan.delete(p.id);
});

// ---------------------------------------------------------------------------
// start, nastavení, správa

/** načtení tříd a nastavení; běží-li už, další volání počká na ně a pak proběhne znovu (dvě najednou by stavěla dvakrát) */
let nacitaniTrid: Promise<void> = Promise.resolve();
function nacist(): Promise<void> {
  nacitaniTrid = nacitaniTrid.then(nacistTed, nacistTed);
  return nacitaniTrid;
}

async function nacistTed() {
  try {
    const v = (await most.storage.get(KLIC.nastaveni)) as Partial<Nastaveni> | null;
    if (v) {
      const r = overit(doplnit(v));
      N = r.n;
      if (r.chyby.length) log(`uložené nastavení má chyby (${r.chyby.map((c) => c.message).join("; ")}), použito i tak`);
    }
  } catch (e) {
    log(`nastavení: ${String(e)}`);
  }
  try {
    const d = (await most.storage.get(KLIC.tridy)) as { dalsiId?: number; tridy?: Trida[] } | null;
    const nove = Array.isArray(d?.tridy) ? d!.tridy : [];
    for (const t of tridy) {
      respawnLaviceStop(t);
      for (const s of t.stoly ?? []) zbouratStul(t, s);
    }
    if (!nove.length && tridy.length) {
      // most naběhl po škole a jeho úložiště tříd je prázdné: třídy z paměti (záloha shimu) do něj uložit
      await ulozTridy();
    } else {
      // stejná id aktualizovat na místě: hodiny a čtenáři drží odkazy na třídy
      const podle = new Map(tridy.map((t) => [t.id, t]));
      tridy = nove.map((n) => (podle.has(n.id) ? Object.assign(podle.get(n.id)!, n) : n));
      for (const h of [...hodiny.values()]) if (!tridy.includes(h.t)) ukoncitHodinu(h.t, false);
    }
    dalsiId = Math.max(Number(d?.dalsiId) || 1, dalsiId, ...tridy.map((t) => t.id + 1));
    for (const t of tridy) {
      // třídy ze starší verze: id kusů pro panel, průvodce hotový (už jsou zařízené)
      for (const m of t.mista) m.k = m.k ?? novyKlic();
      t.lavice.forEach((l) => (l.k = l.k ?? novyKlic()));
      t.stoly = t.stoly ?? [];
      if (t.pruvodce === undefined) t.pruvodce = t.mista.length > 0;
      t.lavice.forEach((_, i) => spawnLavice(t, i));
      for (const s of t.stoly) spawnStul(t, s);
    }
    await nactiSdilene({ get: async (k) => most.storage.get(k), set: async (k, v) => most.storage.set(k, v as any) });
    await nactiObrazky();
    napojitKresby();
    log(`tříd ${tridy.length}, stránek slabikáře ${N.slabikar.length}`);
  } catch (e) {
    log(`třídy: ${String(e)}`);
  }
  for (const p of Player.all()) void nactiProfil(p).then(() => poslatProfil(p));
}

function respawnLaviceStop(t: Trida) {
  for (const [k, so] of [...lavice]) {
    if (!k.startsWith(t.id + ":")) continue;
    try {
      so.destroy();
    } catch {
      // už není
    }
    lavice.delete(k);
  }
}

/** desky tříd, které kresby neznají (ztracené úložiště kreseb, třída z doby bez kreseb), postavit znovu */
async function opravitTridy(): Promise<number> {
  const info = kx<{ slots: ({ d: number } | null)[] } | null>("boardInfo");
  const create = kx("boardCreate");
  if (!info || !create) return 0;
  let n = 0;
  const nova = (f: ListFace, extra: Record<string, unknown> = {}) => {
    const id = create({ owner: OWNER, pos: f.pos, n: f.n, w: f.w, h: f.h, cols: 1, rows: 1, ...extra });
    if (typeof id === "number") n++;
    return typeof id === "number" ? id : null;
  };
  for (const t of tridy) {
    if (t.tabuleFace && (t.tabule === null || !info(t.tabule))) t.tabule = nova(t.tabuleFace, t.tabuleDruh?.kind === "stojan" ? { kind: "stojan", yaw: t.tabuleDruh.yaw } : {});
    for (const m of t.mista) {
      if (m.cit === null || !info(m.cit)) m.cit = nova(m.fc);
      if (m.pis === null || !info(m.pis)) m.pis = nova(m.fp);
      if (m.cit !== null && !info(m.cit)?.slots[0]) await ukazat(m.cit, "citanka", obecnaCitanka(), trServer()("letters.title.reader"));
    }
  }
  if (n) {
    await ulozTridy();
    log(`opraveno ${n} desek tříd (kresby je neznaly)`);
  }
  return n;
}

/** kresby: filtr popisků (název a podpis kresby podle gramotnosti) a oprava tříd; exporty kreseb jdou číst až
 *  chvíli po jejich resourceStart, proto pár pokusů */
function napojitKresby(pokusy = 10) {
  const f = kx("setCaptionFilter");
  if (!f) {
    if (pokusy > 0) setTimeout(() => napojitKresby(pokusy - 1), 300);
    else log(`kresby bez API pro školu (${kxChyba}): tabule a listy nepůjdou stavět`);
    return;
  }
  f((pid: number, text: string, seed: string) => api.filtrText(pid, text, seed), OWNER);
  void safely("oprava tříd", opravitTridy().then((n) => log(`kresby napojené: filtr popisků, sdílené kresby${n ? `, opraveno ${n} desek` : ""}`)));
}

function nastaveniDef(): NastaveniDef<Player> {
  nactiSchopnosti();
  const t = trServer(); // editor nastavení je společný pro server: výchozí jazyk serveru
  return {
    id: "skola",
    title: t("admin.settings.title"),
    description: t("admin.settings.description"),
    perm: "skola.admin",
    schema: schema(jazyky(), t),
    get: () => JSON.parse(JSON.stringify(N)) as SettingsObject,
    set: async (value, ctx) => {
      const ts = trServer();
      const r = overit(JSON.parse(JSON.stringify(value)) as Nastaveni, ts);
      if (r.chyby.length) return { ok: false, message: ts("admin.settings.invalid"), errors: r.chyby };
      const jazykPred = JSON.stringify(N.jazyk);
      N = r.n;
      for (const p of Player.all()) if (profily.has(p.id)) poslatProfil(p);
      if (JSON.stringify(N.jazyk) !== jazykPred) for (const p of Player.all()) void safely("jazyk", nactiJazyk(p));
      const ok = await most.storage.set(KLIC.nastaveni, JSON.parse(JSON.stringify(N)));
      log(`${ctx.caller.nickname}: nastavení školy uloženo`);
      return trServer()(ok ? "admin.settings.saved" : "admin.settings.savedMemory");
    },
    reset: async (ctx) => {
      N = kopie(VYCHOZI);
      await most.storage.delete(KLIC.nastaveni);
      for (const p of Player.all()) if (profily.has(p.id)) poslatProfil(p);
      log(`${ctx.caller.nickname}: nastavení školy vráceno na výchozí`);
      return trServer()("admin.settings.reset");
    },
  };
}

const najit = (jmeno: unknown) => (jmeno && typeof jmeno === "object" ? (jmeno as Player) : Player.all().find((x) => x.nickname.toLowerCase() === String(jmeno ?? "").toLowerCase()) ?? null);
/** jazyk hlášek akce Správy: kdo ji spustil (bez hráče výchozí jazyk serveru) */
const trVolajici = (caller: unknown): Prekladac => (caller && typeof caller === "object" && typeof (caller as Player).id === "number" ? tr(caller as Player) : trServer());

// popisky panelu Správy jsou společné pro server (výchozí jazyk), hlášky akcí v jazyce toho, kdo akci spustil
const panel = registerAdminPanel("skola", () => {
  const L = trServer();
  return {
    id: "skola",
    title: L("admin.title"),
    group: "Moduly", // skupina panelů Správy (stejný název u všech modulů), nepřekládá se
    description: L("admin.description"),
    perm: "skola.admin",
    actions: [
      {
        // písař (i bez admina) otevře panel školy z F10: založení třídy, průvodce, hodina; F10 se zavře, panel po ní
        id: "panel", label: L("admin.openPanel"), perm: "skola.ucit",
        description: L("admin.openPanel.description"),
        handler: ({ caller }: ActionContext) => {
          setTimeout(() => void safely("panel z F10", otevritPanel(caller as Player, true)), 350);
          return { ok: true, message: trVolajici(caller)("admin.openPanel.opening"), close: true };
        },
      },
      {
        id: "profil", label: L("admin.profile"), params: [{ name: "hrac", label: L("admin.param.player"), type: "player", default: "me", required: true }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const p = najit(params.hrac);
          if (!p) return { ok: false, message: t("msg.playerOffline") };
          const pr = (await nactiProfil(p)).p;
          const st = stav(pr.xp, N.pravidla);
          return {
            ok: true, message: `${p.nickname}: ${nazevStupne(t, st)}`, info: [
              { label: "XP", value: pr.xp }, { label: t("admin.profile.level"), value: nazevStupne(t, st) },
              { label: t("admin.profile.letters"), value: st.stupen === 1 ? st.pismena.toUpperCase() : st.stupen > 1 ? t("view.me.allLetters") : t("admin.profile.lettersNone") },
              { label: t("admin.profile.next"), value: st.dalsi ? t("admin.profile.nextValue", { next: dalsiText(t, st), xp: st.dalsi.xp }) : "—" },
              { label: t("admin.profile.today"), value: `${pr.den?.d === dnes() ? pr.den.celkem : 0} XP` },
              { label: t("admin.profile.sample"), value: filtr(t("view.me.sample"), st, { seed: 1 }) },
            ],
          };
        },
      },
      {
        id: "dat", label: L("admin.give"), params: [{ name: "hrac", label: L("admin.param.player"), type: "player", required: true }, { name: "xp", label: "XP", type: "number", min: 1, max: 10000, default: 10 }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const p = najit(params.hrac);
          return p ? t.z(T("msg.xp.entry", { name: p.nickname, result: await pridatXp(p, Number(params.xp), T("msg.xp.reason.admin"), null) })) : { ok: false, message: t("msg.playerOffline") };
        },
      },
      {
        id: "nastavit", label: L("admin.set"), danger: true, params: [{ name: "hrac", label: L("admin.param.player"), type: "player", required: true }, { name: "xp", label: "XP", type: "number", min: 0, max: 100000, default: 0 }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const p = najit(params.hrac);
          return p ? t.z(T("msg.xp.entry", { name: p.nickname, result: await nastavitXp(p, Number(params.xp)) })) : { ok: false, message: t("msg.playerOffline") };
        },
      },
      {
        id: "tridy", label: L("admin.classes"),
        handler: ({ caller }: ActionContext) => {
          const t = trVolajici(caller);
          return {
            ok: true, message: t("admin.classes.summary", { classes: tridy.length, lessons: hodiny.size }),
            info: tridy.map((x) => ({
              label: `${x.id}: ${x.nazev}`,
              value: t("admin.classes.row", { teacher: x.jmeno, seats: x.mista.length, desks: x.stoly?.length ?? 0, benches: x.lavice.length, board: t(x.tabule !== null ? "admin.yes" : "admin.no"), lesson: hodiny.has(x.id) ? t("admin.classes.lessonRunning") : "" }),
            })),
          };
        },
      },
      {
        id: "zrusit", label: L("admin.cancelClass"), danger: true, confirm: L("admin.cancelClass.confirm"), params: [{ name: "id", label: L("admin.param.classId"), type: "number", required: true, min: 1 }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const x = tridy.find((y) => y.id === Number(params.id));
          if (!x) return { ok: false, message: t("admin.cancelClass.none") };
          await zrusitTridu(x);
          return t("admin.cancelClass.done", { id: x.id });
        },
      },
      {
        id: "slabikarJazyka", label: L("admin.primerLang"), danger: true,
        description: L("admin.primerLang.description"),
        confirm: L("admin.primerLang.confirm"),
        params: [{ name: "jazyk", label: L("admin.param.lang"), type: "select", options: Object.keys(SLABIKARE).map((j) => ({ value: j, label: j })), default: vychoziJazyk() in SLABIKARE ? vychoziJazyk() : "cs", required: true }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const s = SLABIKARE[String(params.jazyk)];
          if (!s) return { ok: false, message: t("admin.primerLang.none") };
          N = overit({ ...N, pravidla: { ...N.pravidla, poradi: s.poradi }, slabikar: kopie(s.slabikar) }).n;
          await most.storage.set(KLIC.nastaveni, JSON.parse(JSON.stringify(N)));
          for (const p of Player.all()) if (profily.has(p.id)) poslatProfil(p);
          log(`${(caller as Player).nickname}: slabikář ${params.jazyk}`);
          return t("admin.primerLang.done", { lang: String(params.jazyk), n: N.slabikar.length });
        },
      },
      {
        id: "ladeni", label: L("admin.debug"), perm: "skola.debug",
        description: L("admin.debug.description"),
        params: [{ name: "hrac", label: L("admin.param.player"), type: "player", default: "me", required: true }],
        handler: async ({ params, caller }: ActionContext) => {
          const t = trVolajici(caller);
          const p = najit(params.hrac);
          if (!p) return { ok: false, message: t("msg.playerOffline") };
          return {
            ok: true, message: `${p.nickname}: ${(await prava.roleHrace(p.id)).join(", ")}`, info: [
              { label: t("admin.debug.classesLessons"), value: `${tridy.length} / ${hodiny.size}` },
              { label: t("admin.debug.hooks"), value: HACKY.filter((k) => typeof cizi.h[k] === "function").join(", ") || "—" },
              { label: t("admin.debug.languages"), value: t("admin.debug.languagesValue", { lang: vychoziJazyk(), list: jazyky().join(", "), player: jazyk(p) }) },
              { label: t("admin.debug.may"), value: (await prava.schopnostiHrace(p.id)).join(", ") },
            ],
          };
        },
      },
    ],
  };
}, log);

let bezi = false;
const casovace: ReturnType<typeof setInterval>[] = [];
Events.on("resourceStart", (name: string) => {
  if (name === "sprava") {
    poslatNastaveniPozdeji(nastaveniDef, "skola", log);
    popsatPrikazy();
  }
  if (name === "most") setTimeout(() => void safely("načíst", nacist()), 400);
  if (name === "kresby" && bezi) napojitKresby();
  if (name !== "skola" || bezi) return;
  bezi = true;
  panel.attempt();
  popsatPrikazy();
  if (!poslatNastaveni(nastaveniDef(), "skola", log, true)) poslatNastaveniPozdeji(nastaveniDef, "skola", log);
  casovace.push(setInterval(tick, TICK));
  casovace.push(setInterval(() => void safely("panely", obnovitPanely()), TICK));
  casovace.push(setInterval(hlidatTabuli, 1000));
  casovace.push(setInterval(poslatKarty, 1000));
  casovace.push(setInterval(poslatOkoli, 2000));
  void safely("načíst", nacist());
  log(`most ${most.running() ? "běží" : "neběží"}`);
});
Events.on("resourceStop", (name: string) => {
  if (cizi.owner && name === cizi.owner) {
    cizi.h = { ...(CFG.hooks ?? {}) };
    cizi.owner = null;
    log(`háčky od ${name} zrušeny`);
  }
  if (name !== "skola" && odebratVlastnika(name, nahratJazyky)) {
    log(`překlady od ${name} zrušeny`);
    for (const p of Player.all()) if (jazykPoslan.has(p.id)) poslatJazyk(p);
  }
  if (name !== "skola") return;
  for (const c of casovace) clearInterval(c);
  for (const t of tridy) {
    respawnLaviceStop(t);
    for (const s of t.stoly ?? []) zbouratStul(t, s);
  }
});

// ---------------------------------------------------------------------------
// API pro jiné resources (manifest exports)

const hrac = (id: number) => Player.getById(id);
const api = {
  /** text tak, jak ho hráč přečte (seed = id textu, ať se pseudoznaky nemění) */
  filtrText: (pid: number, text: string, seed?: string | number) => filtr(String(text ?? ""), stavHrace(pid), { seed: seed ?? String(text ?? "") }),
  /** čitelnost 0..1 po 0,1 pro nativní knihu (Book.open legibility) */
  legibility: (pid: number, text: string, seed?: string | number) => legibility(String(text ?? ""), stavHrace(pid), { seed: seed ?? String(text ?? "") }),
  /** stav gramotnosti; nazev v jazyce hráče */
  stav: (pid: number) => {
    const st = stavHrace(pid);
    return { ...st, nazev: nazevStupne(tr(pid), st) };
  },
  xp: (pid: number) => profily.get(pid)?.p.xp ?? 0,
  /** vrací popis výsledku ve výchozím jazyce serveru (pro log a framework) */
  pridatXp: (pid: number, xp: number, duvod = "framework") => {
    const p = hrac(pid);
    return p ? pridatXp(p, xp, duvod, null).then((z) => trServer().z(z)) : Promise.resolve(trServer()("msg.playerOffline"));
  },
  setHooks: (h: Partial<Hooky>, owner: string) => setHooks(h, owner),
  /** smí hráč schopnost? (src/opravneni.ts; i s háčkem frameworku) */
  can: (pid: number, schopnost: string) => (SEZNAM_SCHOPNOSTI.includes(schopnost as Schopnost) ? muze(pid, schopnost as Schopnost) : Promise.resolve(false)),
  /** role a schopnosti hráče */
  roles: async (pid: number) => ({ role: await prava.roleHrace(pid), schopnosti: await prava.schopnostiHrace(pid) }),
  capabilities: () => SEZNAM_SCHOPNOSTI.map((s) => ({ id: s, role: prava.role(s) })),
  /** další jazyk nebo úprava textů (zmizí se zastavením vlastníka); vrací počet klíčů */
  addTranslations: (lang: string, dict: Slovnik, owner: string) => {
    const n = pridatPreklady(lang, dict, owner || "?");
    for (const p of Player.all()) if (jazykPoslan.has(p.id)) poslatJazyk(p);
    return n;
  },
  languages: () => jazyky(),
  /** jazyk hráče; s kódem ho nastaví (jako /skola jazyk), "auto" = podle frameworku / serveru */
  language: async (pid: number, kod?: string) => {
    const p = hrac(pid);
    if (!p) return null;
    if (kod) await nastavitJazyk(p, kod);
    return jazyk(p);
  },
  /** text školy v jazyce hráče (klíč ze src/lang/) */
  translate: (pid: number, klic: string, a?: Record<string, string | number>) => tr(pid)(klic, a),
  isBusy: (pid: number) => ctenari.has(pid),
  spravaPanels: () => panel.spravaPanels(),
  spravaSettings: () => nastaveniDef(),
};
for (const [name, fn] of Object.entries(api)) Exports.register(name, fn);
