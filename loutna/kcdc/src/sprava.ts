// sprava - admin akce modulu jako panel v resource "sprava" (sprava/src/registry.ts, sdílené s tanec/kcdc).
//
// Dvě cesty, obě podporované správou:
//   1. modul běží po správě: Exports.get("sprava", "registerPanel")(def, "<jméno resource>") - teď a při resourceStart správy;
//   2. správa naběhne po modulu: stáhne si export "spravaPanels" (funkce vracející panely) - musí být v manifestu.
// Správa kontroluje oprávnění (`perm` panelu / akce), převede parametry podle typu a volá handler. Hráče (caller i parametr
// "player") posílá jen jako { id, nickname } (PlayerRef): od KCDC 1.7.3 má každý resource vlastní runtime a nativní Player by
// přes Exports dorazil jako prázdný objekt. Celý hráč: Player.getById(ref.id), může být null (mezitím odešel).
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

/** hráč, jak ho handler dostane v `caller` a v parametrech typu "player" (sprava/src/panel-types.ts) */
export interface PlayerRef {
  id: number;
  nickname: string;
}

export interface ActionContext {
  caller: PlayerRef;
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
  // resourceStart přijde, když je Správa ještě ve stavu Loading: Exports.get na ni v handleru hází a čekat se v něm nesmí,
  // proto opakovat časovačem (250 ms, nejvýš 20 s; sprava/AGENTS.md oddíl 1)
  let retry: ReturnType<typeof setTimeout> | null = null;
  const attemptLater = (tries = 80): void => {
    if (retry !== null) clearTimeout(retry);
    retry = setTimeout(() => {
      retry = null;
      if (!attempt() && tries > 0) attemptLater(tries - 1);
    }, 250);
  };
  Events.on("resourceStart", (name) => {
    if (name === "sprava") attemptLater();
  });
  Events.on("resourceStop", (name) => {
    if (name === "sprava" && retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
  });
  return { attempt, spravaPanels: () => [panel()] };
}
