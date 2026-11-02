// most - tenká vrstva nad oficiálním shimem mostu (most/shim/most.ts), sdílená s tanec/kcdc.
//
// Kontrakt: most/CONTRACT.md a most/src/shared/contract.ts (verze 1). Běží-li resource "most", jde všechno přes
// jeho API (Exports.get("most", "api")), jinak přes nativní zálohu shimu: groše a inventář hry, vlastní předměty
// přes Items.register, Dialogue, úložiště v souboru <server>/data/most-shim/<prostor>.json (serverové skripty KCDC
// mají Node včetně fs). Tady navíc:
//   - admin práva: <modul>.admin NEBO admin (pravidlo kontraktu);
//   - záloha práv bez mostu: config modulu (přezdívky adminů);
//   - onChange: most naběhl po modulu nebo se vrátil po restartu (exporty už jdou číst), případně se zastavil.
//     Shim to pozná sám (KCDC pustí resourceStart "most" i most:ready dřív, než jdou exporty přečíst).
// Most není v resourceDependencies modulů: restart mostu by restartoval i je (most/CONTRACT.md).

import {
  configureMostFallback, hasMost, most as shimMost, onMostChange,
} from "../../../most/shim/most";
import type {
  CustomItemDef, MenuOption, MenuSpec, MostApi, MostEconomy, MostIdentity, MostInventory, MostStorage, MostUi, NotifyKind, PlayerId,
} from "../../../most/src/shared/contract";

export type { CustomItemDef, MenuOption, MenuSpec, NotifyKind };

/** Nabídka s id (UI hook): id pozná custom UI, které nabídku kreslí místo herního dialogu (export menuModel). */
export interface Menu extends MenuSpec {
  id: string;
}

export interface ShimOptions {
  /** záloha práv bez mostu: právo -> přezdívky ("*" = všichni). "loutna" zahrnuje "loutna.admin" jako v mostu */
  perms?: Record<string, string[]>;
  isAdmin?: (p: Player) => boolean;
  log?: (text: string) => void;
}

const api = (): MostApi => shimMost();
const running = () => hasMost();

const permMatch = (granted: string, perm: string) => granted === "*" || granted === perm || perm.startsWith(granted + ".");

export function createMost(opts: ShimOptions = {}) {
  configureMostFallback({
    log: opts.log,
    perms: (p, perm) => {
      const isAdminPerm = perm === "admin" || perm.endsWith(".admin");
      if (isAdminPerm && opts.isAdmin?.(p)) return true;
      const nick = p.nickname.toLowerCase();
      let known = false;
      for (const [granted, who] of Object.entries(opts.perms ?? {})) {
        if (!permMatch(granted, perm)) continue;
        known = true;
        if (who.includes("*") || who.map((w) => w.toLowerCase()).includes(nick)) return true;
      }
      return !known && !isAdminPerm;              // neznámé běžné právo = všichni, admin = nikdo
    },
  });

  // části se čtou při každém použití (po restartu mostu je nový objekt)
  const identity: MostIdentity = {
    getCharacterId: (pid) => api().identity.getCharacterId(pid),
    getName: (pid) => api().identity.getName(pid),
    getPlayerId: (charId) => api().identity.getPlayerId(charId),
  };
  const perms = {
    /** admin právo modulu platí i pro obecné "admin" */
    async has(pid: PlayerId, perm: string): Promise<boolean> {
      if (await api().perms.has(pid, perm)) return true;
      return perm.endsWith(".admin") && !!(await api().perms.has(pid, "admin"));
    },
  };
  const economy: MostEconomy = {
    get defaultCurrency() {
      return api().economy.defaultCurrency;
    },
    currencies: () => api().economy.currencies(),
    getBalance: (c, cur) => api().economy.getBalance(c, cur),
    canAfford: (c, n, cur) => api().economy.canAfford(c, n, cur),
    add: (c, n, cur, reason) => api().economy.add(c, n, cur, reason),
    remove: (c, n, cur, reason) => api().economy.remove(c, n, cur, reason),
  };
  const inventory: MostInventory = {
    has: (pid, item, n) => api().inventory.has(pid, item, n),
    count: (pid, item) => api().inventory.count(pid, item),
    give: (pid, item, n, data) => api().inventory.give(pid, item, n, data),
    take: (pid, item, n) => api().inventory.take(pid, item, n),
    list: (pid) => api().inventory.list(pid),
    registerCustomItem: (def) => api().inventory.registerCustomItem(def),
    getCustomItem: (id) => api().inventory.getCustomItem(id),
  };
  const storage: MostStorage = {
    get: (k) => api().storage.get(k),
    set: (k, v) => api().storage.set(k, v),
    delete: (k) => api().storage.delete(k),
    keys: (prefix) => api().storage.keys(prefix),
  };
  const ui: MostUi = {
    menu: (pid, spec) => api().ui.menu(pid, spec),
    confirm: (pid, text, o) => api().ui.confirm(pid, text, o),
    prompt: (pid, spec) => api().ui.prompt(pid, spec),
  };
  const notify = (pid: PlayerId, text: string, kind: NotifyKind = "info") => api().notify(pid, text, kind);

  /** pohodlí pro moduly: peníze hráče (přes jeho postavu) */
  const money = {
    async balance(pid: PlayerId): Promise<number> {
      const c = await identity.getCharacterId(pid);
      return c ? economy.getBalance(c, economy.defaultCurrency) : 0;
    },
    async charge(pid: PlayerId, amount: number, reason: string): Promise<boolean> {
      const c = await identity.getCharacterId(pid);
      return !!c && economy.remove(c, amount, economy.defaultCurrency, reason);
    },
    async pay(pid: PlayerId, amount: number, reason: string): Promise<boolean> {
      const c = await identity.getCharacterId(pid);
      return !!c && economy.add(c, amount, economy.defaultCurrency, reason);
    },
  };

  /** most naběhl po modulu / vrátil se po restartu (true), nebo se zastavil (false); vrací odhlášení */
  const onChange = (f: (running: boolean) => void | Promise<void>) => onMostChange(f);

  return { identity, perms, economy, inventory, storage, notify, ui, money, running, onChange };
}

export type Most = ReturnType<typeof createMost>;
