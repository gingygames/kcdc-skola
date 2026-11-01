// Panel školy: vykreslí pohled ze serveru (`skola:ui`) a pošle zpět jen id akce (`skola:uiAkce`).
// Nic nerozhoduje - server je jediný zdroj pravdy (src/shared/ui.ts). Stránka nezná herní API, jen `callEvent`
// a CustomEvent z `Web.emit`, takže jde otevřít i v běžném prohlížeči (tools/ui-dev/) při ladění vzhledu.
"use strict";

var state = null;
var busy = false;
var cekaniTimer = 0;
var odemknoutTimer = 0;
var modal = null; // otevřený dotaz (vstup)
var pouzite = {}; // id akcí, které už mají své místo na stránce (zbytek jde do „Další akce“)
var konecVolby = {}; // formulář konce hodiny: co písař zaškrtl (přežije překreslení)
var sekce = {}; // které sbalitelné sekce má hráč otevřené (přežije překreslení)
var el = Kit.el;
var $ = function (id) { return document.getElementById(id); };

function call(name, payload) {
  try {
    if (typeof callEvent === "function") callEvent(name, JSON.stringify(payload === undefined ? null : payload));
    else console.log("→", name, payload);
  } catch (e) {
    console.log("callEvent", name, e);
  }
}

function akce(id) {
  if (!state) return null;
  for (var i = 0; i < state.akce.length; i++) if (state.akce[i].id === id) return state.akce[i];
  return null;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ── akce ────────────────────────────────────────────────────────────────────

function poslat(id, hodnota) {
  if (!state || busy) return;
  busy = true;
  var m = { seq: state.seq, id: id };
  if (hodnota !== undefined) m.hodnota = hodnota;
  call("skola:uiAkce", m);
  clearTimeout(cekaniTimer);
  cekaniTimer = setTimeout(function () { $("cekam").hidden = false; }, 220); // jen když odpověď trvá, ať nebliká
  clearTimeout(odemknoutTimer);
  odemknoutTimer = setTimeout(function () { busy = false; $("cekam").hidden = true; }, 5000);
}

function spustit(a) {
  var dal = function () { if (a.vstup) zeptat(a); else poslat(a.id); };
  if (!a.nebezpecne) return dal();
  Kit.confirm({ title: a.text + "?", text: a.nebezpecne, ok: a.text, danger: true }).then(function (ok) { if (ok) dal(); });
}

/** tlačítko akce ze serveru; null, když akce v pohledu není */
function tlacitko(id, o) {
  o = o || {};
  var a = akce(id);
  if (!a) return null;
  pouzite[id] = true;
  var cls = "k-btn" + (o.hlavni || (a.hlavni && !o.vedlejsi) ? "" : a.nebezpecne && o.danger ? " k-btn--danger" : o.tichy ? " k-btn--quiet" : " k-btn--ghost") + (o.sm ? " k-btn--sm" : "") + (o.cls ? " " + o.cls : "");
  var b = el("button", { type: "button", class: cls, title: a.vypnuto || a.tip || null, onclick: function () { if (o.klik) o.klik(a); else spustit(a); } }, o.ikona ? el("span", { class: "ikona", "aria-hidden": "true", text: o.ikona }) : null, o.text || a.text);
  if (a.vypnuto) b.disabled = true;
  return b;
}

/** řádek: tlačítko a vedle vysvětlení (tip nebo proč nejde) */
function radek(id, o) {
  var a = akce(id);
  var b = tlacitko(id, o);
  if (!b) return null;
  return el("div", { class: "radek-akce" }, b, a.vypnuto || a.tip ? el("span", { class: "radek-tip" + (a.vypnuto ? " je-vypnuto" : ""), text: a.vypnuto || a.tip }) : null);
}

/** dotaz na text (název, předloha, text na tabuli) */
function zeptat(a) {
  var v = a.vstup;
  var input = v.radky ? el("textarea", { rows: "3", maxlength: String(v.max || 300), placeholder: v.placeholder || "" }) : el("input", { type: "text", maxlength: String(v.max || 80), placeholder: v.placeholder || "" });
  input.value = v.value || "";
  var zavrit = function () {
    if (!modal) return;
    modal.release();
    modal.node.remove();
    modal = null;
  };
  var ok = function () {
    var t = input.value.trim();
    if (!t) return input.focus();
    zavrit();
    poslat(a.id, t);
  };
  input.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape") zavrit();
    if (e.key === "Enter" && (!v.radky || e.ctrlKey)) { e.preventDefault(); ok(); }
  });
  var volby = (v.volby || []).filter(function (x) { return x && x !== v.value; });
  var dialog = el("div", { class: "k-dialog", role: "dialog", "aria-modal": "true" },
    el("h2", { text: a.text }),
    el("div", { class: "k-field" }, el("label", { text: v.label }), input,
      v.radky ? el("span", { class: "k-help", text: T("page.input.multilineHelp") }) : null),
    volby.length ? el("div", { class: "volby" }, el("span", { class: "volby-popis", text: T("page.input.orPick") })) : null,
    el("div", { class: "k-actions" },
      el("button", { type: "button", class: "k-btn k-btn--ghost", text: T("page.cancel"), onclick: zavrit }),
      el("button", { type: "button", class: "k-btn", text: T("page.done"), onclick: ok })));
  if (volby.length) {
    var box = dialog.querySelector(".volby");
    volby.forEach(function (x) {
      box.appendChild(el("button", { type: "button", class: "k-chip", text: x.length > 36 ? x.slice(0, 35) + "…" : x, title: x, onclick: function () { input.value = x; input.focus(); } }));
    });
  }
  var node = el("div", { class: "k-modal", onclick: function (e) { if (e.target === node) zavrit(); } }, dialog);
  document.body.appendChild(node);
  modal = { node: node, release: Kit.trap(dialog) };
  input.focus();
  input.select();
}

