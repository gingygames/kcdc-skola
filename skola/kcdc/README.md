# Škola (KCDC)

Výuka čtení a psaní u písaře pro **Kingdoms Connected**. Písař si s průvodcem zařídí třídu (tabule, školní lavice se stolem, čítankou a písankou) a vede hodiny. Všechno se ovládá v jednom panelu školy. Studenti za hodiny dostávají XP gramotnosti. Podle XP se postupně zlepšuje, jak čtou texty modulů: od nesmyslných znaků přes písmena, slabiky a slova k plynnému čtení. Návrh a zdůvodnění: [../NAVRH.md](../NAVRH.md).

```
cd skola/kcdc && npm install && npm test        # build + testy (jádro, jazyky a oprávnění, server, klient)
node tools/build.mjs --out <server>/resources/skola   # nasadí skola i skola-ui (vedle)
node playground/nasadit.mjs --jen skola,skola-ui     # z kořene repa: lokální playground
```

**Balíček k publikaci:** resource `skola` (jádro: pravidla, čtení, stavba, oprávnění, překlady, záloha bez UI) a `skola-ui` (výchozí UI: panel a karta hodiny, nahraditelné). Vícejazyčná (cs, en; další jazyk konfigem nebo exportem), napojitelná na jakýkoli framework háčky a schopnostmi. Návod pro servery a agenty (anglicky): **[docs/ADAPTING.md](docs/ADAPTING.md)**.

*English: the school is a literacy system for Kingdoms Connected. Packages `skola` (core) and `skola-ui` (default, replaceable UI). Czech and English built in. Integration guide for frameworks, UIs, permissions and translations: [docs/ADAPTING.md](docs/ADAPTING.md).*

## Ovládání

| Kdo | Klávesa / příkaz | Co |
|---|---|---|
| žák u stolu | nápověda hry **„Číst čítanku“** (`primary_action`) | sklonit se nad čítanku; zvednout hlavu **Esc** nebo **✕ Zavřít** nad listem |
| u stolu a u tabule | nápověda hry **„Škola“** (ovládání sledování `chat_focus_follow_init`, KCDC ho po dobu nápovědy převezme) | **panel školy** (web view vpravo, Esc zavře): písař průvodce, třídu a hodinu, žák gramotnost a písanku |
| písař, admin | **F10 → Škola → Otevřít panel školy** (právo `skola.ucit`) | panel školy kdekoli, i k založení první třídy; F10 → Škola také gramotnost hráčů a nastavení |
| všichni (hlavní cesta) | `/skola`, `/skola cist`, `/skola zvednout`, `/skola psat`, `/skola ja` | panel a akce příkazem s našeptáváním ve Správě (`registerChatCommands`, konzole `;`); bez nápovědy hry je ukáže karta hodiny |
| žák | `/skola psat` | psát do písanky (když písař zadal předlohu) |
| všichni | `/skola ja` | moje gramotnost: stupeň, XP, co odemkne další XP |
| všichni | `/skola nabidka` | stejné akce jako panel v nativní nabídce (záloha bez web view) |
| písař u své třídy | `/skola tabule <text>` (i před hodinou), `/skola pisanka <text>` (v hodině) | vlastní text na tabuli / do písanek |
| písař | `/skola lavice` | blueprinty lavic (smart object hry druhu seat) |
| admin | `/skola dat <hráč> <XP>`, `/skola xp <hráč> <XP>` | přidat / nastavit XP (schopnost `xp.edit`) |
| všichni | `/skola jazyk [kód \| auto]` | jazyk školy pro mě (cs, en …; auto = podle frameworku / serveru); vypnutelné v F10 |
| ladič (`skola.debug`), admin | `/skola debug [stav \| ja [hráč] \| cteni <0-4\|XP> [text] \| pohled \| log on\|off \| opravit \| nacist]` | stav modulu, role a schopnosti, náhled čitelnosti, pohled panelu do logu, podrobný log, oprava desek, znovu načíst |

**Škola si nebere žádné vlastní klávesy** (31. 10. ve hře kolidovala L s loutnou: zvednutí hlavy otevřelo obchod s nástroji). Podle pravidla projektu (v KCDC žádné globální klávesy) se škola otevírá příkazem `/skola` s našeptáváním; u stolu a tabule k tomu nativní nápověda akce hry na ovládání, které tam hra nabízí (jako kostky v gamemode KCDC), písař a admin F10 → Škola. Nová klávesa žádná. Když se při čtení otevře herní dialog nebo nabídka jiného modulu, hlava se sama zvedne.

