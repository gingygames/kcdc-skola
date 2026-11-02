// pole - stavební kameny schématu nastavení pro editor Správy (F10, registerSettings), sdílené s tanec/kcdc.
//
// Správa umí základní typy (string, number, select, group, list ...). Nové typy (slider, offset s laděním naživo, file,
// sound, animation, showIf) teprve přidává. Každý helper tady proto vrátí nový typ, když ho Správa ohlásí, jinak
// nejbližší stávající náhradu. Přepnutí = jen tady (a v převodech hodnot níž), zbytek kódu se nemění.
//
// Schopnosti: exporty Správy "settingsVersion" (2 = nové typy a háčky) a "settingsFields" (názvy typů); starší Správa
// je nemá (pole verze 1). Záložně export "open" (přišel se stejnou verzí editoru) = všechny nové typy. Čte se při každém sestavení schématu
// (registrace a znovu při startu Správy). Tvary hodnot: sprava/src/settings-types.ts (OffsetValue, FileRef, AnimationValue).
import type { SettingsField, SettingsOption } from "../../../sprava/src/settings-types";

export type { SettingsField, SettingsOption };
export type Pole = SettingsField;

export const NOVE_TYPY = ["slider", "offset", "file", "sound", "animation", "showIf", "live", "templates", "open"];
let umi = new Set<string>();

/** přečte, které nové typy polí Správa umí */
export function nactiSchopnosti(): Set<string> {
  try {
    const f = typeof Exports !== "undefined" ? Exports.get("sprava", "settingsFields") : undefined;
    const v = typeof f === "function" ? f() : f;
    const verze = (() => {
      try {
        return Number(Exports.get("sprava", "settingsVersion")) || 0;
      } catch {
        return 0;
      }
    })();
    // editor verze 2: nové typy, showIf, live/play/upload, šablony seznamů, open
    if (Array.isArray(v)) umi = new Set([...v.map(String), ...(verze >= 2 || v.includes("offset") ? ["showIf", "live", "templates", "open"] : [])]);
    else umi = new Set(verze >= 2 || (typeof Exports !== "undefined" && typeof Exports.get("sprava", "open") === "function") ? NOVE_TYPY : []);
  } catch {
    umi = new Set();
  }
  return umi;
}

export const umiPole = (typ: string) => umi.has(typ);
/** pro testy: vnutit schopnosti */
export const nastavSchopnosti = (typy: string[]) => void (umi = new Set(typy));

type Base = { key: string; label?: string; help?: string; required?: boolean; preview?: boolean };
const nove = (f: Record<string, unknown>) => f as unknown as Pole;

/** číslo; s rozsahem jako posuvník, když ho Správa umí */
/** číslo; s rozsahem jako posuvník, když ho Správa umí. `prazdne` = smí zůstat prázdné (posuvník to neumí: zůstane číslo) */
export function cislo(b: Base & { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; default?: number; prazdne?: boolean }): Pole {
  const { prazdne, ...f } = b;
  if (!prazdne && umiPole("slider") && f.min !== undefined && f.max !== undefined) return nove({ ...f, type: "slider" });
  return { ...f, type: "number" };
}

/** poloha úchytu x y z (m) a rx ry rz (°); typ offset ladí naživo (Správa volá SettingsDef.live) */
export function posun(b: Base): Pole {
  if (umiPole("offset")) return nove({ ...b, type: "offset", live: true, preview: true, range: 1, step: 0.005, rotStep: 1 });
  return {
    ...b, type: "group", preview: true, collapsed: true,
    help: (b.help ? b.help + " " : "") + "Test = vezme nástroj s touhle polohou na tebe (ladění naživo).",
    fields: [
      ...(["x", "y", "z"] as const).map((k) => ({ key: k, label: k + " (m)", type: "number" as const, default: 0, step: 0.005, min: -1, max: 1 })),
      ...(["rx", "ry", "rz"] as const).map((k) => ({ key: k, label: k + " (°)", type: "number" as const, default: 0, step: 1, min: -360, max: 360 })),
    ],
  };
}

