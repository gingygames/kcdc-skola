// Most na API resource kresby (kresby/kcdc/src/server/api.ts): desky školy, inkousty, sdílené kresby.
//
// Sdílená kresba se upeče do textury jednou a visí na kolika deskách je třeba: obecný vzhled čítanky na všech
// stolech, předloha písanky ve všech písankách, připravené tabule stránek slabikáře. Klíč -> { id, h }: stejný obsah
// (otisk h) = stejná textura, změněný obsah = stará se smaže a upeče nová. Bez novějších kreseb (bez drawingPrepare)
// se kresba vloží na každou desku zvlášť (boardPut).

import { hashOf, type Ink } from "../../../kresby/kcdc/src/shared/codec";

export const OWNER = "skola";

/** proč naposledy export kreseb nešel přečíst (do logu školy) */
export let kxChyba = "";

export function kx<T = any>(name: string): ((...a: any[]) => T) | null {
  try {
    const f = Exports.get("kresby", name);
    if (typeof f === "function") return f as (...a: any[]) => T;
    kxChyba = `${name}: ${f === undefined ? "export není" : typeof f}`;
    return null;
  } catch (e) {
    kxChyba = `${name}: ${String(e)}`;
    return null;
  }
}

export const maApi = () => !!kx("boardCreate");

/** inkoust relace kreseb: jméno na plátně (k = klíč překladu letters.ink.*), pick:false = jen předloha (psát jím nejde) */
export type Inkoust = Ink & { name: string; k?: string; pick?: false };

// příznaky inkoustu kreseb: 1 krycí, 4 rovnoměrný tah (křída a sázené písmo: bez kaněk, ztenčených konců a slábnutí)
export const CHALK: Inkoust[] = [
  { rgb: [236, 232, 220], flags: 5, strength: 255, name: "Bílá křída", k: "letters.ink.chalkWhite" },
  { rgb: [232, 200, 90], flags: 5, strength: 255, name: "Žlutá křída", k: "letters.ink.chalkYellow" },
  { rgb: [205, 95, 80], flags: 5, strength: 255, name: "Červená křída", k: "letters.ink.chalkRed" },
];
export const INK_PISANKA: Inkoust[] = [
  { rgb: [38, 30, 28], flags: 0, strength: 245, name: "Duběnkový inkoust", k: "letters.ink.oakGall" }, // plátno kreseb vybere první
  { rgb: [150, 138, 118], flags: 4, strength: 150, name: "Předloha", k: "letters.ink.model", pick: false },
];
export const INK_OBRAZEK: Inkoust[] = [
  { rgb: [38, 30, 28], flags: 0, strength: 245, name: "Černá", k: "letters.ink.black" },
  { rgb: [160, 40, 30], flags: 0, strength: 230, name: "Červená", k: "letters.ink.red" },
  { rgb: [50, 85, 150], flags: 0, strength: 230, name: "Modrá", k: "letters.ink.blue" },
  { rgb: [70, 120, 60], flags: 0, strength: 230, name: "Zelená", k: "letters.ink.green" },
  { rgb: [190, 140, 60], flags: 0, strength: 230, name: "Okrová", k: "letters.ink.ochre" },
];

/** inkousty pro relaci kreseb jednoho hráče: jména v jeho jazyce (t = překladač), bez klíče překladu */
export const inkoustyPro = (i: Inkoust[], t: (k: string) => string): Inkoust[] => i.map(({ k, ...x }) => (k ? { ...x, name: t(k) } : x));

/** inkousty do dat kresby (kodek nese jen barvu, druh a sytost) */
export const dataInkoustu = (i: Inkoust[]): Ink[] => i.map(({ rgb, flags, strength }) => ({ rgb, flags, strength }));

export const papirTabule = () => {
  const k = kx<number>("paperCode")?.("tabule");
  return typeof k === "number" && k >= 0 ? k : 31;
};

export interface Sdilena {
  id: number;
  h: string;
  t: number; // naposledy použitá (úklid nejstarších)
}

export interface Uloziste {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<boolean>;
}

const KLIC = "skola:sdilene";
let sdilene: Record<string, Sdilena> = {};
let uloziste: Uloziste | null = null;
const log = (t: string) => console.log("[skola] " + t);

export async function nactiSdilene(u: Uloziste) {
  uloziste = u;
  try {
    const v = (await u.get(KLIC)) as Record<string, Sdilena> | null;
    sdilene = v && typeof v === "object" ? v : {};
  } catch (e) {
    log(`sdílené kresby: ${String(e)}`);
  }
}

const ulozit = () => void uloziste?.set(KLIC, JSON.parse(JSON.stringify(sdilene))).catch(() => false);

/** id sdílené kresby pro klíč a obsah (upeče se, jen když je obsah nový); null = kresby to neumí */
export function sdilena(klic: string, data: string, title: string): number | null {
  const prepare = kx("drawingPrepare");
  if (!prepare) return null;
  const h = hashOf(data);
  const old = sdilene[klic];
  if (old && old.h === h) {
    old.t = Date.now();
    return old.id;
  }
  if (old) void kx("drawingDelete")?.(old.id, OWNER);
  const id = prepare(OWNER, data, { title });
  if (typeof id !== "number") {
    log(`sdílená kresba ${klic}: ${String(id)}`);
    return null;
  }
  sdilene[klic] = { id, h, t: Date.now() };
  uklid();
  ulozit();
  return id;
}

/** nejvýš 40 sdílených kreseb: nejdéle nepoužité předlohy písanek pryč (stránky a čítanka zůstávají) */
function uklid() {
  const predlohy = Object.entries(sdilene).filter(([k]) => k.startsWith("predloha:")).sort((a, b) => a[1].t - b[1].t);
  while (Object.keys(sdilene).length > 40 && predlohy.length) {
    const [k, v] = predlohy.shift()!;
    void kx("drawingDelete")?.(v.id, OWNER);
    delete sdilene[k];
  }
}

export const pripravena = (klic: string) => sdilene[klic] ?? null;
export const hotova = (klic: string) => {
  const s = sdilene[klic];
  return !!s && !!kx<boolean>("drawingReady")?.(s.id);
};

/** list desky ukáže kresbu: sdílenou (jedna textura), jinak vloženou zvlášť. true = visí */
export async function ukazat(board: number | null, klic: string, data: string, title: string): Promise<boolean> {
  if (board === null) return false;
  for (let pokus = 0; pokus < 2; pokus++) {
    const id = sdilena(klic, data, title);
    if (id === null) break;
    const r = await kx<Promise<true | string>>("boardShow")?.(board, 0, id, OWNER);
    if (r === true) return true;
    // kresby kresbu neznají (úložiště kreseb přišlo o data): upéct znovu
    delete sdilene[klic];
  }
  return typeof kx("boardPut")?.(board, 0, data, { owner: OWNER, title }) === "number";
}

/** smazat sdílenou kresbu (obrázek stránky změněn …) */
export function zapomenout(klic: string) {
  const s = sdilene[klic];
  if (!s) return;
  void kx("drawingDelete")?.(s.id, OWNER);
  delete sdilene[klic];
  ulozit();
}
