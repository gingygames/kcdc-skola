// Jádro školy bez hry: stupně z XP, filtr čitelnosti, slabiky, písmo a sazba, hodnocení písanky.
import { describe, expect, it } from "vitest";
import { PRAVIDLA, bezZnacek, citelnost, filtr, legibility, pseudo, slabiky, slova, stav, xpPismene } from "../src/shared/citelnost";
import { chybejiciZnaky, glyf, naTahy, slovoNa, vysadit } from "../src/shared/pismo";
import { bodyTahu, obtazeni, podobnost } from "../src/shared/porovnani";
import { decode, encodeK3 } from "../../../kresby/kcdc/src/shared/codec";

const TEXT = "Matka mele maso. Pes leží u domu a ospale kouká na cestu.";

describe("stupně z XP", () => {
  it("0 → písmena → slabiky → slova → plynně, s tím, co přijde dál", () => {
    expect(stav(0)).toMatchObject({ stupen: 0, pismena: "", dalsi: { xp: 10, co: "písmeno A" } });
    expect(stav(10)).toMatchObject({ stupen: 1, pismena: "a", dalsi: { xp: 18, co: "písmeno E" } });
    expect(stav(10 + 8 * 4)).toMatchObject({ stupen: 1, pismena: "aeiou" });
    const vse = [...PRAVIDLA.poradi].length;
    expect(stav(10 + 8 * (vse - 1)).pismena).toBe(PRAVIDLA.poradi);
    expect(stav(10 + 8 * (vse - 1)).dalsi).toEqual({ xp: 360, co: "slabiky", klic: "level.next.syllables" });
    expect(stav(360)).toMatchObject({ stupen: 2, slabik: 1 });
    expect(stav(400)).toMatchObject({ stupen: 2, slabik: 2 });
    expect(stav(500)).toMatchObject({ stupen: 3, slov: 3 });
    expect(stav(750)).toMatchObject({ stupen: 4, latina: false, dalsi: { co: "latina" } });
    expect(stav(1000)).toMatchObject({ stupen: 4, latina: true, dalsi: null });
    expect(xpPismene("M")).toBe(10 + 8 * 5);
    expect(xpPismene("@")).toBe(-1);
  });
});

describe("filtr čitelnosti", () => {
  it("1 : 1 po znacích, mezery a interpunkce zůstávají, deterministický podle seedu", () => {
    const st = stav(0);
    const a = filtr(TEXT, st, { seed: 7 });
    expect([...a]).toHaveLength([...TEXT].length);
    expect(a.replace(/\p{L}/gu, "x")).toBe(TEXT.replace(/\p{L}/gu, "x"));
    expect(filtr(TEXT, st, { seed: 7 })).toBe(a);
    expect(filtr(TEXT, st, { seed: 8 })).not.toBe(a);
    expect([...a].every((ch, i) => !/\p{L}/u.test(ch) || ch !== [...TEXT][i])).toBe(true); // nic čitelné
    expect(citelnost(TEXT, st)).toBe(0);
    expect(slova(a)).toHaveLength(slova(TEXT).length);
  });

  it("písmena mimo češtinu (ä, ł, ß, cyrilice) negramotný nepřečte", () => {
    const t = "Łódź Straße Ärger Москва";
    const f = filtr(t, stav(0), { seed: 1 });
    expect([...f]).toHaveLength([...t].length);
    expect([...f].every((ch, i) => !/\p{L}/u.test(ch) || ch !== [...t][i])).toBe(true);
  });

  it("pseudoznak má stejnou siluetu (dotahy, velikost, diakritika)", () => {
    for (let i = 0; i < 50; i++) {
      expect("bdhklt").toContain(pseudo("h", "s", i));
      expect("gpqy").toContain(pseudo("p", "s", i));
      expect("acemnorsuvwxz").toContain(pseudo("o", "s", i));
      expect("áéíóúýůěšžčřň").toContain(pseudo("ř", "s", i));
      expect(pseudo("M", "s", i)).toMatch(/[A-Z]/);
      expect(pseudo("M", "s", i)).not.toBe("M");
    }
  });

  it("stupeň 1: jen známá písmena, dlouhé řetězce se rozpadají", () => {
    const st = stav(10 + 8 * 5); // a e i o u m
    const f = filtr("mama ema", st, { seed: 1 });
    expect(f.slice(0, 2)).toBe("ma"); // první 2 písmena slova (spojení)
    expect(f.slice(5, 7)).toBe("em");
    const s = filtr("kost", st, { seed: 1 });
    expect(s[0]).not.toBe("k"); // k ještě nezná
    expect(citelnost(TEXT, st)).toBeGreaterThan(0.1);
    expect(citelnost(TEXT, st)).toBeLessThan(0.6);
  });

  it("stupeň 2: první slabiky čitelné, s XP víc; 3: celá slova, dál ve větě slábne; 4 vše", () => {
    const dlouhe = "Neobyčejně rozcuchaný Mikuláš";
    const s1 = filtr(dlouhe, stav(360), { seed: 3 });
    expect(s1.startsWith("Ne")).toBe(true);
    expect(s1.slice(11, 13)).toBe("ro");
    const c1 = citelnost(dlouhe, stav(360));
    const c2 = citelnost(dlouhe, stav(440));
    expect(c2).toBeGreaterThan(c1);
    const veta = "jedna dva tri ctyri pet sest sedm osm devet deset";
    const s3 = filtr(veta, stav(500), { seed: 2 });
    expect(s3.startsWith("jedna dva tri ")).toBe(true);
    expect(s3).not.toBe(veta);
    expect(citelnost(veta, stav(600))).toBeGreaterThan(citelnost(veta, stav(500)));
    expect(filtr(TEXT, stav(750))).toBe(TEXT);
    expect(legibility(TEXT, stav(0))).toBe(0);
    expect(legibility(TEXT, stav(750))).toBe(1);
  });

  it("latina ve značkách: značky zmizí, čitelná až od xpLatina", () => {
    const t = "Psáno {lat}Anno Domini{/lat} léta Páně";
    expect(bezZnacek(t)).toBe("Psáno Anno Domini léta Páně");
    expect(filtr(t, stav(750), { seed: 1 })).not.toBe(bezZnacek(t));
    expect(filtr(t, stav(750), { seed: 1 }).startsWith("Psáno ")).toBe(true);
    expect(filtr(t, stav(1000))).toBe(bezZnacek(t));
    expect(slova(t)).toEqual(["Psáno", "Anno", "Domini", "léta", "Páně"]);
  });

  it("slabiky: české dělení, ch, dvojhlásky, slabikotvorné r/l", () => {
    const d = (w: string) => {
      const z = slabiky(w);
      return z.map((s, i) => w.slice(s, z[i + 1])).join("-");
    };
    expect(d("matka")).toBe("mat-ka");
    expect(d("maso")).toBe("ma-so");
    expect(d("kouká")).toBe("kou-ká");
    expect(d("střecha")).toBe("stře-cha");
    expect(d("vlkodlak")).toBe("vl-kod-lak");
    expect(d("a")).toBe("a");
  });
});

