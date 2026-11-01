# Adapting the School (`skola`) to your server

Guide for server owners and for AI agents who integrate the school into another framework, UI or language.
Read it fully before changing code. Czech internal notes for this repository are in [../../AGENTS.md](../../AGENTS.md)
and [../README.md](../README.md).

## What it is

A literacy system for **Kingdoms Connected** (KCDC, KCD2 multiplayer): a scribe (teacher) sets up a classroom
(board, desks with a reader and a copybook per student), runs lessons, and students earn literacy XP. Literacy
decides how players *see* text: from pseudo-glyphs through letters, syllables and words to fluent reading.
Other resources can show any text "as this player reads it" (`filtrText`, `legibility`).

## Package layout

| Resource | Required | What it contains |
|---|---|---|
| `skola` | yes | Core. Server rules, storage, permissions, translations, world interaction (reading over a sheet, finger pointing, equipment placement), native-menu fallback. |
| `skola-ui` | default, replaceable | Our UI: the school panel (web view on the right) and the lesson card. It depends on `skola` and attaches with `skola.setUi`. |
| `kresby` | optional | Boards and sheets are drawing boards of `kresby`. Without it, reading still works but nothing can be drawn or placed. |
| `most` | optional | Framework bridge (identity, permissions, storage, money, menus). Without it a built-in shim is used. |
| `sprava` | optional | F10 admin panel and the settings editor (F10 → Settings → School). |

Build: `cd skola/kcdc && npm install && npm test` creates `dist/skola` and `dist/skola-ui`.
`node tools/build.mjs --out <server>/resources/skola` deploys both (`skola-ui` goes next to it).

**Rule of thumb:** never fork the core to change UI, wording, roles or storage. Each has an extension point below.
If something cannot be done through them, extend the extension point (and its tests), not the call sites.

## Architecture in one picture

```
 server (skola)                         client (skola)                    client (skola-ui or yours)
 ───────────────                        ──────────────                    ──────────────────────────
 rules, lessons, XP, storage            reading overlay (Scaleform),      panel: shows UiView, returns
 builds UiView per player  ──skola:ui──▶ finger, placement (PropPlacer),──▶ action ids  (PanelBackend)
 executes action ids  ◀──skola:uiAkce── language, card state       ◀──── card: shows KartaStav (KartaBackend)
 translations per player ─skola:jazyk─▶  setUi registry (Exports)
 permission checks (can)
```

- The **server is the single source of truth.** The panel never decides anything: it renders a `UiView`
  (`src/shared/ui.ts`) and sends back the `id` of the chosen action (plus an optional text value).
- All texts in a `UiView` are already translated for the receiving player.
- Without any UI attached, the core shows the same actions in the game's native menu and puts the lesson state
  into the game's info text. A UI is therefore optional for correctness.

## 1. Framework integration (server)

Hooks replace defaults. Register them from your resource at runtime (they disappear when your resource stops) or
statically in `skola_config.js` (`SKOLA_CONFIG.hooks`):

```js
const setHooks = Exports.get("skola", "setHooks");
setHooks({
  // permissions: return true/false to decide, undefined to let the school decide (see section 2)
  opravneni: (pid, capability, roles) => myFw.can(pid, "school." + capability) ?? undefined,
  // legacy shortcut for the teacher role (job, guild membership)
  jeUcitel: (pid) => myFw.job(pid) === "scribe",
  // player language ("cs", "en", ...); null = server default. A player's own /skola jazyk choice wins.
  jazyk: (pid) => myFw.locale(pid),
  // literacy progress in your database (shape: { xp, den?, historie? })
  progresNacti: async (charId) => myFw.db.get("literacy", charId),
  progresUlozit: async (charId, p) => myFw.db.set("literacy", charId, p),
  // may this lesson start? true, or a reason shown to the teacher (fee, schedule, licence)
  lekcePovolit: (teacherPid, studentPids) => myFw.money(teacherPid) >= 5 || "A lesson costs 5 groschen.",
}, "my-framework");
```

Events for other resources (`Events.on` on the server):

| Event | Payload |
|---|---|
| `skola:lekce` | `{ faze, trida, ucitel, studenti }` lesson start / end |
| `skola:xp` | `{ pid, charId, xp, celkem, co, od }` XP awarded |
| `skola:odemceno` | `{ pid, charId, co, stupen }` something new unlocked |

Server exports (`Exports.get("skola", name)`):

