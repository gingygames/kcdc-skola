// Jednotahové ruční písmo: glyfy jako lomené čáry, sazba textu na list kresby (768 × 512 logických px) do tahů
// kodeku kreseb. Použití:
//   * tabule a čítanka: text napsaný „rukou“ (tahy se upečou do textury jako každá kresba);
//   * písanka: světlá předloha písmene, po které student obtahuje;
//   * čítanka v klientu: přefiltrovaný text se kreslí stejným písmem přes list, polohy slov (boxy) určí,
//     na kterém slově je prst studenta.
//
// Mřížka glyfu: y 0 = horní dotah / výška velkých písmen, 4 = výška malých, 10 = účaří, 13 = dolní dotah.
// Glyf = šířka + čáry "x,y x,y …". Diakritika se skládá (čárka, háček, kroužek nad základní písmeno).

import type { Stroke } from "../../../../kresby/kcdc/src/shared/codec";

type Glyf = [number, string[]];

const G: Record<string, Glyf> = {
  A: [6, ["0,10 3,0 6,10", "1,6.5 5,6.5"]],
  B: [5.5, ["0,10 0,0 4,0 5,1 5,4 4,5 0,5", "4,5 5.5,6 5.5,9 4.5,10 0,10"]],
  C: [6, ["6,1.5 5,0.3 3,0 1,0.8 0,3 0,7 1,9.2 3,10 5,9.7 6,8.5"]],
  D: [6, ["0,0 0,10 3,10 5,8.5 6,5 5,1.5 3,0 0,0"]],
  E: [5, ["5,0 0,0 0,10 5,10", "0,5 4,5"]],
  F: [5, ["5,0 0,0 0,10", "0,5 4,5"]],
  G: [6, ["6,1.5 5,0.3 3,0 1,0.8 0,3 0,7 1,9.2 3,10 5,9.6 6,8 6,6 3.5,6"]],
  H: [6, ["0,0 0,10", "6,0 6,10", "0,5 6,5"]],
  I: [0.5, ["0.25,0 0.25,10"]],
  J: [4, ["4,0 4,8 3,9.7 1.5,10 0,9"]],
  K: [5, ["0,0 0,10", "5,0 0,6", "1.6,4.5 5,10"]],
  L: [5, ["0,0 0,10 5,10"]],
  M: [7, ["0,10 0,0 3.5,6 7,0 7,10"]],
  N: [6, ["0,10 0,0 6,10 6,0"]],
  O: [6, ["3,0 1,0.8 0,3 0,7 1,9.2 3,10 5,9.2 6,7 6,3 5,0.8 3,0"]],
  P: [5.5, ["0,10 0,0 4,0 5.5,1 5.5,4 4,5 0,5"]],
  Q: [6.5, ["3,0 1,0.8 0,3 0,7 1,9.2 3,10 5,9.2 6,7 6,3 5,0.8 3,0", "3.5,7 6.5,10.5"]],
  R: [5.5, ["0,10 0,0 4,0 5.5,1 5.5,4 4,5 0,5", "3,5 5.5,10"]],
  S: [5.7, ["5.5,1.5 4.5,0.2 2.5,0 0.8,0.8 0.5,2.5 1.5,4 4.5,5.5 5.7,7 5.5,9 4,10 2,10 0.5,9.3 0,8.2"]],
  T: [6, ["0,0 6,0", "3,0 3,10"]],
  U: [6, ["0,0 0,7 1,9.3 3,10 5,9.3 6,7 6,0"]],
  V: [6, ["0,0 3,10 6,0"]],
  W: [8, ["0,0 2,10 4,3 6,10 8,0"]],
  X: [6, ["0,0 6,10", "6,0 0,10"]],
  Y: [6, ["0,0 3,5 6,0", "3,5 3,10"]],
  Z: [6, ["0,0 6,0 0,10 6,10"]],
  a: [4.5, ["4.5,5 3,4 1.5,4 0.3,5.5 0,7.5 0.6,9.5 2,10 3.5,9.5 4.5,8", "4.5,4 4.5,10"]],
  b: [4.8, ["0,0 0,10", "0,6 1.5,4.3 3,4 4.3,5 4.8,7 4.3,9 3,10 1.5,9.7 0,8"]],
  c: [4.3, ["4.3,5 3,4 1.5,4 0.3,5.5 0,7 0.4,8.8 1.5,10 3,10 4.3,9"]],
  d: [4.5, ["4.5,0 4.5,10", "4.5,6 3,4.3 1.5,4 0.3,5.3 0,7 0.5,9 1.8,10 3.2,9.7 4.5,8"]],
  e: [4.5, ["0.2,7 4.5,7 4.3,5.3 3,4 1.5,4 0.3,5.3 0,7.2 0.5,9 2,10 3.5,10 4.3,9.2"]],
  f: [3.5, ["3.5,0.5 2.5,0 1.5,0.5 1.2,2 1.2,10", "0,4.5 3,4.5"]],
  g: [4.5, ["4.5,5.5 3,4 1.5,4 0.3,5.3 0,7 0.5,8.8 2,9.5 3.5,9 4.5,7.5", "4.5,4 4.5,11.5 3.5,13 1.5,13 0.3,12"]],
  h: [4.5, ["0,0 0,10", "0,6 1.5,4.3 3,4 4.2,5 4.5,6.5 4.5,10"]],
  i: [1, ["0.5,4.5 0.5,10", "0.5,2 0.5,2.3"]],
  ı: [1, ["0.5,4.5 0.5,10"]], // bez tečky (í)
  j: [2, ["2,4.5 2,11.8 1.3,13 0,12.8", "2,2 2,2.3"]],
  k: [4.2, ["0,0 0,10", "4,4 0,7.5", "1.3,6.5 4.2,10"]],
  l: [2, ["0.5,0 0.5,9 1.3,10 2,9.8"]],
  m: [6, ["0,4 0,10", "0,5.5 1.3,4.2 2.5,4.5 3,5.5 3,10", "3,5.5 4.3,4.2 5.5,4.5 6,5.5 6,10"]],
  n: [4.4, ["0,4 0,10", "0,5.8 1.5,4.2 3,4 4,4.7 4.4,6 4.4,10"]],
  o: [4.4, ["2.2,4 0.6,4.8 0,7 0.6,9.2 2.2,10 3.8,9.2 4.4,7 3.8,4.8 2.2,4"]],
  p: [4.8, ["0,4 0,13", "0,6 1.5,4.3 3,4 4.3,5 4.8,7 4.3,9 3,10 1.5,9.7 0,8"]],
  q: [4.5, ["4.5,4 4.5,13", "4.5,6 3,4.3 1.5,4 0.3,5.3 0,7 0.5,9 1.8,10 3.2,9.7 4.5,8"]],
  r: [3.5, ["0,4 0,10", "0,6.2 1,4.7 2.3,4 3.5,4.3"]],
  s: [3.9, ["3.8,4.8 2.6,4 1.2,4 0.2,4.8 0.4,6.2 3.3,7.6 3.9,8.9 3,9.9 1.5,10 0,9.2"]],
  t: [3, ["1.2,1.5 1.2,9 2,10 3,9.8", "0,4.3 2.8,4.3"]],
  u: [4.3, ["0,4 0,8.5 0.8,9.7 2,10 3.3,9.5 4.3,8 4.3,4", "4.3,8 4.3,10"]],
  v: [4, ["0,4 2,10 4,4"]],
  w: [6, ["0,4 1.5,10 3,5.5 4.5,10 6,4"]],
  x: [4, ["0,4 4,10", "4,4 0,10"]],
  y: [4.5, ["0.5,4 2.5,10", "4.5,4 1.8,12 1,13 0.2,12.8"]],
  z: [4, ["0,4 4,4 0,10 4,10"]],
  "0": [5, ["2.5,0 0.8,1 0,5 0.8,9 2.5,10 4.2,9 5,5 4.2,1 2.5,0"]],
  "1": [2.5, ["0.5,2.5 2.5,0 2.5,10"]],
  "2": [5, ["0.2,2 1.5,0.3 3.5,0.2 4.8,1.6 4.6,3.5 0,10 5,10"]],
  "3": [5, ["0.3,1 2,0 4,0.4 4.8,2.3 3.6,4.5 1.8,5 3.8,5.4 5,7.2 4.6,9.2 2.8,10 1,9.8 0,8.8"]],
  "4": [5, ["3.8,10 3.8,0 0,7 5,7"]],
  "5": [5, ["4.5,0 0.8,0 0.4,4.5 2,4 3.8,4.3 5,6 5,8 3.8,9.6 2,10 0.2,9.3"]],
  "6": [5, ["4.3,0.5 2.5,0 1,1 0.1,4 0,7 0.6,9.2 2.3,10 4,9.4 4.9,7.6 4.4,5.6 2.8,4.8 1,5.4 0.1,7"]],
  "7": [5, ["0,0 5,0 1.8,10"]],
  "8": [5, ["2.5,5 0.8,4 0.6,1.6 2.5,0 4.4,1.6 4.2,4 2.5,5 0.4,6.3 0.2,8.6 2.5,10 4.8,8.6 4.6,6.3 2.5,5"]],
  "9": [5, ["4.8,3 4,4.8 2.4,5.2 0.8,4.4 0.2,2.4 1.2,0.4 2.8,0 4.3,0.8 4.9,3 4.6,7 3.6,9.4 2,10 0.5,9.3"]],
  ".": [0.6, ["0.3,9.6 0.3,10"]],
  ",": [0.8, ["0.7,9.6 0.7,10.4 0,11.5"]],
  "!": [1, ["0.5,0 0.5,7", "0.5,9.6 0.5,10"]],
  "?": [4.5, ["0,2 1,0.4 2.5,0 4,0.6 4.5,2 3.8,3.6 2.3,4.8 2.3,7", "2.3,9.6 2.3,10"]],
  "-": [3, ["0,6.5 3,6.5"]],
  "–": [5, ["0,6.5 5,6.5"]],
  ":": [0.8, ["0.4,4.6 0.4,5", "0.4,9.6 0.4,10"]],
  ";": [0.8, ["0.4,4.6 0.4,5", "0.7,9.6 0.7,10.4 0,11.5"]],
  "'": [0.6, ["0.5,0 0.2,2.5"]],
  '"': [1.6, ["0.5,0 0.2,2.5", "1.6,0 1.3,2.5"]],
  "„": [1.6, ["0.5,9.6 0.2,11.5", "1.6,9.6 1.3,11.5"]],
  "“": [1.6, ["0.2,0 0.5,2", "1.3,0 1.6,2"]],
  "(": [2, ["2,-0.5 0.6,2 0,5 0.6,8 2,10.5"]],
  ")": [2, ["0,-0.5 1.4,2 2,5 1.4,8 0,10.5"]],
  "/": [4, ["4,0 0,10"]],
  "+": [4, ["0,6.5 4,6.5", "2,4.5 2,8.5"]],
  "=": [4, ["0,5.5 4,5.5", "0,7.5 4,7.5"]],
};

