// Výchozí UI školy (resource skola-ui) - panel: web view ui/index.html vpravo na obrazovce (ui-kit).
// Stránka dostane slovník page.* (skola:texty) a pohled UiView (skola:ui) a vrací id akcí (skola:uiAkce).
// Stránka se nahraje předem schovaná, ať se panel ukáže hned. Pravidla a texty pohledu má server.

import { UI, type UiView } from "../shared/ui";
import type { PanelBackend, SkolaUiApi } from "../ui-api";

const VIEW_URL = "fw://resources/skola-ui/ui/index.html";
const SIRKA = 0.36; // pravá část obrazovky, třída zůstává vidět vlevo
const MIN_SIRKA = 440;
export const TEXTY = "skola:texty"; // klient -> stránka: slovník oblasti page.* a jazyk

const log = (t: string) => console.log("[skola-ui] " + t);
const asObject = (m: unknown): any => {
  if (typeof m === "string")
    try {
      return JSON.parse(m);
    } catch {
      return null;
    }
  return m && typeof m === "object" ? m : null;
};
const maWeb = () => typeof Web !== "undefined" && !!Web;

export function vytvoritPanel(): PanelBackend {
  let api: SkolaUiApi | null = null;
  let view = -1;
  let pripravena = false; // stránka poslala hello
  let ukazany = false;
  let cekajici: UiView | null = null;
  let varovano = false;

  const geometrie = () => {
    const s = Web.getScreenSize();
    const width = Math.max(MIN_SIRKA, Math.round(s.width * SIRKA));
    return { width, height: s.height, x: s.width - width, y: 0 };
  };

  const poslatTexty = () => {
    if (view < 0 || !pripravena || !api) return;
    Web.emit(view, TEXTY, { jazyk: api.jazyk(), texty: api.texty(["page.", "level."]) });
  };

  function vytvorit(): boolean {
    if (view >= 0) return true;
    if (!maWeb()) return false;
    try {
      view = Web.createView(VIEW_URL, { ...geometrie(), zIndex: 190, visible: false });
    } catch (e) {
      if (!varovano) log("panel se nepodařilo vytvořit (zkusím znovu): " + String(e));
      varovano = true;
      return false;
    }
    Web.on(view, UI.hello, () => {
      pripravena = true;
      poslatTexty();
      if (cekajici) poslat(cekajici);
      api?.pripraveno();
    });
    Web.on(view, UI.akce, (m: unknown) => {
      const x = asObject(m);
      if (x && typeof x.id === "string") api?.akce(x.id, typeof x.hodnota === "string" ? x.hodnota : undefined);
    });
    Web.on(view, UI.pryc, () => {
      schovat();
      api?.zavreno();
    });
    return true;
  }

  /** createView hází výjimku, dokud prohlížeč hry není hotový: zkoušet znovu */
  function sView(pak: () => void, pokusy = 10) {
    if (vytvorit()) return pak();
    if (pokusy > 0) setTimeout(() => sView(pak, pokusy - 1), 500);
    else if (cekajici) api?.nativni(); // web view nejde: nativní nabídka jádra
  }

  function ukazat() {
    if (view < 0) return;
    const g = geometrie();
    Web.resizeView(view, g.width, g.height);
    Web.setViewPosition(view, g.x, g.y);
    Web.showView(view);
    Web.focusView(view, true);
    ukazany = true;
  }

  function schovat() {
    if (view < 0 || !ukazany) return;
    Web.focusView(view, false);
    Web.hideView(view);
    ukazany = false;
  }

  function poslat(v: UiView) {
    cekajici = v;
    if (!pripravena || view < 0) return;
    Web.emit(view, UI.stav, v);
    if (!ukazany) ukazat();
  }

  return {
    pripojit(a) {
      api = a;
      a.naJazyk(() => poslatTexty());
      if (maWeb()) sView(() => undefined); // stránku nahrát předem: první otevření je hned
    },
    odpojit() {
      schovat();
      api = null;
    },
    pripraveny: () => maWeb() && pripravena,
    ukazat(v) {
      if (!maWeb()) return false;
      sView(() => poslat(v));
      return true;
    },
    schovat() {
      cekajici = null;
      schovat();
    },
  };
}
