// Překlady školy: slovníky klíč -> text, jazyk hráče, parametry a tvary podle čísla. Sdílí server, klient i stránky
// výchozího UI (stránky dostanou hotový slovník své oblasti od klienta, viz src/ui-api.ts).
//
// Text:      "Hodina u {ucitel}"                   parametry {jmeno} se nahradí, neznámé zůstanou, jak jsou
// Tvary:     "{n} {n|místo|místa|míst}"            tvar podle čísla n a jazyka (cs: 1 | 2–4 | jinak, en: 1 | jinak)
// Vnoření:   t("a", { vysledek: T("b", {...}) })   parametr může být zase zpráva (přeloží se stejným jazykem)
//
// Jazyky: vestavěné cs (zdroj pravdy, úplný) a en; další přidá server (SKOLA_CONFIG.jazyky, export addTranslations).
// Chybějící klíč: jazyk -> základ jazyka (en-GB -> en) -> výchozí jazyk serveru -> cs -> klíč sám.

export type Slovnik = Record<string, string>;
export type Parametr = string | number | boolean | null | undefined | Zprava;
export type Parametry = Record<string, Parametr>;

/** zpráva, která se přeloží až pro hráče, který ji uvidí (výsledky akcí, oznámení více hráčům) */
export interface Zprava {
  k: string;
  a?: Parametry;
}

export const ZDROJ = "cs";

const slovniky = new Map<string, Slovnik>();
const vlastnici = new Map<string, { jazyk: string; slovnik: Slovnik }[]>(); // owner -> co přidal (zmizí s ním)
const tvary = new Map<string, (n: number) => number>();

tvary.set("cs", (n) => (n === 1 ? 0 : n >= 2 && n <= 4 && Number.isInteger(n) ? 1 : 2));
tvary.set("sk", tvary.get("cs")!);
tvary.set("en", (n) => (n === 1 ? 0 : 1));
tvary.set("de", tvary.get("en")!);

export const jeZprava = (x: unknown): x is Zprava => !!x && typeof x === "object" && typeof (x as Zprava).k === "string";
export const T = (k: string, a?: Parametry): Zprava => (a ? { k, a } : { k });

/** kód jazyka: malými písmeny, "en_US" -> "en-us" */
export const kodJazyka = (j: unknown): string => String(j ?? "").trim().toLowerCase().replace(/_/g, "-").slice(0, 12);

/** přidá (nebo doplní) slovník jazyka; owner = resource, se kterým klíče zmizí (vestavěné jazyky owner nemají) */
export function pridatPreklady(jazyk: string, slovnik: Slovnik, owner?: string): number {
  const j = kodJazyka(jazyk);
  if (!j || !slovnik || typeof slovnik !== "object") return 0;
  const cil = slovniky.get(j) ?? {};
  const pridane: Slovnik = {};
  for (const [k, v] of Object.entries(slovnik)) {
    if (typeof v !== "string") continue;
    cil[k] = v;
    pridane[k] = v;
  }
  slovniky.set(j, cil);
  if (owner) vlastnici.set(owner, [...(vlastnici.get(owner) ?? []), { jazyk: j, slovnik: pridane }]);
  return Object.keys(pridane).length;
}

/** pravidlo tvarů pro jazyk bez vestavěného (index tvaru podle čísla) */
export function nastavitTvary(jazyk: string, fn: (n: number) => number) {
  if (typeof fn === "function") tvary.set(kodJazyka(jazyk), fn);
}

/** resource skončil: jeho přidané překlady pryč (vestavěné a ostatních vlastníků se nahrají znovu) */
export function odebratVlastnika(owner: string, vestavene: () => void) {
  if (!vlastnici.has(owner)) return false;
  vlastnici.delete(owner);
  slovniky.clear();
  vestavene();
  for (const casti of vlastnici.values()) {
    for (const c of casti) slovniky.set(c.jazyk, { ...(slovniky.get(c.jazyk) ?? {}), ...c.slovnik });
  }
  return true;
}

export const jazyky = (): string[] => [...slovniky.keys()].filter((j) => Object.keys(slovniky.get(j)!).length > 0);
export const maJazyk = (j: string) => rozpoznat(j) !== null;

