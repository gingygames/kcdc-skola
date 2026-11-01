// Výchozí slabikář: stránky v pořadí odemykání písmen (citelnost.ts PRAVIDLA.poradi). Písař ho mění v F10
// (Nastavení → Škola → Slabikář). Text může obsahovat {lat}…{/lat} (latina) a \n (nový řádek).

export interface Strana {
  id: string;
  nazev: string; // v nabídce a nad listem
  pismeno: string; // písmeno lekce ("" = čtení)
  text: string; // na čítanku
  predloha: string; // do písanky (obtahuje se)
}

export const SLABIKAR: Strana[] = [
  { id: "a", nazev: "A a", pismeno: "a", text: "A a A a\na a a\nA A A", predloha: "A a" },
  { id: "e", nazev: "E e", pismeno: "e", text: "E e E e\na e a e\nA E", predloha: "E e" },
  { id: "i", nazev: "I i", pismeno: "i", text: "I i I i\na i e i\nAI EI", predloha: "I i" },
  { id: "o", nazev: "O o", pismeno: "o", text: "O o O o\no a o e\nOI AO", predloha: "O o" },
  { id: "u", nazev: "U u", pismeno: "u", text: "U u U u\nau ou eu\nAU OU", predloha: "U u" },
  { id: "m", nazev: "M m", pismeno: "m", text: "M m M m\nma me mi mo mu\nmama, Ema, umí", predloha: "M m ma" },
  { id: "l", nazev: "L l", pismeno: "l", text: "L l L l\nla le li lo lu\nlama, mele, Ola, mlelo", predloha: "L l la" },
  { id: "s", nazev: "S s", pismeno: "s", text: "S s S s\nsa se si so su\nsolo, osel, mise, sele", predloha: "S s so" },
  { id: "p", nazev: "P p", pismeno: "p", text: "P p P p\npa pe pi po pu\npes, pila, lupa, sopel", predloha: "P p pes" },
  { id: "t", nazev: "T t", pismeno: "t", text: "T t T t\nta te ti to tu\ntata, tele, oplet, lopata", predloha: "T t to" },
  { id: "v", nazev: "V v", pismeno: "v", text: "V v V v\nva ve vi vo vu\nvosa, vlas, sova, Vitus", predloha: "V v vosa" },
  { id: "n", nazev: "N n", pismeno: "n", text: "N n N n\nna ne ni no nu\nnos, noviny, Nela, sen", predloha: "N n nos" },
  { id: "d", nazev: "D d", pismeno: "d", text: "D d D d\nda de di do du\ndomov, voda, Dana, pod", predloha: "D d dum" },
  { id: "k", nazev: "K k", pismeno: "k", text: "K k K k\nka ke ki ko ku\nkoza, kolo, okno, kapuce", predloha: "K k kolo" },
  { id: "r", nazev: "R r", pismeno: "r", text: "R r R r\nra re ri ro ru\nruka, rosa, kostel, vrba", predloha: "R r ruka" },
  { id: "cteni1", nazev: "Čteme: U mlýna", pismeno: "", text: "Ema mele maso.\nPes leží u domu.\nTáta nese vodu od mlýna.", predloha: "Ema mele." },
  { id: "cteni2", nazev: "Čteme: Na trhu", pismeno: "", text: "Na trhu prodává kupec sukno a sůl.\nPísař píše listinu pro pana purkrabího.\nKdo umí číst, ten nekoupí zajíce v pytli.", predloha: "Kdo umí číst." },
  { id: "latina", nazev: "Latina: Otče náš", pismeno: "", text: "{lat}Pater noster, qui es in caelis,\nsanctificetur nomen tuum.{/lat}\nOtče náš, jenž jsi na nebesích,\nposvěť se jméno tvé.", predloha: "Pater noster" },
];

/** anglický slabikář (primer): pořadí písmen podle častosti v angličtině */
export const PORADI_EN = "aeitonsrhldcumwfgypbvkjxqz";

export const SLABIKAR_EN: Strana[] = [
  { id: "a", nazev: "A a", pismeno: "a", text: "A a A a\na a a\nA A A", predloha: "A a" },
  { id: "e", nazev: "E e", pismeno: "e", text: "E e E e\na e a e\nA E", predloha: "E e" },
  { id: "i", nazev: "I i", pismeno: "i", text: "I i I i\na i e i\nAI EI", predloha: "I i" },
  { id: "t", nazev: "T t", pismeno: "t", text: "T t T t\nta te ti\nat, it, tea", predloha: "T t at" },
  { id: "o", nazev: "O o", pismeno: "o", text: "O o O o\nto, too, toe\nIt is too tight", predloha: "O o to" },
  { id: "n", nazev: "N n", pismeno: "n", text: "N n N n\nan, in, on, not\nTen men in a tent", predloha: "N n on" },
  { id: "s", nazev: "S s", pismeno: "s", text: "S s S s\nsat, sit, set\nSo it is said", predloha: "S s so" },
  { id: "r", nazev: "R r", pismeno: "r", text: "R r R r\nran, rest, rose\nThe river is near", predloha: "R r ran" },
  { id: "h", nazev: "H h", pismeno: "h", text: "H h H h\nhat, hen, horse\nHe has his horse", predloha: "H h he" },
  { id: "l", nazev: "L l", pismeno: "l", text: "L l L l\nlet, lot, lord\nThe lord holds the land", predloha: "L l lord" },
  { id: "d", nazev: "D d", pismeno: "d", text: "D d D d\nden, dot, door\nThe old dog sleeps", predloha: "D d dog" },
  { id: "c", nazev: "C c", pismeno: "c", text: "C c C c\ncat, cart, coin\nA coin for the cart", predloha: "C c cat" },
  { id: "m", nazev: "M m", pismeno: "m", text: "M m M m\nman, mill, more\nThe miller grinds meal", predloha: "M m mill" },
  { id: "read1", nazev: "Reading: At the mill", pismeno: "", text: "The miller grinds the corn.\nThe dog rests near the door.\nFather carries water from the well.", predloha: "The mill." },
  { id: "read2", nazev: "Reading: At the market", pismeno: "", text: "At the market a merchant sells cloth and salt.\nThe scribe writes a letter for the burgrave.\nWho can read is not easily fooled.", predloha: "Who can read." },
  { id: "latin", nazev: "Latin: Our Father", pismeno: "", text: "{lat}Pater noster, qui es in caelis,\nsanctificetur nomen tuum.{/lat}\nOur Father, who art in heaven,\nhallowed be thy name.", predloha: "Pater noster" },
];

/** výchozí obsah výuky podle jazyka (F10 → Škola → Načíst slabikář jazyka); jiné jazyky si server napíše v F10 */
export const SLABIKARE: Record<string, { poradi: string; slabikar: Strana[] }> = {
  cs: { poradi: "aeioumlsptvndkrjbhzcyšžčřáéíóúůýěfgxqwďťň", slabikar: SLABIKAR },
  en: { poradi: PORADI_EN, slabikar: SLABIKAR_EN },
};
