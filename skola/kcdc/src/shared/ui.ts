// Panel školy (web view, ui/) a umisťování vybavení (PropPlacer hry).
//
// Server drží celý stav a posílá ho jako UiView (skola:ui). Stránka jen kreslí a vrací id akce (skola:uiAkce).
// Stejný seznam akcí slouží jako záloha nativní nabídkou, když klient web view nemá.
// Umisťování: server pošle UmistitMsg, klient spustí PropPlacer (průsvitný náhled pod zaměřovačem, kolečko otáčí,
// klik staví) a vrátí pózu (skola:umisteno). Co se postaví, rozhoduje server znovu z pózy.

import type { V3 } from "../../../../kresby/kcdc/src/shared/layout";
import { STOJANY } from "../../../../kresby/kcdc/src/shared/stojany";

export const UI = {
  stav: "skola:ui", // server -> klient: UiView
  zavrit: "skola:uiZavrit", // server -> klient: schovat panel
  akce: "skola:uiAkce", // klient -> server: UiAkceMsg
  hello: "skola:uiHello", // klient -> server: stránka je načtená, pošli stav
  otevrit: "skola:uiOtevrit", // klient -> server: hráč chce panel (klávesa)
  pryc: "skola:uiPryc", // klient -> server: hráč panel zavřel
  umistit: "skola:umistit", // server -> klient: UmistitMsg (prázdné druh = konec)
  umisteno: "skola:umisteno", // klient -> server: UmistenoMsg
} as const;

/** tlačítko panelu; stránka je kreslí na svých místech podle id, zbytek pod „Další“; záloha = nativní nabídka */
export interface UiAkce {
  id: string;
  text: string;
  tip?: string;
  hlavni?: boolean; // zlaté tlačítko (jedno na místo)
  nebezpecne?: string; // potvrzení: co se stane
  vypnuto?: string; // proč teď nejde (tlačítko šedé s vysvětlením)
  vstup?: { label: string; value?: string; placeholder?: string; max?: number; volby?: string[]; radky?: boolean };
}

export type DruhKusu = "tabule" | "stul" | "lavice" | "misto";

/** kus vybavení třídy (přehled, přesunout, odebrat) */
export interface UiKus {
  id: string; // "tabule" | "stul:<k>" | "lavice:<k>" | "misto:<k>"
  druh: DruhKusu;
  nazev: string;
  popis: string;
}

export interface UiKrok {
  id: "tabule" | "lavice" | "hotovo";
  nazev: string;
  hotovo: boolean;
}

export interface UiZak {
  pid: number;
  jmeno: string;
  stupen: string;
  xp: number;
  pritomnost: number; // % času hodiny ve třídě
  sedi: boolean; // u listů na stole
  cte: boolean; // vyvolaný ke čtení
  cetl: boolean;
  psal: boolean; // písanka uznaná
  pisanka: { skore: number; stav: "odevzdano" | "uznano" | "znovu" } | null;
  navrh: string; // konec hodiny: "u" | "uc" | "up" | "ucp" | "0" (podle přítomnosti, čtení a písanky)
}

export interface UiStrana {
  i: number;
  nazev: string;
  pismeno: string;
  ukazka: string; // začátek textu
  obrazek: boolean;
  pripravena: boolean; // tabule upečená předem
}

export interface UiJa {
  stupen: number;
  nazev: string;
  xp: number;
  od: number; // XP začátku stupně
  do: number | null; // XP dalšího odemčení
  dalsi: string | null;
  pismena: string; // umí (stupeň písmen)
  ukazka: string; // věta tak, jak ji teď přečte
}

export type Obrazovka = "vitej" | "pruvodce" | "trida" | "hodina" | "konec" | "zak" | "cizi";

export interface UiView {
  seq: number;
  obrazovka: Obrazovka;
  ucitel: boolean;
  titulek: string;
  text?: string;
  trida?: { nazev: string; verejna: boolean; mist: number; vybaveni: UiKus[]; tabule: boolean };
  kroky?: UiKrok[]; // průvodce
  krok?: UiKrok["id"];
  hodina?: {
    ucitel: string;
    minut: number;
    minMinut: number;
    minPritomnost: number;
    strana: number;
    cte: string | null;
    zadani: string | null;
    predloha: string; // návrh předlohy ze stránky
    zaci: UiZak[];
    kolem: { pid: number; jmeno: string }[]; // poblíž, ale ne na hodině
    neupeceno: boolean;
    ulozene: { i: number; nazev: string; hotova: boolean }[];
    xp: { ucast: number; cteni: number; psani: number };
  };
  slabikar?: UiStrana[];
  strana?: number; // vybraná stránka slabikáře
  ja: UiJa;
  akce: UiAkce[];
  hlaska?: { text: string; druh: "info" | "ok" | "warn" | "err" };
}