// ── stavební kameny ────────────────────────────────────────────────────────

function karta(nadpis, aside) {
  var body = el("div", { class: "k-body" });
  var c = el("section", { class: "k-card karta" }, el("header", {}, el("h3", { text: nadpis }), aside || null), body);
  return { node: c, body: body };
}

function sbalitelna(nadpis, otevrena, popis) {
  var body = el("div", { class: "sbal-body" });
  var d = el("details", { class: "sbal" }, el("summary", {}, el("span", { class: "sbal-nadpis", text: nadpis }), popis ? el("span", { class: "sbal-popis", text: popis }) : null), body);
  if (sekce[nadpis] !== undefined ? sekce[nadpis] : otevrena) d.open = true;
  d.addEventListener("toggle", function () { sekce[nadpis] = d.open; });
  return { node: d, body: body };
}

function pridat(parent) {
  for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
  return parent;
}

function gramotnost(ja, velka) {
  var rozsah = ja.do !== null ? Math.max(1, ja.do - ja.od) : 1;
  var hotovo = ja.do !== null ? Math.max(0, Math.min(1, (ja.xp - ja.od) / rozsah)) : 1;
  var c = el("section", { class: "k-paper gramotnost" + (velka ? " je-velka" : "") },
    el("p", { class: "eyebrow eyebrow--papir", text: T("page.literacy.title") }),
    el("div", { class: "stupen" }, el("b", { text: ja.nazev }), el("span", { text: T("page.xp", { xp: ja.xp }) })),
    el("div", { class: "postup", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(hotovo * 100)) }, el("i", { style: "width:" + Math.round(hotovo * 100) + "%" })),
    el("p", { class: "dalsi", text: ja.dalsi ? T("page.literacy.next", { next: ja.dalsi, xp: ja.do }) : T("page.literacy.fluent") }));
  if (velka && ja.pismena && ja.stupen === 1) {
    var p = el("div", { class: "pismena" });
    ja.pismena.split(" ").forEach(function (x) { p.appendChild(el("span", { text: x })); });
    c.appendChild(el("p", { class: "maly", text: T("page.literacy.letters") }));
    c.appendChild(p);
  }
  if (velka) c.appendChild(el("figure", { class: "ukazka" }, el("figcaption", { text: T("page.literacy.sample") }), el("blockquote", { text: ja.ukazka })));
  return c;
}

