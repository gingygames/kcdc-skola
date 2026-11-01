// Překlady (src/shared/i18n.ts, src/lang/) a oprávnění (src/opravneni.ts) bez hry.
import { describe, expect, it } from "vitest";
import { T, chybi, jazyky, oblast, odebratVlastnika, parametry, pridatPreklady, t, tz } from "../src/shared/i18n";
import { VESTAVENE, nahratVestavene } from "../src/lang";
import { SCHOPNOSTI, vytvoritOpravneni, type Role } from "../src/opravneni";
import { chybejiciZnaky } from "../src/shared/pismo";
import { SLABIKARE } from "../src/data";

nahratVestavene();

describe("slovníky", () => {
  it("en má každý klíč cs se stejnými parametry (a nic navíc)", () => {
    const cs = VESTAVENE.cs;
    const en = VESTAVENE.en;
    expect(Object.keys(cs).length).toBeGreaterThan(150);
    expect(chybi("en")).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in cs))).toEqual([]);
    const spatne = Object.keys(cs).filter((k) => parametry(cs[k]).join() !== parametry(en[k]).join());
    expect(spatne).toEqual([]);
  });

  it("klíče mají oblast (msg, view, cmd, admin, set, level, letters, client, page, card)", () => {
    const zle = Object.keys(VESTAVENE.cs).filter((k) => !/^(msg|view|cmd|admin|set|level|letters|client|page|card)\.[\w.]+$/.test(k));
    expect(zle).toEqual([]);
  });

  it("parametry, tvary podle čísla, vnořené zprávy, náhrada chybějícího klíče", () => {
    pridatPreklady("cs", { "msg.test.n": "{n} {n|třída|třídy|tříd}", "msg.test.in": "{kdo}: {co}" });
    pridatPreklady("en", { "msg.test.n": "{n} {n|class|classes}" });
    expect([1, 2, 5].map((n) => t("cs", "msg.test.n", { n }))).toEqual(["1 třída", "2 třídy", "5 tříd"]);
    expect([1, 2].map((n) => t("en", "msg.test.n", { n }))).toEqual(["1 class", "2 classes"]);
    expect(t("cs", "msg.test.in", { kdo: "Hans", co: T("msg.test.n", { n: 3 }) })).toBe("Hans: 3 třídy");
    // en nemá klíč: výchozí jazyk serveru, pak cs; neznámý klíč = klíč
    expect(t("en", "msg.test.in", { kdo: "A", co: "b" })).toBe("A: b");
    expect(t("de", "msg.test.n", { n: 1 }, "en")).toBe("1 class");
    expect(t("cs", "msg.neni.takovy")).toBe("msg.neni.takovy");
    expect(tz("cs", "hotový text")).toBe("hotový text");
  });

  it("jazyk přidaný resource zmizí s ním, ostatní přidané zůstanou", () => {
    pridatPreklady("de", { "page.close": "Schließen" }, "fw-a");
    pridatPreklady("de", { "page.done": "Fertig" }, "fw-b");
    expect(jazyky()).toContain("de");
    expect(odebratVlastnika("fw-a", nahratVestavene)).toBe(true);
    expect(t("de", "page.close", undefined, "cs")).toBe("Zavřít");
    expect(t("de", "page.done")).toBe("Fertig");
    expect(oblast("de", ["page."])["page.brand"]).toBe("Škola"); // řetěz: de -> cs
  });

  it("slabikáře jazyků jdou napsat ručním písmem", () => {
    for (const [j, s] of Object.entries(SLABIKARE)) {
      for (const p of s.slabikar) expect(chybejiciZnaky(p.text.replace(/\{\/?lat\}/g, "") + p.predloha), `${j} ${p.id}`).toEqual([]);
      expect(new Set(s.poradi).size, j).toBe([...s.poradi].length);
    }
  });
});

describe("oprávnění", () => {
  const prava = (granted: Record<number, string[]>, hacky: Parameters<typeof vytvoritOpravneni>[0]["hacky"] = () => ({}), mapa?: Record<string, Role[]>) =>
    vytvoritOpravneni({ pravo: async (pid, p) => (granted[pid] ?? []).includes(p) || (granted[pid] ?? []).includes("*"), hacky, mapa });

  it("role: student každý, písař skola.ucit, ladič skola.debug, admin všechno", async () => {
    const o = prava({ 1: [], 2: ["skola.ucit"], 3: ["skola.debug"], 4: ["skola.admin"] });
    expect(await o.muze(1, "school.use")).toBe(true);
    expect(await o.muze(1, "lesson.run")).toBe(false);
    expect(await o.muze(2, "lesson.run")).toBe(true);
    expect(await o.muze(2, "debug.view")).toBe(false);
    expect(await o.muze(3, "debug.view")).toBe(true);
    expect(await o.muze(3, "lesson.run")).toBe(false);
    for (const s of Object.keys(SCHOPNOSTI)) expect(await o.muze(4, s as keyof typeof SCHOPNOSTI), s).toBe(true);
    expect(await o.roleHrace(3)).toEqual(["student", "debug"]);
  });

  it("žádná schopnost není předponou jiné (právo skola.a by v mostu dalo i skola.a.b)", () => {
    const s = Object.keys(SCHOPNOSTI);
    expect(s.filter((a) => s.some((b) => b !== a && b.startsWith(a + ".")))).toEqual([]);
  });

  it("jemné právo skola.<schopnost> přidá jednu schopnost", async () => {
    const o = prava({ 5: ["skola.xp.edit"] });
    expect(await o.muze(5, "xp.edit")).toBe(true);
    expect(await o.muze(5, "settings.edit")).toBe(false);
  });

  it("háček frameworku rozhodne (true/false), undefined = škola sama; jeUcitel dává roli písaře", async () => {
    const o = prava({ 2: ["skola.ucit"] }, () => ({
      opravneni: (pid, s) => (s === "lesson.xp" ? pid === 9 : undefined),
      jeUcitel: (pid) => pid === 9,
    }));
    expect(await o.muze(2, "lesson.xp")).toBe(false); // framework: XP dává jen 9
    expect(await o.muze(9, "lesson.xp")).toBe(true);
    expect(await o.muze(9, "lesson.run")).toBe(true); // jeUcitel z frameworku
    expect(await o.muze(2, "lesson.run")).toBe(false); // háček jeUcitel přebíjí právo skola.ucit
  });

  it("přemapování schopností z configu", async () => {
    const o = prava({ 2: ["skola.ucit"], 3: ["skola.debug"] }, () => ({}), { "lesson.xp": ["admin"], "debug.view": ["teacher", "debug"] });
    expect(await o.muze(2, "lesson.xp")).toBe(false);
    expect(await o.muze(2, "debug.view")).toBe(true);
    expect(await o.muze(3, "debug.view")).toBe(true);
  });
});