### Panel školy

Server skládá celý pohled (`shared/ui.ts` `UiView`) a provádí akce. Stránka `ui/` (ui-kit, `app.js`) jen kreslí a vrací id akce, takže nic nerozhoduje. Akce mají id (`umistit:stul`, `cist:<pid>`, `tabule:text` …), u některých dotaz na text (`vstup`), u nebezpečných potvrzení, u nedostupných důvod (`vypnuto`). Klient bez web view řekne `web:false` a server ukáže stejné akce v nativní nabídce po stránkách.

| Obrazovka | Kdy | Co v ní |
|---|---|---|
| Vítej | písař bez třídy | jak to chodí ve 3 krocích, Založit školu tady (název) |
| Průvodce | nová třída | kroky **Tabule → Lavice → Hotovo**: velké volby (Tabule na zeď / na stojanu; Školní lavice; Místo u stolu, který tu stojí; Lavice na sezení), postavené kusy s Přesunout / Odebrat, kontrola a „Hotovo, můžu učit“ |
| Třída | zařízená třída | slabikář (dlaždice stránek), Začít hodinu; sbalené sekce Tabule, Vybavení (přidat, přesunout, odebrat), Nastavení (název, veřejné hodiny, průvodce znovu, zrušit) |
| Hodina | běží | žáci (stupeň, přítomnost, sedí, čte, písanka se skóre) s tlačítky Číst nahlas, K tabuli, Prohlédnout / Uznat / Znovu; slabikář; písanky (zadat předlohu); tabule; žáci poblíž, kteří nejsou na hodině |
| Konec hodiny | Ukončit hodinu… | jeden formulář: u každého žáka Účast / Čtení / Psaní (návrh podle toho, kdo četl a čí písanku písař uznal), součet XP |
| Žák | žák, cizí třída | gramotnost na papíře (stupeň, postup, další odemčení, známá písmena, jak teď přečte větu), Sklonit se nad čítanku, Psát do písanky |

Při hodině se otevřený panel obnovuje po 5 s, jen když se něco změnilo (příchody, přítomnost, odevzdané písanky).

### Karta hodiny

Malá karta na kraji obrazovky (`ui/karta.html`, web view **bez fokusu**: nebere myš ani klávesy) při hodině a při stavbě. Nahrazuje řádek infotextu nahoře. Schová se při otevřeném panelu, při čtení nad listem a v dialogu. Server posílá stav po 1 s, jen při změně (`skola:karta`, `KartaMsg`), klient přidá živé věci a karta podle svého obsahu zmenší web view.

| Kdo | Co karta ukáže |
|---|---|
| písař | stránka, minuty (a od kdy se dává XP), na co ukazuje prst čtoucího žáka, předloha písanek a kolik jich čeká na kontrolu, žáci: sedí / nesedí, čte, písanka ke kontrole / uznaná / znovu |
| žák | co má teď udělat (číst nahlas, sednout si k listům, obtahovat předlohu, písanka odevzdaná / uznaná), postup gramotnosti, klávesy u stolu |
| stavba | co se staví, kolik kusů už stojí, Klik / Kolečko / Esc |

Zapnutí, strana (vpravo / vlevo) a odshora: F10 → Nastavení → Škola → Karta hodiny. Bez web view zůstává infotext jako dřív. Náhled mimo hru: `tools/ui-dev/karta.html`.

### Umisťování vybavení

Panel ustoupí a písař míří: **PropPlacer hry** ukáže průsvitný náhled pod zaměřovačem (zelený = jde to, červený = ne), **kolečko otáčí, klik staví, Esc** vrátí panel. Školní lavice a lavice na sezení se stavějí jedna za druhou. Co se postaví, rozhodne server znovu z pózy (nejvýš 10 m od písaře a v poloměru třídy).