const ANIM_HELP = "Fragment hry, volitelně tagy v hranatých závorkách: `Party_Standing_PlayingLute_HoldingLute [variant_01]`. " +
  "`-` = žádná animace, jen nástroj v ruce. Seznam: F10 → Animace / Animations.list.";

/** animace hry (Mannequin fragment a tagy) */
export function animace(b: Base & { default?: string }): Pole {
  if (umiPole("animation")) return nove({ ...b, type: "animation", default: null });
  return { ...b, type: "string", placeholder: "Fragment [tagy]", help: b.help ? b.help + " " + ANIM_HELP : ANIM_HELP };
}

/** zvuk hry (audio trigger) */
export function zvuk(b: Base & { default?: string }): Pole {
  if (umiPole("sound")) return nove({ ...b, type: "sound" });
  return { ...b, type: "string", placeholder: "trigger hry, např. q_S19_lute_strings" };
}

/** nahrání souboru; bez podpory Správy pole není (null) */
export function soubor(b: Base & { accept: ("ogg" | "png")[]; maxBytes?: number }): Pole | null {
  if (!umiPole("file")) return null;
  return nove({ ...b, type: "file", default: null });
}

/** pole jen když jiné pole má danou hodnotu; bez podpory se ukazuje vždy */
export function kdyz<T extends Pole | null>(pole: T, klic: string, rovno: unknown): T {
  if (!pole || !umiPole("showIf")) return pole;
  return { ...pole, showIf: { field: klic, eq: rovno } } as T;
}

/** vyhodí null (pole, která Správa neumí) */
export const pole = (...p: (Pole | null | false | undefined)[]): Pole[] => p.filter((x): x is Pole => !!x);

// ---------------------------------------------------------------------------
// převody hodnot (nové typy mohou mít jiný tvar hodnoty; čte se obojí)

/** text od uživatele (názvy, popisy): bez řídicích znaků, bez krajních mezer, nejvýš `max` znaků;
 *  `radky` = popis smí mít konce řádků, jinak se z nich stane mezera */
export function text(v: unknown, max: number, radky = false): string {
  let s = String(v ?? "").replace(/\r\n?/g, "\n");
  s = s.replace(radky ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]+/g, " ");
  s = radky ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max).trim();
}

export interface Posun { x: number; y: number; z: number; rx: number; ry: number; rz: number }
const K6 = ["x", "y", "z", "rx", "ry", "rz"] as const;

export const posunZ = (v: unknown): number[] => {
  if (Array.isArray(v)) return K6.map((_, i) => Number(v[i]) || 0);
  const o = (v ?? {}) as Record<string, unknown>;
  return K6.map((k) => Number(o[k]) || 0);
};
export const posunNa = (r: number[] | undefined): Posun => {
  const a = r ?? [];
  return { x: a[0] ?? 0, y: a[1] ?? 0, z: a[2] ?? 0, rx: a[3] ?? 0, ry: a[4] ?? 0, rz: a[5] ?? 0 };
};

/** "Fragment [tagy]" | "-" | { fragment, tags } (AnimationValue) -> [fragment, tags]; null = nevyplněno */
export function animaceZ(v: unknown): [string, string] | null {
  if (v && typeof v === "object") {
    const o = v as { fragment?: unknown; tags?: unknown };
    return [String(o.fragment ?? ""), String(o.tags ?? "")];
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "-") return ["", ""];
  const m = /^([^\s[]*)\s*(?:\[([^\]]*)\])?$/.exec(s);
  return m ? [m[1], (m[2] ?? "").trim()] : [s, ""];
}

/** hodnota pole animace: řetězec, nebo AnimationValue (typ animation; "jen nástroj v ruce" = null) */
export function animaceNa(fragment: string, tags: string): string | { fragment: string; tags: string; clip: string; loop: boolean } | null {
  if (umiPole("animation")) return fragment ? { fragment, tags, clip: "", loop: true } : null;
  if (!fragment && !tags) return "-";
  return fragment + (tags ? ` [${tags}]` : "");
}

// ---------------------------------------------------------------------------
// registrace ve Správě (stejné dvě cesty jako panel: push teď a při startu Správy, pull přes export)