function kroky(v) {
  var ol = el("ol", { class: "kroky", "aria-label": T("page.setup.stepsAria") });
  v.kroky.forEach(function (k, i) {
    var a = akce("pruvodce:krok:" + k.id);
    pouzite["pruvodce:krok:" + k.id] = true;
    var li = el("li", { class: (k.id === v.krok ? "je-aktivni " : "") + (k.hotovo ? "je-hotovo" : "") },
      el("button", { type: "button", onclick: function () { if (a) poslat(a.id); }, "aria-current": k.id === v.krok ? "step" : null },
        el("span", { class: "kolecko", text: k.hotovo ? "✓" : String(i + 1) }), el("span", { text: k.nazev })));
    ol.appendChild(li);
  });
  return ol;
}

/** velká volba (karta s obrázkem) pro stavbu */
function volba(id, ikona, popis, doporucena) {
  var a = akce(id);
  if (!a) return null;
  pouzite[id] = true;
  var b = el("button", { type: "button", class: "volba" + (doporucena ? " je-doporucena" : ""), title: a.vypnuto || null, onclick: function () { spustit(a); } },
    el("span", { class: "volba-ikona", "aria-hidden": "true", text: ikona }),
    el("span", { class: "volba-text" }, el("b", { text: a.text }), el("span", { text: a.vypnuto || popis || a.tip || "" })),
    doporucena ? el("span", { class: "k-badge k-badge--ok", text: T("page.recommended") }) : null);
  if (a.vypnuto) b.disabled = true;
  return b;
}

var IKONY = { tabule: "▭", stul: "⊓", lavice: "═", misto: "▤" };

function vybaveni(v, bezTabule) {
  var list = el("ul", { class: "kusy" });
  var n = 0;
  v.trida.vybaveni.forEach(function (k) {
    if (bezTabule && k.druh === "tabule") return;
    n++;
    list.appendChild(el("li", { class: "kus" },
      el("span", { class: "kus-ikona", "aria-hidden": "true", text: IKONY[k.druh] || "•" }),
      el("span", { class: "kus-text" }, el("b", { text: k.nazev }), el("small", { text: k.popis })),
      tlacitko("presunout:" + k.id, { sm: true, tichy: true, text: T("page.move") }),
      tlacitko("odebrat:" + k.id, { sm: true, tichy: true, text: T("page.remove") })));
  });
  return n ? list : el("p", { class: "prazdne", text: T("page.equipment.empty") });
}

function slabikar(v) {
  var g = el("div", { class: "slabikar", role: "listbox", "aria-label": T("page.primer.aria") });
  (v.slabikar || []).forEach(function (s) {
    var id = "strana:" + s.i;
    pouzite[id] = true;
    var vybrana = s.i === (v.hodina ? v.hodina.strana : v.strana);
    g.appendChild(el("button", { type: "button", role: "option", "aria-selected": vybrana ? "true" : "false", class: "strana" + (vybrana ? " je-vybrana" : ""), title: s.ukazka, onclick: function () { poslat(id); } },
      el("span", { class: "strana-pismeno", text: s.pismeno ? s.pismeno.toUpperCase() + s.pismeno : T("page.primer.reading") }),
      el("span", { class: "strana-nazev", text: s.nazev }),
      el("span", { class: "strana-znacky" }, s.obrazek ? el("i", { title: T("page.primer.hasPicture"), text: "✎" }) : null, s.pripravena ? el("i", { title: T("page.primer.prepared"), text: "●" }) : null)));
  });
  return g;
}

function seznamAkci(predpona, o) {
  var box = el("div", { class: "akce-seznam" });
  state.akce.forEach(function (a) {
    if (a.id.indexOf(predpona) === 0 && !pouzite[a.id]) pridat(box, radek(a.id, o));
  });
  return box;
}

// ── obrazovky ──────────────────────────────────────────────────────────────

var OBR = {};