| Kus | Náhled | Ve světě |
|---|---|---|
| Tabule na zeď | obrys tabule na stěně podle normály (na podlaze červený) | deska kreseb na zdi |
| Tabule na stojanu | model malířského stojanu | deska kreseb na stojanu kreseb |
| Školní lavice | stůl `table_shabby_d_160_rough` a lavice | stůl = `Prop` (kolize), 0,7 m před ním `Bench/bench_2places_low_table` (sedí se nativně, jako prefab `Table/table_oneSide`), každý ze 2 žáků má na desce čítanku a písanku (deska stolu se změří paprskem klientem písaře) |
| Místo u stolu, který tu stojí | obrys dvou listů na desce | dva listy, žák sedí na straně, odkud písař míří |
| Lavice na sezení | lavice | smart object z nastavení (`Bench/bench_2places_low`) |

Přesunout = staví se znovu na novém místě se stejným id (tabule si nese, co na ní bylo); odebrat uklidí i listy, prop a lavici.

**Plátno při psaní:** inkousty mají jména (Bílá / Žlutá / Červená křída, Duběnkový inkoust, barvy obrázku), nezobrazuje se počet kapek ani zamčené recepty a světlý inkoust předlohy písanky na plátně nejde vybrat (server tah jím odmítne). Ostatní hráči vidí psaní na tabuli živě (čáry kreseb); stínovaná textura je vystřídá po upečení (konec hodiny).

## Jak to funguje

- **Třída** (`server.ts`, panel → průvodce, viz Umisťování): listy na stole jsou desky kreseb skoro vodorovně (horní okraj od žáka), vlevo čítanka, vpravo písanka. Třídy jsou v `most.storage` `skola:tridy`; stoly a lavice se po startu postaví znovu (KCDC propy ze skriptu ani smart objekty nepersistuje). Třídy ze starší verze dostanou id kusů a průvodce mají hotový.
- **Hodina**: kdo je do `hodina.polomer` od třídy, je na hodině (veřejná třída; jinak ho písař přidá). Přítomnost se počítá po 5 s. Písař odejde od třídy dál než 3× poloměr nebo se odpojí = hodina končí bez XP.
- **Čítanka**: student u místa (do `hodina.dosahStolu`) se skloní. Kamera přeletí nad list, přes list se položí Scaleform: podklad listu a text stránky slabikáře ručním písmem (`shared/pismo.ts`), **přefiltrovaný gramotností toho hráče** (`shared/citelnost.ts`). Ve světě je na čítance jen obecný vzhled (pseudoznaky), takže z textury nikdo nic nepřečte.
- **Prst**: písař vyvolá studenta ke čtení. Skloněný student má kurzor jako prst, poloha na listu a index slova pod prstem jdou serveru ~10× za s (nejvýš 20 zpráv/s). Písař vidí na listu kroužek (Gizmos) a v infotextu skutečné slovo i to, jak ho student vidí.
- **Tabule** (nabídka Tabule…, i mimo hodinu): písař píše sám, vyvolá studenta (kdo stojí dál než 2,6 m, nejdřív k tabuli dojde, na to má 90 s; křída bez materiálu = volná relace kreseb `boardDraw` s dosavadním obsahem tabule jako předlohou), napíše text ručním písmem, nebo ukáže stránku slabikáře. Při hodině se tabule do textury nepeče: ostatní ji vidí živě a po dopsání jako čáry kreseb (bez nové textury a přenačítání balíčku po každém „Hotovo“). Stínovaně se upeče jednou na konci hodiny, mimo hodinu 5 min po posledním psaní, nebo hned volbou Tabule → Upéct tabuli teď. Aby stínovaná podoba byla hned i pro stránky:
  - **připravené tabule**: „Připravit tabule celého slabikáře“ upeče stránky předem, při hodině se ukazují hned;
  - **uložené tabule**: rozepsanou tabuli jde uložit (nejvýš 6 na třídu) a později ukázat bez čekání.