describe("písmo", () => {
  it("má celou abecedu s diakritikou, číslice a běžnou interpunkci", () => {
    expect(chybejiciZnaky("AÁBCČDĎEÉĚFGHIÍJKLMNŇOÓPQRŘSŠTŤUÚŮVWXYÝZŽ aábcčdďeéěfghiíjklmnňoópqrřsštťuúůvwxyýzž 0123456789 .,!?-:;\"'„“()")).toEqual([]);
    expect(chybejiciZnaky("§@")).toEqual(["§", "@"]);
    expect(glyf("í")!.cary).toHaveLength(2); // bez tečky, s čárkou
    expect(glyf("ď")!.w).toBeGreaterThan(glyf("d")!.w);
  });

  it("sazba: zalomení po slovech, boxy slov, slovo pod prstem, tahy jdou kodekem kreseb", () => {
    const v = vysadit(TEXT, { x: 40, y: 40, sirka: 688, vyska: 40, seed: 1 });
    expect(v.radku).toBeGreaterThan(1);
    expect(v.preteklo).toBe(false);
    expect(v.slova.map((s) => s.i)).toEqual(slova(TEXT).map((_, i) => i));
    expect(v.slova.every((s) => s.x1 <= 40 + 688 + 1 && s.x0 >= 40)).toBe(true);
    const w = v.slova[3]; // "maso"
    expect(slovoNa(v.slova, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2)).toBe(3);
    expect(slovoNa(v.slova, 5, 500)).toBe(-1);
    const tahy = naTahy(v.cary, { ink: 1, size: 12 });
    const d = decode(encodeK3({ paper: 31, inks: [{ rgb: [240, 240, 230], flags: 1, strength: 255 }], strokes: tahy }));
    expect(d!.strokes.length).toBe(tahy.length);
    expect(tahy.every((t) => t.p.every((x, i) => (i % 3 === 0 ? x >= 0 && x <= 767 : i % 3 === 1 ? x >= 0 && x <= 511 : true)))).toBe(true);
    // přefiltrovaný text má stejné indexy slov
    expect(vysadit(filtr(TEXT, stav(0), { seed: 1 }), { x: 40, y: 40, sirka: 688, vyska: 40 }).slova).toHaveLength(v.slova.length);
    expect(vysadit("slovo ".repeat(400), { x: 0, y: 0, sirka: 700, vyska: 40 }).preteklo).toBe(true);
  });
});

describe("hodnocení písanky", () => {
  const pred = (t: string, x = 100, y = 100) => bodyTahu(naTahy(vysadit(t, { x, y, sirka: 600, vyska: 120, rozptyl: 0 }).cary, { ink: 1 }));

  it("obtažení: přesné obtažení skoro 1, jiné písmeno málo, prázdno 0", () => {
    const a = pred("A");
    expect(obtazeni(a, a).skore).toBeGreaterThan(0.95);
    expect(obtazeni(a, pred("O")).skore).toBeLessThan(0.5);
    expect(obtazeni(a, []).skore).toBe(0);
    const posun = a.map(([x, y]) => [x + 5, y + 4] as [number, number]);
    expect(obtazeni(a, posun).skore).toBeGreaterThan(0.9);
  });

  it("podobnost: stejné písmeno jinde a jinak velké podobné, jiné písmeno méně", () => {
    const a = pred("A");
    const jinde = bodyTahu(naTahy(vysadit("A", { x: 400, y: 300, sirka: 300, vyska: 60, rozptyl: 0.3, seed: 9 }).cary, { ink: 1 }));
    expect(podobnost(a, jinde)).toBeGreaterThan(0.7);
    expect(podobnost(a, pred("S"))).toBeLessThan(podobnost(a, jinde));
  });
});
