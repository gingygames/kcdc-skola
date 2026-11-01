// Smlouva mezi jádrem školy (klient resource "skola") a UI. Výchozí UI je resource "skola-ui" (panel ve web view
// a karta hodiny, src/vychozi-ui/); jiný framework ho nahradí vlastním resource, který zavolá:
//
//   const setUi = Exports.get("skola", "setUi") as (ui: Partial<SkolaUi>, owner: string) => boolean;
//   setUi({ panel: mujPanel, karta: mojeKarta }, "muj-framework");     // null = žádný (záloha jádra)
//
// Jádro drží všechna pravidla (server je zdroj pravdy, pohled UiView skládá server). UI jen kreslí pohled a vrací
// id akcí. Bez panelu jádro ukáže stejné akce v nativní nabídce hry, bez karty stav hodiny v infotextu hry.
// Texty: UI je nemá vlastní, bere je od jádra (api.t / api.texty) v jazyce hráče. Podrobně docs/ADAPTING.md.

import type { KartaMsg, KartaUkaz, UiView } from "./shared/ui";
import type { Parametry, Slovnik } from "./shared/i18n";

export const VERZE_UI = 1;

/** co jádro nabízí UI */
export interface SkolaUiApi {
  readonly verze: number;
  /** hráč zvolil akci pohledu (UiAkce.id); hodnota = text ze vstupu (UiAkce.vstup), u konce hodiny JSON voleb */
  akce(id: string, hodnota?: string): void;
  /** hráč panel zavřel (Esc, tlačítko): jádro to řekne serveru */
  zavreno(): void;
  /** hráč chce panel (vlastní klávesa nebo tlačítko UI) */
  otevrit(): void;
  /** UI teď pohled ukázat nemůže (web view nejde vytvořit): jádro ukáže stejné akce v nativní nabídce hry */
  nativni(): void;
  /** stránka UI se (znovu) nahrála: server pošle otevřený pohled znovu */
  pripraveno(): void;
  /** text v jazyce hráče (klíče page.*, card.*, client.*, level.*) */
  t(klic: string, a?: Parametry): string;
  /** slovník oblastí (předpony "page.", "card.") pro stránku web view */
  texty(predpony: string[]): Slovnik;
  jazyk(): string;
  /** při změně jazyka (nové texty) */
  naJazyk(cb: (jazyk: string) => void): void;
}

/** panel školy: ukáže pohled ze serveru */
export interface PanelBackend {
  /** ukázat nebo překreslit pohled; false = teď neumí (jádro použije nativní nabídku) */
  ukazat(view: UiView): boolean;
  /** schovat (hráč staví vybavení, čte, server panel zavřel) */
  schovat(): void;
  /** je panel připravený ukázat pohled hned? (jinak jádro chvíli počká, pak nativní nabídka) */
  pripraveny?(): boolean;
  /** UI se připojilo k jádru */
  pripojit?(api: SkolaUiApi): void;
  /** jádro končí (resourceStop) nebo UI vyměnil jiný resource */
  odpojit?(): void;
}

/** co má karta hodiny ukázat */
export interface KartaStav {
  /** obsah (null = nic, karta pryč) */
  ukaz: KartaUkaz | null;
  /** smí být vidět teď (ne při otevřeném panelu, čtení nad listem, v dialogu) */
  videt: boolean;
  nastaveni: KartaMsg["nastaveni"];
}

/** karta hodiny na kraji obrazovky (bez vstupu) */
export interface KartaBackend {
  ukazat(stav: KartaStav): void;
  /** karta teď stav opravdu ukazuje (jádro pak nedává totéž do infotextu) */
  aktivni(): boolean;
  pripojit?(api: SkolaUiApi): void;
  odpojit?(): void;
}

export interface SkolaUi {
  panel: PanelBackend | null;
  karta: KartaBackend | null;
}
