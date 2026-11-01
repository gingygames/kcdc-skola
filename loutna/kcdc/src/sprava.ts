// sprava - admin akce modulu jako panel v resource "sprava" (sprava/src/registry.ts, sdílené s tanec/kcdc).
//
// Dvě cesty, obě podporované správou:
//   1. modul běží po správě: Exports.get("sprava", "registerPanel")(def, "<jméno resource>") - teď a při resourceStart správy;
//   2. správa naběhne po modulu: stáhne si export "spravaPanels" (funkce vracející panely) - musí být v manifestu.
// Správa kontroluje oprávnění (`perm` panelu / akce), převede parametry podle typu (player -> Player) a volá handler.
// Bez správy zůstávají akce jako /příkazy ověřené přes most.perms.

type Awaitable<T> = T | Promise<T>;

export type ParamType = "string" | "text" | "number" | "boolean" | "select" | "player" | "item" | "place";

export interface ParamDef {
  name: string;
  label?: string;
  type?: ParamType;
  required?: boolean;
  default?: string | number | boolean;     // u "player" lze "me"
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string; hint?: string }[];
  placeholder?: string;
  help?: string;
}

export interface ActionContext {
  caller: Player;
  params: Record<string, any>;
  panel: string;
  action: string;
}

export interface ActionResult {
  ok?: boolean;
  message?: string;
  text?: string;
  info?: { label: string; value: string | number | boolean | null }[];
  close?: boolean;
}

export interface ActionDef {
  id: string;
  label: string;
  description?: string;
  perm?: string;
  confirm?: string | boolean;
  danger?: boolean;
  params?: ParamDef[];
  handler: (ctx: ActionContext) => Awaitable<string | void | null | undefined | ActionResult>;
}

export interface PanelDef {
  id: string;
  title: string;
  group?: string;
  description?: string;
  perm?: string;
  actions: ActionDef[];
}

/** Zaregistruje panel (teď, a znovu když správa naběhne) a vrátí funkci pro export "spravaPanels". */
export function registerAdminPanel(owner: string, panel: () => PanelDef, log: (t: string) => void) {
  const attempt = (): boolean => {
    try {
      if (typeof Exports === "undefined") return false;
      const fn = Exports.get("sprava", "registerPanel");
      if (typeof fn !== "function") return false;
      fn(panel(), owner);
      log(`panel ${panel().id} je ve správě (${panel().actions.length} akcí)`);
      return true;
    } catch {
      return false;
    }
  };
  Events.on("resourceStart", (name) => {
    if (name === "sprava") attempt();
  });
  return { attempt, spravaPanels: () => [panel()] };
}
