// Nastavení školy v editoru Správy (F10 → Nastavení → Škola): hodina, XP a ochrany, stupně čitelnosti, zrcadlení
// do nativní stopy, vybavení třídy, karta hodiny na kraji obrazovky a slabikář. Uloží se do most.storage "skola:nastaveni", platí hned.
// Popisky editoru a hlášky ověření jsou v překladech (src/lang/, set.*): server je skládá ve výchozím jazyce serveru.
import { cislo, pole, text, type Pole } from "../../../loutna/kcdc/src/pole";
import { PRAVIDLA, type Pravidla } from "./shared/citelnost";
import { chybejiciZnaky } from "./shared/pismo";
import { prekladac, ZDROJ, type Parametry } from "./shared/i18n";
import { SLABIKAR, type Strana } from "./data";

export interface Nastaveni {
  hodina: { polomer: number; minMinut: number; minPritomnost: number; verejna: boolean; dosahStolu: number };
  xp: { ucast: number; cteni: number; psani: number; stropStudent: number; stropDvojice: number; samSobe: boolean };
  pravidla: Pravidla;
  zrcadlit: { zapnuto: boolean; stopa: string; pomer: number };
  vybaveni: { lavice: string; tabuleSirka: number; tabuleVyska: number; listSirka: number; maxTrid: number; maxMist: number };
  karta: { zapnuto: boolean; strana: "vpravo" | "vlevo"; vyska: number };
  jazyk: { vychozi: string; volba: boolean }; // výchozí jazyk serveru, smí si hráč vybrat (/skola jazyk)
  slabikar: Strana[];
}

export const VYCHOZI: Nastaveni = {
  hodina: { polomer: 14, minMinut: 10, minPritomnost: 60, verejna: true, dosahStolu: 1.6 },
  xp: { ucast: 5, cteni: 10, psani: 10, stropStudent: 60, stropDvojice: 30, samSobe: false },
  pravidla: { ...PRAVIDLA },
  zrcadlit: { zapnuto: true, stopa: "scholarship", pomer: 1 },
  vybaveni: { lavice: "Bench/bench_2places_low", tabuleSirka: 1.6, tabuleVyska: 1, listSirka: 0.34, maxTrid: 2, maxMist: 16 },
  karta: { zapnuto: true, strana: "vpravo", vyska: 22 },
  jazyk: { vychozi: "cs", volba: true },
  slabikar: SLABIKAR.map((s) => ({ ...s })),
};

export const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export interface Chyba { path: string; message: string }

/** překladač textů nastavení (klíč, parametry) -> text; výchozí čeština (zdroj) */
export type Tr = (klic: string, a?: Parametry) => string;
const CS: Tr = (k, a) => prekladac(ZDROJ)(k, a);

/** doplní chybějící klíče výchozími (uložené nastavení ze starší verze) */
export function doplnit(v: Partial<Nastaveni> | null | undefined): Nastaveni {
  const d = kopie(VYCHOZI);
  if (!v || typeof v !== "object") return d;
  return {
    hodina: { ...d.hodina, ...v.hodina },
    xp: { ...d.xp, ...v.xp },
    pravidla: { ...d.pravidla, ...v.pravidla },
    zrcadlit: { ...d.zrcadlit, ...v.zrcadlit },
    vybaveni: { ...d.vybaveni, ...v.vybaveni },
    karta: { ...d.karta, ...v.karta },
    jazyk: { ...d.jazyk, ...v.jazyk },
    slabikar: Array.isArray(v.slabikar) && v.slabikar.length ? v.slabikar.map((s) => ({ ...d.slabikar[0], ...s })) : d.slabikar,
  };
}