OBR.vitej = function (v, obsah, pata) {
  var c = karta(T("page.welcome.title"));
  var ol = el("ol", { class: "postup-kroky" },
    el("li", {}, el("b", { text: T("page.welcome.step1") }), T("page.welcome.step1Text")),
    el("li", {}, el("b", { text: T("page.welcome.step2") }), T("page.welcome.step2Text")),
    el("li", {}, el("b", { text: T("page.welcome.step3") }), T("page.welcome.step3Text")));
  c.body.appendChild(ol);
  obsah.appendChild(c.node);
  obsah.appendChild(gramotnost(v.ja, false));
  pridat(pata, tlacitko("zalozit", { hlavni: true, ikona: "✦" }));
};

OBR.pruvodce = function (v, obsah, pata) {
  obsah.appendChild(kroky(v));
  var k = v.krok;
  if (k === "tabule") {
    obsah.appendChild(el("p", { class: "uvod", text: T("page.setup.boardIntro") }));
    var g = el("div", { class: "volby-velke" });
    pridat(g, volba("umistit:zed", "▭", T("page.setup.wallTip"), true), volba("umistit:stojan", "⍋", T("page.setup.easelTip")));
    obsah.appendChild(g);
    if (v.trida.tabule) {
      var hotovo = karta(T("page.setup.doneTitle"), el("span", { class: "k-badge k-badge--ok", text: "✓" }));
      hotovo.body.appendChild(vybaveniJen(v, "tabule"));
      obsah.appendChild(hotovo.node);
    }
  } else if (k === "lavice") {
    obsah.appendChild(el("p", { class: "uvod", text: T("page.setup.desksIntro") }));
    var g2 = el("div", { class: "volby-velke" });
    pridat(g2, volba("umistit:stul", "⊓", T("page.setup.deskTip"), true));
    obsah.appendChild(g2);
    var dalsi = el("div", { class: "volby-male" });
    pridat(dalsi, volba("umistit:misto", "▤", T("page.setup.spotTip")), volba("umistit:lavice", "═", T("page.setup.benchTip")));
    obsah.appendChild(dalsi);
    var c = karta(T("page.setup.inClass"), el("span", { class: "k-badge", text: T("page.setup.seats", { n: v.trida.mist }) }));
    c.body.appendChild(vybaveni(v, true));
    obsah.appendChild(c.node);
  } else {
    var c2 = karta(T("page.setup.check"));
    var ul = el("ul", { class: "kontrola" },
      el("li", { class: v.trida.tabule ? "je-ok" : "je-chybi", text: v.trida.tabule ? T("page.setup.boardOk") : T("page.setup.boardMissing") }),
      el("li", { class: v.trida.mist ? "je-ok" : "je-chybi", text: v.trida.mist ? T("page.setup.seatsOk", { n: v.trida.mist }) : T("page.setup.seatsMissing") }),
      el("li", { class: "je-info", text: v.trida.verejna ? T("page.setup.public") : T("page.setup.inviteOnly") }));
    c2.body.appendChild(ul);
    obsah.appendChild(c2.node);
  }
  obsah.appendChild(el("aside", { class: "rada" }, el("b", { text: T("page.setup.howTitle") }), T("page.setup.howText")));
  var idx = ["tabule", "lavice", "hotovo"].indexOf(k);
  if (k === "hotovo") pridat(pata, tlacitko("pruvodce:hotovo", { hlavni: true }));
  else {
    var dalsiKrok = akce("pruvodce:krok:" + ["tabule", "lavice", "hotovo"][idx + 1]);
    if (dalsiKrok) pata.appendChild(el("button", { type: "button", class: "k-btn", text: T("page.setup.next"), onclick: function () { poslat(dalsiKrok.id); } }));
  }
  if (idx > 0) {
    var zpet = akce("pruvodce:krok:" + ["tabule", "lavice", "hotovo"][idx - 1]);
    if (zpet) pata.insertBefore(el("button", { type: "button", class: "k-btn k-btn--ghost", text: T("page.setup.back"), onclick: function () { poslat(zpet.id); } }), pata.firstChild);
  }
  // stavební akce jiných kroků a dokončení (dokud se nedojde ke kroku Hotovo) do „Další akce“ nepatří
  state.akce.forEach(function (a) { if (/^(presunout|odebrat|umistit):/.test(a.id) || a.id === "pruvodce:hotovo") pouzite[a.id] = true; });
};

