// Škola - jádro UI v klientu: jazyk klienta, registr UI (export setUi), přenos panelu mezi serverem a UI a skládání
// karty hodiny. Samotné UI (web view panelu a karty) je vyměnitelné: výchozí je modul src/vychozi-ui/ přibalený ve
// škole, jiný resource ho nahradí exportem setUi, server ho vypne SKOLA_CONFIG.ui = false. Smlouva v src/ui-api.ts.
// Bez UI: panel = nativní nabídka (server, web:false), karta = infotext hry (client.ts).

import { KARTA, UI, type KartaMsg, type KartaUkaz, type UiView } from "./shared/ui";
import { EV, type JazykMsg, type KonfigMsg } from "./shared/protocol";
import { ZDROJ, kodJazyka, oblast, pridatPreklady, t, type Parametry, type Slovnik } from "./shared/i18n";
import csKlient from "./lang/cs-klient";
import enKlient from "./lang/en-klient";
import { VERZE_UI, type KartaBackend, type PanelBackend, type SkolaUi, type SkolaUiApi } from "./ui-api";

const log = (x: string) => console.log("[skola] " + x);
const emit = (ev: string, m: unknown = {}) => {
  try {
    Events.emitServer(ev, m as any);
  } catch (e) {
    log(`${ev}: ${String(e)}`);
  }
};
const parse = (m: unknown): any => {
  if (typeof m === "string")
    try {
      return JSON.parse(m);
    } catch {
      return null;
    }
  return m && typeof m === "object" ? m : null;
};

// ---------------------------------------------------------------------------
// jazyk klienta: vestavěné texty klienta (cs, en) + co pošle server (jazyk hráče, jazyky přidané serverem)

pridatPreklady("cs", csKlient);
pridatPreklady("en", enKlient);
let jazykKlienta = ZDROJ;
let vychozi = ZDROJ;
const naJazyk: ((j: string) => void)[] = [];

/** text klienta v jazyce hráče */
export const tk = (klic: string, a?: Parametry) => t(jazykKlienta, klic, a, vychozi);

Events.on(EV.jazyk, (m: unknown) => {
  const x = parse(m) as JazykMsg | null;
  if (!x || typeof x.jazyk !== "string") return;
  jazykKlienta = kodJazyka(x.jazyk) || ZDROJ;
  vychozi = kodJazyka(x.vychozi) || ZDROJ;
  if (x.texty && typeof x.texty === "object") pridatPreklady(jazykKlienta, x.texty);
  for (const cb of naJazyk) {
    try {
      cb(jazykKlienta);
    } catch (e) {
      log("UI při změně jazyka: " + String(e));
    }
  }
  obnovitKartu(true);
});

// ---------------------------------------------------------------------------
// registr UI

const ui: SkolaUi & { owner: string | null } = { panel: null, karta: null, owner: null };
let posledniSeq = 0;
let ukazany = false; // panel je vidět
let zavrenoKdy = 0; // hráč panel zavřel: pohled, který byl zrovna na cestě, ho znovu neotevře
let cekajici: UiView | null = null;
const duvodyPauzy = new Set<string>(); // "stavba", "cteni": panel se neukazuje (pohled ze serveru jen počká)
let pozastaveno = false;

const api: SkolaUiApi = {
  verze: VERZE_UI,
  akce: (id, hodnota) => {
    if (typeof id !== "string" || !id) return;
    emit(UI.akce, { seq: posledniSeq, id: id.slice(0, 80), ...(typeof hodnota === "string" ? { hodnota: hodnota.slice(0, 2000) } : {}) });
  },
  zavreno: () => {
    zavrenoKdy = Date.now();
    schovatPanel();
    emit(UI.pryc);
  },
  otevrit: () => otevritPanel(),
  nativni: () => {
    ukazany = false;
    emit(UI.otevrit, { web: false });
  },
  pripraveno: () => emit(UI.hello),
  t: (k, a) => tk(k, a),
  texty: (predpony: string[]): Slovnik => oblast(jazykKlienta, predpony, vychozi),
  jazyk: () => jazykKlienta,
  naJazyk: (cb) => void (typeof cb === "function" && naJazyk.push(cb)),
};

