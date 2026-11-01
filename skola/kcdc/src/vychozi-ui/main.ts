// Výchozí UI školy: resource "skola-ui" (klient). Připojí se k jádru exportem skola.setUi a dodá panel (web view
// vpravo) a kartu hodiny. Vlastní UI frameworku tenhle resource nahradí: nenasadit skola-ui a zavolat setUi
// z vlastního resource (docs/ADAPTING.md). Bez jakéhokoli UI škola funguje dál (nativní nabídka, infotext).

import { vytvoritPanel } from "./panel";
import { vytvoritKartu } from "./karta";
import type { SkolaUi } from "../ui-api";

const OWNER = "skola-ui";
const log = (t: string) => console.log("[skola-ui] " + t);

const ui: SkolaUi = { panel: vytvoritPanel(), karta: vytvoritKartu() };

/** exporty školy jdou číst až chvíli po jejím startu: pár pokusů */
function pripojit(pokusy = 20) {
  let setUi: unknown = null;
  try {
    setUi = Exports.get("skola", "setUi");
  } catch {
    // škola ještě neběží
  }
  if (typeof setUi === "function") {
    if ((setUi as (u: SkolaUi, o: string) => boolean)(ui, OWNER)) log("připojeno ke škole");
    return;
  }
  if (pokusy > 0) setTimeout(() => pripojit(pokusy - 1), 300);
  else log("škola neběží nebo nemá setUi: výchozí UI se nepřipojilo");
}

pripojit();
Events.on("resourceStart", (name: string) => void (name === "skola" && pripojit()));