- **Obrázek ke stránce**: písař u tabule nakreslí obrázek na pergamen (tabule se nezmění). Čítanky ho ukazují nad textem hned, tabule stránky ho má křídou vpravo nahoře. Uložený v `most.storage` `skola:obrazek/<id stránky>`.
- **Sdílené textury**: obecný vzhled čítanky, předlohy písanek a připravené tabule jsou sdílené kresby kreseb (`drawingPrepare` + `boardShow`): jedna textura pro všechny stoly místo jedné na každý stůl. Hotová písanka se do textury nepeče vůbec (písař ji kontroluje přes list).
- **Písanka**: písař zadá předlohu (světlé tahy ručního písma). Student obtahuje inkoustem (relace kreseb, předlohu nejde vzít zpět) a odevzdá. Písař dostane pomocné skóre obtažení (`shared/porovnani.ts`, F1 pokrytí a přesnosti), písanku si prohlédne (kamera na list studenta), uzná nebo vrátí.
- **Třída patří písaři**: cizí písař ji nemění ani v ní neučí (admin školy ano), může si založit vlastní jinde. Když kresby přijdou o desky třídy, škola je při startu kreseb postaví znovu.
- **XP** na konci hodiny: písař ve formuláři zaškrtne u každého žáka účast / čtení / psaní (návrh: účast při dost přítomnosti, čtení když četl, psaní když má uznanou písanku). Ochrany: nejkratší hodina, nejmenší přítomnost v %, denní strop studenta a strop od jednoho písaře, ne sám sobě. XP se zrcadlí do nativní stopy (`player.addXp("scholarship")`, nastavitelné a vypínatelné).

## Stupně čitelnosti

| Stupeň | Výchozí XP | Co hráč vidí |
|---|---|---|
| 0 Negramotný | 0 | všechna písmena jsou pseudoznaky se stejnou siluetou (deterministicky podle textu) |
| 1 Písmena | 10, každé další +8 | odemčená písmena v pořadí slabikáře; ve slově přečte jen pár písmen za sebou |
| 2 Slabiky | 360, další slabika +40 | první slabiky slova, konec dlouhých slov se rozpadá |
| 3 Slova | 500, další slovo +30 | celá slova, po K slovech ve větě slábne |
| 4 Plynné čtení | 750 | vše; latina (`{lat}…{/lat}`) od 1000 |

Vše jde měnit v F10 → Nastavení → Škola (i pořadí písmen). Filtr je 1 : 1 po znacích, mezery a interpunkce zůstávají.

## Napojení na framework serveru

Podrobně a anglicky pro jiné servery a agenty: [docs/ADAPTING.md](docs/ADAPTING.md).

- **Oprávnění** (`src/opravneni.ts`): škola se ptá jen na schopnosti (`lesson.run`, `lesson.xp`, `class.manage`, `xp.edit`, `settings.edit`, `debug.view` …), každá má výchozí role: **student** (každý), **teacher** = `skola.ucit`, **admin** = `skola.admin` (nebo `admin`, smí všechno), **debug** = `skola.debug` (ladič: `/skola debug`, F10 → Škola → Ladění). Pořadí: háček `opravneni` → jemné právo `skola.<schopnost>` → role. Přemapování bez kódu `SKOLA_CONFIG.opravneni`, bez mostu seznamy `ucitele` / `admini` / `ladici`.
- **Jazyky** (`src/shared/i18n.ts`, slovníky `src/lang/`): vestavěné cs (zdroj pravdy) a en. Jazyk hráče: `/skola jazyk` → háček `jazyk` → výchozí serveru (F10 → Nastavení → Škola → Jazyk). Další jazyk: `SKOLA_CONFIG.jazyky` nebo export `addTranslations`. Slabikář jazyka: F10 → Škola → Načíst slabikář jazyka (cs, en).
- **UI** je vyměnitelné: výchozí resource `skola-ui`, jinak vlastní přes klientský export `setUi` (smlouva `src/ui-api.ts`). Bez UI nativní nabídka a infotext.
- Háčky (`SKOLA_CONFIG.hooks` nebo za běhu `Exports.get("skola", "setHooks")({ ... }, "muj-framework")`, zmizí se zastavením vlastníka):

| Háček | Výchozí | K čemu |
|---|---|---|
| `opravneni(pid, schopnost, role)` | tabulka `SCHOPNOSTI` | oprávnění frameworku: `true` / `false`, `undefined` = rozhodne škola |
| `jeUcitel(pid)` | `most.perms.has(pid, "skola.ucit")` | role písaře z frameworku (job, cech) |
| `jazyk(pid)` | výchozí serveru | jazyk hráče z frameworku (volba hráče `/skola jazyk` má přednost) |
| `progresNacti(charId)` / `progresUlozit(charId, p)` | `most.storage` `skola:progres/<charId>` | XP v databázi frameworku (`{ xp, den, historie }`) |
| `lekcePovolit(ucitelPid, studentPids)` | vždy | poplatek, rozvrh, licence: `true` nebo text důvodu |