type Znamenko = "carka" | "hacek" | "krouzek" | "apostrof";
// písmeno -> [základ, znaménko]
const SLOZENE: Record<string, [string, Znamenko]> = {
  á: ["a", "carka"], é: ["e", "carka"], í: ["ı", "carka"], ó: ["o", "carka"], ú: ["u", "carka"], ý: ["y", "carka"],
  ů: ["u", "krouzek"], ě: ["e", "hacek"], š: ["s", "hacek"], č: ["c", "hacek"], ř: ["r", "hacek"], ž: ["z", "hacek"],
  ň: ["n", "hacek"], ď: ["d", "apostrof"], ť: ["t", "apostrof"],
  Á: ["A", "carka"], É: ["E", "carka"], Í: ["I", "carka"], Ó: ["O", "carka"], Ú: ["U", "carka"], Ý: ["Y", "carka"],
  Ů: ["U", "krouzek"], Ě: ["E", "hacek"], Š: ["S", "hacek"], Č: ["C", "hacek"], Ř: ["R", "hacek"], Ž: ["Z", "hacek"],
  Ň: ["N", "hacek"], Ď: ["D", "hacek"], Ť: ["T", "hacek"],
};

type Bod = [number, number];
type Cara = Bod[];

const parse = (s: string): Cara => s.split(" ").map((p) => p.split(",").map(Number) as Bod);

