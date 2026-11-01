// Škola - klientská část: panel školy (/skola, src/panel.ts: web view a umisťování vybavení), sklonit se nad
// čítanku (/skola cist), čtení přes list, prst, značka prstu u učitele. Škola si nebere žádné klávesy (L i J
// kolidovaly s jinými moduly, L s loutnou): všechno je na příkazech s našeptáváním v konzoli Správy.
//
// Čtení: kamera plynule přeletí nad list na stole (Camera.setShot, jako prohlížení kreseb) a přes list se položí
// obrazovka Scaleform: podklad listu, obrázek stránky a text stránky ručním písmem (shared/pismo.ts), přefiltrovaný
// podle gramotnosti tohohle hráče (shared/citelnost.ts). Dva studenti na stejném listu vidí každý něco jiného.
// Panel a karta hodiny jsou vyměnitelné UI (src/ui-api.ts, src/ui-jadro.ts; výchozí resource skola-ui).
// Zvednout hlavu: Esc, W/A/S/D, tlačítko Zavřít nebo /skola cist. Když učitel řekl „čti“, kurzor je prst: poloha na listu jde serveru
// (~10× za s) a s ní index slova pod prstem; učitel vidí značku na listu (Gizmos) a skutečné slovo v infotextu.

import { decode, type Drawing } from "../../../kresby/kcdc/src/shared/codec";
import { axes, sheetPoint, slotCenter, slots, viewPoint, type Face, type V3 } from "../../../kresby/kcdc/src/shared/layout";
import { drawingOps } from "../../../kresby/kcdc/src/shared/vector";
import { Painter, Pen, cursor, drawPaper, probe, text, waitReady } from "../../../kresby/kcdc/src/client/native";
import { PRAVIDLA, filtr, stav, type Pravidla } from "./shared/citelnost";
import { slovoNa, type Slovo } from "./shared/pismo";
import { listCteni } from "./sazba";
import { EV, type CteniMsg, type ListFace, type OkoliMsg, type PrstMsg, type ProfilMsg, type XpMsg } from "./shared/protocol";
import { karta, kartaAktivni, obnovitKartu, otevritPanel, pozastavitPanel, setUi, tk } from "./ui-jadro";
import "./umistovani";

const log = (t: string) => console.log("[skola] " + t);
const GLIDE = 650;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parse = <T>(m: unknown): T => (typeof m === "string" ? JSON.parse(m) : m) as T;
const emit = (ev: string, m: unknown = {}) => {
  try {
    Events.emitServer(ev, m as any);
  } catch (e) {
    log(`${ev}: ${String(e)}`);
  }
};

let profil: { xp: number; pravidla: Pravidla } = { xp: 0, pravidla: { ...PRAVIDLA } };
let infotext: string | null = null;

Events.on(EV.profil, (m: unknown) => {
  const p = parse<ProfilMsg>(m);
  if (p && typeof p.xp === "number") profil = { xp: p.xp, pravidla: { ...PRAVIDLA, ...p.pravidla } };
});

Events.on(EV.info, (m: unknown) => {
  const t = parse<{ text: string }>(m)?.text;
  if (!t) return;
  try {
    Hud.showNotification(t);
  } catch {
    // bez HUD
  }
});

Events.on(EV.stav, (m: unknown) => {
  infotext = parse<{ text: string | null }>(m)?.text ?? null;
  ukazInfotext(true);
});

// infotext hry: stav hodiny + nápověda kláves u stolu a tabule (při čtení má infotext čtení)
let napoveda = "";
let ukazano: string | null = null;
let ukazanoKdy = 0;
function ukazInfotext(hned = false) {
  if (cteni) return;
  karta.klavesy(napoveda);
  // karta hodiny ukazuje stav hodiny i klávesy sama: infotext by opakoval totéž
  const t = kartaAktivni() ? "" : [infotext, napoveda].filter(Boolean).join(String.fromCharCode(10));
  if (!hned && t === ukazano && Date.now() - ukazanoKdy < 60000) return;
  ukazano = t;
  ukazanoKdy = Date.now();
  try {
    if (t) Hud.showInfoText(t, 3600000);
    else Hud.hideInfoText();
  } catch {
    // bez HUD
  }
}