function vybaveniJen(v, druh) {
  var kopie = { trida: { vybaveni: v.trida.vybaveni.filter(function (k) { return k.druh === druh; }) } };
  return vybaveni(kopie, false);
}

OBR.trida = function (v, obsah, pata) {
  var s = karta(T("page.primer.title"), el("span", { class: "k-aside", text: T("page.primer.asideClass") }));
  s.body.appendChild(slabikar(v));
  obsah.appendChild(s.node);

  var t = sbalitelna(T("page.board.title"), false, v.trida.tabule ? T("page.board.desc") : T("page.board.none"));
  pridat(t.body, seznamAkci("tabule:"));
  obsah.appendChild(t.node);

  var vb = sbalitelna(T("page.equipment.title"), false, T("page.setup.seats", { n: v.trida.mist }));
  vb.body.appendChild(vybaveni(v, false));
  var pr = el("div", { class: "pridat-kusy" });
  pridat(pr, tlacitko("umistit:stul", { sm: true, ikona: "+", text: T("page.add.desk") }), tlacitko("umistit:zed", { sm: true, ikona: "+", text: T("page.add.wall") }), tlacitko("umistit:stojan", { sm: true, ikona: "+", text: T("page.add.easel") }), tlacitko("umistit:misto", { sm: true, ikona: "+", text: T("page.add.spot") }), tlacitko("umistit:lavice", { sm: true, ikona: "+", text: T("page.add.bench") }));
  vb.body.appendChild(pr);
  obsah.appendChild(vb.node);

  var n = sbalitelna(T("page.classSettings.title"), false, v.trida.verejna ? T("page.classSettings.public") : T("page.classSettings.invite"));
  pridat(n.body, radek("trida:nazev"), radek("trida:verejna"), radek("pruvodce:znovu"), radek("trida:zrusit", { danger: true }));
  obsah.appendChild(n.node);
  obsah.appendChild(gramotnost(v.ja, false));
  pridat(pata, tlacitko("hodina:zacit", { hlavni: true, ikona: "▶" }));
};

function procenta(x) { return Math.round(x * 100) + " %"; }

function zak(z, v) {
  var flags = el("span", { class: "zak-znacky" },
    z.cte ? el("span", { class: "k-badge k-badge--ok", text: T("page.student.reading") }) : null,
    !z.cte && z.cetl ? el("span", { class: "k-badge", text: T("page.student.read") }) : null,
    z.sedi ? null : el("span", { class: "k-badge k-badge--warn", text: T("page.student.notSeated") }),
    z.pisanka ? el("span", { class: "k-badge" + (z.pisanka.stav === "uznano" ? " k-badge--ok" : ""), text: T("page.student.copybook", { score: procenta(z.pisanka.skore) }) + (z.pisanka.stav === "uznano" ? " ✓" : z.pisanka.stav === "znovu" ? " ↺" : T("page.student.toCheck")) }) : null);
  var radka = el("li", { class: "zak" + (z.cte ? " je-cte" : "") },
    el("div", { class: "zak-hlava" },
      el("b", { text: z.jmeno }),
      el("span", { class: "k-chip", text: z.stupen }),
      el("span", { class: "pritomnost", title: T("page.student.presence", { p: z.pritomnost }) }, el("i", { style: "width:" + z.pritomnost + "%", class: z.pritomnost < v.hodina.minPritomnost ? "je-malo" : "" }))),
    flags,
    pridat(el("div", { class: "zak-akce" }),
      tlacitko("cist:" + z.pid, { sm: true, text: T("page.student.readAloud") }),
      tlacitko("tabule:zak:" + z.pid, { sm: true, text: T("page.student.toBoard") }),
      tlacitko("pisanka:ukaz:" + z.pid, { sm: true, text: T("page.student.viewCopybook") }),
      tlacitko("pisanka:ok:" + z.pid, { sm: true, text: T("page.student.accept") }),
      tlacitko("pisanka:znovu:" + z.pid, { sm: true, tichy: true, text: T("page.student.again") })));
  return radka;
}