/** oblé tahy (o, a, s, c…) vyhladit (Chaikin), ostré rohy (A, M, V, N…) nechat: řeže se jen mírná zatáčka */
function vyhladit(c: Cara, kol = 2): Cara {
  let b = c;
  for (let k = 0; k < kol; k++) {
    if (b.length < 3) return b;
    const out: Cara = [b[0]];
    for (let i = 1; i < b.length - 1; i++) {
      const [ax, ay] = b[i - 1];
      const [px, py] = b[i];
      const [cx, cy] = b[i + 1];
      const u = Math.atan2(py - ay, px - ax);
      const v = Math.atan2(cy - py, cx - px);
      let zatacka = Math.abs(v - u);
      if (zatacka > Math.PI) zatacka = 2 * Math.PI - zatacka;
      if (zatacka > (80 * Math.PI) / 180) out.push(b[i]);
      else {
        out.push([px + (ax - px) * 0.25, py + (ay - py) * 0.25]);
        out.push([px + (cx - px) * 0.25, py + (cy - py) * 0.25]);
      }
    }
    out.push(b[b.length - 1]);
    b = out;
  }
  return b;
}
const CACHE = new Map<string, { w: number; cary: Cara[] } | null>();

/** glyf znaku: šířka a čáry v mřížce (null = písmo znak nemá) */
export function glyf(ch: string): { w: number; cary: Cara[] } | null {
  if (CACHE.has(ch)) return CACHE.get(ch)!;
  let out: { w: number; cary: Cara[] } | null = null;
  const g = G[ch];
  if (g) out = { w: g[0], cary: g[1].map((x) => vyhladit(parse(x))) };
  else if (SLOZENE[ch]) {
    const [z, zn] = SLOZENE[ch];
    const b = glyf(z);
    if (b) {
      const velke = z === z.toUpperCase() && z !== "ı";
      const cx = b.w / 2;
      const dy = velke ? -3.6 : 0;
      let m: Cara[];
      if (zn === "carka") m = [[[cx - 0.4, 3.2 + dy], [cx + 1, 1.3 + dy]]];
      else if (zn === "hacek") m = [[[cx - 1.2, 1.4 + dy], [cx, 2.9 + dy], [cx + 1.2, 1.4 + dy]]];
      else if (zn === "krouzek") {
        const c: Cara = [];
        for (let k = 0; k <= 8; k++) c.push([cx + 0.9 * Math.cos((k / 8) * 2 * Math.PI), 2.1 + dy + 0.9 * Math.sin((k / 8) * 2 * Math.PI)]);
        m = [c];
      } else m = [[[b.w + 0.9, 0], [b.w + 0.6, 2.2]]];
      out = { w: zn === "apostrof" ? b.w + 1 : b.w, cary: [...b.cary, ...m] };
    }
  }
  CACHE.set(ch, out);
  return out;
}

