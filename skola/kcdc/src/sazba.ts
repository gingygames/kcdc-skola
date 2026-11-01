// Sazba školy: co se kreslí na listy a tabuli (kodek kreseb "k3."), bez hry. Server ji peče do textur, klient jí
// kreslí čítanku přes list a tools/nahled.ts z ní dělá obrázky k ladění vzhledu.

import { decode, encodeK3, type Drawing, type Stroke } from "../../../kresby/kcdc/src/shared/codec";
import { CHALK, INK_PISANKA, dataInkoustu } from "./kresby";
import { bezZnacek, filtr, stav } from "./shared/citelnost";
import { naTahy, vysadit, type Sazba, type Slovo, type Vysazeno } from "./shared/pismo";
import type { Strana } from "./data";

/** největší písmo (výška velkých písmen v px listu), se kterým se text i po zalomení vejde nad `dole` */
export function vejdeSe(text: string, s: Omit<Sazba, "vyska">, max: number, min: number, dole: number): { v: Vysazeno; vyska: number } {
  // osamocené slovo na řádku po zalomení („sůl.“): kvůli němu radši až o pětinu menší písmo
  const jednoslovnych = text.split("\n").filter((r) => r.trim() && !/\s/.test(r.trim())).length;
  const vdovy = (v: Vysazeno) => {
    const naRadku = new Map<number, number>();
    for (const w of v.slova) naRadku.set(w.radek, (naRadku.get(w.radek) ?? 0) + 1);
    return [...naRadku.values()].filter((n) => n === 1).length > jednoslovnych;
  };
  let prvni: { v: Vysazeno; vyska: number } | null = null;
  for (let h = max; h > min; h -= 1) {
    const v = vysadit(text, { ...s, vyska: h });
    if (s.y + (v.radku - 1) * h * (s.radek ?? 1.9) + h * 1.3 > dole) continue;
    prvni = prvni ?? { v, vyska: h };
    if (!vdovy(v)) return { v, vyska: h };
    if (h < prvni.vyska * 0.8) break;
  }
  return prvni ?? { v: vysadit(text, { ...s, vyska: min }), vyska: min };
}

/** obecný vzhled čítanky ve světě: řádky písma bez významu (čte se až skloněný, každý podle sebe) */
export function obecnaCitanka(seed = 7): string {
  const v = vysadit(filtr("Ema mele maso. Pes leží u domu.\nTáta nese vodu od mlýna.\nKdo umí číst, ten ví.", stav(0), { seed }), { x: 70, y: 70, sirka: 630, vyska: 34, seed });
  return encodeK3({ paper: 0, inks: [{ ...dataInkoustu([INK_PISANKA[0]])[0], flags: 4 }], strokes: naTahy(v.cary, { ink: 1, size: 10, op: 200 }) });
}

/** tahy křídy: tah asi třetina výšky písmene na čtvrtpixely (z lavic čitelný), rovnoměrný (příznak inkoustu 4) */
const krida = (v: Vysazeno, vyska: number) => naTahy(v.cary, { ink: 1, size: Math.min(24, Math.round(vyska / 2.6)), op: 235 });

/** text křídou na tabuli: co největší, ale celý (dlouhé řádky se zalomí); pod 24 px radši přeteče */
export function kridouText(text: string, seed: string, papir: number, nahore = 50): { data: string; preteklo: boolean } {
  const { v, vyska } = vejdeSe(text, { x: 50, y: nahore, sirka: 668, seed, rozptyl: 0.15, radek: 1.75 }, 76, 24, 488);
  return { data: encodeK3({ paper: papir, inks: dataInkoustu(CHALK), strokes: krida(v, vyska) }), preteklo: v.preteklo };
}

