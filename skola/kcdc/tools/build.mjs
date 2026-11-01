// Sestaví dva resource pro Kingdoms Connected:
//   dist/skola     jádro: server.js, client.js (čtení, stavba, záloha bez UI), package.json, skola_config.js
//   dist/skola-ui  výchozí UI: client.js (panel ve web view a karta hodiny), server.js, ui/ s ui-kitem z ../../ui-kit
// a dist/ui-dev-texty.json (slovníky stránek pro náhled tools/ui-dev/).
//   node tools/build.mjs [--out <složka resources/skola na serveru KCDC>]   (skola-ui jde vedle: <out>/../skola-ui)
// Sdílí shim most, panel sprava a pole nastavení s loutnou (../../loutna/kcdc/src), kodek, geometrii listů a
// Scaleform kreslení s kresbami (../../kresby/kcdc/src) - esbuild je přibalí.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyKit } from "../../../ui-kit/copy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist", "skola");
const distUi = join(root, "dist", "skola-ui");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const node = (bin, ...args) => execFileSync(process.execPath, [join(root, "node_modules", ...bin), ...args], { stdio: "inherit" });
const bundle = (entry, out, extra = []) =>
  node(["esbuild", "bin", "esbuild"], join(root, entry), "--bundle", "--format=iife", "--platform=neutral", "--target=es2022",
    "--charset=utf8", `--outfile=${out}`, "--log-level=warning", ...extra);

node(["typescript", "bin", "tsc"], "-p", join(root, "tsconfig.server.json"));
node(["typescript", "bin", "tsc"], "-p", join(root, "tsconfig.client.json"));
mkdirSync(dist, { recursive: true });
mkdirSync(distUi, { recursive: true });
bundle("src/server.ts", join(dist, "server.js"));
bundle("src/client.ts", join(dist, "client.js"));
bundle("src/vychozi-ui/main.ts", join(distUi, "client.js"));
bundle("src/vychozi-ui/server.ts", join(distUi, "server.js"));
// jádro už stránky nemá (dřív dist/skola/ui)
rmSync(join(dist, "ui"), { recursive: true, force: true });
// výchozí UI: stránky modulu + sdílená sada vzhledu (kopie se needituje)
rmSync(join(distUi, "ui"), { recursive: true, force: true });
cpSync(join(root, "ui"), join(distUi, "ui"), { recursive: true });
copyKit(join(distUi, "ui", "kit"));

const manifest = {
  name: "skola",
  version: pkg.version,
  description: "Škola: výuka čtení a psaní u písaře (tabule a listy z kreseb), XP gramotnosti a postupná čitelnost textů. Jádro bez UI: panel a kartu dodá skola-ui nebo UI frameworku (setUi).",
  mafiahub: {
    serverScripts: ["skola_config.js", "server.js"],
    clientScripts: ["client.js"],
    // závislosti startují dřív a modul se s nimi restartuje; bez nich běží dál (optional).
    // Na sprava ani skola-ui záviset nesmí: sprava závisí na modulech, skola-ui na škole (cyklus).
    resourceDependencies: [{ name: "most", optional: true }, { name: "kresby", optional: true }],
    exports: [
      // server
      "filtrText", "legibility", "stav", "xp", "pridatXp", "setHooks", "isBusy", "spravaPanels", "spravaSettings",
      "can", "roles", "capabilities", "addTranslations", "languages", "language", "translate",
      // klient
      "setUi", "isReading", "stopReading",
    ],
    errorBehavior: "continue",
  },
};
writeFileSync(join(dist, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const manifestUi = {
  name: "skola-ui",
  version: pkg.version,
  description: "Výchozí UI školy: panel školy (web view vpravo) a karta hodiny. Nahraditelné vlastním UI frameworku (skola.setUi).",
  mafiahub: {
    serverScripts: ["server.js"],
    clientScripts: ["client.js"],
    files: ["ui/**"],
    // UI potřebuje jádro: startuje po něm a restartuje se s ním
    resourceDependencies: [{ name: "skola" }],
    exports: [],
    errorBehavior: "continue",
  },
};
writeFileSync(join(distUi, "package.json"), JSON.stringify(manifestUi, null, 2) + "\n");
const config = join(dist, "skola_config.js");
if (!existsSync(config)) copyFileSync(join(root, "config", "skola_config.example.js"), config);

// slovníky stránek pro náhled mimo hru (tools/ui-dev/?lang=en): stejné oblasti, jaké klient posílá stránkám
{
  const out = join(root, "dist", "ui-dev-texty.mjs");
  bundle("tools/texty.ts", out, ["--format=esm", "--platform=node"]);
  const { texty } = await import(pathToFileURL(out).href + "?t=" + Date.now());
  writeFileSync(join(root, "dist", "ui-dev-texty.json"), JSON.stringify(texty(), null, 1));
}

const kb = (f) => (readFileSync(f).length / 1024).toFixed(1);
console.log(`skola (KCDC): server ${kb(join(dist, "server.js"))} KB, client ${kb(join(dist, "client.js"))} KB -> dist/skola; skola-ui client ${kb(join(distUi, "client.js"))} KB -> dist/skola-ui`);

const out = arg("--out");
if (out) {
  mkdirSync(out, { recursive: true });
  for (const f of ["server.js", "client.js", "package.json"]) copyFileSync(join(dist, f), join(out, f));
  rmSync(join(out, "ui"), { recursive: true, force: true }); // stránky má teď skola-ui
  if (!existsSync(join(out, "skola_config.js"))) copyFileSync(config, join(out, "skola_config.js"));
  const outUi = join(dirname(out), "skola-ui");
  rmSync(outUi, { recursive: true, force: true });
  cpSync(distUi, outUi, { recursive: true });
  console.log(`nasazeno do ${out} a ${outUi} (skola_config.js se nepřepisuje)`);
}
