// Texty stránek výchozího UI školy: slovník přijde od klienta (událost `skola:texty` { jazyk, texty }) v jazyce
// hráče. T(klic, parametry) jako v src/shared/i18n.ts: {jmeno} a tvary podle čísla {n|jeden|dva|pět}.
// Prvky s data-t="klic" (text) a data-t-title="klic" (title) se přeloží samy. Mimo hru (tools/ui-dev/) slovník
// pošle náhled. Bez slovníku se ukáže klíč (vidět, co chybí).
"use strict";

var Texty = (function () {
  var slovnik = {};
  var jazyk = "cs";
  var posluchaci = [];

  function tvar(n) {
    if (jazyk === "cs" || jazyk === "sk") return n === 1 ? 0 : n >= 2 && n <= 4 && n % 1 === 0 ? 1 : 2;
    return n === 1 ? 0 : 1;
  }

  function T(k, a) {
    var s = slovnik[k];
    if (s === undefined) return k;
    if (!a) return s;
    return s.replace(/\{(\w+)(?:\|([^{}]*))?\}/g, function (cele, jm, formy) {
      if (!(jm in a)) return cele;
      if (formy !== undefined) {
        var f = formy.split("|");
        return f[Math.min(f.length - 1, tvar(Math.abs(Number(a[jm]))))] || "";
      }
      return a[jm] === null || a[jm] === undefined ? "" : String(a[jm]);
    });
  }

  function prelozitStranku(root) {
    (root || document).querySelectorAll("[data-t]").forEach(function (n) { n.textContent = T(n.getAttribute("data-t")); });
    (root || document).querySelectorAll("[data-t-title]").forEach(function (n) { n.title = T(n.getAttribute("data-t-title")); });
  }

  function nastavit(d) {
    if (!d || typeof d !== "object") return;
    slovnik = d.texty || {};
    jazyk = d.jazyk || "cs";
    document.documentElement.lang = jazyk;
    prelozitStranku();
    posluchaci.forEach(function (f) { try { f(jazyk); } catch (e) { console.log("texty", e); } });
  }

  window.addEventListener("skola:texty", function (e) {
    var d = e.detail;
    if (typeof d === "string") {
      try { d = JSON.parse(d); } catch (err) { return; }
    }
    nastavit(d);
  });

  return { T: T, nastavit: nastavit, prelozitStranku: prelozitStranku, naZmenu: function (f) { posluchaci.push(f); }, jazyk: function () { return jazyk; } };
})();
var T = Texty.T;
