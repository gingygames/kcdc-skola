# School (Škola) for Kingdoms Connected

A literacy system for **Kingdoms Connected** (KCDC, the Kingdom Come: Deliverance II multiplayer platform). A scribe
sets up a classroom (a board, school desks with a reader and a copybook for each student), runs lessons, and students
earn literacy XP. Literacy decides how players *see* text: from pseudo-glyphs through letters, syllables and words to
fluent reading. Other resources can show any text "as this player reads it".

- Languages: Czech and English built in; add more by config or at runtime.
- Any framework: permissions, teacher role, language, progress storage and lesson rules are hooks.
- Any UI: ships with a default UI (`skola-ui`); replace it with your own through `setUi`.
- Permissions for teachers, admins and debuggers (`/skola debug`).

## Resources

| Resource | | |
|---|---|---|
| `skola` | required | core: rules, storage, permissions, translations, reading over a sheet, equipment placement, native-menu fallback |
| `skola-ui` | default UI | school panel (web view) and lesson card; depends on `skola`; replaceable |
| [`kresby`](https://github.com/gingygames/kcdc-kresby) | dependency | boards and sheets are drawing boards of the drawings resource. Without it reading works, but nothing can be drawn or built |
| `most`, `sprava` | optional | framework bridge and the F10 admin panel from [gingy-kcdc](https://github.com/gingygames/gingy-kcdc) |

## Build and install

```
cd skola/kcdc
npm ci
npm test                                                   # builds dist/skola and dist/skola-ui, runs the tests
node tools/build.mjs --out <server>/resources/skola        # deploys skola and skola-ui next to it
```

Install [kcdc-kresby](https://github.com/gingygames/kcdc-kresby) the same way (`resources/kresby`). Use releases built
from the same gingy-kcdc commit (see `ZDROJ.md` in both repositories): the school compiles in shared drawing code
and talks to the drawings resource through its API.

Settings: F10 → Settings → School (with `sprava`), or `resources/skola/skola_config.js`.

## Documentation

- **[skola/kcdc/docs/ADAPTING.md](skola/kcdc/docs/ADAPTING.md)**: integration guide for server owners and AI agents
  (framework hooks, permissions, translations, replacing the UI, debugging, checklist).
- [skola/kcdc/README.md](skola/kcdc/README.md): full module description (Czech).

## Source

This repository is generated from the monorepo [gingygames/gingy-kcdc](https://github.com/gingygames/gingy-kcdc)
(`skola/kcdc`) together with the shared code it compiles in (same folder layout). Details in [ZDROJ.md](ZDROJ.md).
Report issues here; changes are made in gingy-kcdc and mirrored.

## License

MIT, see [LICENSE](LICENSE).
