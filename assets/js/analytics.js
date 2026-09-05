/* AW PowerCube – Nutzungsmessung (Umami)
 * Eigenstaendiges Modul. Aendert KEINE bestehende Logik, kein Layout, keine Optik.
 * Arbeitet ausschliesslich beobachtend (MutationObserver + Event-Delegation).
 * Erfasst keine personenbezogenen Daten: keine Namen, keine E-Mail-Adressen,
 * keine Formularinhalte. Zahlenwerte werden nur in Bandbreiten uebertragen.
 */
(function () {
  'use strict';

  /* ---------- Sicheres Senden ---------------------------------------- */
  var QUEUE = [];
  function track(name, props) {
    try {
      if (window.umami && typeof window.umami.track === 'function') {
        while (QUEUE.length) { var q = QUEUE.shift(); window.umami.track(q[0], q[1]); }
        window.umami.track(name, props || {});
      } else {
        if (QUEUE.length < 40) QUEUE.push([name, props || {}]);
      }
    } catch (e) { /* Messung darf die Seite niemals stoeren */ }
  }
  // Falls das Umami-Skript verzoegert laedt: spaeter erneut versuchen
  var flushTries = 0;
  var flushTimer = setInterval(function () {
    if (window.umami && QUEUE.length) { track('__flush__noop', null); }
    if (++flushTries > 20 || !QUEUE.length) clearInterval(flushTimer);
  }, 1000);

  /* ---------- Seitenkennung ------------------------------------------ */
  var p = location.pathname;
  var SEITE = /\/en\/pro\//.test(p) ? 'pro-en'
            : /\/pro\//.test(p)     ? 'pro-de'
            : /\/en\//.test(p)      ? 'start-en'
            :                         'start-de';

  function base(props) {
    props = props || {};
    props.seite = SEITE;
    return props;
  }

  /* ---------- Hilfsfunktionen ---------------------------------------- */
  function band(n) {
    if (!isFinite(n) || n <= 0) return 'ungueltig';
    if (n < 21000)  return 'unter 21.000';
    if (n < 40000)  return '21.000-40.000';
    if (n < 70000)  return '40.000-70.000';
    if (n < 80000)  return '70.000-80.000';
    if (n < 113000) return '80.000-112.000';
    return 'ueber 112.000';
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {

    /* ---------- 1. Panel-Wechsel ------------------------------------- */
    var panels = Array.prototype.slice.call(document.querySelectorAll('.panel[data-panel]'));
    var lastPanel = null;
    var maxTiefe = 0;

    function reportPanel() {
      var act = panels.filter(function (el) { return el.classList.contains('active'); })[0];
      if (!act) return;
      var name = act.getAttribute('data-panel');
      if (name === lastPanel) return;
      lastPanel = name;
      var idx = panels.indexOf(act) + 1;
      if (idx > maxTiefe) maxTiefe = idx;
      track('bereich', base({ bereich: name, position: idx }));
      // Konfigurator-Start zaehlen: Schritt 1 ist beim Laden bereits aktiv und
      // loest daher keinen Beobachter aus.
      if (name === 'matrix' && typeof meldeStart === 'function') meldeStart();
    }

    if (panels.length) {
      var po = new MutationObserver(reportPanel);
      panels.forEach(function (el) {
        po.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
      reportPanel(); // Einstiegsbereich
    }

    /* ---------- 2. Konfigurator: Schritte ---------------------------- */
    var steps = Array.prototype.slice.call(document.querySelectorAll('.wizard-step'));
    var lastStep = -1;
    var maxStep = 0;
    function meldeStart() {
      if (!steps.length || maxStep > 0) return;
      maxStep = 1; lastStep = 0;
      track('konfigurator-schritt', base({ schritt: 1, von: steps.length }));
    }
    if (steps.length) {
      var so = new MutationObserver(function () {
        var i = -1;
        steps.forEach(function (el, k) { if (el.classList.contains('active')) i = k; });
        if (i < 0 || i === lastStep) return;
        lastStep = i;
        if (i + 1 > maxStep) maxStep = i + 1;
        track('konfigurator-schritt', base({ schritt: i + 1, von: steps.length }));
      });
      steps.forEach(function (el) {
        so.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    }

    /* ---------- 3. Konfigurator: Ergebnis erreicht -------------------- */
    var ergebnisGemeldet = false;
    var resultPanel = document.getElementById('result-panel');
    if (resultPanel) {
      new MutationObserver(function () {
        if (ergebnisGemeldet) return;
        if (resultPanel.classList.contains('show')) {
          ergebnisGemeldet = true;
          track('konfigurator-ergebnis', base({}));
        }
      }).observe(resultPanel, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- 4. PPU Quick-Check (nur Pro-Seiten) ------------------- */
    var qcForm = document.getElementById('qc-form');
    var qcVal  = document.getElementById('qc-price-val');
    var qcKwh  = document.getElementById('qc-kwh');
    if (qcForm && qcVal && qcKwh) {
      var qcAnzahl = 0;
      function meldeQc(quelle) {
        setTimeout(function () {
          var roh = parseFloat(String(qcKwh.value).replace(/[^\d.,]/g, '').replace(',', '.'));
          var txt = (qcVal.textContent || '').trim();
          var treffer = /\d/.test(txt) && txt.indexOf('\u2013') !== 0;
          qcAnzahl++;
          track('quickcheck', base({
            menge: band(roh),
            ergebnis: treffer ? 'preis' : 'individuell',
            quelle: quelle,
            nr: qcAnzahl
          }));
        }, 350);
      }
      qcForm.addEventListener('submit', function () { meldeQc('eingabe'); });
      document.addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('.qc-chip');
        if (chip) meldeQc('vorschlag');
        var hb = e.target.closest && e.target.closest('#qc-helper-btn');
        if (hb) meldeQc('rechenhilfe');
      });
    }

    /* ---------- 5. Downloads ----------------------------------------- */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href$=".pdf"]');
      if (!a) return;
      var datei = (a.getAttribute('href') || '').split('/').pop();
      track('download', base({ datei: datei }));
    });

    /* ---------- 6. Angebots-PDF aus dem Konfigurator ------------------ */
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('#download-summary-btn');
      if (b) track('konfiguration-pdf', base({}));
    });

    /* ---------- 7. Kontaktanfrage ------------------------------------ */
    var cf = document.getElementById('contact-form');
    if (cf) {
      cf.addEventListener('submit', function () {
        track('anfrage-abgeschickt', base({
          konfigurator: ergebnisGemeldet ? 'mit Konfiguration' : 'ohne Konfiguration'
        }));
      }, true);
    }

    /* ---------- 8. Pro-Bereich: Anmeldung ---------------------------- */
    var gate = document.getElementById('pro-gate-form');
    if (gate) {
      gate.addEventListener('submit', function () {
        setTimeout(function () {
          var offen = !document.body.classList.contains('pro-locked');
          track('pro-anmeldung', base({ ergebnis: offen ? 'erfolgreich' : 'fehlgeschlagen' }));
        }, 400);
      }, true);
    }

    /* ---------- 9. Sprachwechsel ------------------------------------- */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.lang-switch a');
      if (!a) return;
      track('sprachwechsel', base({ ziel: a.textContent.trim() }));
    });

    /* ---------- 10. Verlassen: erreichte Tiefe ------------------------ */
    var abschiedGesendet = false;
    function abschied() {
      if (abschiedGesendet) return;
      abschiedGesendet = true;
      track('besuch-ende', base({
        tiefe: maxTiefe,
        letzterBereich: lastPanel || '-',
        konfiguratorSchritt: maxStep
      }));
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') abschied();
    });
    window.addEventListener('pagehide', abschied);
  });
})();