Events.on(EV.xp, (m: unknown) => {
  const x = parse<XpMsg>(m);
  profil.xp = x.xp;
});

// ---------------------------------------------------------------------------
// čtení nad listem

const nad = (m: { x: number; y: number }, b?: { x: number; y: number; w: number; h: number }) => !!b && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
const faceOf = (l: ListFace): Face => ({ pos: l.pos, n: l.n, w: l.w, h: l.h, cols: 1, rows: 1 });
const v3 = (p: V3) => new Vector3(p[0], p[1], p[2]);

interface Cteni {
  msg: CteniMsg;
  screen: NativeScreen | null;
  painter: Painter | null;
  timer: ReturnType<typeof setInterval> | null;
  keys: [string, () => void][];
  slova: Slovo[];
  prst: boolean;
  zavrit?: { x: number; y: number; w: number; h: number }; // tlačítko Zavřít v souřadnicích listu (px 768 × 512)
  mys?: { x: number; y: number }; // poslední poloha kurzoru na listu (i mimo list)
  kurzor: boolean; // drží Controls.showCursor (vrátit při konci)
  bezFokusu: number; // kolik ticků (50 ms) obrazovka nemá fokus
  otevreno: number; // kdy se překryv otevřel (klávesa, kterou se čtení otevřelo, ho nezavře)
  konec: () => void;
}

let cteni: Cteni | null = null;

function sheetRect(screen: NativeScreen, st: { width: number; height: number }, f: Face) {
  const fallback = () => {
    const w = Math.min(st.width * 0.7, ((st.height * 0.7) / 2) * 3);
    return { x: (st.width - w) / 2, y: st.height * 0.12, w, h: (w / 3) * 2 };
  };
  try {
    const s = slots(f)[0];
    const ax = axes(f.n);
    const a = sheetPoint(f, s, ax, 0, 0, 0);
    const b = sheetPoint(f, s, ax, 768, 512, 0);
    const size = Web.getScreenSize();
    const pa = Hud.worldToScreen(v3(a));
    const pb = Hud.worldToScreen(v3(b));
    if (!pa || !pb || !pa.onScreen || !pb.onScreen) return fallback();
    const sa = screen.screenToStage(pa.x / size.width, pa.y / size.height);
    const sb = screen.screenToStage(pb.x / size.width, pb.y / size.height);
    if (!sa || !sb) return fallback();
    const w = sb.x - sa.x;
    const h = sb.y - sa.y;
    if (w < st.width * 0.25 || h <= 0 || Math.abs(w / h - 1.5) > 0.3) return fallback();
    return { x: sa.x, y: sa.y, w, h };
  } catch {
    return fallback();
  }
}

/** obsah listu: kontrola = písanka žáka, jinak čítanka (text přefiltrovaný gramotností tohohle hráče) */
function obsah(m: CteniMsg): { d: Drawing; slova: Slovo[] } {
  if (m.mod === "kontrola" && m.kresba) {
    const d = decode(m.kresba, 16);
    return { d: d ?? { paper: m.papir, inks: [], strokes: [] }, slova: [] };
  }
  const t = m.filtr ? filtr(m.text, stav(profil.xp, profil.pravidla), { seed: m.seed }) : m.text.replace(/\{\/?lat\}/g, "");
  return listCteni(t, m.seed, m.papir, m.obrazek);
}