- Události mezi resources (`Events.emit`): `skola:lekce` (`{ faze, trida, ucitel, studenti }`), `skola:xp` (`{ pid, charId, xp, celkem, co, od }`), `skola:odemceno` (`{ pid, charId, co, stupen }`).
- Exporty serveru: `filtrText(pid, text, seed?)` (text, jak ho hráč přečte), `legibility(pid, text, seed?)` (0..1 po 0,1 pro `Book.open`), `stav(pid)`, `xp(pid)`, `pridatXp(pid, xp, duvod)`, `setHooks`, `isBusy`, `can(pid, schopnost)`, `roles(pid)`, `capabilities()`, `addTranslations(jazyk, slovnik, owner)`, `languages()`, `language(pid, kod?)`, `translate(pid, klic, a?)`, `spravaPanels`, `spravaSettings`. Klienta: `setUi(ui, owner)`, `isReading()`, `stopReading()`.
- Popisky kreseb: škola si do kreseb zaregistruje filtr (`setCaptionFilter` na serveru i v klientu), takže název a podpis kresby i nápovědu „Prohlédnout …“ vidí hráč podle své gramotnosti. Kresby na škole nezávisí (žádný cyklus závislostí).

## Sazba a náhled

Co se kreslí na listy a tabuli, je v `src/sazba.ts` (čistý kód bez hry): obecná čítanka ve světě, text křídou, tabule stránky (s obrázkem: velké písmeno lekce vedle něj), předloha písanky s linkami a čítanka při čtení. Písmo (`shared/pismo.ts`) je jednotahové, s kerningem podle obrysu písmen, optickou mezerou mezi slovy a vyhlazenými oblouky. Velikost písma volí `vejdeSe`: co největší, aby se text i po zalomení vešel a nezůstalo osamocené slovo na řádku. Sázené písmo a křída mají příznak inkoustu 4 (rovnoměrný tah v kresbách: bez kaněk brku, ztenčených konců a slábnutí).

```
npx esbuild tools/nahled.ts --bundle --platform=node --outfile=dist/nahled.cjs && node dist/nahled.cjs   # PNG do dist/nahled/
```
Náhled kreslí stejným rastrem jako server kreseb: tabule stránek (i s obrázkem), text křídou, čítanka po stupních gramotnosti, předloha a obtažená písanka, čítanka ve světě.

## Závislosti

- `kresby` s API pro jiné resources (`kresby/kcdc/src/server/api.ts`: `boardCreate`, `boardDraw`, `boardPut`, `drawingPrepare`, `boardShow` …, papír `tabule` kód 31). Bez nich škola běží, ale nestaví tabule a listy a nepíše se (čítanka jde číst, líc listu si škola pamatuje sama).
- Sdílený kód se přibalí: `loutna/kcdc/src` (most, sprava, pole nastavení, ovládání), `kresby/kcdc/src` (kodek, geometrie listů, Scaleform kreslení).

## Ověřit ve hře

1. Panel: `/skola` otevře panel vpravo, Esc zavře, kurzor a vstup se vrátí hře. Čitelnost písma na 1080p i 4K.
2. Umisťování: náhled pod zaměřovačem, kolečko otáčí, klik staví, Esc vrátí panel. Je stůl s lavicí natočený čelem k písaři (výchozí otočení 180°)? Sedí lavice `Bench/bench_2places_low_table` těsně u stolu a sedí se na ní?
3. Tabule na zeď: obrys sedí na stěně, na podlaze zčervená. Stojan: model a deska nad ním.
4. Listy na stole: změřená výška desky (bez změření 0,78 m), textura listu vodorovně.
5. Překryv nad ležícím listem ze sedu, prst (plynulost, kroužek u písaře), konec hodiny formulářem, `player.addXp("scholarship")`.
6. **Esc ze čtení** (i po `/skola cist` z konzole Správy, z nápovědy u stolu, při kontrole písanky písařem): hlava se zvedne, kamera a ovládání se vrátí. Kurzor při čtení jen s fokusem obrazovky (log `čtení: obrazovka nemá fokus`, když ho hra nedá).
7. Jazyk: `/skola jazyk en` přepne panel, kartu, nápovědu i oznámení; F10 → Škola → Načíst slabikář jazyka.
8. Bez `skola-ui` (nenasazené): `/skola` ukáže nativní nabídku, stav hodiny infotext.
