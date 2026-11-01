// Čitelnost textu podle gramotnosti postavy. Sdílí server (export filtrText pro jiné moduly) i klient (čítanka).
//
// Z XP gramotnosti se spočítá stav (stav()): stupeň, známá písmena, kolik písmen umí spojit, kolik slabik a slov
// přečte. filtr() pak nahradí nečitelné znaky pseudoznaky:
//   * deterministicky: hash(seed, pozice, znak) - stejný text vypadá při každém otevření stejně (nebliká);
//   * se stejnou siluetou: malé písmeno bez dotahu za jiné takové, s horním dotahem za jiné s horním dotahem …,
//     takže slovo vypadá jako slovo, jen ho čtenář nepřečte;
//   * 1 : 1 po znacích: mezery, čísla, interpunkce a pořadí slov zůstávají, takže index slova v přefiltrovaném
//     textu je i index slova v originále (učitel vidí skutečné slovo pod prstem studenta).
//
// Stupně (prahy XP v pravidlech, nastavení ve Správě):
//   0 Negramotný   vše pseudoznaky
//   1 Písmena      odemčená písmena (pořadí slabikáře) čitelná, ostatní ne; dlouhé řetězce písmen se rozpadají
//   2 Slabiky      první slabiky slova čitelné, ke konci dlouhých slov se rozpadají
//   3 Slova        celá slova, ale po K slovech ve větě čitelnost slábne
//   4 Plynně       vše čitelné; latina ({lat}…{/lat}) až od xpLatina

export interface Pravidla {
  poradi: string; // pořadí odemykání písmen (malá písmena, i s diakritikou)
  xpPrvni: number; // XP pro první písmeno (začátek stupně 1)
  xpPismeno: number; // XP za každé další písmeno
  spojeni: number; // stupeň 1: kolik písmen za sebou ve slově přečte na začátku (roste se známými písmeny)
  xpSlabiky: number; // začátek stupně 2
  slabikKrok: number; // XP za další čitelnou slabiku
  xpSlova: number; // začátek stupně 3
  slovaZaklad: number; // stupeň 3: slov ve větě na začátku
  slovaKrok: number; // XP za další slovo ve větě
  xpPlynule: number; // stupeň 4
  xpLatina: number; // latina čitelná (0 = s plynulým čtením)
  cislice: boolean; // číslice čitelné od stupně 1
}

export const PRAVIDLA: Pravidla = {
  poradi: "aeioumlsptvndkrjbhzcyšžčřáéíóúůýěfgxqwďťň",
  xpPrvni: 10,
  xpPismeno: 8,
  spojeni: 2,
  xpSlabiky: 360,
  slabikKrok: 40,
  xpSlova: 500,
  slovaZaklad: 3,
  slovaKrok: 30,
  xpPlynule: 750,
  xpLatina: 1000,
  cislice: true,
};

export const STUPNE = ["Negramotný", "Písmena", "Slabiky", "Slova", "Plynné čtení"] as const;
/** klíč názvu stupně v překladech (src/lang/, level.0 … level.4); STUPNE zůstávají kvůli zpětné kompatibilitě */
export const klicStupne = (stupen: number) => "level." + stupen;

export interface Stav {
  xp: number;
  stupen: 0 | 1 | 2 | 3 | 4;
  pismena: string; // známá malá písmena (stupeň 1; od stupně 2 všechna)
  spojeni: number; // stupeň 1
  slabik: number; // stupeň 2
  slov: number; // stupeň 3
  latina: boolean;
  cislice: boolean;
  /** co odemkne další XP (HUD, deník): co = česky, klic a a = k překladu (level.next.*) */
  dalsi: { xp: number; co: string; klic: string; a?: Record<string, string | number> } | null;
}