OBR.hodina = function (v, obsah, pata) {
  var h = v.hodina;
  obsah.appendChild(el("div", { class: "stav-hodiny" },
    el("span", { class: "k-chip", text: T("page.lesson.minutes", { min: h.minut }) + (h.minut < h.minMinut ? T("page.lesson.xpFrom", { min: h.minMinut }) : "") }),
    el("span", { class: "k-chip", text: T("page.lesson.students", { n: h.zaci.length }) }),
    h.zadani ? el("span", { class: "k-chip", text: T("page.lesson.template", { text: h.zadani }) }) : null,
    h.cte ? el("span", { class: "k-chip is-on", text: T("page.lesson.reading", { name: h.cte }) }) : null));

  var z = karta(T("page.lesson.studentsTitle"), tlacitko("cist:stop", { sm: true, tichy: true }));
  if (!h.zaci.length) z.body.appendChild(el("div", { class: "k-empty" }, el("strong", { text: T("page.lesson.nobody") }), v.trida && v.trida.verejna ? T("page.lesson.nobodyPublic") : T("page.lesson.nobodyInvite")));
  else {
    var ul = el("ul", { class: "zaci" });
    h.zaci.forEach(function (x) { ul.appendChild(zak(x, v)); });
    z.body.appendChild(ul);
  }
  if (h.kolem.length) {
    var k = el("div", { class: "kolem" }, el("span", { class: "maly", text: T("page.lesson.nearby") }));
    h.kolem.forEach(function (x) { pridat(k, tlacitko("pridat:" + x.pid, { sm: true, ikona: "+", text: x.jmeno })); });
    z.body.appendChild(k);
  }
  obsah.appendChild(z.node);

  var s = karta(T("page.primer.title"), el("span", { class: "k-aside", text: T("page.primer.asideLesson") }));
  s.body.appendChild(slabikar(v));
  obsah.appendChild(s.node);

  var p = karta(T("page.copybooks.title"));
  p.body.appendChild(el("p", { class: "maly", text: h.zadani ? T("page.copybooks.assigned", { text: h.zadani }) : T("page.copybooks.none") }));
  pridat(p.body, radek("pisanky:zadat"));
  obsah.appendChild(p.node);

  var t = sbalitelna(T("page.board.title"), true, h.neupeceno ? T("page.board.unbaked") : "");
  pridat(t.body, radek("tabule:strana"), radek("tabule:ja"), radek("tabule:text"), seznamAkci("tabule:"));
  obsah.appendChild(t.node);

  pridat(pata, tlacitko("hodina:konec", { hlavni: true }));
};

OBR.konec = function (v, obsah, pata) {
  var h = v.hodina;
  var x = h.xp;
  var volby = konecVolby;
  var kratka = h.minut < h.minMinut;
  var souhrn = el("span", { class: "souhrn" });
  var prepocet = function () {
    var celkem = 0;
    Object.keys(volby).forEach(function (pid) {
      var c = volby[pid];
      celkem += (c.indexOf("u") >= 0 ? x.ucast : 0) + (c.indexOf("c") >= 0 ? x.cteni : 0) + (c.indexOf("p") >= 0 ? x.psani : 0);
    });
    souhrn.textContent = kratka ? T("page.end.noXp") : T("page.end.total", { xp: celkem });
  };
  if (!h.zaci.length) obsah.appendChild(el("div", { class: "k-empty" }, el("strong", { text: T("page.end.nobody") }), T("page.end.nobodyText")));
  var tab = el("div", { class: "konec" });
  h.zaci.forEach(function (z) {
    var malo = z.pritomnost < h.minPritomnost;
    if (malo || kratka) volby[z.pid] = "";
    else if (volby[z.pid] === undefined) volby[z.pid] = z.navrh === "0" ? "" : z.navrh; // návrh jen poprvé, pak co písař zaškrtl
    var box = function (ch, popis, xp, pozn) {
      var i = el("input", { type: "checkbox" });
      i.checked = volby[z.pid].indexOf(ch) >= 0;
      i.disabled = malo || kratka;
      i.addEventListener("change", function () {
        var s = volby[z.pid].replace(ch, "");
        if (i.checked) s += ch;
        volby[z.pid] = ["u", "c", "p"].filter(function (c) { return s.indexOf(c) >= 0; }).join("");
        prepocet();
      });
      return el("label", { class: "zaskrt" + (pozn ? " je-navrh" : "") }, i, el("span", { text: popis + " +" + xp }), pozn ? el("small", { text: pozn }) : null);
    };
    tab.appendChild(el("div", { class: "konec-zak" + (malo ? " je-malo" : "") },
      el("div", { class: "zak-hlava" }, el("b", { text: z.jmeno }), el("span", { class: "maly", text: T("page.end.presence", { p: z.pritomnost }) + (malo ? T("page.end.tooLittle") : "") })),
      el("div", { class: "zaskrtavani" },
        box("u", T("page.end.attendance"), x.ucast),
        box("c", T("page.end.reading"), x.cteni, z.cetl ? T("page.end.didRead") : null),
        box("p", T("page.end.writing"), x.psani, z.psal ? T("page.end.copybookAccepted") : null))));
  });
  obsah.appendChild(tab);
  prepocet();
  var rozdat = tlacitko("hodina:rozdat", { hlavni: true, klik: function () { poslat("hodina:rozdat", JSON.stringify(volby)); } });
  pridat(pata, tlacitko("konec:zpet"), tlacitko("hodina:bezxp", { tichy: true }), souhrn, rozdat);
};