async function otevritPres(c: Cteni): Promise<boolean> {
  let screen: NativeScreen;
  try {
    screen = NativeUI.createScreen();
  } catch {
    return false;
  }
  c.screen = screen;
  const ok = (await waitReady(screen)) && !!screen.root && probe(screen.root);
  if (cteni !== c) {
    // čtení mezitím skončilo nebo se otevřelo znovu: tahle obrazovka už nikomu nepatří
    try {
      screen.close();
    } catch {
      // zavřená
    }
    return false;
  }
  if (!ok || !screen.root) return false;
  const root = screen.root;
  const st = screen.stage() ?? { width: 1920, height: 1080 };
  const r = sheetRect(screen, st, faceOf(c.msg.list));
  const sheet = root.createClip()!;
  sheet.set({ x: r.x, y: r.y, scaleX: r.w / 768, scaleY: r.h / 512 });
  drawPaper(new Pen(sheet.createClip()!), c.msg.papir);
  const ink = sheet.createClip()!;
  const o = obsah(c.msg);
  c.slova = o.slova;
  c.painter = new Painter(new Pen(ink), c.msg.papir, 2500);
  c.painter.reset(drawingOps(o.d));
  const tt = text(root, r.x, r.y - st.height * 0.07, r.w, st.height * 0.06, c.msg.titulek, 30, 0xf0e2c0, "Manuscript");
  tt?.setTextStyle({ align: "center" });
  if (c.msg.pozn) text(root, r.x, r.y + r.h + 6, r.w, 30, c.msg.pozn, 18, 0xd8c8a0)?.setTextStyle({ align: "center" });
  // Zavřít: vpravo nad listem; klik (kcdc_ui_accept s prstem nad tlačítkem) nebo Esc (kcdc_ui_back)
  const zavrit = { x: r.x + r.w - 150, y: r.y - st.height * 0.06, w: 150, h: st.height * 0.045 };
  text(root, zavrit.x, zavrit.y, zavrit.w, zavrit.h, tk("client.read.close"), 22, 0xf0e2c0)?.setTextStyle({ align: "right" });
  c.zavrit = { x: (zavrit.x - r.x) / (r.w / 768), y: (zavrit.y - r.y) / (r.h / 512), w: zavrit.w / (r.w / 768), h: zavrit.h / (r.h / 512) };
  c.otevreno = Date.now();
  screen.on("input", (action: string, mode?: unknown) => {
    if (mode === "release" || mode === "up") return; // jen stisk (KCDC posílá i druh aktivace)
    if (action === "kcdc_ui_back") zvednout(true);
    // klik na Zavřít; ne hned po otevření (klávesa „použít“, kterou se čtení otevřelo z nápovědy u stolu)
    if (action === "kcdc_ui_accept" && Date.now() - c.otevreno > 400 && c.mys && nad(c.mys, c.zavrit)) zvednout(true);
  });
  zapnoutPrst(c, sheet); // kurzor, když obrazovka drží fokus (tlačítko Zavřít); prst se kreslí a posílá jen při čtení nahlas
  return true;
}

// Fokus obrazovky čtení. Esc musí jít vždycky: s fokusem ho hra pošle obrazovce (kcdc_ui_back), bez fokusu
// Key.bind("escape"). Key.bind ale hra nepustí, dokud je vidět kurzor UI (bere ho jako UI se vstupem). Když fokus
// nejde vzít (otevřená konzole Správy, chat, jiné UI s vyšší prioritou), kurzor se proto schová, ať Esc a W/A/S/D
// přes Key.bind fungují; fokus se zkouší znovu a s ním se kurzor vrátí. (Hráči nešlo čtení zavřít Esc, 1. 11. 2026.)
const BEZ_FOKUSU_TICKU = 6; // 300 ms bez fokusu = kurzor pryč

function hlidatFokus(c: Cteni) {
  const s = c.screen;
  if (!s) return;
  let ma = false;
  try {
    ma = s.hasFocus();
  } catch {
    ma = false;
  }
  if (!ma && c.bezFokusu % 4 === 0) {
    try {
      ma = s.focus();
    } catch {
      ma = false;
    }
  }
  if (ma) {
    c.bezFokusu = 0;
    if (!c.kurzor) {
      cursor(true);
      c.kurzor = true;
    }
    return;
  }
  c.bezFokusu++;
  if (c.kurzor && c.bezFokusu >= BEZ_FOKUSU_TICKU) {
    cursor(false);
    c.kurzor = false;
    log("čtení: obrazovka nemá fokus, kurzor schovaný (Esc a pohyb přes klávesy hry)");
  }
}

