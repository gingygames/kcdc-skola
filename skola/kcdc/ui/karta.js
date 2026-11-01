// Karta hodiny: jen ukazuje (žádné ovládání, web view nemá fokus). Data skládá klient (`skola:kartaUkaz`, typ
// KartaUkaz v src/shared/ui.ts): stav hodiny ze serveru, prst čtoucího žáka, stavbu a nápovědu kláves.
// Po každém vykreslení pošle výšku obsahu, ať klient zmenší web view přesně na kartu.
"use strict";

var el = Kit.el;
var root = document.getElementById("karta");

function call(name, payload) {
  try {
    if (typeof callEvent === "function") callEvent(name, JSON.stringify(payload === undefined ? null : payload));
  } catch (e) {
    console.log("callEvent", name, e);
  }
}

/** „[/skola cist] sklonit se · [/skola] škola“ → příkazy jako kbd */
function klavesy(text) {
  var box = el("p", { class: "klavesy" });
  String(text || "").split(/(\[[^\]]+\])/).forEach(function (kus) {
    if (!kus) return;
    var m = /^\[([^\]]+)\]$/.exec(kus);
    box.appendChild(m ? el("kbd", { class: "k-kbd", text: m[1] }) : document.createTextNode(kus));
  });
  return box;
}

function hlava(h) {
  var pismeno = h.pismeno ? h.pismeno.toUpperCase() + h.pismeno : T("card.reading");
  var cas = T("card.minutes", { min: h.minut }) + (h.minut < h.minMinut ? T("card.xpFrom", { min: h.minMinut }) : "");
  return el("header", { class: "hlava" },
    el("span", { class: "dlazdice", text: pismeno }),
    el("span", { class: "hlava-text" },
      el("b", { text: h.role === "ucitel" ? T("card.lessonTeacher", { page: h.strana }) : T("card.lessonStudent", { teacher: h.ucitel }) }),
      el("small", { text: (h.role === "ucitel" ? "" : h.strana + " · ") + cas })));
}

var PISANKA = { odevzdano: ["card.copybook.submitted", "je-pozor"], uznano: ["card.copybook.accepted", "je-ok"], znovu: ["card.copybook.again", ""] };

function ucitel(h, c, box) {
  if (c.prst) box.appendChild(el("p", { class: "zivy" }, el("span", { "aria-hidden": "true", text: "☝ " }), c.prst));
  else if (h.cte) box.appendChild(el("p", { class: "radek", text: T("card.readingAloud", { name: h.cte }) }));
  var kKontrole = (h.zaci || []).filter(function (z) { return z.pisanka === "odevzdano"; }).length;
  if (h.zadani || kKontrole) {
    box.appendChild(el("p", { class: "radek" },
      h.zadani ? T("card.copybooks.template", { text: h.zadani }) : T("card.copybooks.title"),
      kKontrole ? el("span", { class: "k-badge k-badge--warn", text: T("card.copybooks.toCheck", { n: kKontrole }) }) : null));
  }
  var zaci = h.zaci || [];
  if (!zaci.length) return box.appendChild(el("p", { class: "prazdne", text: T("card.nobody") }));
  var ul = el("ul", { class: "zaci" });
  zaci.slice(0, 10).forEach(function (z) {
    var p = z.pisanka ? PISANKA[z.pisanka] : null;
    ul.appendChild(el("li", {},
      el("i", { class: "tecka " + (z.sedi ? "je-ok" : "je-pryc"), title: z.sedi ? T("card.student.seated") : T("card.student.notSeated") }),
      el("span", { class: "jmeno", text: z.jmeno }),
      z.cte ? el("span", { class: "stitek je-ok", text: T("card.student.reading") }) : null,
      !z.sedi ? el("span", { class: "stitek", text: T("card.student.notSeated") }) : null,
      p ? el("span", { class: "stitek " + p[1], text: T(p[0]) }) : null));
  });
  box.appendChild(ul);
  if (zaci.length > 10) box.appendChild(el("p", { class: "prazdne", text: T("card.more", { n: zaci.length - 10 }) }));
}

/** co má žák teď udělat: jedna věta, nejdůležitější první */
function ukol(h) {
  var j = h.ja;
  if (j.ctu) return [T("card.task.readAloud"), "je-akce"];
  if (!j.sedi) return [T("card.task.sitDown"), ""];
  if (h.zadani && j.pisanka === "znovu") return [T("card.task.again", { text: h.zadani }), "je-akce"];
  if (h.zadani && !j.pisanka) return [T("card.task.trace", { text: h.zadani }), "je-akce"];
  if (j.pisanka === "odevzdano") return [T("card.task.submitted"), ""];
  if (j.pisanka === "uznano") return [T("card.task.accepted"), "je-hotovo"];
  return [T("card.task.listen"), ""];
}

function zak(h, box) {
  var u = ukol(h);
  box.appendChild(el("p", { class: "ukol " + u[1], text: u[0] }));
  var j = h.ja;
  var rozsah = j.do !== null ? Math.max(1, j.do - j.od) : 1;
  var hotovo = j.do !== null ? Math.max(0, Math.min(1, (j.xp - j.od) / rozsah)) : 1;
  box.appendChild(el("div", { class: "postup-mini" },
    el("span", { text: T("card.progress", { name: j.nazev, xp: j.xp }) }),
    el("div", { class: "postup" }, el("i", { style: "width:" + Math.round(hotovo * 100) + "%" })),
    j.dalsi ? el("small", { text: T("card.next", { next: j.dalsi, xp: j.do }) }) : null));
}

function stavba(s, box) {
  box.appendChild(el("header", { class: "hlava" },
    el("span", { class: "dlazdice", text: "✦" }),
    el("span", { class: "hlava-text" }, el("b", { text: T("card.build.title", { name: s.nazev }) }), el("small", { text: s.znovu ? T("card.build.more", { n: s.postaveno }) : T("card.build.one") }))));
  box.appendChild(el("ul", { class: "ovladani" },
    el("li", {}, el("kbd", { class: "k-kbd", text: T("card.build.click") }), T("card.build.clickText")),
    el("li", {}, el("kbd", { class: "k-kbd", text: T("card.build.wheel") }), T("card.build.wheelText")),
    el("li", {}, el("kbd", { class: "k-kbd", text: "Esc" }), T("card.build.escText"))));
  box.appendChild(el("p", { class: "prazdne", text: T("card.build.legend") }));
}

function render(c) {
  while (root.firstChild) root.removeChild(root.firstChild);
  if (c.stavba) stavba(c.stavba, root);
  else if (c.hodina) {
    root.appendChild(hlava(c.hodina));
    if (c.hodina.role === "ucitel") ucitel(c.hodina, c, root);
    else zak(c.hodina, root);
  }
  if (c.klavesy && !c.stavba) root.appendChild(klavesy(c.klavesy));
  root.hidden = !root.firstChild;
  call("skola:kartaVyska", Math.ceil(root.getBoundingClientRect().height) + 2);
}

var posledni = null;
Texty.naZmenu(function () { if (posledni) try { render(posledni); } catch (err) { console.log("karta", err); } });

window.addEventListener("skola:kartaUkaz", function (e) {
  var c = e.detail;
  if (typeof c === "string") {
    try { c = JSON.parse(c); } catch (err) { return; }
  }
  if (!c) return;
  posledni = c;
  try { render(c); } catch (err) { console.log("karta", err); }
});

call("skola:kartaHello", {});