OBR.zak = function (v, obsah, pata) {
  obsah.appendChild(gramotnost(v.ja, true));
  obsah.appendChild(el("aside", { class: "rada" }, el("b", { text: T("page.student.atDeskTitle") }), T("page.student.atDeskText")));
  pridat(pata, tlacitko("zak:psat"), tlacitko("zak:cist", { hlavni: true }));
};

OBR.cizi = function (v, obsah, pata) {
  obsah.appendChild(gramotnost(v.ja, true));
  pridat(pata, tlacitko("zak:cist"));
};


function render(v) {
  state = v;
  busy = false;
  clearTimeout(cekaniTimer);
  clearTimeout(odemknoutTimer);
  $("cekam").hidden = true;
  pouzite = { zavrit: true };
  if (v.obrazovka !== "konec") konecVolby = {};
  $("nadpis-maly").textContent = /^(vitej|pruvodce|trida|hodina|konec|zak|cizi)$/.test(v.obrazovka) ? T("page.screen." + v.obrazovka) : T("page.screen.default");
  $("nadpis").textContent = v.titulek;
  $("podnadpis").textContent = v.text || "";
  $("podnadpis").hidden = !v.text;
  var obsah = clear($("obsah"));
  var pata = clear($("pata"));
  var scroll = $("main").scrollTop;
  (OBR[v.obrazovka] || OBR.cizi)(v, obsah, pata);
  // co nemá místo, je v „Další akce“ - nic se neztratí
  var zbytek = state.akce.filter(function (a) { return !pouzite[a.id]; });
  if (zbytek.length) {
    var d = sbalitelna(T("page.moreActions"), false, String(zbytek.length));
    zbytek.forEach(function (a) { pridat(d.body, radek(a.id, { danger: true })); });
    obsah.appendChild(d.node);
  }
  $("pata").hidden = !pata.firstChild;
  $("main").scrollTop = scroll;
  if (v.hlaska && v.hlaska.text) Kit.toast(v.hlaska.text, v.hlaska.druh === "warn" ? "warn" : v.hlaska.druh === "err" ? "err" : v.hlaska.druh === "ok" ? "ok" : "info");
}

function zavritPanel() {
  if (modal) return;
  call("skola:uiPryc", {});
}

$("zavrit").addEventListener("click", zavritPanel);
document.addEventListener("keydown", function (e) {
  if (modal || document.querySelector(".k-modal")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    zavritPanel();
  }
});

window.addEventListener("skola:ui", function (e) {
  var v = e.detail;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch (err) { return; }
  }
  if (!v || !v.obrazovka) return;
  try { render(v); } catch (err) { console.log("render", err); }
});

// jazyk se změnil: překreslit poslední pohled novými texty
Texty.naZmenu(function () { if (state) try { render(state); } catch (err) { console.log("render", err); } });

call("skola:uiHello", {});