function zapnoutPrst(c: Cteni, sheet: NativeClip) {
  const fing = sheet.createClip()!;
  const pen = new Pen(fing);
  let lx = -1;
  let ly = -1;
  let lw = -2;
  let last = 0;
  let fokus = false;
  try {
    fokus = !!c.screen?.focus();
  } catch {
    fokus = false;
  }
  if (fokus) {
    cursor(true);
    c.kurzor = true;
  } else log("čtení: obrazovka nedostala fokus, Esc přes klávesy hry");
  c.timer = setInterval(() => {
    hlidatFokus(c);
    const mx = Number(sheet.get("_xmouse"));
    const my = Number(sheet.get("_ymouse"));
    if (!Number.isFinite(mx) || !Number.isFinite(my)) return;
    c.mys = { x: mx, y: my };
    if (!c.prst) return;
    const x = Math.max(0, Math.min(767, Math.round(mx)));
    const y = Math.max(0, Math.min(511, Math.round(my)));
    // prst: kruh pod kurzorem (bříško), kreslí se lokálně hned
    if (x !== lx || y !== ly) {
      pen.clear();
      pen.circle(x, y + 10, 11, 0xc89a78, 55);
      pen.circle(x, y + 10, 4, 0x8a5a3c, 60);
    }
    const w = slovoNa(c.slova, x, y, 10);
    const t = Date.now();
    if ((x !== lx || y !== ly || w !== lw) && t - last >= 100) {
      last = t;
      lx = x;
      ly = y;
      lw = w;
      emit(EV.prst, { x, y, w });
    }
  }, 50);
}

async function otevritCteni(m: CteniMsg) {
  zvednout(false);
  const f = faceOf(m.list);
  const pose = Camera.getPose();
  const s = slots(f)[0];
  const at = slotCenter(f, s);
  const kolmo = viewPoint(f, s, pose?.fov || 55, pose?.aspectRatio || 16 / 9, 0.7);
  // nad list, ale ne svisle shora (kamera by neměla jasný směr nahoru): o 18° ke studentovi, jako hlava nad stolem
  const d = Math.hypot(kolmo[0] - at[0], kolmo[1] - at[1], kolmo[2] - at[2]);
  const v = axes(f.n).v; // „nahoru po listu“ = od studenta
  const k = Math.sin((18 * Math.PI) / 180);
  const c0 = Math.cos((18 * Math.PI) / 180);
  const eye: V3 = [at[0] + (f.n[0] * c0 - v[0] * k) * d, at[1] + (f.n[1] * c0 - v[1] * k) * d, at[2] + (f.n[2] * c0 - v[2] * k) * d];
  try {
    Camera.setShot({ position: v3(eye), lookAt: v3(at), duration: GLIDE });
  } catch (e) {
    log("kamera: " + String(e));
    return;
  }
  try {
    Controls.disable();
  } catch {
    // starší klient
  }
  pozastavitPanel(true, "cteni"); // panel školy by držel fokus (Esc by zavřel panel, ne čtení)
  const c: Cteni = { msg: m, screen: null, painter: null, timer: null, keys: [], slova: [], prst: m.prst, kurzor: false, bezFokusu: 0, otevreno: Date.now(), konec: () => {} };
  cteni = c;
  // Esc hned (i během přeletu kamery), pohyb až po přeletu (držené W od chůze ke stolu by čtení hned zavřelo);
  // obrazovka s fokusem pak dostane Esc jako kcdc_ui_back
  const ven = () => zvednout(true);
  const svazat = (k: string) => {
    try {
      Key.bind(k, "down", ven);
      c.keys.push([k, ven]);
    } catch {
      // neznámá klávesa
    }
  };
  svazat("escape");
  await sleep(GLIDE);
  if (cteni !== c) return;
  for (const k of ["w", "a", "s", "d"]) svazat(k);
  if (!(await otevritPres(c)) && cteni === c) log("obrazovka Scaleform nejde otevřít: čte se jen list ve světě");
  if (cteni !== c) return;
  try {
    Hud.showInfoText(tk(m.prst ? "client.read.hintFinger" : "client.read.hint", { cmd: "/skola cist" }), 3600000);
  } catch {
    // bez HUD
  }
}

