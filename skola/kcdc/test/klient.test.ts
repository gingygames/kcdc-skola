// Klient školy na falešném klientu KCDC z kreseb (kresby/kcdc/test/fake.ts: Scaleform, kamera, Gizmos, klávesy, web
// view): panel (transport stránky), umisťování (PropPlacer), sklonit se nad list, text přefiltrovaný vlastní
// gramotností, prst, zvednout hlavu, značka prstu u učitele.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vec, makeClient } from "../../../kresby/kcdc/test/fake";
import { PRAVIDLA } from "../src/shared/citelnost";

const script = readFileSync(join(import.meta.dirname, "..", "dist", "skola", "client.js"), "utf8");
const NL = String.fromCharCode(10);
const LIST = { pos: [10, 1.2, 0.806], n: [0, -0.139, 0.99], w: 0.34, h: 0.227 };

/** klient školy; ui = false: server výchozí UI vypnul (SKOLA_CONFIG.ui = false -> skola:konfig) */
function klient(ui = true, blizko = true) {
  const sent: [string, any][] = [];
  const c = makeClient((n, p) => void sent.push([n, p]), { script });
  Object.assign((c.ctx as any).Web, { resizeView: () => true, setViewPosition: () => true }); // falešný klient kreseb je nemá
  if (!ui) c.deliver("skola:konfig", JSON.stringify({ ui: false }));
  // třída do 60 m (daleko od hráče, bez nápovědy): výchozí UI si nahraje stránky předem (bez třídy je nevytváří)
  if (blizko) c.deliver("skola:okoli", JSON.stringify({ dosah: 1.6, tridy: [{ id: 99, mista: [[500, 500, 0]], tabule: null, zadani: false, moje: false }] }));
  return { ...c, sent, posl: (ev: string) => sent.filter(([n]) => n === ev).map(([, p]) => p) };
}
const bezTextu = (e: [string, any][]) => e.filter(([n]) => n !== "skola:texty");

const cist = (o: object = {}) => ({ mod: "cteni", list: LIST, titulek: "Čteme", text: "Ema mele maso.", seed: "s1", papir: 0, prst: false, filtr: true, ...o });

/** otisk kreslení: všechna volání lineTo/moveTo na clipech obrazovky */
const kresleni = (scr: any) => {
  const out: string[] = [];
  const walk = (c: any) => {
    for (const x of c.calls) if (x[0] === "lineTo" || x[0] === "moveTo") out.push(x.slice(1).map((v: number) => Math.round(v)).join(","));
    c.children.forEach(walk);
  };
  walk(scr.root);
  return out.join(";");
};

