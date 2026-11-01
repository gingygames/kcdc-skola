// Nastavení školy pro server Kingdoms Connected. Načte se před server.js; build ho jen založí a nepřepisuje.
// Většina nastavení je v F10 → Nastavení → Škola (most.storage), i jazyk serveru. Tady záloha bez mostu, háčky
// frameworku, přemapování oprávnění a další jazyky. Návod: docs/ADAPTING.md.
// School settings for a Kingdoms Connected server (loaded before server.js). Most settings live in F10; this file
// holds the fallback without `most`, framework hooks, permission remapping and extra languages. See docs/ADAPTING.md.
globalThis.SKOLA_CONFIG = {
  admini: [],            // přezdívky adminů (právo "skola.admin"), když neběží most
  ucitele: [],           // přezdívky písařů (právo "skola.ucit"), když neběží most; "*" = všichni
  ladici: [],            // přezdívky ladičů (právo "skola.debug": /skola debug), když neběží most
  ui: true,              // výchozí UI školy (panel a karta); false = jen UI frameworku (setUi), jinak nativní nabídka hry
  // opravneni: {         // schopnost -> role (student, teacher, admin, debug); výchozí v src/opravneni.ts
  //   "lesson.xp": ["admin"],              // XP na konci hodiny rozdá jen admin
  //   "debug.view": ["teacher", "debug"],  // písař vidí /skola debug stav
  // },
  // jazyky: {            // další jazyk nebo úpravy textů (klíče v src/lang/cs-*.ts)
  //   de: { "page.close": "Schließen", "client.hint.read": "Fibel lesen" },
  // },
  // hooks: {            // napojení na vlastní framework (nebo za běhu: Exports.get("skola", "setHooks")({...}, "muj-fw"))
  //   opravneni: (pid, schopnost, role) => mujFramework.smi(pid, "skola." + schopnost), // true/false; undefined = škola sama
  //   jeUcitel: (pid) => mujFramework.job(pid) === "pisar",
  //   jazyk: (pid) => mujFramework.jazyk(pid),                   // "cs", "en" …; null = výchozí serveru
  //   progresNacti: async (charId) => mujFramework.db.get("gramotnost", charId),
  //   progresUlozit: async (charId, p) => mujFramework.db.set("gramotnost", charId, p),
  //   lekcePovolit: (ucitelPid, studenti) => true,   // nebo text důvodu
  // },
};