export interface UiAkceMsg {
  seq: number;
  id: string;
  hodnota?: string;
}

// ---------------------------------------------------------------------------
// karta hodiny: malý web view na kraji obrazovky bez vstupu (stav hodiny, žáci, úkol žáka, klávesy, stavba)

export const KARTA = {
  stav: "skola:karta", // server -> klient: KartaMsg (hodina null = bez hodiny)
  vyska: "skola:kartaVyska", // stránka -> klient: výška obsahu v px (klient podle ní zmenší web view)
  zobrazit: "skola:kartaUkaz", // klient -> stránka: KartaUkaz (vše, co se má ukázat; skládá klient)
} as const;

export type StavPisanky = "odevzdano" | "uznano" | "znovu" | null;

export interface KartaMsg {
  nastaveni: { zapnuto: boolean; strana: "vpravo" | "vlevo"; vyska: number };
  hodina: null | {
    role: "ucitel" | "zak";
    ucitel: string;
    strana: string; // název stránky slabikáře
    pismeno: string;
    minut: number;
    minMinut: number;
    zadani: string | null; // předloha do písanek
    cte: string | null; // kdo čte nahlas
    zaci?: { jmeno: string; sedi: boolean; cte: boolean; pisanka: StavPisanky }[]; // jen písař
    ja?: { sedi: boolean; ctu: boolean; pisanka: StavPisanky; nazev: string; xp: number; od: number; do: number | null; dalsi: string | null }; // jen žák
  };
}

/** co stránka karty ukáže (klient přidá k serveru živé věci: prst, stavbu, klávesy) */
export interface KartaUkaz {
  hodina: KartaMsg["hodina"];
  prst: string | null; // písař: na co ukazuje čtoucí žák
  stavba: { nazev: string; postaveno: number; znovu: boolean } | null;
  klavesy: string; // nápověda kláves u stolu a tabule
}

// ---------------------------------------------------------------------------
// umisťování

export type DruhUmisteni = "zed" | "stojan" | "stul" | "lavice" | "misto";

export interface UmistitMsg {
  druh: DruhUmisteni | "";
  presun?: string; // id kusu, který se přesouvá (postaví se znovu na novém místě)
  nazev: string; // co se staví (nápověda)
  models: string[];
  offsets?: V3[];
  rotations?: [number, number, number, number][]; // w, x, y, z
  scale?: number;
  yaw: number; // stupně navíc k natočení od hráče
  znovu: boolean; // po postavení stavět dál (lavice)
  obrys?: { w: number; h: number }; // tabule / list: obdélník podle normály povrchu
  maxDalka: number;
}

export interface UmistenoMsg {
  druh: DruhUmisteni;
  presun?: string;
  pos: V3;
  n: V3;
  yaw: number; // stupně, natočení náhledu kolem svislé osy (0 = líc k +Y)
}

// ---------------------------------------------------------------------------
// geometrie školní lavice: stůl (prop) a před ním lavice se dvěma místy (smart object hry, jako prefab table_oneSide)

export const STUL = {
  model: "objects/manmade/common_furniture/tables/table_shabby_d_160_rough.cgf",
  lavice: "Bench/bench_2places_low_table",
  lavicePrefabModel: "objects/manmade/common_furniture/benches/low/bench_shabby_a.cgf", // jen náhled
  laviceY: -0.7, // lavice před stolem (místní souřadnice, žáci hledí na +Y)
  sedadla: [-0.35, 0.35], // x míst na lavici
  listY: -0.2, // listy na desce u kraje k žákům
  vyska: 0.78, // deska stolu nad zemí, když se nepodaří změřit
};

export const LAVICE_MODEL = "objects/manmade/common_furniture/benches/low/bench_shabby_d.cgf"; // náhled Bench/bench_2places_low
// tabule na stojanu: dřevěná tabule na sloupku z podstavců kreseb (natočení a líc změřené z geometrie modelu)
export const STOJAN = STOJANY[0];
export const LIST_MODEL = "objects/manmade/task_specific_props/read_and_write/scrolls/paper_a.cgf"; // náhled listu (zmenšený = jen obrys)

/** bod v místních souřadnicích kusu (x doprava, y dopředu, z nahoru) do světa */
export function doSveta(pos: V3, yawDeg: number, x: number, y: number, z = 0): V3 {
  const a = (yawDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [pos[0] + x * c - y * s, pos[1] + x * s + y * c, pos[2] + z];
}

/** yaw (stupně) z kvaternionu otočení kolem svislé osy */
export const yawZ = (q: { w: number; z: number }) => (2 * Math.atan2(q.z, q.w) * 180) / Math.PI;

/** kvaternion [w, x, y, z] otočení kolem svislé osy */
export const qZ = (yawDeg: number): [number, number, number, number] => {
  const a = (yawDeg * Math.PI) / 360;
  return [Math.cos(a), 0, 0, Math.sin(a)];
};