| Export | Use |
|---|---|
| `filtrText(pid, text, seed?)` | text as this player reads it (1:1 per character) |
| `legibility(pid, text, seed?)` | 0..1 in steps of 0.1 for native books (`Book.open`) |
| `stav(pid)`, `xp(pid)`, `pridatXp(pid, xp, reason)` | literacy state, XP, award XP (no daily caps) |
| `can(pid, capability)` | permission check with all hooks applied |
| `roles(pid)`, `capabilities()` | roles and capabilities of a player; capability → role table |
| `addTranslations(lang, dict, owner)` | add a language or override texts (section 3) |
| `languages()`, `language(pid, code?)`, `translate(pid, key, params?)` | languages; get/set a player's language; translate a key |
| `setHooks(hooks, owner)`, `isBusy(pid)` | hooks; is the player reading right now |
| `spravaPanels()`, `spravaSettings()` | F10 panel and settings for `sprava` |

Client exports (`Exports.get("skola", name)` in a client script): `setUi(ui, owner)`, `isReading()`, `stopReading()`.

## 2. Permissions

The school never asks for a role, only for a **capability**. Table in `src/opravneni.ts` (`SCHOPNOSTI`):

| Capability | Default roles | Meaning |
|---|---|---|
| `school.use`, `school.write` | student | panel, literacy, reader; write in the copybook |
| `class.create`, `class.edit` | teacher | found a class; set up and change *own* class |
| `class.manage`, `class.delete`, `class.limit.bypass` | admin | manage and teach in any class; more classes than the limit |
| `lesson.run` | teacher | run lessons, call students, copybooks, board |
| `lesson.xp` | teacher | award XP at the end of a lesson (with the anti-abuse limits) |
| `xp.edit` | admin | add / set anybody's XP (`/skola dat`, `/skola xp`, F10) |
| `xp.view` | admin, debug | see another player's literacy |
| `settings.edit` | admin | F10 → Settings → School |
| `debug.view`, `debug.preview`, `debug.tools` | debug | `/skola debug …` (state, roles, view dump, literacy preview, repair, verbose log) |

Roles map to framework permission nodes: `teacher` = `skola.ucit`, `admin` = `skola.admin` (or `admin`),
`debug` = `skola.debug`. **Admin can do everything.** Students are everybody.

Resolution order for `can(pid, capability)`:

1. hook `opravneni(pid, capability, roles)` returns `true` / `false` → final; `undefined` → continue,
2. fine-grained node `skola.<capability>` (e.g. `skola.lesson.xp`) via `most.perms.has`,
3. any of the capability's roles (teacher via hook `jeUcitel` when present, otherwise `skola.ucit`),
4. admin node.

Remap without code: `SKOLA_CONFIG.opravneni = { "lesson.xp": ["admin"], "debug.view": ["teacher", "debug"] }`.
Without `most`: `SKOLA_CONFIG.ucitele`, `admini`, `ladici` (nicknames, `"*"` = everybody).

Typical setups:

- *Assistant teacher* who may teach in any class but not award XP: grant `skola.lesson.run` and
  `skola.class.manage`, not `skola.ucit`; their lessons end without XP. (With `skola.class.create` and
  `skola.class.edit` instead of `class.manage` they run their own classes only.)
- *Debugger* for a tester: grant `skola.debug` (no teaching rights needed).
- *Guild-based teachers*: hook `jeUcitel` reading the guild; keep admins on `skola.admin`.

## 3. Translations

Built in: `cs` (source of truth, complete) and `en`. Dictionaries are flat `key → text` maps in `src/lang/`:
`cs-server.ts` / `en-server.ts` (server: `msg.*`, `view.*`, `cmd.*`, `admin.*`, `set.*`, `level.*`, `letters.*`) and
`cs-klient.ts` / `en-klient.ts` (client and default UI: `client.*`, `page.*`, `card.*`).

Syntax: `{name}` parameters, plural forms `{n|one|few|many}` chosen per language (cs: 1 | 2–4 | other,
en: 1 | other; other languages use `Intl.PluralRules` order). A parameter may be a nested message.

Player language: own choice `/skola jazyk <code>` (`auto` resets; can be disabled in F10) → framework hook
`jazyk(pid)` → server default (F10 → Settings → School → Language). Missing keys fall back to the server default
language, then to `cs`.

Add a language (pick one):

- **Config** (`skola_config.js`): `jazyky: { de: { "page.close": "Schließen", ... } }`.
- **Runtime** from your resource: `Exports.get("skola", "addTranslations")("de", dict, "my-resource")`.
  Removed automatically when your resource stops; clients get updated texts immediately.
- **In the repository**: add `src/lang/de-server.ts` and `de-klient.ts`, register them in `src/lang/index.ts`,
  run the tests (`test/jazyk.test.ts` enforces identical keys and parameters against `cs`).

Translate from `cs` (the source). Keep every `{parameter}` and plural block; keep symbols (✕, ✓, ⏱) and
commands (`/skola cist`) as they are. Player-written content (names, class names, primer pages) is never translated.