/** ověří a upraví nastavení; t = jazyk hlášek (editor: výchozí jazyk serveru, log: čeština) */
export function overit(v: Nastaveni, t: Tr = CS): { n: Nastaveni; chyby: Chyba[] } {
  const n = doplnit(kopie(v));
  const chyby: Chyba[] = [];
  const p = n.pravidla;
  p.poradi = [...new Set([...String(p.poradi ?? "").toLowerCase()].filter((c) => /\p{L}/u.test(c)))].join("");
  if (!p.poradi) chyby.push({ path: "pravidla.poradi", message: t("set.err.orderEmpty") });
  const prahy: [keyof Pravidla, string][] = [["xpPrvni", "set.err.threshold.first"], ["xpSlabiky", "set.err.threshold.syllables"], ["xpSlova", "set.err.threshold.words"], ["xpPlynule", "set.err.threshold.fluent"]];
  for (let i = 1; i < prahy.length; i++) {
    if (Number(p[prahy[i][0]]) <= Number(p[prahy[i - 1][0]])) chyby.push({ path: `pravidla.${prahy[i][0]}`, message: t("set.err.threshold", { field: t(prahy[i][1]), prev: t(prahy[i - 1][1]).toLowerCase() }) });
  }
  const konecPismen = p.xpPrvni + ([...p.poradi].length - 1) * Math.max(1, p.xpPismeno);
  if (konecPismen > p.xpSlabiky) chyby.push({ path: "pravidla.xpPismeno", message: t("set.err.lettersLate", { xp: konecPismen, syllables: p.xpSlabiky }) });
  const ids = new Set<string>();
  n.slabikar = n.slabikar.map((s, i) => {
    const P = `slabikar.${i}`;
    const id = text(s.id, 24);
    if (!/^[a-z0-9_]{1,24}$/.test(id)) chyby.push({ path: `${P}.id`, message: t("set.err.id") });
    if (ids.has(id)) chyby.push({ path: `${P}.id`, message: t("set.err.idDuplicate") });
    ids.add(id);
    const tx = text(s.text, 600, true);
    const ch = chybejiciZnaky(tx.replace(/\{\/?lat\}/g, "") + text(s.predloha, 40));
    if (ch.length) chyby.push({ path: `${P}.text`, message: t("set.err.glyphs", { chars: ch.join(" ") }) });
    if (!tx) chyby.push({ path: `${P}.text`, message: t("set.err.textEmpty") });
    return { id, nazev: text(s.nazev, 40) || id, pismeno: text(s.pismeno, 2).toLowerCase(), text: tx, predloha: text(s.predloha, 40) };
  });
  if (!n.slabikar.length) chyby.push({ path: "slabikar", message: t("set.err.primerEmpty") });
  n.jazyk.vychozi = String(n.jazyk.vychozi ?? "cs").trim().toLowerCase().replace(/_/g, "-").slice(0, 12) || "cs";
  n.jazyk.volba = n.jazyk.volba !== false;
  if (n.karta.strana !== "vlevo") n.karta.strana = "vpravo";
  n.karta.vyska = Math.max(0, Math.min(70, Math.round(Number(n.karta.vyska) || 0)));
  if (!/^[a-z_]+$/.test(n.zrcadlit.stopa)) chyby.push({ path: "zrcadlit.stopa", message: t("set.err.track") });
  return { n, chyby };
}

const o = (value: string, label: string) => ({ value, label });