/** pošle definici nastavení Správě; vrací true, když ji přijala */
export function poslatNastaveni(def: unknown, owner: string, log: (t: string) => void, tise = false): boolean {
  try {
    if (typeof Exports === "undefined") return false;
    const fn = Exports.get("sprava", "registerSettings");
    if (typeof fn !== "function") return false;
    fn(def, owner);
    log("nastavení je v editoru správy (F10)");
    return true;
  } catch (e) {
    if (!tise) log(`nastavení se do správy nepodařilo poslat: ${String(e)}`);
    return false;
  }
}

/** příkaz pro nápovědu a našeptávání v konzoli Správy (sprava ChatCommandDef) */
export interface PrikazPopis { name: string; usage?: string; help?: string; perm?: string; sub?: string[] }
const popisy = new Map<string, ReturnType<typeof setTimeout>>();
/** Popíše chatové příkazy modulu Správě (`registerChatCommands`), s pokusy jako u nastavení: exporty Správy jdou
 *  přečíst až chvíli po jejím startu. Bez Správy nic. */
export function popsatPrikazy(owner: string, defs: () => PrikazPopis[], pokusy = 10) {
  const t = popisy.get(owner);
  if (t) clearTimeout(t);
  popisy.set(owner, setTimeout(() => {
    popisy.delete(owner);
    try {
      const reg = Exports.get("sprava", "registerChatCommands") as ((o: string, d: PrikazPopis[]) => void) | undefined;
      if (typeof reg === "function") return void reg(owner, defs());
    } catch {
      // Správa neběží nebo ještě nejde přečíst
    }
    if (pokusy > 0) popsatPrikazy(owner, defs, pokusy - 1);
  }, 300));
}

const odlozene = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * Pošle nastavení, až půjdou číst exporty Správy: KCDC je v její `resourceStart` ještě nevydá („not running“),
 * proto pokusy po 300 ms (nejvýš ~3 s). `def` je funkce: schéma se sestaví podle schopností běžící Správy.
 */
export function poslatNastaveniPozdeji(def: () => unknown, owner: string, log: (t: string) => void, pokusy = 10) {
  const t = odlozene.get(owner);
  if (t) clearTimeout(t);
  odlozene.set(owner, setTimeout(() => {
    odlozene.delete(owner);
    if (poslatNastaveni(def(), owner, log, pokusy > 0)) return;
    if (pokusy > 0) poslatNastaveniPozdeji(def, owner, log, pokusy - 1);
  }, 300));
}

/** otevře editor nastavení u hráče (export Správy "open"; cesta "nastroje.roh.uchyt.posun", u seznamu podle id);
 *  false = Správa to neumí, hráči se napíše cesta */
export function otevritNastaveni(pid: number, settings: string, path: (string | number)[] = []): boolean {
  try {
    const fn = typeof Exports !== "undefined" ? Exports.get("sprava", "open") : undefined;
    if (typeof fn !== "function") return false;
    void fn(pid, { settings, ...(path.length ? { path: path.join(".") } : {}) });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// novější háčky editoru (live, play, upload): typy vlastní, ať modul jde sestavit i proti starší Správě

import type { SettingsDef, SettingsObject, SettingsPreviewResult } from "../../../sprava/src/settings-types";

type Cesta = (string | number)[];
type Odpoved = void | string | SettingsPreviewResult;
type A<T> = T | Promise<T>;
export interface LiveCtx<P> { caller: P; phase: "start" | "update" | "end"; path: Cesta; value: unknown; tree: SettingsObject }
export interface PlayCtx<P> { caller: P; kind: "sound" | "animation" | "file"; path: Cesta; value: unknown; stop?: boolean }
export interface UploadCtx<P> { caller: P; path: Cesta; name: string; kind: "ogg" | "png"; size: number; bytes: Uint8Array }
export type NastaveniDef<P> = SettingsDef<P> & {
  live?(ctx: LiveCtx<P>): A<Odpoved>;
  play?(ctx: PlayCtx<P>): A<Odpoved>;
  upload?(ctx: UploadCtx<P>): A<void | { ok?: boolean; message?: string; ref?: string }>;
};