/** kód jazyka, který škola má: přesně ("en-gb"), jinak základ ("en-US" -> "en"); null = nezná */
export function rozpoznat(j: unknown): string | null {
  const k = kodJazyka(j);
  if (!k) return null;
  if (slovniky.has(k)) return k;
  const zaklad = k.split("-")[0];
  return slovniky.has(zaklad) ? zaklad : null;
}

function tvar(jazyk: string, n: number): number {
  const f = tvary.get(jazyk) ?? tvary.get(jazyk.split("-")[0]);
  if (f) return f(n);
  try {
    // jiné jazyky: tvary v pořadí kategorií Intl (one, two, few, many, other)
    const pr = new Intl.PluralRules(jazyk);
    const poradi = ["zero", "one", "two", "few", "many", "other"].filter((c) => pr.resolvedOptions().pluralCategories.includes(c as Intl.LDMLPluralRule));
    return Math.max(0, poradi.indexOf(pr.select(n)));
  } catch {
    return n === 1 ? 0 : 1;
  }
}

/** řetěz jazyků, ve kterém se klíč hledá */
export function retez(jazyk: string, vychozi = ZDROJ): string[] {
  const j = kodJazyka(jazyk) || kodJazyka(vychozi) || ZDROJ;
  return [...new Set([j, j.split("-")[0], kodJazyka(vychozi), kodJazyka(vychozi).split("-")[0], ZDROJ])].filter(Boolean);
}

export function najit(jazyk: string, klic: string, vychozi = ZDROJ): string | undefined {
  for (const j of retez(jazyk, vychozi)) {
    const v = slovniky.get(j)?.[klic];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** dosadí parametry a tvary podle čísla do hotového textu */
export function dosadit(text: string, jazyk: string, a: Parametry | undefined, prelozit: (z: Zprava) => string): string {
  if (!a) return text;
  return text.replace(/\{(\w+)(?:\|([^{}]*))?\}/g, (cele, jm: string, formy?: string) => {
    if (!(jm in a)) return cele;
    const v = a[jm];
    if (formy !== undefined) {
      const f = formy.split("|");
      return f[Math.min(f.length - 1, tvar(kodJazyka(jazyk), Math.abs(Number(v))))] ?? "";
    }
    if (v === null || v === undefined) return "";
    return jeZprava(v) ? prelozit(v) : String(v);
  });
}

/** přeloží klíč do jazyka (parametry mohou být zprávy) */
export function t(jazyk: string, klic: string, a?: Parametry, vychozi = ZDROJ): string {
  const text = najit(jazyk, klic, vychozi) ?? klic;
  return dosadit(text, jazyk, a, (z) => t(jazyk, z.k, z.a, vychozi));
}

/** zpráva nebo hotový text (jména hráčů, text písaře) do jazyka */
export const tz = (jazyk: string, x: Zprava | string | null | undefined, vychozi = ZDROJ): string =>
  x === null || x === undefined ? "" : typeof x === "string" ? x : t(jazyk, x.k, x.a, vychozi);

/** překladač svázaný s jazykem */
export function prekladac(jazyk: string, vychozi = ZDROJ) {
  const fn = (klic: string, a?: Parametry) => t(jazyk, klic, a, vychozi);
  fn.z = (x: Zprava | string | null | undefined) => tz(jazyk, x, vychozi);
  fn.jazyk = kodJazyka(jazyk) || ZDROJ;
  return fn;
}
export type Prekladac = ReturnType<typeof prekladac>;

/** všechny klíče s předponou (např. "page.") v jazyce i s náhradami z řetězu: slovník pro stránku nebo klienta */
export function oblast(jazyk: string, predpony: string[], vychozi = ZDROJ): Slovnik {
  const out: Slovnik = {};
  for (const j of [...retez(jazyk, vychozi)].reverse()) {
    for (const [k, v] of Object.entries(slovniky.get(j) ?? {})) if (predpony.some((p) => k.startsWith(p))) out[k] = v;
  }
  return out;
}

/** klíče, které jazyk nemá proti zdroji (cs): k hlášení a testům */
export function chybi(jazyk: string): string[] {
  const z = slovniky.get(ZDROJ) ?? {};
  const s = slovniky.get(kodJazyka(jazyk)) ?? {};
  return Object.keys(z).filter((k) => !(k in s));
}

/** parametry {jmeno} v textu (bez tvarů) */
export const parametry = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]))].sort();
