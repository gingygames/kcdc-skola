// Náhled vykreslení školy bez hry: listy a tabule stejnou cestou jako server kreseb (rastr kreseb), do PNG.
//   npx esbuild tools/nahled.ts --bundle --platform=node --outfile=dist/nahled.cjs && node dist/nahled.cjs [složka]
// Výstup (výchozí dist/nahled/): tabule stránek, text na tabuli, čítanka po stupních gramotnosti, předloha písanky
// a obtažená písanka, obecná čítanka ve světě. Čítanka při čtení se ve hře kreslí přes Scaleform stejnými tahy;
// tady je v rastru kreseb (vzhled tahů se mírně liší, rozložení je stejné).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { decode, encodeK3, type Drawing } from "../../../kresby/kcdc/src/shared/codec";
import { renderSheet, runSync, type Canvas } from "../../../kresby/kcdc/src/server/raster";
import { SLABIKAR } from "../src/data";
import { PRAVIDLA, filtr, stav } from "../src/shared/citelnost";
import { kridouText, listCteni, obecnaCitanka, predloha, tabuleStrany } from "../src/sazba";

const TABULE = 31;
const K = 1.5; // px obrázku na logický px listu (768 × 512)

function png(c: Canvas): Buffer {
  const raw = Buffer.alloc((c.w * 3 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 3 + 1)] = 0;
    for (let x = 0; x < c.w * 3; x++) raw[y * (c.w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(c.px[y * c.w * 3 + x])));
  }
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let k = n;
    for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
    return k >>> 0;
  });
  const crc = (b: Buffer) => {
    let x = 0xffffffff;
    for (const v of b) x = crcT[(x ^ v) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const out = process.argv[2] ?? join(__dirname, "nahled");
mkdirSync(out, { recursive: true });
const ulozit = (jmeno: string, d: Drawing) => {
  writeFileSync(join(out, jmeno + ".png"), png(runSync(renderSheet(d, K, 1e9))));
  console.log(jmeno);
};
const k3 = (data: string) => decode(data, 16)!;
const strana = (id: string) => SLABIKAR.find((s) => s.id === id)!;

// tabule
for (const id of ["a", "m", "cteni1", "cteni2", "latina"]) ulozit("tabule-" + id, k3(tabuleStrany(strana(id), undefined, TABULE)));
// obrázek stránky (jako by ho písař nakreslil u tabule): mlýn s kolem, červená střecha
const kruh = (cx: number, cy: number, r: number) => Array.from({ length: 25 }, (_, i) => [Math.round(cx + Math.cos((i / 24) * 6.283) * r), Math.round(cy + Math.sin((i / 24) * 6.283) * r), 12]).flat();
const obrazek = encodeK3({
  paper: 0, inks: [{ rgb: [38, 30, 28], flags: 0, strength: 245 }, { rgb: [160, 40, 30], flags: 0, strength: 230 }],
  strokes: [
    { tool: 0, a: 1, b: 0, mix: 0, size: 14, op: 255, p: [200, 420, 12, 200, 220, 12, 520, 220, 12, 520, 420, 12, 200, 420, 12] },
    { tool: 0, a: 2, b: 0, mix: 0, size: 18, op: 255, p: [170, 230, 12, 360, 90, 12, 550, 230, 12] },
    { tool: 0, a: 1, b: 0, mix: 0, size: 12, op: 255, p: kruh(620, 330, 90) },
    { tool: 0, a: 1, b: 0, mix: 0, size: 10, op: 255, p: [530, 330, 12, 710, 330, 12] },
    { tool: 0, a: 1, b: 0, mix: 0, size: 10, op: 255, p: [620, 240, 12, 620, 420, 12] },
  ],
});
ulozit("tabule-m-obrazek", k3(tabuleStrany(strana("m"), obrazek, TABULE)));
ulozit("citanka-m-obrazek", listCteni(filtr(strana("m").text, stav(900, PRAVIDLA), { seed: "m" }), "m", 0, obrazek).d);
ulozit("tabule-text", k3(kridouText("Dnes: písmeno M\nmama, Ema, umí", "x", TABULE).data));

// čítanka při čtení: stejná stránka po stupních gramotnosti
for (const [xp, nazev] of [[0, "0-negramotny"], [30, "1-pismena"], [120, "1-pismena-vic"], [400, "2-slabiky"], [600, "3-slova"], [900, "4-plynule"]] as const) {
  const s = strana("cteni1");
  const t = filtr(s.text, stav(xp, PRAVIDLA), { seed: s.id });
  ulozit("citanka-" + nazev, listCteni(t, s.id, 0).d);
}
ulozit("citanka-m-plynule", listCteni(filtr(strana("m").text, stav(900, PRAVIDLA), { seed: "m" }), "m", 0).d);
ulozit("citanka-trh-plynule", listCteni(filtr(strana("cteni2").text, stav(900, PRAVIDLA), { seed: "cteni2" }), "cteni2", 0).d);

// písanka: předloha a obtažená (žák obtáhne tmavým inkoustem s malou odchylkou)
const p = predloha("A a");
ulozit("pisanka-predloha", k3(p.data));
const zak = p.tahy.map((t) => ({ ...t, a: 1, op: 255, size: 10, p: t.p.map((v, i) => (i % 3 === 2 ? v : v + Math.round(Math.sin(i) * 3))) }));
ulozit("pisanka-obtazena", { ...k3(p.data), strokes: [...k3(p.data).strokes, ...zak] });

// čítanka ve světě (obecný vzhled)
ulozit("citanka-svet", k3(obecnaCitanka()));