export function stav(xp: number, pr: Pravidla = PRAVIDLA): Stav {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const abc = [...pr.poradi.toLowerCase()];
  const vse = abc.join("");
  const latina = x >= (pr.xpLatina > 0 ? pr.xpLatina : pr.xpPlynule);
  const base = { xp: x, latina, cislice: false, spojeni: 0, slabik: 0, slov: 0, pismena: "" };
  if (x >= pr.xpPlynule) return { ...base, stupen: 4, pismena: vse, cislice: true, slabik: 99, slov: 999, spojeni: 99, dalsi: latina ? null : { xp: pr.xpLatina, co: "latina", klic: "level.next.latin" } };
  if (x >= pr.xpSlova) {
    const slov = pr.slovaZaklad + Math.floor((x - pr.xpSlova) / Math.max(1, pr.slovaKrok));
    const dalsiXp = Math.min(pr.xpPlynule, pr.xpSlova + (slov - pr.slovaZaklad + 1) * Math.max(1, pr.slovaKrok));
    return { ...base, stupen: 3, pismena: vse, cislice: true, slabik: 99, spojeni: 99, slov, dalsi: dalsiXp >= pr.xpPlynule ? { xp: dalsiXp, co: "plynné čtení", klic: "level.next.fluent" } : { xp: dalsiXp, co: `${slov + 1} slov ve větě`, klic: "level.next.wordsInSentence", a: { n: slov + 1 } } };
  }
  if (x >= pr.xpSlabiky) {
    const slabik = 1 + Math.floor((x - pr.xpSlabiky) / Math.max(1, pr.slabikKrok));
    const dalsiXp = Math.min(pr.xpSlova, pr.xpSlabiky + slabik * Math.max(1, pr.slabikKrok));
    return { ...base, stupen: 2, pismena: vse, cislice: pr.cislice, spojeni: 99, slabik, dalsi: dalsiXp >= pr.xpSlova ? { xp: dalsiXp, co: "celá slova", klic: "level.next.words" } : { xp: dalsiXp, co: `${slabik + 1}. slabika`, klic: "level.next.syllable", a: { n: slabik + 1 } } };
  }
  if (x >= pr.xpPrvni) {
    const n = Math.min(abc.length, 1 + Math.floor((x - pr.xpPrvni) / Math.max(1, pr.xpPismeno)));
    const pismena = abc.slice(0, n).join("");
    const spojeni = pr.spojeni + Math.floor(n / 10);
    const dalsi = n < abc.length
      ? { xp: pr.xpPrvni + n * Math.max(1, pr.xpPismeno), co: `písmeno ${abc[n].toUpperCase()}`, klic: "level.next.letter", a: { letter: abc[n].toUpperCase() } }
      : { xp: pr.xpSlabiky, co: "slabiky", klic: "level.next.syllables" };
    return { ...base, stupen: 1, pismena, spojeni, cislice: pr.cislice, dalsi };
  }
  const prvni = (abc[0] ?? "a").toUpperCase();
  return { ...base, stupen: 0, dalsi: { xp: pr.xpPrvni, co: `písmeno ${prvni}`, klic: "level.next.letter", a: { letter: prvni } } };
}

/** XP potřebné k odemčení písmene (pro učitele: co ještě student neumí); -1 = písmeno v pořadí není */
export function xpPismene(ch: string, pr: Pravidla = PRAVIDLA): number {
  const i = [...pr.poradi.toLowerCase()].indexOf(ch.toLowerCase());
  return i < 0 ? -1 : pr.xpPrvni + i * Math.max(1, pr.xpPismeno);
}

// ---------------------------------------------------------------------------
// pseudoznaky

const TRIDY = [
  "acemnorsuvwxz", // malá bez dotahů
  "bdhklt", // malá s horním dotahem (f zvlášť: úzké)
  "gpqy", // malá s dolním dotahem
  "áéíóúýůěšžčřň", // malá s diakritikou
  "ABCDEGHKMNOPRSUVXZ", // velká široká
  "FIJLT", // velká úzká
  "ÁÉÍÓÚÝŮĚŠŽČŘŇĎŤ", // velká s diakritikou
  "0123456789",
];
const TRIDA = new Map<string, string>();
for (const t of TRIDY) for (const ch of t) TRIDA.set(ch, t);
TRIDA.set("f", "bdhklt");
TRIDA.set("j", "gpqy");
TRIDA.set("i", "acemnorsuvwxz");
TRIDA.set("ď", "bdhklt");
TRIDA.set("ť", "bdhklt");
TRIDA.set("Q", "ABCDEGHKMNOPRSUVXZ");
TRIDA.set("W", "ABCDEGHKMNOPRSUVXZ");
TRIDA.set("Y", "ABCDEGHKMNOPRSUVXZ");

/** 32bitový hash (FNV-1a + promíchání) */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
const nahoda = (...p: (string | number)[]) => hash(...p) / 4294967296;

/** pseudoznak za znak ch (jiný než ch, stejná silueta) */
export function pseudo(ch: string, seed: string | number, pos: number): string {
  // písmeno mimo české třídy (ä, ł, cyrilice …) nesmí projít čitelné: dostane obecnou třídu podle velikosti
  const t = TRIDA.get(ch) ?? (/\p{L}/u.test(ch) ? (ch !== ch.toLowerCase() ? TRIDY[4] : TRIDY[0]) : undefined);
  if (!t) return ch;
  const moznosti = [...t].filter((x) => x !== ch);
  return moznosti[hash(seed, pos, ch) % moznosti.length];
}

const PISMENO = /\p{L}/u;
const SAMOHLASKY = new Set([..."aáeéěiíoóuúůyý"]);
const zaklad = (ch: string) => ch.toLowerCase();

