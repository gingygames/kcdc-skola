# Guidelines for AI agents working in this repository

You are in **kcdc-skola**, the School resource for Kingdoms Connected (KCDC, Kingdom Come: Deliverance II multiplayer).
Read this file first, then [skola/kcdc/docs/ADAPTING.md](skola/kcdc/docs/ADAPTING.md) (integration guide) and
[skola/kcdc/README.md](skola/kcdc/README.md) (full description, Czech). Code identifiers and comments are Czech;
this file and ADAPTING.md are English.

## This repository is a mirror

- Generated from the monorepo [gingygames/gingy-kcdc](https://github.com/gingygames/gingy-kcdc) by
  `tools/zrcadlo.mjs` (commit in [ZDROJ.md](ZDROJ.md)). Changes made here get overwritten by the next mirror.
- If you work for someone **adapting the school to their server**: do it through the extension points below
  (config, hooks, `setUi`, `addTranslations`) in *their own* resource or config. Then upgrading to a newer mirror
  is a drop-in replacement.
- If you **change the school itself**: make the change in gingy-kcdc (`skola/kcdc/`), run its tests, regenerate the
  mirror. A pull request here is welcome as a proposal; it will be ported by hand.
- Folders other than `skola/` (`kresby/`, `loutna/`, `most/`, `sprava/`, `ui-kit/`) are **shared code copied from the
  monorepo** that the school compiles in. Do not edit them here. They keep the monorepo layout so relative imports
  work unchanged.

## Layout

| Path | What |
|---|---|
| `skola/kcdc/src/server.ts` | server: classes, lessons, XP, panel views (`pohled()`), actions (`provest()`), commands, exports |
| `skola/kcdc/src/client.ts` | client core: reading over a sheet (Scaleform), finger, hints, exports `setUi`, `isReading`, `stopReading` |
| `skola/kcdc/src/ui-jadro.ts`, `src/ui-api.ts` | UI registry and the UI contract (any UI attaches through it) |
| `skola/kcdc/src/vychozi-ui/` + `ui/` | **default UI, a detachable module**: panel (web view) and lesson card on the shared `ui-kit` look |
| `skola/kcdc/src/umistovani.ts` | equipment placement (game PropPlacer) |
| `skola/kcdc/src/opravneni.ts` | permissions: capabilities → roles (student, teacher, admin, debug), framework hook |
| `skola/kcdc/src/shared/i18n.ts`, `src/lang/` | translations: `cs-*.ts` (source of truth), `en-*.ts` |
| `skola/kcdc/src/shared/` | game-free core: literacy filter (`citelnost.ts`), handwriting font (`pismo.ts`), copybook scoring, protocol |
| `skola/kcdc/test/` | tests on fake KCDC server and client (vitest) |
| `skola/kcdc/tools/build.mjs` | builds the resource into `dist/skola` (`--out <server>/resources/skola` deploys) |

## Commands

```
cd skola/kcdc
npm ci
npm test            # typecheck + build + all tests; must pass before you finish
node tools/build.mjs --out <server>/resources/skola
```

Page preview without the game: serve the repo root over HTTP and open `skola/kcdc/tools/ui-dev/` (`?lang=en`).

## Rules (enforced by tests or review)

1. **The server is the single source of truth.** UIs render `UiView` and send back action ids. A new feature is an
   action in `pohled()` + `provest()`; the default page shows unknown actions under "More actions", so other UIs get
   it too. Never put rules into `src/vychozi-ui/` or `ui/`.
2. **Modularity of the default UI.** The core never imports `src/vychozi-ui/` except the single attach call in
   `client.ts` (`nastavitVychoziUi`). `src/vychozi-ui/` imports only types and constants. Texts come from
   `api.t()` / `api.texty()`. `SKOLA_CONFIG.ui = false` must leave a working school (native menu).
3. **No hardcoded player-facing text.** Add a key to `src/lang/cs-*.ts` **and** `en-*.ts` with the same `{parameters}`
   (`test/jazyk.test.ts`). On the server use `tr(p)` for one known player, `T(key, params)` for messages translated
   per recipient. Log lines stay Czech.
4. **Permissions only through capabilities** (`muze(p, "lesson.run")`), never roles or `most.perms` directly. A new
   capability gets a default role in `SCHOPNOSTI`, must not be a prefix of another, and a row in ADAPTING.md.
5. **No global keys.** KCDC modules open menus with chat commands (`/skola …`) and native action hints, not `Key.bind`
   on random keys. The only key bindings are Escape / W / A / S / D while reading.
6. **Reading must always close with Escape** (focused screen → `kcdc_ui_back`; unfocused → `Key.bind("escape")` with
   the cursor hidden). Keep `klient.test.ts` green.
7. The literacy filter is 1:1 per character (word indices map the finger to words). Change it only with
   `test/jadro.test.ts`.
8. **Performance:** send messages only on change and only to players they concern; the game info text is shared with
   other resources, so set it only when your text changes and hide only what you showed; idle clients (no class
   within 60 m) do no work and create no web views (`pripravitUi`). Measure new timers with the fake server and
   64 players before adding them.
9. Keep ADAPTING.md in sync with hooks, exports, capabilities and the UI contract when you change them.

## Before you finish

- `npm test` passes; no new Czech/English literal outside `src/lang/` (except logs and comments).
- New config keys are in `config/skola_config.example.js` and ADAPTING.md.
- In-game behaviour you could not verify is listed for the human (the tests use a fake KCDC).