/** zvednout hlavu: pryč s překryvem, kamera plynule zpět, ovládání až po dojezdu */
function zvednout(serveru: boolean) {
  const c = cteni;
  if (!c) return;
  cteni = null;
  pozastavitPanel(false, "cteni");
  if (c.timer) clearInterval(c.timer);
  for (const [k, f] of c.keys) {
    try {
      Key.unbind(k, "down", f);
    } catch {
      // nic
    }
  }
  c.painter?.stop();
  if (c.kurzor) cursor(false); // kurzor drží zapnoutPrst / hlidatFokus, jen když obrazovka má fokus
  c.kurzor = false;
  try {
    c.screen?.blur();
    c.screen?.close();
  } catch {
    // zavřená
  }
  try {
    Camera.clearShot(GLIDE);
  } catch {
    // nic
  }
  setTimeout(() => {
    try {
      Controls.enable();
    } catch {
      // nic
    }
  }, GLIDE);
  ukazInfotext(true);
  if (serveru) emit(EV.zvednout);
}

Events.on(EV.cist, (m: unknown) => void otevritCteni(parse<CteniMsg>(m)).catch((e) => log("čtení: " + String(e))));
Events.on(EV.prestat, () => zvednout(false));
Events.on(EV.prstMod, (m: unknown) => {
  const on = !!parse<{ on: boolean }>(m)?.on;
  if (cteni && cteni.msg.mod === "cteni" && cteni.prst !== on) void otevritCteni({ ...cteni.msg, prst: on });
});

// ---------------------------------------------------------------------------
// učitel: kde má student prst

const znacky = new Map<number, string>();

Events.on(EV.prstUcitel, (raw: unknown) => {
  const m = parse<PrstMsg>(raw);
  const id = "prst" + m.pid;
  if (m.konec) {
    try {
      Gizmos.remove(id);
    } catch {
      // nic
    }
    znacky.delete(m.pid);
    karta.prst(null);
    ukazInfotext(true);
    return;
  }
  const f = faceOf(m.list);
  const s = slots(f)[0];
  const ax = axes(f.n);
  const pts: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const p = sheetPoint(f, s, ax, m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 14, 0.01);
    pts.push({ x: p[0], y: p[1], z: p[2] });
  }
  try {
    Gizmos.set(id, { type: "polyline", points: pts, closed: true }, { color: 0xffe8b25a, width: 3, depthTest: false });
    znacky.set(m.pid, id);
  } catch (e) {
    log("značka prstu: " + String(e));
  }
  const text = !m.slovo
    ? tk("client.finger.between", { name: m.jmeno })
    : m.vidi && m.vidi !== m.slovo
      ? tk("client.finger.wordSees", { name: m.jmeno, word: m.slovo, sees: m.vidi })
      : tk("client.finger.word", { name: m.jmeno, word: m.slovo });
  karta.prst(text);
  if (kartaAktivni()) return;
  try {
    Hud.showInfoText(text, 3600000);
  } catch {
    // nic
  }
});

// ---------------------------------------------------------------------------
// nápověda u stolu a u tabule: který příkaz tady jde (karta hodiny, jinak infotext hry). Žádné klávesy ani nativní
// nápověda akce: na klávese „použít“ by se bila s herním „vstát“ z lavice, vlastní klávesy s jinými moduly.

let okoli: OkoliMsg = { dosah: 1.6, tridy: [] };

Events.on(EV.okoli, (m: unknown) => {
  const o = parse<OkoliMsg>(m);
  if (o && Array.isArray(o.tridy)) okoli = o;
});

function mojePoloha(): V3 | null {
  try {
    const p = LocalPlayer?.position;
    if (p) return [p.x, p.y, p.z];
  } catch {
    // starší klient
  }
  const c = Camera.getPose()?.position;
  return c ? [c.x, c.y, c.z - 1.6] : null;
}

const vzd = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Nativní nápověda akce hry (jako kostky v gamemode KCDC): u místa u stolu „Číst čítanku“ na primary_action,
// „Škola“ (panel) na chat_focus_follow_init - KCDC ho pro skripty nahradí, dokud nápověda svítí. Bez nápovědy hry
// (starší klient) příkazy v kartě hodiny / infotextu.
const KLIC_CIST = "primary_action";
const KLIC_PANEL = "chat_focus_follow_init";
interface Napoveda {
  cist: boolean; // u místa u stolu
  panel: string | null; // text tlačítka panelu, null = není u třídy
  zadani: boolean;
}
const hinty = new Map<string, { id: number; text: string; akce: () => void }>();