export const MEZERA = 4.4; // šířka mezery v jednotkách mřížky (slova se nesmí slévat)
export const ROZPAL = 1.5; // viditelná mezera mezi písmeny (vyrovnává ji kerning)

// kerning: obrys glyfu po řádcích mřížky (nejlevější a nejpravější inkoust v pásu výšky 1), z něj vzdálenost
// sousedních písmen tam, kde se opravdu potkají (T|a, l|ý, r|o …), ne podle šířky glyfu
type Profil = { l: number[]; r: number[] }; // index = řádek + 2 (y -2..14), NaN = v řádku nic
const PROFILY = new Map<string, Profil | null>();
const RADKY = 17;
function profil(ch: string): Profil | null {
  if (PROFILY.has(ch)) return PROFILY.get(ch)!;
  const g = glyf(ch);
  let out: Profil | null = null;
  if (g) {
    const l = new Array<number>(RADKY).fill(NaN);
    const r = new Array<number>(RADKY).fill(NaN);
    const bod = (x: number, y: number) => {
      const i = Math.round(y) + 2;
      if (i < 0 || i >= RADKY) return;
      l[i] = Number.isNaN(l[i]) ? x : Math.min(l[i], x);
      r[i] = Number.isNaN(r[i]) ? x : Math.max(r[i], x);
    };
    for (const c of g.cary) {
      for (let k = 0; k < c.length; k++) {
        if (k === 0) bod(c[0][0], c[0][1]);
        else {
          const [ax, ay] = c[k - 1];
          const [bx, by] = c[k];
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
          for (let j = 1; j <= n; j++) bod(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n);
        }
      }
    }
    out = { l, r };
  }
  PROFILY.set(ch, out);
  return out;
}

/** volné místo glyfu vlevo / vpravo v pásu malých písmen (j má háček pod řádkem, mezera před ním by byla větší) */
function okraj(ch: string, strana: "l" | "r"): number {
  const p = profil(ch);
  const g = glyf(ch);
  if (!p || !g) return 0;
  let m = Infinity;
  for (let i = 4 + 2; i <= 10 + 2; i++) {
    const v = strana === "l" ? p.l[i] : g.w - p.r[i];
    if (!Number.isNaN(v)) m = Math.min(m, v);
  }
  return Number.isFinite(m) ? Math.max(0, Math.min(1.6, m)) : 0;
}