/** slabiky slova: pole indexů začátků slabik (jednoduché české dělení; ch je jedna souhláska, slabikotvorné r, l) */
export function slabiky(slovo: string): number[] {
  const z = [...slovo.toLowerCase()];
  const jadra: [number, number][] = []; // [začátek, konec] jádra (dvojhláska ou/au = jedno jádro)
  for (let i = 0; i < z.length; i++) {
    const posl = jadra[jadra.length - 1];
    if (SAMOHLASKY.has(z[i])) {
      if (z[i] === "u" && posl && posl[1] === i - 1 && (z[i - 1] === "o" || z[i - 1] === "a")) posl[1] = i;
      else jadra.push([i, i]);
    } else if ((z[i] === "r" || z[i] === "l") && i > 0 && !SAMOHLASKY.has(z[i - 1]) && (i === z.length - 1 || !SAMOHLASKY.has(z[i + 1]))) {
      jadra.push([i, i]);
    }
  }
  if (jadra.length <= 1) return [0];
  const out = [0];
  for (let k = 1; k < jadra.length; k++) {
    const a = jadra[k - 1][1] + 1; // první souhláska mezi jádry
    const b = jadra[k][0];
    const ch = b - a >= 2 && z[b - 1] === "h" && z[b - 2] === "c"; // ch je jedna souhláska
    const souhl = b - a - (ch ? 1 : 0);
    out.push(souhl === 0 ? b : souhl === 1 ? (ch ? b - 2 : b - 1) : a + 1);
  }
  return out;
}

export interface FiltrVolby {
  seed?: string | number; // id textu: stejný text, stejné pseudoznaky
}

/** text, jak ho postava se stavem `st` vidí. Značky {lat}…{/lat} se odstraní (latina čitelná až od xpLatina). */
export function filtr(text: string, st: Stav, o: FiltrVolby = {}): string {
  return projit(text, st, o).text;
}

/** podíl čitelných písmen (0..1) - pro nativní knihu (Book legibility, kroky 0,1) */
export function citelnost(text: string, st: Stav, o: FiltrVolby = {}): number {
  const r = projit(text, st, o);
  return r.pismen ? r.citelnych / r.pismen : 1;
}

export const legibility = (text: string, st: Stav, o: FiltrVolby = {}) => Math.round(citelnost(text, st, o) * 10) / 10;

/** text bez značek {lat} (to, co je napsané) */
export const bezZnacek = (text: string) => String(text ?? "").replace(/\{\/?lat\}/g, "");

function projit(text: string, st: Stav, o: FiltrVolby): { text: string; pismen: number; citelnych: number } {
  const seed = o.seed ?? "";
  const znaky = [...String(text ?? "")];
  const out: string[] = [];
  let pismen = 0;
  let citelnych = 0;
  let latina = false;
  let veVete = 0; // slovo ve větě (stupeň 3)
  let poz = 0; // pozice v textu bez značek
  let i = 0;
  while (i < znaky.length) {
    // značky latiny
    if (znaky[i] === "{") {
      const zbytek = znaky.slice(i, i + 6).join("");
      if (zbytek.startsWith("{lat}")) {
        latina = true;
        i += 5;
        continue;
      }
      if (zbytek.startsWith("{/lat}")) {
        latina = false;
        i += 6;
        continue;
      }
    }
    const ch = znaky[i];
    if (!PISMENO.test(ch)) {
      if (/[0-9]/.test(ch)) out.push(st.cislice || st.stupen >= 4 ? ch : pseudo(ch, seed, poz));
      else out.push(ch);
      if (/[.!?\n]/.test(ch)) veVete = 0;
      poz++;
      i++;
      continue;
    }
    // celé slovo
    let j = i;
    while (j < znaky.length && PISMENO.test(znaky[j])) j++;
    const slovo = znaky.slice(i, j);
    const lat = latina && !st.latina;
    const slab = st.stupen === 2 || (lat && st.stupen >= 2) ? slabiky(slovo.join("")) : [0];
    veVete++;
    for (let k = 0; k < slovo.length; k++) {
      const c = slovo[k];
      pismen++;
      let ok: boolean;
      const r = nahoda(seed, "p", poz + k, c);
      if (st.stupen >= 4 && !lat) ok = true;
      else if (st.stupen === 0) ok = false;
      else if (lat) {
        // latina: nejvýš jako stupeň 2 (první slabika)
        const s = slab.filter((x) => x <= k).length - 1;
        ok = st.stupen >= 2 && s < 1 ? true : r < 0.15;
      } else if (st.stupen === 1) {
        ok = st.pismena.includes(zaklad(c)) && (k < st.spojeni || r < 0.35);
      } else if (st.stupen === 2) {
        const s = slab.filter((x) => x <= k).length - 1; // index slabiky písmene
        ok = s < st.slabik || r > Math.min(0.9, 0.35 + 0.2 * (s - st.slabik));
      } else {
        const navic = veVete - st.slov;
        ok = navic <= 0 || r > Math.min(0.85, 0.25 * navic);
      }
      if (ok) citelnych++;
      out.push(ok ? c : pseudo(c, seed, poz + k));
    }
    poz += slovo.length;
    i = j;
  }
  return { text: out.join(""), pismen, citelnych };
}

/** slova textu (bez značek) v pořadí: index slova = index i v přefiltrovaném textu */
export function slova(text: string): string[] {
  return bezZnacek(text).match(/\p{L}+/gu) ?? [];
}