function odpojit(b: PanelBackend | KartaBackend | null) {
  try {
    b?.odpojit?.();
  } catch (e) {
    log("odpojení UI: " + String(e));
  }
}

/** export setUi: vyměnit panel a/nebo kartu (null = žádné, jádro použije zálohu); owner = resource UI */
export function setUi(x: Partial<SkolaUi> | null, owner: string): boolean {
  if (!x || typeof x !== "object") return false;
  if (ui.owner && owner !== ui.owner) {
    log(`UI ${ui.owner} nahrazeno UI ${owner}`);
    naJazyk.length = 0; // posluchači jazyka patřili starému UI
  }
  if ("panel" in x) {
    if (ui.panel !== x.panel) {
      if (ukazany) schovatPanel();
      odpojit(ui.panel);
    }
    ui.panel = x.panel ?? null;
    ui.panel?.pripojit?.(api);
  }
  if ("karta" in x) {
    if (ui.karta !== x.karta) odpojit(ui.karta);
    ui.karta = x.karta ?? null;
    ui.karta?.pripojit?.(api);
    poslanoKarte = "";
  }
  ui.owner = ui.panel || ui.karta ? owner || "?" : null;
  log(`UI: panel ${ui.panel ? "ano" : "ne (nativní nabídka)"}, karta ${ui.karta ? "ano" : "ne (infotext)"}${ui.owner ? " od " + ui.owner : ""}`);
  obnovitKartu(true);
  return true;
}

export const maPanel = () => !!ui.panel;

// výchozí UI (src/vychozi-ui/, přibalené ve škole): platí, dokud ho nevymění jiný resource (setUi) nebo ho server
// nevypne (SKOLA_CONFIG.ui = false -> EV.konfig). Když cizí UI skončí, vrátí se výchozí (nebo záloha bez UI).
const VLASTNI = "skola";
let vychoziUi: SkolaUi | null = null;
let vychoziPovoleno = true;

function pouzitVychozi() {
  setUi(vychoziPovoleno && vychoziUi ? vychoziUi : { panel: null, karta: null }, VLASTNI);
}

/** client.ts: výchozí UI školy; použije se hned, pokud zrovna neplatí cizí */
export function nastavitVychoziUi(x: SkolaUi) {
  vychoziUi = x;
  if (!ui.owner || ui.owner === VLASTNI) pouzitVychozi();
}

Events.on(EV.konfig, (m: unknown) => {
  const x = parse(m) as KonfigMsg | null;
  if (!x) return;
  const pred = vychoziPovoleno;
  vychoziPovoleno = x.ui !== false;
  if (pred !== vychoziPovoleno && (!ui.owner || ui.owner === VLASTNI)) pouzitVychozi();
});

Events.on("resourceStop", (name: string) => {
  if (name === "skola") {
    schovatPanel();
    odpojit(ui.panel);
    odpojit(ui.karta);
    return;
  }
  if (name !== ui.owner) return;
  log(`UI ${name} skončilo: ${vychoziPovoleno && vychoziUi ? "zpět výchozí UI školy" : "záloha jádra"}`);
  naJazyk.length = 0;
  pouzitVychozi();
});

// ---------------------------------------------------------------------------
// panel: pohled ze serveru do UI, akce z UI na server

function ukazatPanel(v: UiView): boolean {
  const p = ui.panel;
  if (!p) return false;
  try {
    if (!p.ukazat(v)) return false;
  } catch (e) {
    log("panel UI: " + String(e));
    return false;
  }
  if (!ukazany) {
    ukazany = true;
    obnovitKartu();
  }
  return true;
}

export function schovatPanel() {
  if (!ukazany) return;
  ukazany = false;
  try {
    ui.panel?.schovat();
  } catch (e) {
    log("panel UI schovat: " + String(e));
  }
  obnovitKartu();
}

Events.on(UI.stav, (m: unknown) => {
  const v = parse(m) as UiView | null;
  if (!v || !v.obrazovka) return;
  if (!ui.panel) return emit(UI.otevrit, { web: false }); // bez UI: nativní nabídka serveru
  if (!ukazany && Date.now() - zavrenoKdy < 1500) return;
  posledniSeq = Number(v.seq) || 0;
  cekajici = v;
  if (pozastaveno) return;
  if (!ukazatPanel(v)) emit(UI.otevrit, { web: false });
});
Events.on(UI.zavrit, () => {
  cekajici = null;
  schovatPanel();
});

