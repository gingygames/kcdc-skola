// Oprávnění školy: schopnosti (co jde udělat) -> role (kdo to smí) -> práva frameworku.
//
// Škola se nikdy neptá přímo na roli, jen na schopnost: muze(pid, "lesson.run"). Rozhodnutí v tomhle pořadí:
//   1. háček frameworku opravneni(pid, schopnost, role) - vrátí true/false; undefined = rozhodni sám (dál)
//   2. jemné právo "skola.<schopnost>" v mostu (most.perms.has), např. skola.lesson.xp
//   3. role schopnosti (výchozí tabulka SCHOPNOSTI, přemapovatelná SKOLA_CONFIG.opravneni): student = každý,
//      teacher = právo skola.ucit (nebo háček jeUcitel), admin = skola.admin (nebo admin), debug = skola.debug.
//      Admin smí všechno. Bez mostu platí seznamy SKOLA_CONFIG.ucitele / admini / ladici (přezdívky, "*" = všichni).
//
// Návod pro framework: docs/ADAPTING.md, oddíl Permissions.

export type Role = "student" | "teacher" | "admin" | "debug";

/** schopnost -> role, které ji mají (admin má vždy všechno) */
export const SCHOPNOSTI = {
  "school.use": ["student"], // panel školy, gramotnost, čítanka
  "school.write": ["student"], // psát do písanky při hodině
  "class.create": ["teacher"], // založit třídu
  "class.edit": ["teacher"], // zařídit a měnit vlastní třídu
  "class.manage": ["admin"], // měnit a učit v cizí třídě
  "class.delete": ["admin"], // zrušit cizí třídu (F10)
  "class.limit.bypass": ["admin"], // víc tříd, než dovolí nastavení
  "lesson.run": ["teacher"], // vést hodinu, vyvolávat, písanky, tabule
  "lesson.xp": ["teacher"], // rozdat XP na konci hodiny (s ochranami)
  "xp.edit": ["admin"], // přidat / nastavit XP komukoli (/skola dat, xp, F10)
  "xp.view": ["admin", "debug"], // gramotnost jiného hráče (F10)
  "settings.edit": ["admin"], // F10 → Nastavení → Škola
  "debug.view": ["debug"], // /skola debug: stav, třídy, hodiny, pohled panelu, háčky
  "debug.preview": ["debug"], // text na jakémkoli stupni gramotnosti, jazyk náhledu
  "debug.tools": ["debug"], // oprava desek tříd, podrobný log, znovu načíst
} as const satisfies Record<string, readonly Role[]>;

export type Schopnost = keyof typeof SCHOPNOSTI;
export const SEZNAM_SCHOPNOSTI = Object.keys(SCHOPNOSTI) as Schopnost[];

/** role -> právo frameworku (most.perms) */
export const PRAVO_ROLE: Record<Exclude<Role, "student">, string> = { teacher: "skola.ucit", admin: "skola.admin", debug: "skola.debug" };

export type HacekOpravneni = (pid: number, schopnost: Schopnost, role: readonly Role[]) => boolean | undefined | null | Promise<boolean | undefined | null>;

export interface ZdrojeOpravneni {
  /** most.perms.has (nebo cokoli se stejným tvarem) */
  pravo(pid: number, pravo: string): Promise<boolean>;
  /** háčky frameworku (čte se při každém dotazu: vyměnitelné za běhu) */
  hacky(): { opravneni?: HacekOpravneni; jeUcitel?: (pid: number) => boolean | Promise<boolean> };
  /** přemapování schopností z configu: { "lesson.xp": ["admin"] } */
  mapa?: Partial<Record<string, readonly Role[]>>;
  log?: (t: string) => void;
}

export function vytvoritOpravneni(z: ZdrojeOpravneni) {
  const log = z.log ?? (() => undefined);
  const role = (s: Schopnost): readonly Role[] => {
    const m = z.mapa?.[s];
    return Array.isArray(m) && m.every((r) => ["student", "teacher", "admin", "debug"].includes(r)) ? m : SCHOPNOSTI[s];
  };

  async function maRoli(pid: number, r: Role): Promise<boolean> {
    if (r === "student") return true;
    if (r === "teacher") {
      const h = z.hacky().jeUcitel;
      if (h) {
        try {
          return !!(await h(pid));
        } catch (e) {
          log(`háček jeUcitel: ${String(e)}`);
        }
      }
    }
    return z.pravo(pid, PRAVO_ROLE[r]);
  }

  async function muze(pid: number, s: Schopnost): Promise<boolean> {
    if (!(s in SCHOPNOSTI)) return false;
    const rs = role(s);
    const h = z.hacky().opravneni;
    if (h) {
      try {
        const v = await h(pid, s, rs);
        if (v === true || v === false) return v;
      } catch (e) {
        log(`háček opravneni(${s}): ${String(e)}`);
      }
    }
    if (await z.pravo(pid, "skola." + s)) return true;
    for (const r of rs) if (await maRoli(pid, r)) return true;
    return rs[0] !== "admin" && (await z.pravo(pid, PRAVO_ROLE.admin)); // admin smí všechno
  }

  /** role hráče (ladění, F10) */
  async function roleHrace(pid: number): Promise<Role[]> {
    const out: Role[] = ["student"];
    for (const r of ["teacher", "admin", "debug"] as const) if (await maRoli(pid, r)) out.push(r);
    return out;
  }

  /** co hráč smí (ladění, F10, export) */
  async function schopnostiHrace(pid: number): Promise<Schopnost[]> {
    const out: Schopnost[] = [];
    for (const s of SEZNAM_SCHOPNOSTI) if (await muze(pid, s)) out.push(s);
    return out;
  }

  return { muze, maRoli, roleHrace, schopnostiHrace, role };
}
export type Opravneni = ReturnType<typeof vytvoritOpravneni>;
