// Pomocné hodnocení písanky: jak dobře tahy studenta odpovídají předloze. Jen napovídá učiteli, nerozhoduje.
//
//   obtazeni(predloha, student)  student obtahoval předlohu na stejném místě: kolik předlohy pokryl a kolik
//                                jeho tahů leží na předloze (F1 z pokrytí a přesnosti)
//   podobnost(predloha, student) student psal jinde (pod předlohu): obě mračna bodů se posunou a zvětší na
//                                stejnou velikost a porovnají ($P bez ohledu na pořadí tahů)

export type Body = [number, number][];

/** body tahů kodeku (x, y, tlak) převzorkované po `krok` px */
export function bodyTahu(tahy: { p: number[] }[], krok = 4): Body {
  const out: Body = [];
  for (const t of tahy) {
    const p = t.p;
    for (let i = 0; i + 2 < p.length; i += 3) {
      if (i >= 3) {
        const ax = p[i - 3];
        const ay = p[i - 2];
        const n = Math.floor(Math.hypot(p[i] - ax, p[i + 1] - ay) / krok);
        for (let k = 1; k < n; k++) out.push([ax + ((p[i] - ax) * k) / n, ay + ((p[i + 1] - ay) * k) / n]);
      }
      out.push([p[i], p[i + 1]]);
    }
  }
  return out;
}

function blizko(a: Body, b: Body, r: number): number {
  if (!a.length) return 0;
  // mřížka pro b
  const cell = Math.max(1, r);
  const grid = new Map<string, [number, number][]>();
  for (const q of b) {
    const k = Math.floor(q[0] / cell) + "," + Math.floor(q[1] / cell);
    const l = grid.get(k);
    if (l) l.push(q);
    else grid.set(k, [q]);
  }
  let n = 0;
  for (const [x, y] of a) {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let hit = false;
    for (let i = -1; i <= 1 && !hit; i++) {
      for (let j = -1; j <= 1 && !hit; j++) {
        for (const q of grid.get(cx + i + "," + (cy + j)) ?? []) {
          if ((q[0] - x) ** 2 + (q[1] - y) ** 2 <= r * r) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) n++;
  }
  return n / a.length;
}

/** obtažení předlohy: 0..1 (F1 pokrytí a přesnosti), r = tolerance v px listu */
export function obtazeni(predloha: Body, student: Body, r = 12): { skore: number; pokryti: number; presnost: number } {
  const pokryti = blizko(predloha, student, r);
  const presnost = blizko(student, predloha, r);
  const skore = pokryti + presnost ? (2 * pokryti * presnost) / (pokryti + presnost) : 0;
  return { skore, pokryti, presnost };
}

function normalizovat(b: Body, n = 48): Body {
  if (!b.length) return [];
  // převzorkovat na n bodů rovnoměrně podle pořadí
  const step = b.length / n;
  const r: Body = [];
  for (let i = 0; i < n; i++) r.push(b[Math.min(b.length - 1, Math.floor(i * step))]);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of r) {
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
  }
  const s = Math.max(maxx - minx, maxy - miny) || 1;
  let cx = 0, cy = 0;
  for (const [x, y] of r) {
    cx += x;
    cy += y;
  }
  cx /= r.length;
  cy /= r.length;
  return r.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
}

/** podobnost tvaru 0..1 ($P: hladové párování mračen v obou směrech) */
export function podobnost(predloha: Body, student: Body): number {
  const a = normalizovat(predloha);
  const b = normalizovat(student);
  if (!a.length || !b.length) return 0;
  const d = Math.min(match(a, b), match(b, a));
  // průměrná vzdálenost bodu ~0 = stejné, ~0,35 = jiný tvar
  return Math.max(0, Math.min(1, 1 - d / 0.35));
}

function match(a: Body, b: Body): number {
  const used = new Array(b.length).fill(false);
  let sum = 0;
  for (const [x, y] of a) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < b.length; j++) {
      if (used[j]) continue;
      const d = (b[j][0] - x) ** 2 + (b[j][1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best >= 0) used[best] = true;
    sum += Math.sqrt(bd);
  }
  return sum / a.length;
}

/** krátké slovní hodnocení pro učitele: klíč překladu (src/lang/, msg.grade.*) */
export function slovneKlic(skore: number): string {
  if (skore >= 0.8) return "msg.grade.fine";
  if (skore >= 0.6) return "msg.grade.passable";
  if (skore >= 0.35) return "msg.grade.unsure";
  return "msg.grade.unlike";
}

/** krátké slovní hodnocení pro učitele (česky; server překládá přes slovneKlic) */
export function slovne(skore: number): string {
  if (skore >= 0.8) return "pěkně";
  if (skore >= 0.6) return "ujde";
  if (skore >= 0.35) return "nejisté";
  return "nepodobá se";
}