/** otevřít panel (příkaz /skola přes server, nápověda akce u tabule) */
export function otevritPanel() {
  if (pozastaveno) return;
  zavrenoKdy = 0;
  const p = ui.panel;
  emit(UI.otevrit, { web: !!p });
  // UI se ještě nenahrálo (web view bez hello): nativní nabídka, ať příkaz vždycky něco ukáže
  if (p && p.pripraveny && !p.pripraveny()) setTimeout(() => void (ui.panel === p && !p.pripraveny?.() && emit(UI.otevrit, { web: false })), 4000);
}

/** stavba vybavení (umistovani.ts) nebo čtení nad listem (client.ts): panel ustoupí a do konce se neukáže.
 *  Stavba: server pak pošle pohled znovu. Čtení: panel se zavře i pro server (jinak by ho obnova hodiny po 5 s
 *  ukázala přes čtení a vzala čtení fokus, Esc by pak zavřel panel, ne čtení). */
export function pozastavitPanel(ano: boolean, duvod: "stavba" | "cteni" = "stavba") {
  if (ano) {
    duvodyPauzy.add(duvod);
    if (duvod === "cteni" && ukazany) api.zavreno();
    else schovatPanel();
  } else {
    duvodyPauzy.delete(duvod);
    if (duvod === "stavba") zavrenoKdy = 0;
  }
  pozastaveno = duvodyPauzy.size > 0;
}

export const panelUkazany = () => ukazany;

// ---------------------------------------------------------------------------
// karta hodiny: stav ze serveru + živé věci z klienta; UI ji kreslí, jádro rozhoduje, kdy smí být vidět

let server: KartaMsg | null = null;
let prst: string | null = null;
let stavba: KartaUkaz["stavba"] = null;
let klavesy = "";
let cte: () => boolean = () => false;
let poslanoKarte = "";

const nastaveniKarty = () => server?.nastaveni ?? { zapnuto: true, strana: "vpravo" as const, vyska: 22 };

function obsahKarty(): KartaUkaz | null {
  if (!nastaveniKarty().zapnuto) return null;
  const hodina = server?.hodina ?? null;
  if (!hodina && !stavba) return null;
  return { hodina, prst: hodina?.role === "ucitel" ? prst : null, stavba, klavesy };
}

function vDialogu(): boolean {
  try {
    return Hud.isInDialogue();
  } catch {
    return false;
  }
}

/** karta stav ukazuje (nebo by ukázala, kdyby ji neschoval panel / čtení): infotext pak nemá opakovat totéž */
export function kartaAktivni(): boolean {
  try {
    return !!ui.karta && ui.karta.aktivni() && obsahKarty() !== null;
  } catch {
    return false;
  }
}

/** přepočítat kartu (po změně a po 250 ms z hlídání nápovědy v client.ts) */
export function obnovitKartu(vynutit = false) {
  const k = ui.karta;
  if (!k) return;
  const stav = { ukaz: obsahKarty(), videt: !ukazany && !cte() && !vDialogu(), nastaveni: nastaveniKarty() };
  const sig = JSON.stringify(stav);
  if (!vynutit && sig === poslanoKarte) return;
  poslanoKarte = sig;
  try {
    k.ukazat(stav);
  } catch (e) {
    log("karta UI: " + String(e));
  }
}

Events.on(KARTA.stav, (m: unknown) => {
  const x = parse(m) as KartaMsg | null;
  if (!x || !x.nastaveni) return;
  server = x;
  if (!x.hodina) prst = null;
  obnovitKartu();
});

export const karta = {
  /** písař: na co ukazuje prst čtoucího žáka (null = přestal) */
  prst(text: string | null) {
    prst = text;
    obnovitKartu();
  },
  /** co se staví (null = konec stavby) */
  stavba(x: KartaUkaz["stavba"]) {
    stavba = x;
    obnovitKartu();
  },
  klavesy(text: string) {
    if (text === klavesy) return;
    klavesy = text;
    obnovitKartu();
  },
  /** jak jádro pozná, že hráč čte nad listem (karta se schová) */
  cteni(fn: () => boolean) {
    cte = fn;
  },
};