/** mezera mezi slovy podle sousedních písmen (jednotky mřížky) */
export const mezeraMezi = (pred?: string, po?: string) => MEZERA - (pred ? okraj(pred, "r") : 0) - (po ? okraj(po, "l") : 0);

/** posun kerningu mezi znaky a a b (jednotky mřížky, záporný = blíž) */
export function kerning(a: string, b: string): number {
  const pa = profil(a);
  const pb = profil(b);
  const ga = glyf(a);
  if (!pa || !pb || !ga) return 0;
  let min = Infinity;
  for (let i = 0; i < RADKY; i++) {
    // sousední řádky taky (šikmé tahy: V|A, y|o)
    for (const j of [i - 1, i, i + 1]) {
      if (j < 0 || j >= RADKY || Number.isNaN(pa.r[i]) || Number.isNaN(pb.l[j])) continue;
      min = Math.min(min, ga.w - pa.r[i] + ROZPAL + pb.l[j]);
    }
  }
  if (!Number.isFinite(min)) return 0;
  return Math.max(-Math.min(2.6, ga.w * 0.5), Math.min(1, ROZPAL - min));
}

export interface Sazba {
  x: number; // levý okraj (px listu)
  y: number; // horní okraj prvního řádku (px)
  sirka: number; // šířka sazby (px)
  vyska: number; // výška písma = velká písmena (px)
  radek?: number; // řádkování (× výška), výchozí 1,9
  rozptyl?: number; // ruka: náhodné posuny (jednotky mřížky), výchozí 0,12
  seed?: string | number;
  zarovnat?: "vlevo" | "stred";
}

export interface Slovo {
  i: number; // index slova (písmena) v textu
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radek: number;
}

export interface Vysazeno {
  cary: [number, number][][]; // čáry v px listu
  slova: Slovo[];
  radku: number;
  preteklo: boolean; // text se nevešel na list
}

const PISMENO = /\p{L}/u;