**Teaching content is separate from UI language.** The primer (pages, letter order) is data in the settings.
F10 → School → *Load primer of a language* loads the built-in `cs` or `en` primer (`src/data.ts` `SLABIKARE`).
Other languages: write the primer in F10 and set the letter order (*Stupně čitelnosti → Pořadí písmen*). The
handwriting font (`src/shared/pismo.ts`) covers Latin letters with Czech diacritics; the settings editor reports
missing glyphs.

## 4. Replacing the UI

Do not edit `skola-ui` for a different look: write your own UI resource and do not deploy `skola-ui`.
Contract: `src/ui-api.ts` (version `VERZE_UI = 1`).

```js
// client script of your resource; manifest: resourceDependencies: [{ name: "skola" }]
const setUi = Exports.get("skola", "setUi");
let api = null;
setUi({
  panel: {
    pripojit(a) { api = a; },                         // a: SkolaUiApi
    ukazat(view) { myUi.render(view, api.t); return true; },   // UiView; false = cannot (native menu instead)
    schovat() { myUi.hide(); },
    pripraveny() { return myUi.loaded; },              // optional
    odpojit() { myUi.hide(); api = null; },            // optional
  },
  karta: {                                             // optional lesson card (null = info text fallback)
    ukazat(state) { myHud.lesson(state.videt ? state.ukaz : null, state.nastaveni); },
    aktivni() { return true; },
  },
}, "my-ui");
// in your UI: api.akce(action.id, inputValue?) · api.zavreno() when the user closes · api.otevrit() to open
```

How to render a `UiView`:

- `obrazovka` tells which screen it is (`vitej`, `pruvodce`, `trida`, `hodina`, `konec`, `zak`, `cizi`);
  `titulek`, `text`, `hlaska` (toast) and the structured parts (`trida`, `hodina`, `slabikar`, `ja`) carry data.
- `akce` is the full list of buttons. Each has `id`, `text`, optional `tip`, `hlavni` (primary), `nebezpecne`
  (ask for confirmation with this text), `vypnuto` (disabled, show the reason), `vstup` (ask for text first:
  `label`, `value`, `placeholder`, `max`, `volby` suggestions, `radky` multi-line).
- Place known ids where they belong (`hodina:zacit`, `strana:<i>`, `cist:<pid>` …, see `ui/app.js`) and put
  **every action you did not place** into a generic "more actions" list. New server features then appear in
  your UI without changes.
- End of lesson (`hodina:rozdat`): send `JSON.stringify({ "<pid>": "u" | "uc" | "up" | "ucp" | "" })` as value
  (attendance / reading / writing), proposal in `hodina.zaci[].navrh`.
- Texts that are not part of the view (static labels of your page) come from `api.t(key)` / `api.texty(["page."])`;
  re-render on `api.naJazyk(cb)`.
- Equipment placement and reading over a sheet are core features; your UI is hidden automatically while they run.

A pure web-view UI can reuse our pages: they only need `skola:texty` (`{ jazyk, texty }`) and `skola:ui` (`UiView`)
events and send `skola:uiHello`, `skola:uiAkce`, `skola:uiPryc` (see `src/vychozi-ui/panel.ts`). Preview outside
the game: `tools/ui-dev/` (`?lang=en`), views from `SKOLA_UI_DUMP=1 npm test`.

## 5. Debugging

With `skola.debug` (or admin): `/skola debug stav` (classes, lessons, hooks, languages, UI),
`/skola debug ja [player]` (roles, capabilities, XP, language), `/skola debug cteni <0-4|XP> [text]` (how a text
reads at a level), `/skola debug pohled` (current panel view as JSON in the server log), `/skola debug log on|off`
(verbose log), `/skola debug opravit` (rebuild missing boards), `/skola debug nacist` (reload classes and settings).
F10 → School → *Debug: module state* shows the same for any player.

## Checklist for an integrating agent

1. Decide framework hooks (permissions, teacher role, language, progress storage, lesson gate) and register
   them with `setHooks` from your resource. Do not edit `server.ts` for this.
2. Map your permission system: hook `opravneni`, or grant `skola.ucit` / `skola.admin` / `skola.debug` /
   `skola.<capability>` nodes through `most`.
3. Language: hook `jazyk`, server default in F10, extra languages via `addTranslations`. Load a matching primer.
4. UI: keep `skola-ui`, or attach your own with `setUi` and stop deploying `skola-ui`. Render every action id.
5. Run `npm test` in `skola/kcdc` after any change in this package; add tests next to the extension point you touched.
6. Verify in game: open the panel (`/skola`), place a board and a desk, run a lesson, read over a sheet and leave
   it with **Esc**, end the lesson with XP, switch language with `/skola jazyk en`.
