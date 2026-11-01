// Výchozí UI školy (modul src/vychozi-ui/, odpojitelný: SKOLA_CONFIG.ui = false nebo setUi jiného resource) - karta
// hodiny: malý web view na kraji obrazovky (ui/karta.html), bez fokusu, takže nebere myš ani klávesy. Co ukázat a kdy smí být vidět, rozhoduje jádro (KartaStav); karta jen kreslí
// a podle výšky obsahu zmenší web view. Dokud stránka není hotová, aktivni() = false a jádro ukazuje infotext.

import { KARTA, type KartaMsg } from "../shared/ui";
import type { KartaBackend, KartaStav, SkolaUiApi } from "../ui-api";

const URL = "fw://resources/skola/ui/karta.html";
const OKRAJ = 16;
const TEXTY = "skola:texty";

const log = (t: string) => console.log("[skola] " + t);
const maWeb = () => typeof Web !== "undefined" && !!Web;

export function vytvoritKartu(): KartaBackend {
  let api: SkolaUiApi | null = null;
  let view = -1;
  let pripravena = false;
  let ukazana = false;
  let vyska = 0; // výška obsahu stránky v px
  let poslano = "";
  let pokusy = 0;
  let posledni: KartaStav | null = null;
  let nastaveni: KartaMsg["nastaveni"] = { zapnuto: true, strana: "vpravo", vyska: 22 };

  const poslatTexty = () => {
    if (view < 0 || !pripravena || !api) return;
    Web.emit(view, TEXTY, { jazyk: api.jazyk(), texty: api.texty(["card."]) });
    poslano = "";
  };

  function vytvorit(): boolean {
    if (view >= 0) return true;
    if (!maWeb() || pokusy > 20) return false;
    pokusy++;
    try {
      view = Web.createView(URL, { width: 340, height: 120, x: 0, y: 0, zIndex: 150, visible: false, focus: false });
    } catch (e) {
      if (pokusy === 1) log("karta hodiny: web view zatím nejde (zkusím znovu): " + String(e));
      return false;
    }
    Web.on(view, "skola:kartaHello", () => {
      pripravena = true;
      poslatTexty();
      if (posledni) ukazat(posledni);
    });
    Web.on(view, KARTA.vyska, (m: unknown) => {
      const h = Number(typeof m === "string" ? JSON.parse(m) : m);
      if (Number.isFinite(h) && h > 0 && Math.abs(h - vyska) > 1) {
        vyska = Math.ceil(h);
        umistit();
      }
    });
    return true;
  }

  function umistit() {
    if (view < 0) return;
    const s = Web.getScreenSize();
    const sirka = Math.round(Math.min(420, Math.max(300, s.width * 0.19)));
    const vys = Math.min(Math.round(s.height * 0.7), Math.max(60, vyska || 120));
    Web.resizeView(view, sirka, vys);
    Web.setViewPosition(view, nastaveni.strana === "vlevo" ? OKRAJ : s.width - sirka - OKRAJ, Math.round((s.height * nastaveni.vyska) / 100));
  }

  function ukazat(st: KartaStav) {
    posledni = st;
    const zmenaPolohy = st.nastaveni.strana !== nastaveni.strana || st.nastaveni.vyska !== nastaveni.vyska;
    nastaveni = st.nastaveni;
    if (!st.ukaz) {
      if (ukazana && view >= 0) Web.hideView(view);
      ukazana = false;
      return;
    }
    if (!vytvorit() || !pripravena) return;
    const sig = JSON.stringify(st.ukaz);
    if (sig !== poslano) {
      poslano = sig;
      Web.emit(view, KARTA.zobrazit, st.ukaz);
    }
    if (st.videt && !ukazana) {
      umistit();
      Web.showView(view); // bez focusView: karta fokus nikdy nemá a měnit ho by rušilo panel a placer hry
    } else if (!st.videt && ukazana) Web.hideView(view);
    else if (ukazana && zmenaPolohy) umistit();
    ukazana = st.videt;
  }

  return {
    pripojit(a) {
      api = a;
      a.naJazyk(() => {
        poslatTexty();
        if (posledni) ukazat(posledni);
      });
    },
    // stránku nahrát předem až u třídy: karta se pak ukáže hned se začátkem hodiny
    pripravit() {
      if (maWeb()) vytvorit();
    },
    odpojit() {
      if (view >= 0 && ukazana) Web.hideView(view);
      ukazana = false;
      api = null;
    },
    ukazat,
    aktivni: () => maWeb() && pripravena,
  };
}