/** tabule stránky slabikáře: obrázek křídou vpravo nahoře (když je), písmeno lekce a text */
export function tabuleStrany(s: Strana, obr: string | undefined, papir: number): string {
  const tahy: Stroke[] = [];
  let nahore = 50;
  const d = obr ? decode(obr, 16) : null;
  if (d && d.strokes.length) {
    // zmenšený do horní třetiny; křídou (inkousty pergamenu by na tabuli nebyly vidět): červená a modrá zůstanou barevné
    const k = 0.36;
    for (const x of d.strokes) {
      if (x.tool === 3) continue;
      const barva = x.a === 2 ? 3 : x.a === 5 ? 2 : 1;
      tahy.push({ ...x, tool: x.tool === 2 ? 0 : x.tool, a: barva, b: 0, mix: 0, p: x.p.map((v, i) => (i % 3 === 0 ? Math.round(768 - 768 * k - 30 + v * k) : i % 3 === 1 ? Math.round(24 + v * k) : v)) });
    }
    nahore = Math.round(24 + 512 * k + 12);
    // písmeno lekce velké vlevo vedle obrázku (místo prázdného rohu), text pod obrázkem
    if (s.pismeno) {
      const h = vejdeSe(`${s.pismeno.toUpperCase()} ${s.pismeno}`, { x: 50, y: 40, sirka: 768 - 768 * k - 110, seed: s.id, rozptyl: 0.15 }, 110, 40, nahore - 16);
      tahy.push(...krida(h.v, h.vyska));
      const t = kridouText(bezZnacek(s.text), s.id, papir, nahore);
      return encodeK3({ paper: papir, inks: dataInkoustu(CHALK), strokes: [...tahy, ...decode(t.data, 16)!.strokes] });
    }
  }
  const text = bezZnacek((s.pismeno ? `${s.pismeno.toUpperCase()} ${s.pismeno}\n` : "") + s.text);
  const t = kridouText(text, s.id, papir, nahore);
  const td = decode(t.data, 16)!;
  return encodeK3({ paper: papir, inks: dataInkoustu(CHALK), strokes: [...tahy, ...td.strokes] });
}

/** předloha do písanky: zřetelné světlé tahy ručního písma po celé šířce listu, pod nimi linky (účaří a výška malých
 *  písmen) jako v písance; skóre obtažení se počítá jen z tahů písma (`tahy`), linky jsou podklad */
export function predloha(text: string): { data: string; tahy: Stroke[] } {
  const { v, vyska } = vejdeSe(text, { x: 64, y: 90, sirka: 640, seed: "p" + text, rozptyl: 0, radek: 1.6 }, 170, 60, 470);
  const tahy = naTahy(v.cary, { ink: 2, size: Math.max(16, Math.round(vyska / 5.5)), op: 185 });
  const linky: Stroke[] = [];
  for (let r = 0; r < v.radku; r++) {
    const y0 = 90 + r * vyska * 1.6;
    for (const y of [y0 + vyska * 0.4, y0 + vyska]) linky.push(...naTahy([[[40, y], [728, y]]], { ink: 2, size: 4, op: 70 }));
  }
  return { data: encodeK3({ paper: 0, inks: dataInkoustu(INK_PISANKA), strokes: [...linky, ...tahy] }), tahy };
}

const INKY_CTENI: Drawing["inks"] = [{ rgb: [38, 30, 28], flags: 4, strength: 245 }, { rgb: [150, 138, 118], flags: 4, strength: 150 }];

/** čítanka přes list při čtení: obrázek stránky nahoře (když je), pod ním text už přefiltrovaný gramotností hráče;
 *  vrací kresbu a boxy slov (prst) */
export function listCteni(text: string, seed: string, papir: number, obrazek?: string): { d: Drawing; slova: Slovo[] } {
  const strokes: Stroke[] = [];
  let top = 44;
  const obr = obrazek ? decode(obrazek, 16) : null;
  if (obr) {
    // obrázek do horní třetiny (zmenšený)
    const k = 0.42;
    for (const s of obr.strokes) strokes.push({ ...s, a: s.a ? 1 : 0, b: 0, p: s.p.map((v, i) => (i % 3 === 0 ? 384 - 384 * k + v * k : i % 3 === 1 ? 20 + v * k : v)) });
    top = 20 + 512 * k + 10;
  }
  const { v, vyska } = vejdeSe(text, { x: 48, y: top, sirka: 672, seed, radek: 1.85 }, 54, 20, 490);
  strokes.push(...naTahy(v.cary, { ink: 1, size: Math.max(6, Math.round(vyska / 3.4)), op: 235 }));
  return { d: { paper: papir, inks: INKY_CTENI, strokes }, slova: v.slova };
}