function nahodne(seed: string | number, i: number): number {
  let h = 2166136261 ^ i;
  const s = String(seed);
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** sazba textu do čar (px listu) se zalomením po slovech; \n = nový řádek */
export function vysadit(text: string, s: Sazba): Vysazeno {
  const k = s.vyska / 10;
  const radek = s.vyska * (s.radek ?? 1.9);
  const rozptyl = s.rozptyl ?? 0.12;
  const seed = s.seed ?? text;
  const slova: Slovo[] = [];
  const cary: [number, number][][] = [];
  // tokeny: slovo (písmena), mezera, nový řádek, jiné znaky (připojí se ke slovu)
  const tokeny = String(text ?? "").match(/\n|[^\S\n]+|[^\s]+/g) ?? [];
  // posun za znakem: šířka glyfu, rozpal a kerning s dalším znakem téhož tokenu
  const posun = (ch: string, dalsi?: string) => (glyf(ch)?.w ?? 2.5) + ROZPAL + (dalsi ? kerning(ch, dalsi) : 0);
  const sirkaTokenu = (t: string) => {
    const z = [...t];
    return z.reduce((a, ch, i) => a + posun(ch, z[i + 1]), 0) - ROZPAL;
  };
  // rozdělit do řádků
  const radky: { tokeny: string[]; w: number }[] = [{ tokeny: [], w: 0 }];
  const max = s.sirka / k;
  for (const t of tokeny) {
    const r = radky[radky.length - 1];
    if (t === "\n") {
      radky.push({ tokeny: [], w: 0 });
      continue;
    }
    if (/^\s+$/.test(t)) {
      if (r.tokeny.length) r.tokeny.push(" ");
      continue;
    }
    const w = sirkaTokenu(t);
    const predchozi = r.tokeny[r.tokeny.length - 2];
    const mezera = r.tokeny[r.tokeny.length - 1] === " " ? mezeraMezi(predchozi ? [...predchozi].at(-1) : undefined, [...t][0]) : 0;
    const sMezerou = r.tokeny.length ? r.w + mezera + w : w;
    if (r.tokeny.length && sMezerou > max) {
      if (r.tokeny[r.tokeny.length - 1] === " ") r.tokeny.pop();
      radky.push({ tokeny: [t], w });
    } else {
      r.w += mezera;
      r.tokeny.push(t);
      r.w += w;
    }
  }
  let slovo = -1;
  let n = 0;
  let preteklo = false;
  radky.forEach((r, ri) => {
    if (r.tokeny[r.tokeny.length - 1] === " ") r.tokeny.pop();
    const y = s.y + ri * radek;
    if (y + s.vyska * 1.3 > 512) preteklo = true;
    let x = s.x + (s.zarovnat === "stred" ? Math.max(0, (s.sirka - r.w * k) / 2) : 0);
    r.tokeny.forEach((t, ti) => {
      if (t === " ") {
        x += mezeraMezi([...(r.tokeny[ti - 1] ?? "")].at(-1), [...(r.tokeny[ti + 1] ?? "")][0]) * k;
        return;
      }
      // slova uvnitř tokenu (písmena oddělená interpunkcí: "slovo," = jedno slovo + čárka)
      let veSlove = false;
      const znaky = [...t];
      for (let zi = 0; zi < znaky.length; zi++) {
        const ch = znaky[zi];
        const pis = PISMENO.test(ch);
        if (pis && !veSlove) {
          slovo++;
          slova.push({ i: slovo, x0: x, y0: y - s.vyska * 0.1, x1: x, y1: y + s.vyska * 1.3, radek: ri });
        }
        veSlove = pis;
        const g = glyf(ch);
        if (g) {
          const dx = nahodne(seed, n * 3) * rozptyl;
          const dy = nahodne(seed, n * 3 + 1) * rozptyl;
          for (const c of g.cary) {
            cary.push(c.map(([gx, gy]) => [x + (gx + dx + nahodne(seed, n * 7 + gx * 13 + gy) * rozptyl * 0.5) * k, y + (gy + dy) * k] as [number, number]));
          }
        }
        x += posun(ch, znaky[zi + 1]) * k;
        if (pis) slova[slova.length - 1].x1 = x - ROZPAL * k;
        n++;
      }
      x -= ROZPAL * k; // za posledním znakem tokenu není rozpal (jako sirkaTokenu)
    });
  });
  return { cary, slova, radku: radky.length, preteklo };
}

/** slovo pod bodem listu (px), nebo -1; tolerance v px */
export function slovoNa(slova: Slovo[], x: number, y: number, tol = 6): number {
  let best = -1;
  let bd = Infinity;
  for (const s of slova) {
    const dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
    const dy = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
    const d = Math.hypot(dx, dy);
    if (d <= tol && d < bd) {
      bd = d;
      best = s.i;
    }
  }
  return best;
}

export interface Pero {
  ink: number; // index inkoustu (od 1); 0 = uhel
  tool?: number; // 0 brk, 1 štětec, 2 uhel
  size?: number; // čtvrtpixely (kodek), výchozí podle výšky písma
  op?: number; // krytí 13..255
  tlak?: number; // 0..15
}

/** čáry -> tahy kodeku kreseb (souřadnice oříznuté na list, body zaokrouhlené, dlouhé čáry rozdělené) */
export function naTahy(cary: [number, number][][], pero: Pero): Stroke[] {
  const tool = pero.tool ?? (pero.ink ? 0 : 2);
  const out: Stroke[] = [];
  for (const c of cary) {
    const p: number[] = [];
    let last = "";
    for (const [x, y] of zhustit(c, 6)) {
      const X = Math.max(0, Math.min(767, Math.round(x)));
      const Y = Math.max(0, Math.min(511, Math.round(y)));
      const key = X + "," + Y;
      if (key === last) continue;
      last = key;
      p.push(X, Y, pero.tlak ?? 10);
    }
    if (p.length === 3) p.push(p[0], p[1], p[2]); // tečka
    for (let i = 0; i < p.length; i += 297) {
      const kus = p.slice(Math.max(0, i - 3), i + 297);
      if (kus.length >= 3) out.push({ tool, a: tool === 2 ? 0 : pero.ink, b: 0, mix: 0, size: pero.size ?? 10, op: pero.op ?? 255, p: kus });
    }
  }
  return out;
}

/** body po nejvýš `krok` px (hladší tahy v rastru) */
function zhustit(c: [number, number][], krok: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < c.length; i++) {
    if (i > 0) {
      const [ax, ay] = c[i - 1];
      const [bx, by] = c[i];
      const n = Math.floor(Math.hypot(bx - ax, by - ay) / krok);
      for (let k = 1; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    out.push(c[i]);
  }
  return out;
}

/** znaky, které písmo neumí (pro editor slabikáře) */
export function chybejiciZnaky(text: string): string[] {
  const out = new Set<string>();
  for (const ch of String(text ?? "")) if (!/\s/.test(ch) && !glyf(ch)) out.add(ch);
  return [...out];
}
