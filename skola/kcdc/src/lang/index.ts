// Vestavěné jazyky školy. cs je zdroj pravdy (úplný), en překlad. Klíče jsou anglicky a s oblastí:
//   msg.*    oznámení a výsledky akcí (server)         view.*   texty pohledu panelu (server, UiView)
//   cmd.*    příkazy a nápověda                        admin.*  panel Správy (F10)
//   set.*    editor nastavení (F10 → Nastavení)        level.*  stupně gramotnosti a co odemkne další XP
//   client.* klient (čtení, stavba, nápověda)          page.*   stránka panelu (výchozí UI)
//   card.*   karta hodiny (výchozí UI)                 letters.* názvy (např. inkoustů)
// Klient a stránky dostanou od serveru jen oblasti client., page., card., level., letters. (EV.jazyk).
// Nový jazyk: SKOLA_CONFIG.jazyky, export addTranslations, nebo nový soubor tady (docs/ADAPTING.md, Translations).

import { pridatPreklady, type Slovnik } from "../shared/i18n";
import csServer from "./cs-server";
import enServer from "./en-server";
import csKlient from "./cs-klient";
import enKlient from "./en-klient";

export const VESTAVENE: Record<string, Slovnik> = {
  cs: { ...csServer, ...csKlient },
  en: { ...enServer, ...enKlient },
};

export function nahratVestavene() {
  for (const [j, s] of Object.entries(VESTAVENE)) pridatPreklady(j, s);
}