/** co tady jde: u místa u stolu čítanka (a písanka, když je zadaná), u tabule panel školy */
function coTady(): Napoveda | null {
  const pos = mojePoloha();
  if (!pos || cteni) return null;
  try {
    if (Hud.isInDialogue()) return null;
  } catch {
    // starší klient
  }
  let best: { d: number; zadani: boolean } | null = null;
  for (const t of okoli.tridy) for (const m of t.mista) {
    const d = vzd(pos, m);
    if (d <= okoli.dosah && (!best || d < best.d)) best = { d, zadani: t.zadani };
  }
  if (best) return { cist: true, panel: best.zadani ? "write" : "school", zadani: best.zadani };
  for (const t of okoli.tridy) {
    if (t.tabule && vzd(pos, t.tabule) <= 2.6) return { cist: false, panel: t.moje ? "board" : "school", zadani: false };
  }
  return null;
}

/** jedna nápověda hry na klávese (null = pryč); false = hra tu klávesu u nápovědy nemá */
function hint(klic: string, text: string | null, akce: () => void): boolean {
  const h = hinty.get(klic);
  if (!text) {
    if (h) {
      try {
        ActionHint.remove(h.id);
      } catch {
        // už není
      }
      hinty.delete(klic);
    }
    return true;
  }
  try {
    if (!ActionHint.keys().includes(klic)) return false;
    if (!h) hinty.set(klic, { id: ActionHint.create({ key: klic, text }, () => hinty.get(klic)?.akce()), text, akce });
    else {
      h.akce = akce;
      if (h.text !== text && ActionHint.setText(h.id, text)) h.text = text;
    }
    return true;
  } catch {
    return false;
  }
}

function hlidatNapovedu() {
  // otevřel se herní dialog nebo nabídka jiného modulu: zvednout hlavu, ať čtení nedrží kameru a ovládání
  try {
    if (cteni && Hud.isInDialogue()) zvednout(true);
  } catch {
    // starší klient
  }
  const co = coTady();
  const cist = hint(KLIC_CIST, co?.cist ? tk("client.hint.read") : null, () => emit(EV.sklonit));
  const panel = hint(KLIC_PANEL, co?.panel ? tk("client.hint.panel." + co.panel) : null, () => otevritPanel());
  // záloha bez nápovědy hry: příkazy
  const zaloha: string[] = [];
  if (co?.cist && !cist) zaloha.push(tk("client.fallback.read"));
  if (co?.panel && !panel) zaloha.push(co.cist ? (co.zadani ? tk("client.fallback.write") : "") : tk(co.panel === "school" ? "client.fallback.school" : "client.fallback.board"));
  napoveda = zaloha.filter(Boolean).join(" · ");
  ukazInfotext();
  obnovitKartu(); // dialog, čtení: karta se schová a zase ukáže
}
setInterval(hlidatNapovedu, 250);

// ---------------------------------------------------------------------------
// kresby: název kresby v nápovědě akce („Prohlédnout …“) podle gramotnosti tohohle hráče

function napojitKresby(pokusy = 10) {
  let f: unknown = null;
  try {
    f = Exports.get("kresby", "setCaptionFilter");
  } catch {
    // kresby neběží
  }
  if (typeof f === "function") return void f((text: string, seed: string) => filtr(text, stav(profil.xp, profil.pravidla), { seed }), "skola");
  if (pokusy > 0) setTimeout(() => napojitKresby(pokusy - 1), 300);
}
napojitKresby();
Events.on("resourceStart", (name: string) => void (name === "kresby" && napojitKresby()));

// ---------------------------------------------------------------------------
// start

karta.cteni(() => !!cteni);

// API pro jiné klientské resources: vlastní UI (src/ui-api.ts, docs/ADAPTING.md), stav čtení
Exports.register("setUi", setUi);
Exports.register("isReading", () => !!cteni);
Exports.register("stopReading", () => zvednout(true));

Events.on("resourceStop", (name: string) => {
  if (name !== "skola") return;
  zvednout(false);
  for (const k of [...hinty.keys()]) hint(k, null, () => undefined);
  napoveda = "";
  infotext = null;
  ukazInfotext(true);
  for (const id of znacky.values()) {
    try {
      Gizmos.remove(id);
    } catch {
      // nic
    }
  }
});
