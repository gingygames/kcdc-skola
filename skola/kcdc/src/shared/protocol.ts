// Události školy mezi serverem a klientem (server -> klient: player.emit s JSON, klient -> server: Events.emitServer).
import type { V3 } from "../../../../kresby/kcdc/src/shared/layout";
import type { Pravidla } from "./citelnost";

export const EV = {
  // server -> klient
  profil: "skola:profil", // ProfilMsg: XP a pravidla (klient si spočítá stav a filtruje sám)
  cist: "skola:cist", // CteniMsg: skloň se nad list (kamera na list, text přes list)
  prestat: "skola:prestat", // {}: zvednout hlavu (konec čtení / kontroly)
  prstMod: "skola:prstMod", // { on }: učitel chce, ať student ukazuje prstem
  prstUcitel: "skola:prstUcitel", // PrstMsg: kde má student prst (jen učiteli)
  info: "skola:info", // { text }: nativní oznámení
  stav: "skola:stav", // { text | null }: infotext (hodina, čtení, klávesy)
  xp: "skola:xp", // XpMsg: zisk gramotnosti (HUD)
  okoli: "skola:okoli", // OkoliMsg: místa u stolů a tabule tříd poblíž (nápověda akce)
  jazyk: "skola:jazyk", // JazykMsg: jazyk hráče a texty klienta a stránek UI
  konfig: "skola:konfig", // KonfigMsg: nastavení klienta ze serveru (výchozí UI zapnuté?)
  // klient -> server
  menu: "skola:menu", // klávesa panelu (starší klient; nový posílá skola:uiOtevrit)
  sklonit: "skola:sklonit", // klávesa: skloň se nad čítanku (u stolu)
  zvednout: "skola:zvednout", // hráč zvedl hlavu
  prst: "skola:prst", // { x, y, w }: prst na listu (px), w = index slova pod prstem (-1 nic)
  psat: "skola:psat", // psát do písanky (u stolu)
} as const;

export interface ProfilMsg {
  xp: number;
  pravidla: Pravidla;
}

/** list ve světě: kresby deska (líc) a první list na ní */
export interface ListFace {
  pos: V3;
  n: V3;
  w: number;
  h: number;
}

export interface CteniMsg {
  mod: "cteni" | "kontrola";
  list: ListFace;
  titulek: string; // nad listem (Scaleform)
  text: string; // originál (klient ho přefiltruje svým stavem), u kontroly ""
  seed: string; // id textu (pseudoznaky stejné u všech čtení)
  obrazek?: string; // "k3." tahy obrázku stránky (horní část listu)
  kresba?: string; // kontrola: "k3." písanka studenta
  papir: number;
  prst: boolean; // ukazovat prstem (učitel řekl „čti“)
  filtr: boolean; // false = učitel kontroluje (bez filtru)
  pozn?: string; // řádek pod listem
}

export interface PrstMsg {
  pid: number;
  jmeno: string;
  list: ListFace;
  x: number;
  y: number;
  slovo: string | null; // skutečné slovo pod prstem
  vidi: string | null; // jak ho student vidí
  konec?: boolean;
}

export interface XpMsg {
  xp: number;
  pridano: number;
  stupen: string;
  co?: string; // nově odemčeno
}

/** třídy do ~60 m od hráče: kde jsou místa u stolů a tabule (klient podle nich ukazuje nápovědu akce) */
export interface OkoliMsg {
  dosah: number; // m od místa u stolu
  tridy: { id: number; mista: V3[]; tabule: V3 | null; zadani: boolean; moje: boolean }[];
}

/** jazyk hráče: klient a UI překládají podle něj (texty = oblasti client., page., card., level., letters.) */
export interface JazykMsg {
  jazyk: string;
  vychozi: string;
  texty: Record<string, string>;
}

/** nastavení klienta ze serveru: ui = false vypne výchozí UI školy (panel a karta; SKOLA_CONFIG.ui) */
export interface KonfigMsg {
  ui: boolean;
}
