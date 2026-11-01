// Škola - umisťování vybavení (PropPlacer hry), část jádra: nezávisí na UI. Průsvitný náhled pod zaměřovačem,
// kolečko otáčí, klik staví, Esc končí. Tabule na zeď a místo na stole mají místo modelu obrys (Gizmos) podle normály
// povrchu; špatný povrch = červený náhled (veto). Co se postaví, rozhodne server znovu z pózy (skola:umisteno).

import { UI, type UmistenoMsg, type UmistitMsg } from "./shared/ui";
import type { V3 } from "../../../kresby/kcdc/src/shared/layout";
import { karta, kartaAktivni, pozastavitPanel, tk } from "./ui-jadro";

const log = (t: string) => console.log("[skola] " + t);
const emit = (ev: string, m: unknown = {}) => {
  try {
    Events.emitServer(ev, m as any);
  } catch (e) {
    log(`${ev}: ${String(e)}`);
  }
};
const asObject = (m: unknown): any => {
  if (typeof m === "string")
    try {
      return JSON.parse(m);
    } catch {
      return null;
    }
  return m && typeof m === "object" ? m : null;
};

let umistuje: UmistitMsg | null = null;
let obrysTimer: ReturnType<typeof setInterval> | null = null;
let odhlasit: (() => void)[] = [];
let veto = false;
let postaveno = 0;

const OBRYS = "umistit-obrys";
let posledniObrys = "";
const ZELENA = 0xff7fd18b;
const CERVENA = 0xffe0645a;

export const stavi = () => !!umistuje || cekaNaStart;

function obdelnik(pos: V3, n: V3, w: number, h: number, vodorovne: boolean, yaw: number): V3[] {
  // svisle na zdi: osa u vodorovně podél zdi, v nahoru; vodorovně na stole: u podél pohledu kolmo, v dopředu
  let u: V3;
  let v: V3;
  if (vodorovne) {
    const a = (yaw * Math.PI) / 180;
    u = [Math.cos(a), Math.sin(a), 0];
    v = [-Math.sin(a), Math.cos(a), 0];
  } else {
    const l = Math.hypot(n[0], n[1]) || 1;
    u = [-n[1] / l, n[0] / l, 0];
    v = [0, 0, 1];
  }
  const o = 0.015;
  const at = (a: number, b: number): V3 => [pos[0] + u[0] * a + v[0] * b + n[0] * o, pos[1] + u[1] * a + v[1] * b + n[1] * o, pos[2] + u[2] * a + v[2] * b + n[2] * o];
  return [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2), at(-w / 2, -h / 2)];
}

/** tabule na zeď potřebuje svislou stěnu, místo u stolu vodorovnou desku */
function spatnyPovrch(m: UmistitMsg, n: V3): boolean {
  if (m.druh === "zed") return Math.abs(n[2]) > 0.5;
  if (m.druh === "misto") return n[2] < 0.7;
  return false;
}

const v3 = (v: { x: number; y: number; z: number }): V3 => [v.x, v.y, v.z];
const yawZ = (q: { w: number; z: number }) => (2 * Math.atan2(q.z, q.w) * 180) / Math.PI;

function kreslitObrys() {
  const m = umistuje;
  if (!m?.obrys) return;
  const pose = PropPlacer.getPose();
  if (!pose) return;
  const n = v3(pose.normal);
  const spatne = spatnyPovrch(m, n) || !pose.onSurface;
  if (spatne !== veto) {
    veto = spatne;
    PropPlacer.setVeto(spatne);
  }
  // obrys jen při změně pózy (zaokrouhleně na cm a desetinu stupně): Gizmos.set 20× za s by se jinak volalo i v klidu
  const sig = [pose.position.x, pose.position.y, pose.position.z, n[0], n[1], n[2]].map((x) => Math.round(x * 100)).join() + "," + Math.round(yawZ(pose.rotation) * 10) + (spatne ? "!" : "");
  if (sig === posledniObrys) return;
  posledniObrys = sig;
  try {
    const body = obdelnik(v3(pose.position), n, m.obrys.w, m.obrys.h, m.druh === "misto", yawZ(pose.rotation));
    Gizmos.set(OBRYS, { type: "polyline", points: body.map((p) => ({ x: p[0], y: p[1], z: p[2] })) }, { color: spatne ? CERVENA : ZELENA, width: 3, depthTest: false });
  } catch {
    // mimo rozpočet Gizmos
  }
}