describe("klient školy", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("škola si nebere klávesy (jen příkazy); čtení: kamera na list, překryv, zvednout hlavu Esc, ne L", async () => {
    const c = klient();
    expect([...c.keys.keys()]).toEqual([]); // J a L kolidovaly s jinými moduly (L = loutna a její obchod)

    c.deliver("skola:cist", JSON.stringify(cist()));
    expect(c.shots.at(-1)).toMatchObject({ duration: 650 });
    expect(c.controls.off).toBe(1);
    await vi.advanceTimersByTimeAsync(900);
    expect(c.screens).toHaveLength(1);
    expect(c.cursor()).toBe(1); // kurzor vždy (tlačítko Zavřít), prst jen při čtení nahlas
    expect(c.posl("skola:prst")).toEqual([]);
    expect(c.keys.has("l")).toBe(false); // L nechává loutně
    // Esc zvedne hlavu: konec překryvu, kamera zpět, server se to dozví
    c.keys.get("escape")!();
    expect(c.shots.at(-1)).toBeNull();
    expect(c.posl("skola:zvednout")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(c.controls.off).toBe(0);
  });

  it("výkon: hráč bez třídy poblíž nemá web view školy a škola nesahá na infotext; stejný stav se nepřekresluje", async () => {
    const c = klient(true, false);
    expect(c.views).toEqual([]); // web view až u třídy nebo při /skola
    const pred = c.notices.length;
    await vi.advanceTimersByTimeAsync(70000); // dřív každých 60 s Hud.hideInfoText i u nečinného hráče
    expect(c.notices.length).toBe(pred);
    c.deliver("skola:stav", JSON.stringify({ text: "Hodina u Henry: A a" }));
    c.deliver("skola:stav", JSON.stringify({ text: "Hodina u Henry: A a" }));
    expect(c.notices.filter((t) => t === "Hodina u Henry: A a")).toHaveLength(1);
    c.deliver("skola:okoli", JSON.stringify({ dosah: 1.6, tridy: [{ id: 1, mista: [[500, 500, 0]], tabule: null, zadani: false, moje: false }] }));
    expect(c.views.map((v) => v.url)).toEqual(["fw://resources/skola/ui/index.html", "fw://resources/skola/ui/karta.html"]);
  });

  it("Esc jde vždycky: obrazovka bez fokusu (konzole, chat) schová kurzor, ať klávesy hry Esc pustí; fokus zpět = kurzor zpět", async () => {
    const c = klient();
    c.deliver("skola:cist", JSON.stringify(cist()));
    expect(c.keys.has("escape")).toBe(true); // Esc hned, i během přeletu kamery
    expect(c.keys.has("w")).toBe(false); // pohyb až po přeletu (držené W od chůze)
    await vi.advanceTimersByTimeAsync(660); // po přeletu: obrazovka vznikla, ještě není hotová
    const scr = c.screens[0];
    let dovolit = false;
    scr.focus = () => (scr.focused = dovolit); // jiné UI drží vstup: hra fokus nedá
    await vi.advanceTimersByTimeAsync(700);
    expect(c.keys.has("w")).toBe(true);
    expect(c.cursor()).toBe(0); // bez fokusu kurzor nesmí viset (Key.bind by hra nepustila)
    // jiné UI pustilo vstup: fokus se vezme znovu a kurzor se vrátí (tlačítko Zavřít)
    dovolit = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(scr.focused).toBe(true);
    expect(c.cursor()).toBe(1);
    // hra fokus vzala zpátky (dialog s vyšší prioritou): po chvíli kurzor pryč, Esc přes klávesy
    scr.focused = false;
    dovolit = false;
    await vi.advanceTimersByTimeAsync(400);
    expect(c.cursor()).toBe(0);
    c.keys.get("escape")!();
    expect(c.posl("skola:zvednout")).toHaveLength(1);
    expect(scr.valid).toBe(false);
    expect(c.cursor()).toBe(0);
  });

  it("čtení při otevřeném panelu: panel se zavře i pro server a obnova hodiny ho přes čtení neukáže", async () => {
    const c = klient();
    const v = c.views[0];
    v.handlers.get("skola:uiHello")!();
    const pohled = { seq: 1, obrazovka: "zak", ucitel: false, titulek: "Hodina", ja: {}, akce: [] };
    c.deliver("skola:ui", JSON.stringify(pohled));
    expect(v).toMatchObject({ shown: true, focused: true });
    c.deliver("skola:cist", JSON.stringify(cist())); // /skola cist z konzole, panel zůstal otevřený
    expect(v).toMatchObject({ shown: false, focused: false });
    expect(c.posl("skola:uiPryc")).toHaveLength(1); // server ví, že panel je zavřený
    await vi.advanceTimersByTimeAsync(2000);
    c.deliver("skola:ui", JSON.stringify({ ...pohled, seq: 2 })); // obnova hodiny po 5 s
    expect(v.shown).toBe(false);
    expect(c.screens[0].focused).toBe(true); // fokus zůstal čtení: Esc jde čtení
    c.screens[0].input("kcdc_ui_back");
    expect(c.posl("skola:zvednout")).toHaveLength(1);
    c.deliver("skola:ui", JSON.stringify({ ...pohled, seq: 3 }));
    expect(v.shown).toBe(true); // po čtení zase normálně
  });

  it("Esc na obrazovce s fokusem (kcdc_ui_back) zvedne hlavu; uvolnění klávesy ne", async () => {
    const c = klient();
    c.deliver("skola:cist", JSON.stringify(cist()));
    await vi.advanceTimersByTimeAsync(900);
    const scr = c.screens[0];
    expect(scr.focused).toBe(true);
    for (const f of scr.handlers.input ?? []) f("kcdc_ui_back", "release");
    expect(c.posl("skola:zvednout")).toHaveLength(0);
    scr.input("kcdc_ui_back");
    expect(c.posl("skola:zvednout")).toHaveLength(1);
    expect(c.cursor()).toBe(0);
    await vi.advanceTimersByTimeAsync(700);
    expect(c.controls.off).toBe(0);
  });

  it("text se filtruje gramotností hráče: negramotný a plynně čtoucí kreslí jiné tahy", async () => {
    const c = klient();
    c.deliver("skola:cist", JSON.stringify(cist()));
    await vi.advanceTimersByTimeAsync(5000);
    const a = kresleni(c.screens[0]);
    c.keys.get("escape")!();
    c.deliver("skola:profil", JSON.stringify({ xp: 2000, pravidla: PRAVIDLA }));
    c.deliver("skola:cist", JSON.stringify(cist()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(kresleni(c.screens[1])).not.toBe(a);
  });

  it("prst: kurzor, poloha a slovo pod prstem ~10× za s; učitel vidí značku a slovo", async () => {
    const c = klient();
    c.deliver("skola:cist", JSON.stringify(cist({ prst: true })));
    await vi.advanceTimersByTimeAsync(900);
    expect(c.cursor()).toBe(1);
    const scr = c.screens[0];
    expect(scr.focused).toBe(true);
    // myš na stage: list je bez promítnutí uprostřed (fallback), první slovo vlevo nahoře
    scr.mouse = { x: 1920 / 2 - 400, y: 200 };
    await vi.advanceTimersByTimeAsync(1000);
    const p = c.posl("skola:prst");
    expect(p.length).toBeGreaterThan(0);
    expect(p.length).toBeLessThanOrEqual(11);
    expect(p.at(-1)).toMatchObject({ x: expect.any(Number), y: expect.any(Number), w: expect.any(Number) });
    // učitel (jiný klient) dostane polohu prstu
    const u = klient();
    u.deliver("skola:prstUcitel", JSON.stringify({ pid: 2, jmeno: "Hans", list: LIST, x: 100, y: 80, slovo: "Ema", vidi: "Ewa" }));
    expect(u.gizmos.get("prst2")!.prim).toMatchObject({ type: "polyline", closed: true });
    expect(u.notices.at(-1)).toBe("Hans ukazuje na „Ema“ (vidí „Ewa“)");
    u.deliver("skola:prstUcitel", JSON.stringify({ pid: 2, jmeno: "Hans", list: LIST, x: 0, y: 0, slovo: null, vidi: null, konec: true }));
    expect(u.gizmos.has("prst2")).toBe(false);
  });

  it("nápověda hry: u stolu „Číst čítanku“ (primary_action) a „Škola“ (follow), u tabule „Škola“; stisk = akce", async () => {
    const c = klient();
    (c.ctx as any).ActionHint.keys = () => ["primary_action", "chat_focus_follow_init", "use"];
    const okoli = (o: object) => c.deliver("skola:okoli", JSON.stringify({ dosah: 1.6, tridy: [{ id: 1, mista: [[0, 2, 0]], tabule: [5, 5, 1.5], zadani: false, moje: true, ...o }] }));
    okoli({ zadani: true });
    await vi.advanceTimersByTimeAsync(300);
    const h = () => [...c.hints.values()].map((x) => [x.key, x.text]);
    expect(h()).toEqual([["primary_action", "Číst čítanku"], ["chat_focus_follow_init", "Škola: psát do písanky"]]);
    expect(c.notices.filter((t) => t.includes("/skola"))).toEqual([]); // žádné příkazy, když hra nápovědu ukáže
    [...c.hints.values()][0].handler();
    expect(c.posl("skola:sklonit")).toHaveLength(1);
    [...c.hints.values()][1].handler();
    expect(c.posl("skola:uiOtevrit")).toEqual([{ web: true }]);
    // u tabule jen panel, daleko nic
    c.pose.position.x = 5;
    c.pose.position.y = 5;
    await vi.advanceTimersByTimeAsync(300);
    expect(h()).toEqual([["chat_focus_follow_init", "Škola: tabule a hodina"]]);
    c.pose.position.x = 50;
    await vi.advanceTimersByTimeAsync(300);
    expect(h()).toEqual([]);
  });

  it("záloha bez nápovědy hry: u stolu příkaz čítanky (a písanky), u tabule /skola, jinde nic; žádné klávesy", async () => {
    const c = klient();
    // kamera falešného klienta je v (0; 1,5; 1,6): poloha hráče = kamera - 1,6 m
    const okoli = (o: object) => c.deliver("skola:okoli", JSON.stringify({ dosah: 1.6, tridy: [{ id: 1, mista: [[0, 2, 0]], tabule: [5, 5, 1.5], zadani: false, moje: true, ...o }] }));
    okoli({});
    await vi.advanceTimersByTimeAsync(300);
    expect(c.notices.at(-1)).toBe("[/skola cist] sklonit se nad čítanku");
    expect(c.hints.size).toBe(0);
    okoli({ zadani: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(c.notices.at(-1)).toContain("[/skola psat] psát do písanky");
    // stav hodiny a nápověda jsou v infotextu spolu
    c.deliver("skola:stav", JSON.stringify({ text: "Hodina u Henry: A a" }));
    expect(c.notices.at(-1)).toBe(`Hodina u Henry: A a${NL}[/skola cist] sklonit se nad čítanku · [/skola psat] psát do písanky`);
    // u tabule
    c.pose.position.x = 5;
    c.pose.position.y = 5;
    await vi.advanceTimersByTimeAsync(300);
    expect(c.notices.at(-1)).toBe(`Hodina u Henry: A a${NL}[/skola] tabule a hodina`);
    // daleko: jen stav hodiny
    c.pose.position.x = 50;
    await vi.advanceTimersByTimeAsync(300);
    expect(c.notices.at(-1)).toBe("Hodina u Henry: A a");
  });

  it("panel: stránka se nahraje předem, pohled ze serveru dostane až po hello, akce a zavření jdou serveru", async () => {
    const c = klient();
    expect(c.views.map((v) => v.url)).toEqual(["fw://resources/skola/ui/index.html", "fw://resources/skola/ui/karta.html"]); // nahrané předem, schované
    const v = c.views[0];
    const pohled = { seq: 3, obrazovka: "trida", ucitel: true, titulek: "Škola", ja: {}, akce: [] };
    c.deliver("skola:ui", JSON.stringify(pohled));
    expect(v.emitted).toEqual([]); // stránka ještě není hotová: pohled počká
    v.handlers.get("skola:uiHello")!();
    expect(v.emitted[0]).toMatchObject(["skola:texty", { jazyk: "cs", texty: { "page.close": "Zavřít" } }]); // nejdřív texty stránky
    expect(bezTextu(v.emitted)).toEqual([["skola:ui", pohled]]);
    expect(v).toMatchObject({ shown: true, focused: true });
    expect(c.posl("skola:uiHello")).toHaveLength(1);
    // klik na stránce: id akce (a hodnota z dotazu) jde serveru
    v.handlers.get("skola:uiAkce")!(JSON.stringify({ seq: 3, id: "tabule:text", hodnota: "Ema mele maso." }));
    expect(c.posl("skola:uiAkce")).toEqual([{ seq: 3, id: "tabule:text", hodnota: "Ema mele maso." }]);
    // Esc na stránce: panel pryč, vstup zpátky hře
    v.handlers.get("skola:uiPryc")!();
    expect(v).toMatchObject({ shown: false, focused: false });
    expect(c.posl("skola:uiPryc")).toHaveLength(1);
    // pohled, který byl na cestě, když hráč zavřel, panel znovu neotevře
    c.deliver("skola:ui", JSON.stringify({ ...pohled, seq: 4 }));
    expect(v.shown).toBe(false);
    await vi.advanceTimersByTimeAsync(1600);
    c.deliver("skola:ui", JSON.stringify({ ...pohled, seq: 5 }));
    expect(v.shown).toBe(true);
    // server zavře panel (otevřelo se plátno nebo čítanka)
    c.deliver("skola:uiZavrit", "{}");
    expect(v.shown).toBe(false);
  });

  it("výchozí UI vypnuté (SKOLA_CONFIG.ui = false): panel = nativní nabídka serveru, karta = infotext", async () => {
    const c = klient(false);
    c.views.forEach((v) => v.handlers.get("skola:uiHello")?.()); // stránky se nahrály, ale UI je odpojené
    c.deliver("skola:ui", JSON.stringify({ seq: 1, obrazovka: "trida", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(c.views.some((v) => v.shown)).toBe(false);
    expect(c.posl("skola:uiOtevrit")).toEqual([{ web: false }]);
    const hodina = { role: "zak", ucitel: "Henry", strana: "A a", pismeno: "a", minut: 3, minMinut: 10, zadani: null, cte: null, ja: { sedi: true, ctu: false, pisanka: null, nazev: "Písmena", xp: 12, od: 10, do: 18, dalsi: "písmeno E" } };
    c.deliver("skola:karta", JSON.stringify({ nastaveni: { zapnuto: true, strana: "vpravo", vyska: 22 }, hodina }));
    c.deliver("skola:stav", JSON.stringify({ text: "Hodina u Henry: A a" }));
    expect(c.notices.at(-1)).toBe("Hodina u Henry: A a"); // bez karty jde stav do infotextu
  });

  it("vlastní UI frameworku přes setUi nahradí výchozí; když jeho resource skončí, výchozí se vrátí", async () => {
    const c = klient();
    const vychozi = c.views[0];
    vychozi.handlers.get("skola:uiHello")!();
    const setUi = c.exportsReg.get("setUi") as (ui: object, owner: string) => boolean;
    const pohledy: any[] = [];
    let api: any = null;
    const karty: any[] = [];
    expect(setUi({ panel: { pripojit: (a: any) => (api = a), ukazat: (v: any) => (pohledy.push(v), true), schovat: () => undefined }, karta: { ukazat: (s: any) => karty.push(s), aktivni: () => true } }, "muj-fw")).toBe(true);
    expect(api.verze).toBe(1);
    api.otevrit();
    expect(c.posl("skola:uiOtevrit")).toEqual([{ web: true }]);
    c.deliver("skola:ui", JSON.stringify({ seq: 7, obrazovka: "trida", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(pohledy.map((v) => v.seq)).toEqual([7]);
    expect(vychozi.shown).toBe(false); // výchozí panel je odpojený
    api.akce("hodina:zacit");
    expect(c.posl("skola:uiAkce")).toEqual([{ seq: 7, id: "hodina:zacit" }]);
    api.zavreno();
    expect(c.posl("skola:uiPryc")).toHaveLength(1);
    // karta: stav hodiny od jádra, ne v infotextu
    const hodina = { role: "ucitel", ucitel: "Henry", strana: "A a", pismeno: "a", minut: 3, minMinut: 10, zadani: null, cte: null, zaci: [] };
    c.deliver("skola:karta", JSON.stringify({ nastaveni: { zapnuto: true, strana: "vlevo", vyska: 10 }, hodina }));
    expect(karty.at(-1)).toMatchObject({ ukaz: { hodina }, videt: true, nastaveni: { strana: "vlevo" } });
    // jazyk: texty pro UI od jádra
    expect(api.t("page.close")).toBe("Zavřít");
    let zmena = "";
    api.naJazyk((j: string) => (zmena = j));
    c.deliver("skola:jazyk", JSON.stringify({ jazyk: "en", vychozi: "cs", texty: { "page.close": "Close!" } }));
    expect(zmena).toBe("en");
    expect(api.t("page.close")).toBe("Close!"); // texty od serveru mají přednost (úpravy, další jazyky)
    expect(api.texty(["card."])["card.nobody"]).toBe("Nobody in the lesson yet.");
    // framework skončil: zpátky výchozí UI školy
    c.deliver("resourceStop", "muj-fw");
    await vi.advanceTimersByTimeAsync(1600); // panel hráč výše zavřel: pohled na cestě ho 1,5 s neotevře
    c.deliver("skola:ui", JSON.stringify({ seq: 8, obrazovka: "trida", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(pohledy).toHaveLength(1);
    expect(vychozi.shown).toBe(true);
  });

  it("framework vymění jen panel: výchozí karta dál dostává texty v novém jazyce; setUi(null) a konec frameworku vrátí výchozí UI", async () => {
    const c = klient();
    const [panel, karta] = c.views;
    karta.handlers.get("skola:kartaHello")!();
    const setUi = c.exportsReg.get("setUi") as (ui: object, owner: string) => boolean;
    setUi({ panel: { ukazat: () => true, schovat: () => undefined } }, "fw");
    c.deliver("skola:jazyk", JSON.stringify({ jazyk: "en", vychozi: "cs", texty: {} }));
    expect(karta.emitted.filter(([n]) => n === "skola:texty").at(-1)).toMatchObject(["skola:texty", { jazyk: "en", texty: { "card.nobody": "Nobody in the lesson yet." } }]);
    // framework UI vypne úplně (null), pak skončí: výchozí panel se vrátí
    setUi({ panel: null, karta: null }, "fw");
    c.deliver("resourceStop", "fw");
    panel.handlers.get("skola:uiHello")!();
    c.deliver("skola:ui", JSON.stringify({ seq: 1, obrazovka: "trida", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(panel.shown).toBe(true);
  });

  it("jazyk hráče: nápověda u stolu a texty stránky anglicky", async () => {
    const c = klient();
    c.deliver("skola:jazyk", JSON.stringify({ jazyk: "en", vychozi: "cs", texty: {} }));
    (c.ctx as any).ActionHint.keys = () => ["primary_action", "chat_focus_follow_init"];
    c.deliver("skola:okoli", JSON.stringify({ dosah: 1.6, tridy: [{ id: 1, mista: [[0, 2, 0]], tabule: null, zadani: false, moje: false }] }));
    await vi.advanceTimersByTimeAsync(300);
    expect([...c.hints.values()].map((x) => x.text)).toEqual(["Read the reader", "School"]);
    expect(c.views[0].emitted.length).toBe(0);
    c.views[0].handlers.get("skola:uiHello")!();
    expect(c.views[0].emitted[0]).toMatchObject(["skola:texty", { jazyk: "en", texty: { "page.close": "Close" } }]);
  });

  it("karta hodiny: bez fokusu na kraji obrazovky, schová ji panel, prst a klávesy jdou do ní místo infotextu", async () => {
    const c = klient();
    const k = c.views[1];
    const panel = c.views[0];
    k.handlers.get("skola:kartaHello")!();
    panel.handlers.get("skola:uiHello")!();
    const hodina = { role: "ucitel", ucitel: "Henry", strana: "A a", pismeno: "a", minut: 3, minMinut: 10, zadani: null, cte: "Hans", zaci: [{ jmeno: "Hans", sedi: true, cte: true, pisanka: null }] };
    c.deliver("skola:karta", JSON.stringify({ nastaveni: { zapnuto: true, strana: "vpravo", vyska: 22 }, hodina }));
    expect(k).toMatchObject({ shown: true, focused: false }); // vidět, ale myš ani klávesy nebere
    expect(k.emitted.at(-1)).toEqual(["skola:kartaUkaz", { hodina, prst: null, stavba: null, klavesy: "" }]);
    // písař: prst čtoucího žáka v kartě, ne v infotextu
    const pred = c.notices.length;
    c.deliver("skola:prstUcitel", JSON.stringify({ pid: 2, jmeno: "Hans", list: LIST, x: 100, y: 80, slovo: "Ema", vidi: "Ewa" }));
    expect(k.emitted.at(-1)![1].prst).toBe("Hans ukazuje na „Ema“ (vidí „Ewa“)");
    expect(c.notices.slice(pred).some((t) => t.includes("ukazuje"))).toBe(false);
    // otevřený panel kartu schová, zavřený ji vrátí
    c.deliver("skola:ui", JSON.stringify({ seq: 1, obrazovka: "hodina", ucitel: true, titulek: "Hodina", ja: {}, akce: [] }));
    expect(k.shown).toBe(false);
    panel.handlers.get("skola:uiPryc")!();
    expect(k.shown).toBe(true);
    // konec hodiny: karta zmizí
    c.deliver("skola:karta", JSON.stringify({ nastaveni: { zapnuto: true, strana: "vpravo", vyska: 22 }, hodina: null }));
    expect(k.shown).toBe(false);
  });

  it("umisťování: PropPlacer s náhledem, obrys tabule podle normály, špatný povrch = veto, potvrzení a konec jdou serveru", async () => {
    const c = klient();
    const on = new Map<string, (pose: any, valid: boolean) => void>();
    const placer = { begin: null as any, veto: [] as boolean[], pose: null as any, active: false, odmitnout: 1, pokusy: 0 };
    (c.ctx as any).Quaternion = class { constructor(public w: number, public x: number, public y: number, public z: number) {} };
    (c.ctx as any).PropPlacer = {
      // jako ve hře: dokud panel drží vstup, placer odmítne (tady první pokus)
      begin: (o: any) => (placer.pokusy++, placer.odmitnout-- > 0 ? false : ((placer.begin = o), (placer.active = true), true)),
      end: () => ((placer.active = false), on.get("end")?.(null, false)),
      isActive: () => placer.active,
      setVeto: (x: boolean) => (placer.veto.push(x), true),
      getPose: () => placer.pose,
      on: (e: string, f: any) => (on.set(e, f), () => on.delete(e)),
    };
    const v = c.views[0];
    v.handlers.get("skola:uiHello")!();
    c.deliver("skola:ui", JSON.stringify({ seq: 1, obrazovka: "pruvodce", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(v.shown).toBe(true);
    c.deliver("skola:umistit", JSON.stringify({ druh: "zed", nazev: "Tabule na zeď", models: ["paper_a"], scale: 0.01, yaw: 0, znovu: false, obrys: { w: 1.6, h: 1 }, maxDalka: 10 }));
    expect(v).toMatchObject({ shown: false, focused: false }); // panel ustoupí a pustí vstup
    expect(placer.pokusy).toBe(0); // placer až po chvíli, ne ve stejném okamžiku
    await vi.advanceTimersByTimeAsync(300);
    expect(placer.pokusy).toBe(1); // první pokus hra odmítla
    expect(c.posl("skola:umisteno")).toEqual([]); // server se nic nedozví, zkouší se znovu
    c.deliver("skola:ui", JSON.stringify({ seq: 2, obrazovka: "pruvodce", ucitel: true, titulek: "Škola", ja: {}, akce: [] }));
    expect(v.shown).toBe(false); // než placer naběhne, panel se znovu neukáže
    await vi.advanceTimersByTimeAsync(300);
    expect(placer.pokusy).toBe(2);
    expect(placer.begin).toMatchObject({ models: ["paper_a"], scale: 0.01, keepOpen: false, alignToSurface: false, rules: { maxDistance: 10, requireSurface: true } });
    expect(c.notices.at(-1)).toBe("Tabule na zeď: klik postaví · kolečko otáčí · Esc konec");
    // míří na zeď: zelený obdélník 1,6 × 1 m na zdi
    const q = { w: 1, x: 0, y: 0, z: 0 };
    placer.pose = { position: new Vec(0, 4, 1.5), normal: new Vec(0, -1, 0), rotation: q, onSurface: true };
    await vi.advanceTimersByTimeAsync(60);
    const g = c.gizmos.get("umistit-obrys")!;
    expect(g.style.color).toBe(0xff7fd18b);
    const xs = g.prim.points.map((p: any) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.6, 3);
    // míří na podlahu: červeně a veto (klik se odmítne)
    placer.pose = { ...placer.pose, normal: new Vec(0, 0, 1) };
    await vi.advanceTimersByTimeAsync(60);
    expect(c.gizmos.get("umistit-obrys")!.style.color).toBe(0xffe0645a);
    expect(placer.veto).toEqual([true]);
    on.get("rejected")!(placer.pose, false);
    expect(c.notices.at(-1)).toBe("Tabule patří na svislou zeď.");
    // potvrzení: póza serveru (yaw z kvaternionu)
    on.get("confirm")!({ position: new Vec(0, 4, 1.5), normal: new Vec(0, -1, 0), rotation: { w: Math.SQRT1_2, x: 0, y: 0, z: Math.SQRT1_2 } }, true);
    expect(c.posl("skola:umisteno")).toEqual([{ druh: "zed", pos: [0, 4, 1.5], n: [0, -1, 0], yaw: 90 }]);
    // konec (Esc nebo po jednom kusu): obrys pryč, server vrátí panel
    on.get("end")!(null, false);
    expect(c.gizmos.has("umistit-obrys")).toBe(false);
    expect(c.posl("skola:umisteno").at(-1)).toEqual({ konec: true });
  });
});
