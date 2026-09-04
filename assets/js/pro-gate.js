/* ============================================================
   AW Automotive PowerCube — Zugangsschutz für den Pro-Bereich
   Das Kennwort wird nicht im Klartext hinterlegt, sondern nur
   als SHA-256-Hash geprüft. Nach erfolgreicher Anmeldung bleibt
   die Freigabe für die laufende Browser-Sitzung bestehen.
   Hinweis: Ein rein clientseitiger Schutz hält Gelegenheits-
   besucher fern, ersetzt aber keine serverseitige Absicherung.
   ============================================================ */
(function () {
  var HASH = '3aa736f8a22710622d5416a336ae3ef22cbf29d1f7c15c686dd460530c206efa';
  var KEY = 'aw_pro_unlocked';

  function unlock() {
    document.body.classList.remove('pro-locked');
    var gate = document.getElementById('pro-gate');
    if (gate) gate.remove();
    try { sessionStorage.setItem(KEY, HASH); } catch (e) {}
    window.dispatchEvent(new Event('resize'));
  }

  function sha256(text) {
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve(null);
    return window.crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(text))
      .then(function (buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
      })
      .catch(function () { return null; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var already = false;
    try { already = sessionStorage.getItem(KEY) === HASH; } catch (e) {}
    if (already) { unlock(); return; }

    var form = document.getElementById('pro-gate-form');
    var input = document.getElementById('pro-pass');
    var err = document.getElementById('pro-gate-err');
    if (!form || !input) return;
    setTimeout(function () { input.focus(); }, 120);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sha256(input.value).then(function (h) {
        if (h === HASH) {
          if (err) err.hidden = true;
          unlock();
        } else {
          if (err) err.hidden = false;
          input.value = '';
          input.focus();
          var box = document.querySelector('.pro-gate-box');
          if (box) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
        }
      });
    });
  });
})();