function konecUmistovani(oznamit: boolean) {
  if (startTimer) clearTimeout(startTimer);
  startTimer = null;
  cekaNaStart = false;
  const m = umistuje;
  umistuje = null;
  for (const f of odhlasit) f();
  odhlasit = [];
  if (obrysTimer) clearInterval(obrysTimer);
  obrysTimer = null;
  veto = false;
  posledniObrys = "";
  try {
    Gizmos.remove(OBRYS);
  } catch {
    // nic
  }
  try {
    if (PropPlacer.isActive()) PropPlacer.end();
  } catch {
    // nic
  }
  karta.stavba(null);
  try {
    Hud.hideInfoText();
  } catch {
    // bez HUD
  }
  pozastavitPanel(false); // server teď panel vrátí
  if (oznamit && m) emit(UI.umisteno, { konec: true });
}

// Placer hry odmítne začít, dokud vstup drží jiná část modu (panel právě pouští fokus): nejdřív panel schovat,
// placer spustit až po chvíli a případně zkusit znovu. Spuštění ve stejném okamžiku jako schování panelu
// (31. 10. ve hře) placer odmítl a uvolněný vstup otevřel herní mapu.
const ODKLAD_MS = 250;
const POKUSU = 6;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let cekaNaStart = false;

function zacitUmistovani(m: UmistitMsg, pokus = 0) {
  if (pokus === 0) {
    if (umistuje) konecUmistovani(false);
    if (startTimer) clearTimeout(startTimer);
    cekaNaStart = true;
    pozastavitPanel(true);
    log(`umisťování ${m.druh}: panel schovaný, placer za ${ODKLAD_MS} ms`);
    startTimer = setTimeout(() => zacitUmistovani(m, 1), ODKLAD_MS);
    return;
  }
  startTimer = null;
  const rot = (m.rotations ?? []).map((q) => new Quaternion(q[0], q[1], q[2], q[3]));
  let ok = false;
  let chyba = "";
  try {
    ok = PropPlacer.begin({
      models: m.models,
      offsets: m.offsets?.map((o) => new Vector3(o[0], o[1], o[2])),
      rotations: rot.length ? rot : undefined,
      scale: m.scale,
      yaw: m.yaw,
      range: 14,
      keepOpen: m.znovu,
      alignToSurface: false,
      faceAwayFromPlayer: true,
      rules: { maxDistance: m.maxDalka, requireSurface: true, ...(m.druh === "stul" || m.druh === "lavice" || m.druh === "stojan" ? { maxSlope: 20 } : {}) },
    });
  } catch (e) {
    chyba = String(e); // model, který katalog hry nezná
  }
  if (!ok) {
    if (!chyba && pokus < POKUSU) {
      log(`umisťování ${m.druh}: placer pokus ${pokus} odmítl (vstup drží něco jiného?), znovu za ${ODKLAD_MS} ms`);
      startTimer = setTimeout(() => zacitUmistovani(m, pokus + 1), ODKLAD_MS);
      return;
    }
    cekaNaStart = false;
    log(`umisťování ${m.druh} nejde spustit: ${chyba || "placer hry odmítl " + pokus + "×"}`);
    try {
      Hud.showNotification(tk("client.place.cannotStart"));
    } catch {
      // bez HUD
    }
    pozastavitPanel(false);
    emit(UI.umisteno, { konec: true });
    return;
  }
  cekaNaStart = false;
  log(`umisťování ${m.druh}: placer běží (pokus ${pokus})`);
  umistuje = m;
  odhlasit.push(
    PropPlacer.on("confirm", (pose) => {
      if (!pose || !umistuje) return;
      const x: UmistenoMsg = { druh: m.druh as UmistenoMsg["druh"], ...(m.presun ? { presun: m.presun } : {}), pos: v3(pose.position), n: v3(pose.normal), yaw: Math.round(yawZ(pose.rotation) * 10) / 10 };
      emit(UI.umisteno, x);
      if (m.znovu) karta.stavba({ nazev: m.nazev, postaveno: ++postaveno, znovu: true });
    }),
    PropPlacer.on("rejected", () => {
      try {
        Hud.showNotification(tk(m.druh === "zed" ? "client.place.needWall" : m.druh === "misto" ? "client.place.needDesk" : "client.place.cannotHere"));
      } catch {
        // bez HUD
      }
    }),
    PropPlacer.on("end", () => konecUmistovani(true)),
  );
  if (m.obrys) obrysTimer = setInterval(kreslitObrys, 50);
  postaveno = 0;
  karta.stavba({ nazev: m.nazev, postaveno: 0, znovu: m.znovu });
  if (kartaAktivni()) return; // klávesy ukáže karta
  try {
    Hud.showInfoText(tk(m.znovu ? "client.place.hintRepeat" : "client.place.hint", { name: m.nazev }), 3600000);
  } catch {
    // bez HUD
  }
}

Events.on(UI.umistit, (m: unknown) => {
  const x = asObject(m) as UmistitMsg | null;
  if (!x || !x.druh) return konecUmistovani(false);
  zacitUmistovani(x);
});

Events.on("resourceStop", (name: string) => {
  if (name !== "skola") return;
  konecUmistovani(false);
});