/** schéma editoru; jazyky = kódy jazyků, které škola zná (vestavěné + přidané serverem); t = jazyk popisků */
export function schema(jazyky: string[] = ["cs", "en"], t: Tr = CS): Pole[] {
  return [
    {
      key: "jazyk", label: t("set.lang.label"), type: "group",
      help: t("set.lang.help"),
      fields: pole(
        { key: "vychozi", label: t("set.lang.default"), type: "select", options: jazyky.map((j) => o(j, j)) },
        { key: "volba", label: t("set.lang.choice"), type: "boolean" },
      ),
    },
    {
      key: "hodina", label: t("set.lesson.label"), type: "group", fields: pole(
        cislo({ key: "polomer", label: t("set.lesson.radius"), min: 4, max: 40, step: 1, unit: "m", help: t("set.lesson.radius.help") }),
        cislo({ key: "minMinut", label: t("set.lesson.minMinutes"), min: 0, max: 120, step: 1, unit: "min", help: t("set.lesson.minMinutes.help") }),
        cislo({ key: "minPritomnost", label: t("set.lesson.minPresence"), min: 0, max: 100, step: 5, unit: "%", help: t("set.lesson.minPresence.help") }),
        { key: "verejna", label: t("set.lesson.public"), type: "boolean" },
        cislo({ key: "dosahStolu", label: t("set.lesson.deskReach"), min: 0.5, max: 4, step: 0.1, unit: "m", help: t("set.lesson.deskReach.help") }),
      ),
    },
    {
      key: "xp", label: t("set.xp.label"), type: "group", fields: pole(
        cislo({ key: "ucast", label: t("set.xp.attendance"), min: 0, max: 100, step: 1, unit: "XP" }),
        cislo({ key: "cteni", label: t("set.xp.reading"), min: 0, max: 100, step: 1, unit: "XP" }),
        cislo({ key: "psani", label: t("set.xp.writing"), min: 0, max: 100, step: 1, unit: "XP" }),
        cislo({ key: "stropStudent", label: t("set.xp.capStudent"), min: 0, max: 1000, step: 5, unit: "XP", help: t("set.xp.capStudent.help") }),
        cislo({ key: "stropDvojice", label: t("set.xp.capPair"), min: 0, max: 1000, step: 5, unit: "XP", help: t("set.xp.capPair.help") }),
        { key: "samSobe", label: t("set.xp.self"), type: "boolean" },
      ),
    },
    {
      key: "pravidla", label: t("set.rules.label"), type: "group", collapsed: true,
      help: t("set.rules.help"),
      fields: pole(
        { key: "poradi", label: t("set.rules.order"), type: "string", maxLength: 80, help: t("set.rules.order.help") },
        cislo({ key: "xpPrvni", label: t("set.rules.firstLetter"), min: 0, max: 1000, step: 1, unit: "XP" }),
        cislo({ key: "xpPismeno", label: t("set.rules.perLetter"), min: 1, max: 200, step: 1, unit: "XP" }),
        cislo({ key: "spojeni", label: t("set.rules.joined"), min: 1, max: 10, step: 1, integer: true, help: t("set.rules.joined.help") }),
        cislo({ key: "xpSlabiky", label: t("set.rules.syllables"), min: 1, max: 5000, step: 5, unit: "XP" }),
        cislo({ key: "slabikKrok", label: t("set.rules.syllableStep"), min: 1, max: 500, step: 1, unit: "XP" }),
        cislo({ key: "xpSlova", label: t("set.rules.words"), min: 1, max: 5000, step: 5, unit: "XP" }),
        cislo({ key: "slovaZaklad", label: t("set.rules.wordsBase"), min: 1, max: 20, step: 1, integer: true }),
        cislo({ key: "slovaKrok", label: t("set.rules.wordStep"), min: 1, max: 500, step: 1, unit: "XP" }),
        cislo({ key: "xpPlynule", label: t("set.rules.fluent"), min: 1, max: 10000, step: 5, unit: "XP" }),
        cislo({ key: "xpLatina", label: t("set.rules.latin"), min: 0, max: 20000, step: 5, unit: "XP", help: t("set.rules.latin.help") }),
        { key: "cislice", label: t("set.rules.digits"), type: "boolean" },
      ),
    },
    {
      key: "zrcadlit", label: t("set.mirror.label"), type: "group", collapsed: true,
      help: t("set.mirror.help"),
      fields: pole(
        { key: "zapnuto", label: t("set.mirror.on"), type: "boolean" },
        { key: "stopa", label: t("set.mirror.track"), type: "select", options: [o("scholarship", t("set.mirror.track.scholarship")), o("speech", t("set.mirror.track.speech"))] },
        cislo({ key: "pomer", label: t("set.mirror.ratio"), min: 0.1, max: 10, step: 0.1, help: t("set.mirror.ratio.help") }),
      ),
    },
    {
      key: "vybaveni", label: t("set.equipment.label"), type: "group", collapsed: true, fields: pole(
        { key: "lavice", label: t("set.equipment.bench"), type: "string", maxLength: 80, help: t("set.equipment.bench.help") },
        cislo({ key: "tabuleSirka", label: t("set.equipment.boardWidth"), min: 0.5, max: 4, step: 0.1, unit: "m" }),
        cislo({ key: "tabuleVyska", label: t("set.equipment.boardHeight"), min: 0.3, max: 3, step: 0.1, unit: "m" }),
        cislo({ key: "listSirka", label: t("set.equipment.sheetWidth"), min: 0.15, max: 0.8, step: 0.01, unit: "m" }),
        cislo({ key: "maxTrid", label: t("set.equipment.maxClasses"), min: 1, max: 20, step: 1, integer: true }),
        cislo({ key: "maxMist", label: t("set.equipment.maxSeats"), min: 1, max: 64, step: 1, integer: true }),
      ),
    },
    {
      key: "karta", label: t("set.card.label"), type: "group", collapsed: true,
      help: t("set.card.help"),
      fields: pole(
        { key: "zapnuto", label: t("set.card.on"), type: "boolean" },
        { key: "strana", label: t("set.card.side"), type: "select", options: [o("vpravo", t("set.card.side.right")), o("vlevo", t("set.card.side.left"))] },
        cislo({ key: "vyska", label: t("set.card.top"), min: 0, max: 70, step: 1, unit: "%", help: t("set.card.top.help") }),
      ),
    },
    {
      key: "slabikar", label: t("set.primer.label"), type: "list", itemLabel: "nazev", unique: "id", addLabel: t("set.primer.add"), min: 1,
      help: t("set.primer.help"),
      item: {
        type: "group", fields: pole(
          { key: "id", label: t("set.primer.id"), type: "string", required: true, maxLength: 24 },
          { key: "nazev", label: t("set.primer.name"), type: "string", required: true, maxLength: 40 },
          { key: "pismeno", label: t("set.primer.letter"), type: "string", maxLength: 2 },
          { key: "text", label: t("set.primer.text"), type: "text", required: true, maxLength: 600 },
          { key: "predloha", label: t("set.primer.model"), type: "string", maxLength: 40 },
        ),
      },
    },
  ] as Pole[];
}
