/* ============================================================
   AW Automotive PowerCube – PRO-BEREICH — Auswahlmatrix, PPU-Logik
   und Panel-Navigation (eine Seite nach der anderen).
   PPU-Berechnung basiert auf den gelb hinterlegten Eingabefeldern
   der Datei "Berechnung-PPU-Modell_Sped_Sommer.xlsx".
   ============================================================ */

/* ----------------------------------------------------------------
   PRO-BEREICH — Variantenlogik und PPU-Preis nach Berechnungsmatrix
   Quelle: 260409-Berechnungsmatrix-PPU-Modell.xlsx
           Reiter „PowerCube Varianten“ und „PPU-Modell je kWh“

   Preisformel (identisch mit Spalte O/P der Excel):
     PPU €/kWh = (CPO_monatlich + Annuität_monatlich) / kWh_Monat
                 + Spirii + AUDI + Monitoring + Strompreis
     Annuität  = (Wertbasis × (1 − Restwert)) × (i/12)
                 / (1 − (1 + i/12)^−Laufzeit)

   Liegt die monatliche Energiemenge unterhalb der kleinsten oder
   oberhalb der größten Menge der Matrix liegt, wird wie auf der
   Standardseite die kundenspezifische Variante ausgegeben. Liegt sie
   in einer Lücke zwischen zwei Varianten, wird die nächstgrößere
   Variante mit ihrer Mindestmenge als Berechnungsbasis verwendet.
   ---------------------------------------------------------------- */
var PPU_KONST = { spirii: 0, audi: 0.02, monitoring: 0.01, strom: 0, zins: 0.058, laufzeit: 108, restwert: 0.20 };

var VARIANTEN = [
  { id: 'V1',      badge: 'V1',         format: '10-Fuß-Container', speicher: 756,  hycInt: 400,  hycExt: 0,   ladepunkte: 2, netzKw: 80,  lvMin: 3,  lvMax: 5,  tage: 20, kwhMin: 21000,  kwhMax: 28000,  wertbasis: 420000, cpo: 15000 },
  { id: 'V2',      badge: 'V2',         format: '20-Fuß-Container', speicher: 1512, hycInt: 400,  hycExt: 400, ladepunkte: 4, netzKw: 200, lvMin: 10, lvMax: 14, tage: 20, kwhMin: 70000,  kwhMax: 78400,  wertbasis: 700000, cpo: 19500 },
  { id: 'V3-1',    badge: 'V3 · Fall 1', format: '30-Fuß-Container', speicher: 2000, hycInt: 1000, hycExt: 0,   ladepunkte: 4, netzKw: 200, lvMin: 10, lvMax: 14, tage: 20, kwhMin: 70000,  kwhMax: 78400,  wertbasis: 790000, cpo: 24000 },
  { id: 'V3-2',    badge: 'V3 · Fall 2', format: '30-Fuß-Container', speicher: 2000, hycInt: 1000, hycExt: 0,   ladepunkte: 4, netzKw: 300, lvMin: 16, lvMax: 20, tage: 20, kwhMin: 112000, kwhMax: 112000, wertbasis: 790000, cpo: 24000 },
  { id: 'V3-3',    badge: 'V3 · Fall 3', format: '30-Fuß-Container', speicher: 2000, hycInt: 1000, hycExt: 0,   ladepunkte: 8, netzKw: 200, lvMin: 10, lvMax: 14, tage: 20, kwhMin: 70000,  kwhMax: 78400,  wertbasis: 880000, cpo: 26000 },
  { id: 'V3-4',    badge: 'V3 · Fall 4', format: '30-Fuß-Container', speicher: 2000, hycInt: 1000, hycExt: 0,   ladepunkte: 8, netzKw: 300, lvMin: 16, lvMax: 20, tage: 20, kwhMin: 112000, kwhMax: 112000, wertbasis: 880000, cpo: 26000 }
];

/* Monatliche Annuität der Wertbasis (Finanzierungsanteil) */
function annuitaet(v) {
  var i = PPU_KONST.zins / 12;
  return (v.wertbasis * (1 - PPU_KONST.restwert)) * i / (1 - Math.pow(1 + i, -PPU_KONST.laufzeit));
}

/* Exakter PPU-Preis (€/kWh) einer Variante für eine monatliche Energiemenge */
function variantenPreis(v, kwh) {
  if (!kwh) return null;
  return (v.cpo / 12 + annuitaet(v)) / kwh
    + PPU_KONST.spirii + PPU_KONST.audi + PPU_KONST.monitoring + PPU_KONST.strom;
}

/* Auswahl der Variante nach Berechnungsmatrix.
   Rückgabe: { v: Variante, kwhRechnung: Menge für die Preisbildung, mindest: true/false }
   oder null, wenn kein Eintrag der Matrix passt.
   Liegt die Menge in einer Lücke zwischen zwei Varianten, wird die
   nächstgrößere Variante mit ihrer Mindestmenge herangezogen. */
function waehleVariante(kwh, netzKwVerfuegbar, ladepunkte) {
  if (!kwh) return null;
  var alleMin = VARIANTEN.map(function (v) { return v.kwhMin; });
  var alleMax = VARIANTEN.map(function (v) { return v.kwhMax; });
  var globalMin = Math.min.apply(null, alleMin);
  var globalMax = Math.max.apply(null, alleMax);
  // Unterhalb der kleinsten bzw. oberhalb der größten Menge -> kundenspezifisch
  if (kwh < globalMin || kwh > globalMax) return null;

  function filtern(liste) {
    var k = liste.slice();
    if (ladepunkte) {
      var n = parseInt(ladepunkte, 10);
      var exakt = k.filter(function (v) { return v.ladepunkte === n; });
      k = exakt.length ? exakt : k.filter(function (v) { return v.ladepunkte >= n; });
    }
    if (netzKwVerfuegbar > 0) {
      k = k.filter(function (v) { return v.netzKw <= netzKwVerfuegbar; });
    }
    return k;
  }

  // 1) Direkte Übereinstimmung mit einem Mengenband
  var direkt = filtern(VARIANTEN.filter(function (v) { return kwh >= v.kwhMin && kwh <= v.kwhMax; }));
  if (direkt.length) {
    var best = direkt.reduce(function (a, b) {
      return variantenPreis(a, kwh) <= variantenPreis(b, kwh) ? a : b;
    });
    return { v: best, kwhRechnung: kwh, mindest: false };
  }

  // 2) Lücke -> nächstgrößere Variante, Preis auf Basis ihrer Mindestmenge
  var groesser = filtern(VARIANTEN.filter(function (v) { return v.kwhMin > kwh; }));
  if (!groesser.length) return null;
  var naechsteMin = Math.min.apply(null, groesser.map(function (v) { return v.kwhMin; }));
  var stufe = groesser.filter(function (v) { return v.kwhMin === naechsteMin; });
  var bestG = stufe.reduce(function (a, b) {
    return variantenPreis(a, naechsteMin) <= variantenPreis(b, naechsteMin) ? a : b;
  });
  return { v: bestG, kwhRechnung: naechsteMin, mindest: true };
}

function fmtKwh(n) { return Math.round(n).toLocaleString('de-DE'); }
function fmtPreis(r) { return r.toFixed(4).replace('.', ','); }

/* Leistungsdaten einer Variante (ohne Umrichterleistung — hier nicht relevant) */
function variantenSpecs(v) {
  var s = [
    ['Bauform', v.format],
    ['Batteriespeicher', v.speicher.toLocaleString('de-DE') + ' kWh'],
    ['Integrierte Ladeleistung', 'HYC ' + v.hycInt.toLocaleString('de-DE') + ' kW']
  ];
  if (v.hycExt) s.push(['Externe Ladeleistung', 'HYC ' + v.hycExt.toLocaleString('de-DE') + ' kW']);
  s.push(['Ladepunkte', String(v.ladepunkte)]);
  s.push(['Netzanschluss', v.netzKw + ' kW']);
  s.push(['Ladevorgänge', v.lvMin + '–' + v.lvMax + ' / 24 h']);
  s.push(['Betriebstage', v.tage + ' Tage / Monat']);
  s.push(['Betriebsart', 'Hybrid PV/Batterie/Netz – vorrangige PV-Nutzung']);
  return s;
}

function variantenBeschreibung(v, total, netz, netzKw) {
  return 'Lädt <strong>' + v.lvMin + '–' + v.lvMax + ' Ladevorgänge / 24 h</strong> bei Betrieb an <strong>'
    + netz + (netzKw ? ' (' + netzKw + ' kW)' : '') + '</strong>. Für Ihre <strong>' + total
    + '</strong> geplanten e-LKW. Ausgelegt auf <strong>' + fmtKwh(v.kwhMin) + '–' + fmtKwh(v.kwhMax)
    + ' kWh / Monat</strong> bei ' + v.tage + ' Betriebstagen.';
}

document.addEventListener('DOMContentLoaded', () => {

  /* ===================================================================
     PANEL-NAVIGATION — eine Sektion nach der anderen, nicht scrollbar
     =================================================================== */
  const panels = Array.from(document.querySelectorAll('#flow .panel'));
  const panelNames = panels.map(p => p.dataset.panel);
  const darkPanels = ['hero', 'matrix'];   // panels with dark background
  const dotsNav = document.getElementById('panel-dots');
  const backBtn = document.getElementById('panel-back');
  let currentPanel = 0;

  // Activate panel mode only if JS is running (graceful fallback otherwise)
  document.body.classList.add('panel-mode');

  // Build dots
  const dotLabels = { hero:'Start', vorteile:'Vorteile', product:'Produkt', quickcheck:'PPU Quick-Check', matrix:'Konfigurator', kontakt:'Kontakt', downloads:'Unterlagen' };
  panels.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = dotLabels[p.dataset.panel] || ('Schritt ' + (i+1));
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => goToPanel(i));
    dotsNav.appendChild(b);
  });

  function resolveIndex(target){
    if(target === undefined || target === null) return null;
    if(/^\d+$/.test(String(target))) return parseInt(target, 10);
    const idx = panelNames.indexOf(String(target));
    return idx >= 0 ? idx : null;
  }

  function goToPanel(i){
    if(i < 0 || i >= panels.length) return;
    panels.forEach((p, idx) => p.classList.toggle('active', idx === i));
    currentPanel = i;
    // dots
    Array.from(dotsNav.children).forEach((d, idx) => d.classList.toggle('active', idx === i));
    const dark = darkPanels.includes(panelNames[i]);
    dotsNav.classList.toggle('on-dark', dark);
    // back button visibility
    backBtn.hidden = (i === 0);
    // scroll the panel itself to top
    panels[i].scrollTop = 0;
    window.scrollTo(0, 0);
    // build dynamic content when needed
    if(panelNames[i] === 'matrix') ensureWizardInit();
  }

  // Any [data-goto] element navigates between panels
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-goto]');
    if(!trigger) return;
    const idx = resolveIndex(trigger.dataset.goto);
    if(idx !== null){ e.preventDefault(); goToPanel(idx); }
  });

  backBtn.addEventListener('click', () => goToPanel(currentPanel - 1));

  // Keyboard: left/right arrows move between panels (skip when typing)
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if(e.key === 'ArrowRight' || e.key === 'PageDown') goToPanel(currentPanel + 1);
    if(e.key === 'ArrowLeft'  || e.key === 'PageUp')   goToPanel(currentPanel - 1);
  });

  goToPanel(0);

  /* ===================================================================
     WIZARD (innerhalb des Konfigurator-Panels)
     =================================================================== */
  const wizard = document.getElementById('wizard');
  if(!wizard) return;

  const steps    = Array.from(wizard.querySelectorAll('.wizard-step'));
  const progress = Array.from(wizard.querySelectorAll('.wizard-progress .step'));
  let current = 0;

  function showStep(i){
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
    progress.forEach((p, idx) => {
      p.classList.toggle('active', idx === i);
      p.classList.toggle('done', idx < i);
    });
    // Aktiven Schritt in der Fortschrittsleiste sichtbar halten (mobil scrollbar)
    const activeTab = progress[i];
    if(activeTab && activeTab.parentElement){
      const bar = activeTab.parentElement;
      const target = activeTab.offsetLeft - (bar.clientWidth - activeTab.offsetWidth) / 2;
      bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
    current = i;
    // when entering step 2, (re)build the per-truck profiles
    if(i === 1) buildProfiles();
    const wb = wizard.querySelector('.wizard-body');
    if(wb) wb.scrollTop = 0;
  }

  /* ---- Choice chip / card toggling ---- */
  wizard.addEventListener('change', (e) => {
    const inp = e.target;
    if(inp.matches('.choice input, .choice-card input')){
      const group = inp.name;
      wizard.querySelectorAll(`.choice input[name="${group}"], .choice-card input[name="${group}"]`)
        .forEach(o => o.closest('.choice,.choice-card').classList.toggle('sel', o.checked));
    }
    if(inp.name === 'pv'){
      const cond = document.getElementById('pv-ppu-cond');
      const showCond = inp.value === 'geplant';
      if(cond){
        cond.classList.toggle('show', showCond);
        // reset the PPU-interest checkbox whenever another option is chosen
        if(!showCond){ const cb = cond.querySelector('input[name="pv_ppu"]'); if(cb) cb.checked = false; }
      }
    }
    if(inp.name === 'netz'){
      const kwCond = document.getElementById('netz-kw-cond');
      const showKw = inp.value.includes('Direkt');
      if(kwCond){
        kwCond.classList.toggle('show', showKw);
        if(!showKw){ const f = kwCond.querySelector('input[name="netz_kw"]'); if(f) f.value = ''; }
      }
    }
  });

  /* ---- Truck repeater (Step 1) ---- */
  const truckList = document.getElementById('truck-list');
  const addBtn = document.getElementById('add-truck');
  let truckCount = 0;

  function truckRowHTML(n){
    const brand =
      `<div><label>Fabrikat</label><input type="text" name="t_brand_${n}" placeholder="z. B. MAN, Scania"></div>`;
    return `<div class="truck-row" data-row="${n}">
      <div class="idx">${n}</div>
      ${brand}
      <div><label>Anzahl</label><input type="number" min="1" name="t_qty_${n}" value="1"></div>
      <div><label>Typ / Einsatz</label><input type="text" name="t_type_${n}" placeholder="z. B. 3-Achser, Verteiler"></div>
      <div><label>Akku kWh</label><input type="number" min="0" name="t_akku_${n}" placeholder="z. B. 480"></div>
      <button type="button" class="icon-btn remove-truck" title="Entfernen" aria-label="Zeile entfernen">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
      </button>
    </div>`;
  }
  function addTruck(){ truckCount++; truckList.insertAdjacentHTML('beforeend', truckRowHTML(truckCount)); }

  let wizardInited = false;
  function ensureWizardInit(){
    if(wizardInited) return;
    wizardInited = true;
    addTruck();
  }
  if(addBtn){
    addBtn.addEventListener('click', addTruck);
    truckList.addEventListener('click', e => {
      if(e.target.closest('.remove-truck')){
        if(truckList.querySelectorAll('.truck-row').length > 1) e.target.closest('.truck-row').remove();
      }
    });
  }

  /* ---- Read all truck rows from Step 1 ---- */
  function readTrucks(){
    const rows = [];
    truckList.querySelectorAll('.truck-row').forEach(r => {
      const n = r.dataset.row;
      const get = sel => { const el = r.querySelector(sel); return el ? el.value.trim() : ''; };
      rows.push({
        row: n,
        brand: get(`input[name="t_brand_${n}"]`),
        qty:   parseInt(get(`input[name="t_qty_${n}"]`)) || 1,
        type:  get(`input[name="t_type_${n}"]`),
        akku:  get(`input[name="t_akku_${n}"]`)
      });
    });
    return rows;
  }

  /* ---- Build per-truck driving-profile cards (Step 2) ---- */
  const profileList = document.getElementById('profile-list');
  function buildProfiles(){
    const trucks = readTrucks();
    // preserve previously entered profile values
    const prev = {};
    profileList.querySelectorAll('input').forEach(i => prev[i.name] = (i.type==='checkbox' ? i.checked : i.value));

    if(!trucks.length){
      profileList.innerHTML = `<div class="profile-empty">Bitte fügen Sie in Schritt 1 zuerst mindestens einen e-LKW hinzu.</div>`;
      return;
    }
    profileList.innerHTML = trucks.map(t => {
      const label = [t.brand, t.type].filter(Boolean).join(' · ') || 'e-LKW';
      const n = t.row;
      return `<div class="profile-card" data-row="${n}">
        <div class="pc-head"><span class="pc-badge">${t.qty}×</span><span>${label}</span><span class="pc-sub">Zeile ${n} aus Schritt 1</span></div>
        <div class="row3">
          <div class="field"><label>Fahrtstrecke <span class="hint">(km / 24 h)</span></label><input type="number" name="p_km_${n}" placeholder="z. B. 220"></div>
          <div class="field"><label>Einsatztage <span class="hint">(pro Monat)</span></label><input type="number" name="p_tage_${n}" placeholder="z. B. 20"></div>
          <div class="field"><label>Einsatzzeiten</label><input type="text" name="p_zeit_${n}" placeholder="z. B. Mo–Fr, 6–18 Uhr"></div>
        </div>
        <div class="scenario-label">Geplante Ladeszenarien</div>
        <div class="choice-cards">
          <label class="choice-card"><input type="checkbox" name="p_uebernacht_${n}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg><div><div class="t">Übernachtladen</div><div class="d">Vollständiges Laden im Depot über Nacht.</div></div></label>
          <label class="choice-card"><input type="checkbox" name="p_zwischen_${n}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><div><div class="t">Zwischenladungen tagsüber</div><div class="d">Kurzzeitige Nachladung im Tagesbetrieb.</div></div></label>
        </div>
        <div class="field" style="margin-top:14px"><label>Zeitfenster für Zwischenladungen <span class="hint">(falls geplant)</span></label><input type="text" name="p_fenster_${n}" placeholder="z. B. 11–13 Uhr (Mittagspause)"></div>
      </div>`;
    }).join('');

    // restore preserved values
    profileList.querySelectorAll('input').forEach(i => {
      if(i.name in prev){
        if(i.type === 'checkbox'){ i.checked = prev[i.name]; if(i.checked) i.closest('.choice-card').classList.add('sel'); }
        else i.value = prev[i.name];
      }
    });
  }

  /* ---- Navigation buttons inside wizard ---- */
  wizard.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => {
    if(current < steps.length - 1) showStep(current + 1);
  }));
  wizard.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', () => {
    if(current > 0) showStep(current - 1);
  }));

  /* ---- Compute & show result ---- */
  function val(name){ const el = wizard.querySelector(`[name="${name}"]`); return el ? el.value.trim() : ''; }

  function buildSummary(trucks, total, netz, netzKw, totalKwh, capacity, capacityNote){
    const grid = document.getElementById('result-summary-grid');
    if(!grid) return;

    // Trucks block (full width)
    const truckRows = trucks.map(t => {
      const n = t.row;
      const label = [t.brand, t.type].filter(Boolean).join(' · ') || 'e-LKW';
      const km = val(`p_km_${n}`), tage = val(`p_tage_${n}`), zeit = val(`p_zeit_${n}`);
      const scen = [];
      if(wizard.querySelector(`[name="p_uebernacht_${n}"]`)?.checked) scen.push('Übernacht');
      if(wizard.querySelector(`[name="p_zwischen_${n}"]`)?.checked){
        const f = val(`p_fenster_${n}`);
        scen.push('Zwischenladung' + (f ? ` (${f})` : ''));
      }
      const parts = [];
      parts.push(`<b>${t.qty}× ${label}</b>`);
      if(t.akku) parts.push(`Akku ${t.akku} kWh`);
      if(km) parts.push(`${km} km/24 h`);
      if(tage) parts.push(`${tage} Tage/Monat`);
      if(zeit) parts.push(zeit);
      if(scen.length) parts.push(scen.join(', '));
      return `<div class="rs-truck">${parts.map(p=>`<span>${p}</span>`).join('')}</div>`;
    }).join('');
    let html = `<div class="rs-trucks"><div class="rs-item"><span class="rs-k">Geplante e-LKW</span><span class="rs-v">${total} Fahrzeug${total===1?'':'e'}${trucks.length>1?` · ${trucks.length} Gruppen`:''}</span></div>${truckRows}</div>`;

    // PV
    const pvMap = { vorhanden:'PV/Eigenstrom vorhanden', geplant:'PV-Anschaffung geplant', keine:'Keine PV geplant' };
    const pv = (wizard.querySelector('input[name="pv"]:checked')||{}).value;
    if(pv){
      let pvText = pvMap[pv] || pv;
      const kwp = val('pv_kwp'); if(kwp) pvText += ` · ${kwp} kWp`;
      html += rsItem('Eigenstrom / PV', pvText);
      if(wizard.querySelector('input[name="pv_ppu"]')?.checked)
        html += rsItem('PV im PPU-Modell', 'Interesse vorhanden');
    }
    // Netzanschluss
    html += rsItem('Netzanschluss', (netz || 'noch offen') + (netzKw ? ` · max. ${netzKw} kW` : ''));
    // Ladekapazität (mit Hinweis)
    if(capacity){
      html += rsItem('Ladekapazität', `${capacity}${capacityNote ? `<span class="rs-note">${capacityNote}</span>` : ''}`);
    }
    // Ladepunkte (Pro-Auswahl)
    const lpSel = (wizard.querySelector('input[name="ladepunkte"]:checked')||{}).value;
    html += rsItem('Ladepunkte', lpSel ? lpSel : 'automatisch gewählt');
    // Gesamter Energiebedarf
    if(totalKwh){
      const kwhStr = Math.round(totalKwh).toLocaleString('de-DE');
      html += rsItem('Energiebedarf', `${kwhStr} kWh / Monat`);
    }

    grid.innerHTML = html;
  }
  function rsItem(k, v){ return `<div class="rs-item"><span class="rs-k">${k}</span><span class="rs-v">${v}</span></div>`; }

  // Speichert die zuletzt berechneten Ergebnisdaten (für PDF & Kontaktformular)
  let lastResult = null;

  const computeBtn = document.getElementById('compute-btn');
  if(computeBtn){
    computeBtn.addEventListener('click', () => {
      const trucks = readTrucks();
      let total = trucks.reduce((s, t) => s + (t.qty || 0), 0);
      if(total === 0) total = 1;

      // Monatlicher Energiebedarf: Summe(Anzahl × km/Tag × Einsatztage/Monat), 1 km = 1 kWh
      const totalKwh = trucks.reduce((s, t) => {
        const km   = parseFloat(val(`p_km_${t.row}`)) || 0;
        const tage = parseFloat(val(`p_tage_${t.row}`)) || 0;
        return s + (t.qty || 0) * km * tage;
      }, 0);

      const netz = (wizard.querySelector('input[name="netz"]:checked')||{}).value || 'CEE 5/125 A';
      const netzKw = val('netz_kw');
      const isCee = !netz.includes('Direkt');

      const ladepunkte = (wizard.querySelector('input[name="ladepunkte"]:checked')||{}).value || '';

      // --- Verfügbare Anschlussleistung ---
      // CEE 5/125 A entspricht rechnerisch rund 86 kW (125 A × 400 V × √3).
      const kwEingabe = parseFloat(netzKw) || 0;
      const netzKwVerfuegbar = kwEingabe > 0 ? kwEingabe : (isCee ? 86 : 0);

      // --- Variantenauswahl nach Berechnungsmatrix ---
      const auswahl  = waehleVariante(totalKwh, netzKwVerfuegbar, ladepunkte);
      const variante = auswahl ? auswahl.v : null;
      const rechenKwh = auswahl ? auswahl.kwhRechnung : totalKwh;
      const istMindest = auswahl ? auswahl.mindest : false;

      const CAPACITY_NOTE = 'Abhängig vom geplanten Einsatz- und Ladeprofil der Fahrzeuge.';
      const ppuBox    = document.getElementById('ppu-box');
      const ppuNocalc = document.getElementById('ppu-nocalc');
      const cubeBlock = document.getElementById('result-cube');
      const varBlock  = document.getElementById('result-variant');
      const videoBlock = document.getElementById('result-video');
      const videoEl   = document.getElementById('result-video-el');

      let rate = null, rateLabel, cubeName;
      let summaryCapacity, summaryCapacityNote = CAPACITY_NOTE;

      if(!variante){
        // Keine Übereinstimmung mit der Matrix -> kundenspezifische Variante
        if(cubeBlock) cubeBlock.style.display = 'none';
        if(varBlock)  varBlock.classList.remove('show');
        if(videoBlock) videoBlock.classList.add('show');
        if(videoEl){ try { videoEl.currentTime = 0; const pr = videoEl.play(); if(pr && pr.catch) pr.catch(()=>{}); } catch(e){} }
        ppuBox.style.display = 'none';
        ppuNocalc.classList.add('show');
        rateLabel = 'Kundenspezifische Variante – individuelle Beratung erforderlich';
        cubeName  = 'Kundenspezifische Variante';
        summaryCapacity = 'Bestandteil der gesonderten PowerCube Konfiguration';
        summaryCapacityNote = '';
      } else {
        rate = variantenPreis(variante, rechenKwh);
        rateLabel = fmtPreis(rate) + ' €/kWh' + (istMindest ? ' (Mindestmenge ' + fmtKwh(rechenKwh) + ' kWh / Monat)' : '');
        summaryCapacity = variante.lvMin + '–' + variante.lvMax + ' Ladevorgänge / 24 h';
        if(videoBlock) videoBlock.classList.remove('show');
        if(videoEl){ try { videoEl.pause(); } catch(e){} }
        ppuBox.style.display = '';
        ppuNocalc.classList.remove('show');
        document.getElementById('ppu-rate-val').innerHTML = fmtPreis(rate) + ' <small>€/kWh</small>';
        const lbl = document.querySelector('#ppu-box .lbl');
        if(lbl) lbl.textContent = 'Preisindikation nach Berechnungsmatrix · Variante ' + variante.badge;
        const from = document.querySelector('#ppu-box .ppu-from');
        if(from) from.textContent = istMindest
          ? 'Berechnet für die Mindestmenge von ' + fmtKwh(rechenKwh) + ' kWh / Monat (Ihr Bedarf: ' + fmtKwh(totalKwh) + ' kWh / Monat) · Pay per Use, Abrechnung je geladener kWh'
          : 'Berechnet für ' + fmtKwh(totalKwh) + ' kWh / Monat · Pay per Use, Abrechnung je geladener kWh';

        if(variante.id === 'V1'){
          // V1 -> bestehende Darstellung der empfohlenen Ladelösung
          cubeName = 'PowerCube 400 kW · 756 kWh';
          if(varBlock) varBlock.classList.remove('show');
          if(cubeBlock) cubeBlock.style.display = '';
          document.getElementById('res-cube-name').textContent = cubeName;
          document.getElementById('res-cube-desc').innerHTML =
            'Mit integrierter Alpitronic HYC400. Lädt <strong>' + summaryCapacity + '</strong> bei Betrieb an <strong>'
            + netz + (netzKw ? ' (' + netzKw + ' kW)' : '') + '</strong>. Für Ihre <strong>' + total
            + '</strong> geplanten e-LKW.<br><span class="cap-note">' + CAPACITY_NOTE + '</span>';
        } else {
          // V2 / V3 -> Variantenblock mit Lösungsbeispiel
          cubeName = 'PowerCube ' + variante.badge + ' · ' + variante.format;
          if(cubeBlock) cubeBlock.style.display = 'none';
          if(varBlock)  varBlock.classList.add('show');
          document.getElementById('res-var-badge').textContent = variante.badge;
          document.getElementById('res-var-name').textContent = 'PowerCube ' + variante.badge;
          document.getElementById('res-var-desc').innerHTML =
            variantenBeschreibung(variante, total, netz, netzKw)
            + '<br><span class="cap-note">' + CAPACITY_NOTE + '</span>';
          document.getElementById('res-var-specs').innerHTML =
            variantenSpecs(variante).map(function(p){
              return '<div><div class="k">' + p[0] + '</div><div class="v">' + p[1] + '</div></div>';
            }).join('');
        }
      }
      document.getElementById('res-trucks').textContent = total;

      buildSummary(trucks, total, netz, netzKw, totalKwh, summaryCapacity, summaryCapacityNote);

      // Ergebnis für PDF / Kontaktformular merken
      const pvSel = (wizard.querySelector('input[name="pv"]:checked')||{}).value;
      const pvKwp = val('pv_kwp');
      const pvPpu = wizard.querySelector('input[name="pv_ppu"]')?.checked || false;
      lastResult = { trucks, total, totalKwh, netz, netzKw, rate, rateLabel, cubeName, variante, ladepunkte, capacity: summaryCapacity, capacityNote: summaryCapacityNote, pv: pvSel, pvKwp, pvPpu };

      document.getElementById('result-panel').classList.add('show');
      showStep(steps.length - 1);
    });
  }

  /* ===================================================================
     ZUSAMMENFASSUNG ALS PDF  (jsPDF)
     =================================================================== */
  function buildSummaryPdf(){
    if(!lastResult || !window.jspdf) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const pageW = 210, mL = 18, mR = 18, contentW = pageW - mL - mR;
    let y = 20;
    const BLUE = [34, 108, 224], INK = [17, 24, 39], GREY = [110, 120, 135];

    doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(0, 0, pageW, 4, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(INK[0],INK[1],INK[2]);
    doc.text('AW Automotive \u2013 PowerCube', mL, y); y += 7;
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('Zusammenfassung Ihrer Konfiguration (Pro-Bereich)', mL, y); y += 4;
    doc.setDrawColor(220); doc.line(mL, y, pageW - mR, y); y += 10;

    const heading = (t) => { doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(BLUE[0],BLUE[1],BLUE[2]); doc.text(t, mL, y); y += 6; doc.setTextColor(INK[0],INK[1],INK[2]); };
    const kv = (k, v) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(INK[0],INK[1],INK[2]);
      const kLines = doc.splitTextToSize(String(k), 52); doc.text(kLines, mL, y);
      doc.setFont('helvetica','normal'); doc.setTextColor(60,66,78);
      const vLines = doc.splitTextToSize(String(v), contentW - 55); doc.text(vLines, mL + 55, y);
      y += Math.max(6, Math.max(kLines.length, vLines.length) * 5);
    };
    const line = () => { doc.setDrawColor(232); doc.line(mL, y, pageW - mR, y); y += 6; };
    const checkPage = () => { if(y > 262){ doc.addPage(); y = 20; } };

    if(lastResult.rate === null){
      heading('Ihre individuelle Ladel\u00f6sung');
      const txt = 'Auf Basis Ihrer Angaben konfigurieren wir Ihren PowerCube passgenau. Der PowerCube ist modular aufgebaut und l\u00e4sst sich flexibel an Ihr Einsatz- und Ladeprofil anpassen \u2013 von der Speichergr\u00f6\u00dfe \u00fcber die Ladeleistung bis zum Netzanschluss. Ein pers\u00f6nliches Beratungsgespr\u00e4ch liefert die Grundlage f\u00fcr ein ma\u00dfgeschneidertes Konzept.';
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,66,78);
      const l = doc.splitTextToSize(txt, contentW); doc.text(l, mL, y); y += l.length * 5 + 3;
      if(lastResult.capacity) kv('Ladekapazit\u00e4t', lastResult.capacity);
    } else {
      heading('Empfohlene Ladel\u00f6sung');
      kv('L\u00f6sung', 'PowerCube ' + lastResult.variante.badge);
      variantenSpecs(lastResult.variante).forEach(function(p){ checkPage(); kv(p[0], p[1]); });
      kv('Ladekapazit\u00e4t', lastResult.capacity);
      if(lastResult.variante.id !== 'V1'){
        doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
        doc.text('Abbildung/Konfiguration: L\u00f6sungsbeispiel.', mL, y); y += 5; doc.setFont('helvetica','normal');
      }
      if(lastResult.capacityNote){
        doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
        const nl = doc.splitTextToSize(lastResult.capacityNote, contentW - 55); doc.text(nl, mL + 55, y); y += nl.length * 4 + 1;
        doc.setFont('helvetica','normal');
      }
    }
    y += 2; line(); checkPage();

    heading('Preisindikation \u00b7 PPU-Modell');
    if(lastResult.rate === null){
      const txt = 'Mit den hinterlegten Daten l\u00e4sst sich keine belastbare PPU-Geb\u00fchr berechnen. Wir empfehlen ein pers\u00f6nliches Beratungsgespr\u00e4ch.';
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,66,78);
      const l = doc.splitTextToSize(txt, contentW); doc.text(l, mL, y); y += l.length * 5 + 2;
    } else {
      kv('PPU-Rate', lastResult.rateLabel);
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
      const dis = 'Berechnet nach der AW-Berechnungsmatrix f\u00fcr ' + Math.round(lastResult.totalKwh).toLocaleString('de-DE') + ' kWh/Monat. Unverbindliche Orientierung, enth\u00e4lt keinen Stromliefervertrag.';
      const l = doc.splitTextToSize(dis, contentW); doc.text(l, mL, y); y += l.length * 4 + 2;
    }
    y += 2; line(); checkPage();

    heading('Ihre Angaben');
    kv('Geplante e-LKW', lastResult.total + ' Fahrzeug' + (lastResult.total===1?'':'e') + (lastResult.trucks.length>1?(' (' + lastResult.trucks.length + ' Gruppen)'):''));
    lastResult.trucks.forEach((t) => {
      checkPage();
      const n = t.row;
      const label = [t.brand, t.type].filter(Boolean).join(' \u00b7 ') || 'e-LKW';
      const km = val('p_km_' + n), tage = val('p_tage_' + n), zeit = val('p_zeit_' + n);
      const scen = [];
      if(wizard.querySelector('[name="p_uebernacht_' + n + '"]') && wizard.querySelector('[name="p_uebernacht_' + n + '"]').checked) scen.push('\u00dcbernacht');
      const zw = wizard.querySelector('[name="p_zwischen_' + n + '"]');
      if(zw && zw.checked){ const f = val('p_fenster_' + n); scen.push('Zwischenladung' + (f ? (' (' + f + ')') : '')); }
      const det = [];
      if(t.akku) det.push('Akku ' + t.akku + ' kWh');
      if(km) det.push(km + ' km/24 h');
      if(tage) det.push(tage + ' Tage/Monat');
      if(zeit) det.push(zeit);
      if(scen.length) det.push(scen.join(', '));
      kv('\u00bb ' + t.qty + '\u00d7 ' + label, det.length ? det.join(' \u00b7 ') : '\u2013');
    });
    const pvMap = { vorhanden:'PV/Eigenstrom vorhanden', geplant:'PV-Anschaffung geplant', keine:'Keine PV geplant' };
    if(lastResult.pv){
      let pvText = pvMap[lastResult.pv] || lastResult.pv;
      if(lastResult.pvKwp) pvText += ' (' + lastResult.pvKwp + ' kWp)';
      kv('Eigenstrom / PV', pvText);
      if(lastResult.pvPpu) kv('PV im PPU-Modell', 'Interesse vorhanden');
    }
    kv('Netzanschluss', (lastResult.netz || 'noch offen') + (lastResult.netzKw ? (' (max. ' + lastResult.netzKw + ' kW)') : ''));
    if(lastResult.totalKwh) kv('Energiebedarf', Math.round(lastResult.totalKwh).toLocaleString('de-DE') + ' kWh / Monat');

    y = 285;
    doc.setDrawColor(220); doc.line(mL, y, pageW - mR, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('AW Automotive GmbH \u00b7 Max-Planck-Str. 23 \u00b7 06796 Sandersdorf-Brehna \u00b7 info@aw-automotive.de \u00b7 www.aw-automotive.de', mL, y);
    doc.text('Erstellt am ' + new Date().toLocaleDateString('de-DE'), mL, y + 4);
    return doc;
  }

  let summaryPdfUrl = null;

  const downloadBtn = document.getElementById('download-summary-btn');
  if(downloadBtn){
    downloadBtn.addEventListener('click', () => {
      const doc = buildSummaryPdf();
      if(!doc){ alert('Bitte berechnen Sie zuerst Ihr Ergebnis.'); return; }
      doc.save('AW_PowerCube_Zusammenfassung.pdf');
    });
  }

  const toContactBtn = document.getElementById('to-contact-btn');
  const summaryAttached = document.getElementById('summary-attached');
  if(toContactBtn){
    toContactBtn.addEventListener('click', () => {
      const doc = buildSummaryPdf();
      if(doc){
        if(summaryPdfUrl) URL.revokeObjectURL(summaryPdfUrl);
        summaryPdfUrl = URL.createObjectURL(doc.output('blob'));
        if(summaryAttached) summaryAttached.hidden = false;
      }
      const idx = resolveIndex('kontakt');
      if(idx !== null) goToPanel(idx);
    });
  }

  const summaryViewBtn = document.getElementById('summary-view-btn');
  if(summaryViewBtn){
    summaryViewBtn.addEventListener('click', () => {
      if(!summaryPdfUrl){ const doc = buildSummaryPdf(); if(doc) summaryPdfUrl = URL.createObjectURL(doc.output('blob')); }
      if(summaryPdfUrl) window.open(summaryPdfUrl, '_blank');
    });
  }


  /* ---- File upload (Fragenkatalog) ---- */
  const uploadInput = document.getElementById('katalog-upload');
  const uploadDrop  = document.getElementById('upload-drop');
  const uploadText  = document.getElementById('upload-text');
  if(uploadInput && uploadDrop){
    const setFile = (file) => {
      if(file){
        uploadText.innerHTML = `<strong>${file.name}</strong> ausgewählt`;
        uploadDrop.classList.add('has-file');
      } else {
        uploadText.innerHTML = 'Datei hierher ziehen oder <strong>auswählen</strong>';
        uploadDrop.classList.remove('has-file');
      }
    };
    uploadInput.addEventListener('change', () => setFile(uploadInput.files[0]));
    ['dragenter','dragover'].forEach(ev => uploadDrop.addEventListener(ev, e => { e.preventDefault(); uploadDrop.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => uploadDrop.addEventListener(ev, e => { e.preventDefault(); uploadDrop.classList.remove('drag'); }));
    uploadDrop.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if(f){ uploadInput.files = e.dataTransfer.files; setFile(f); }
    });
  }

  /* ---- Contact form (Versand via Web3Forms an info@aw-automotive.de) ---- */
  const WEB3FORMS_KEY = '99977e12-7ca8-4066-912c-e9a344e8fc68';
  const form = document.getElementById('contact-form');
  if(form){
    form.addEventListener('submit', async e => {
      e.preventDefault();
      let ok = true;
      form.querySelectorAll('[required]').forEach(f => {
        const wrap = f.closest('.field');
        const valid = f.value.trim() !== '';
        if(wrap) wrap.classList.toggle('invalid', !valid);
        if(!valid) ok = false;
      });
      if(!ok) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      const errBox = getFormErrorBox();
      errBox.hidden = true;

      /* Datei-Upload (Fragenkatalog) prüfen: max. 5 MB */
      const katalogInput = document.getElementById('katalog-upload');
      const katalogFile = katalogInput && katalogInput.files && katalogInput.files[0] ? katalogInput.files[0] : null;
      if(katalogFile && katalogFile.size > 5 * 1024 * 1024){
        errBox.textContent = 'Der hochgeladene Fragenkatalog ist größer als 5 MB. Bitte verwenden Sie eine kleinere Datei.';
        errBox.hidden = false;
        return;
      }

      const fd = new FormData();
      fd.append('access_key', WEB3FORMS_KEY);
      fd.append('from_name', 'AW PowerCube Landingpage');
      const firma = (form.querySelector('[name="firma"]') || {}).value || '';
      fd.append('subject', 'Beratungsanfrage PowerCube' + (firma ? ' \u2013 ' + firma : ''));

      /* Kontaktfelder */
      const label = { firma:'Firmierung', ansprech:'Ansprechpartner', funktion:'Funktion', email:'E-Mail', tel:'Telefon', zeitraum:'Inbetriebnahmezeitraum', nachricht:'Nachricht' };
      Object.keys(label).forEach(name => {
        const f = form.querySelector('[name="' + name + '"]');
        if(f) fd.append(label[name], f.value.trim());
      });
      const emailField = form.querySelector('[name="email"]');
      if(emailField) fd.append('email', emailField.value.trim()); // Reply-To
      const bot = form.querySelector('[name="botcheck"]');
      if(bot && bot.checked){ return; } // Honeypot: stiller Abbruch bei Bots

      /* Konfigurator-Daten als Text */
      if(lastResult){
        fd.append('Konfigurator: Energiebedarf', Math.round(lastResult.totalKwh).toLocaleString('de-DE') + ' kWh/Monat');
        fd.append('Konfigurator: Netzanschluss', lastResult.netz + (lastResult.netzKw ? ' (' + lastResult.netzKw + ' kW)' : ''));
        fd.append('Konfigurator: Pay-per-Use-Rate', lastResult.rate === null ? 'Individuelles Angebot (gesonderte Konfiguration)' : String(lastResult.rateLabel));
        fd.append('Konfigurator: Ladekapazitaet', String(lastResult.capacity || ''));
        fd.append('Konfigurator: Variante', lastResult.variante ? ('PowerCube ' + lastResult.variante.badge) : 'Kundenspezifische Variante');
        fd.append('Konfigurator: Ladepunkte', lastResult.ladepunkte ? String(lastResult.ladepunkte) : 'automatisch gewaehlt');
        fd.append('Herkunft', 'Pro-Bereich (DE)');
        if(lastResult.pv) fd.append('Konfigurator: PV-Anlage', lastResult.pv + (lastResult.pvKwp ? ' (' + lastResult.pvKwp + ' kWp)' : ''));
      }

      /* Anhaenge: Konfigurations-PDF + optional Fragenkatalog */
      const summaryOn = summaryAttached && !summaryAttached.hidden;
      if(summaryOn){
        const doc = buildSummaryPdf();
        if(doc) fd.append('attachment', doc.output('blob'), 'AW_PowerCube_Zusammenfassung.pdf');
      }
      if(katalogFile) fd.append('fragenkatalog', katalogFile, katalogFile.name);

      /* Senden */
      const btnHtml = submitBtn ? submitBtn.innerHTML : '';
      if(submitBtn){ submitBtn.disabled = true; submitBtn.innerHTML = 'Wird gesendet \u2026'; }
      try{
        /* Wichtig: keine Header setzen – bei Anhängen setzt der Browser den
           korrekten multipart-Header (inkl. boundary) automatisch. */
        const res = await fetch('https://api.web3forms.com/submit', { method:'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if(!res.ok || json.success === false) throw new Error(json.message || ('HTTP ' + res.status));
        form.style.display = 'none';
        const thanks = document.getElementById('thanks');
        if(summaryOn){
          const note = thanks.querySelector('.thanks-summary-note');
          if(!note){
            const p = document.createElement('p');
            p.className = 'thanks-summary-note';
            p.style.cssText = 'margin-top:10px;font-size:.92rem;color:#226CE0;font-weight:600';
            p.innerHTML = 'Ihre Konfigurations-Zusammenfassung wurde als PDF automatisch beigefügt.';
            thanks.appendChild(p);
          }
        }
        thanks.classList.add('show');
      }catch(err){
        errBox.textContent = 'Ihre Anfrage konnte leider nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an info@aw-automotive.de.';
        errBox.hidden = false;
      }finally{
        if(submitBtn){ submitBtn.disabled = false; submitBtn.innerHTML = btnHtml; }
      }
    });

    function getFormErrorBox(){
      let box = form.querySelector('.form-error');
      if(!box){
        box = document.createElement('p');
        box.className = 'form-error';
        box.style.cssText = 'margin-top:12px;padding:10px 14px;border-radius:8px;background:#fdecea;color:#b3261e;font-size:.9rem;font-weight:600;text-align:center';
        box.hidden = true;
        const btn = form.querySelector('button[type="submit"]');
        if(btn && btn.parentNode) btn.parentNode.insertBefore(box, btn.nextSibling);
        else form.appendChild(box);
      }
      return box;
    }
  }
});


/* ============================================================
   PPU QUICK-CHECK — monatliche Lademenge eingeben, PPU-Preis
   erhalten. Nutzt dieselbe Berechnungsmatrix wie der
   Konfigurator (VARIANTEN, waehleVariante, variantenPreis).
   ============================================================ */
(function () {
  var T = {
    loc: 'de-DE',
    unit: '\u20ac/kWh',
    eurKwh: ' \u20ac/kWh',
    bis: '\u2013',
    lp: ' Ladepunkte',
    netz: ' kW Netz',
    kwhMonat: ' kWh / Monat',
    approx: 'ca. ',
    priceLbl: 'PPU-Preis je geladener Kilowattstunde',
    priceSub: 'Ausbaustufe %v \u00b7 berechnet f\u00fcr %k kWh im Monat',
    fInput: 'Ihre Lademenge',
    fBasis: 'Berechnungsbasis',
    fLevel: 'Ausbaustufe',
    fTech: 'Technik',
    fTrucks: 'Ladevorg\u00e4nge / 24 h',
    fMonth: 'Monatlicher Rechnungsbetrag',
    fEst: 'Entspricht rund \u2026 e\u2011LKW',
    noCalcLbl: 'Kundenspezifische Ausf\u00fchrung',
    noCalcVal: 'individuell',
    noCalcSub: 'F\u00fcr %s kWh im Monat liegt kein Standardfall der Berechnungsmatrix vor.',
    noteOut: '<strong>Ihre Lademenge liegt au\u00dferhalb der sechs Standard-Ausbaustufen.</strong> Unterhalb von 21.000 kWh und oberhalb von 112.000 kWh im Monat konzipieren wir die Ladel\u00f6sung individuell \u2013 sprechen Sie uns gern an.',
    noteMin: 'Ihre Lademenge von %s kWh liegt zwischen zwei Ausbaustufen. Berechnet wird daher die n\u00e4chstgr\u00f6\u00dfere Stufe %v mit ihrer Mindestmenge von %k kWh im Monat.',
    helperOut: 'Ergibt eine monatliche Lademenge von %s.',
    cTruck: 'Ladevorg\u00e4nge / 24 h',
    cKwh: 'kWh / Monat',
    cTech: 'Technik'
  };

  function eurFmt(n) { return Math.round(n).toLocaleString(T.loc) + '\u00a0\u20ac'; }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('qc-form');
    if (!form) return;

    var inKwh   = document.getElementById('qc-kwh');
    var errBox  = document.getElementById('qc-err');
    var resBox  = document.getElementById('qc-result');
    var priceEl = document.getElementById('qc-price');
    var valEl   = document.getElementById('qc-price-val');
    var lblEl   = document.getElementById('qc-price-lbl');
    var subEl   = document.getElementById('qc-price-sub');
    var factsEl = document.getElementById('qc-facts');
    var noteEl  = document.getElementById('qc-note');

    /* ---------- Übersichtstabelle und Mobil-Karten aufbauen ---------- */
    var tb = document.getElementById('qc-tbody');
    var cards = document.getElementById('qc-cards');
    VARIANTEN.forEach(function (v) {
      var pMin = variantenPreis(v, v.kwhMin);
      var pMax = variantenPreis(v, v.kwhMax);
      var preis = (Math.abs(pMin - pMax) < 1e-9)
        ? fmtPreis(pMin) + T.eurKwh
        : fmtPreis(pMax) + T.bis + fmtPreis(pMin) + T.eurKwh;
      var menge = (v.kwhMin === v.kwhMax)
        ? fmtKwh(v.kwhMin)
        : fmtKwh(v.kwhMin) + '\u2013' + fmtKwh(v.kwhMax);
      var technik = v.format + ' \u00b7 ' + v.ladepunkte + T.lp + ' \u00b7 ' + v.netzKw + T.netz;

      if (tb) {
        var tr = document.createElement('tr');
        tr.dataset.vid = v.id;
        tr.innerHTML = '<td class="qc-t-badge">' + v.badge + '</td><td>' + technik
          + '</td><td>' + v.lvMin + '\u2013' + v.lvMax + '</td><td>' + menge
          + '</td><td class="qc-t-price">' + preis + '</td>';
        tb.appendChild(tr);
      }
      if (cards) {
        var c = document.createElement('div');
        c.className = 'qc-mcard';
        c.dataset.vid = v.id;
        c.innerHTML = '<div class="qc-mc-head"><span class="qc-mc-badge">' + v.badge
          + '</span><span class="qc-mc-price">' + preis + '</span></div>'
          + '<div class="qc-mc-rows">'
          + '<div><span>' + T.cTruck + '</span><strong>' + v.lvMin + '\u2013' + v.lvMax + '</strong></div>'
          + '<div><span>' + T.cKwh + '</span><strong>' + menge + '</strong></div>'
          + '<div><span>' + T.cTech + '</span><strong>' + technik + '</strong></div>'
          + '</div>';
        cards.appendChild(c);
      }
    });

    function markiere(id) {
      [].forEach.call(document.querySelectorAll('#qc-tbody tr, #qc-cards .qc-mcard'), function (el) {
        el.classList.toggle('is-sel', !!id && el.dataset.vid === id);
      });
    }

    /* ---------- Umrechnungshilfe: Anzahl e-LKW -> kWh ---------- */
    var hLkw = document.getElementById('qc-lkw');
    var hLade = document.getElementById('qc-lade');
    var hTage = document.getElementById('qc-tage');
    var hOut = document.getElementById('qc-helper-out');
    var hBtn = document.getElementById('qc-helper-btn');

    function helperKwh() {
      var a = parseFloat((hLkw || {}).value) || 0;
      var b = parseFloat((hLade || {}).value) || 0;
      var c = parseFloat((hTage || {}).value) || 0;
      return a * b * c;
    }
    function helperUpdate() {
      var k = helperKwh();
      if (hOut) hOut.innerHTML = T.helperOut.replace('%s', '<strong>' + (k ? fmtKwh(k) + T.kwhMonat : '\u2013') + '</strong>');
      if (hBtn) hBtn.disabled = !k;
    }
    [hLkw, hLade, hTage].forEach(function (el) { if (el) el.addEventListener('input', helperUpdate); });
    helperUpdate();
    if (hBtn) hBtn.addEventListener('click', function () {
      var k = helperKwh();
      if (!k) return;
      inKwh.value = Math.round(k);
      berechne();
    });

    /* ---------- Schnellauswahl ---------- */
    [].forEach.call(document.querySelectorAll('.qc-chip'), function (b) {
      b.addEventListener('click', function () {
        inKwh.value = b.dataset.kwh;
        [].forEach.call(document.querySelectorAll('.qc-chip'), function (x) { x.classList.remove('is-sel'); });
        b.classList.add('is-sel');
        berechne();
      });
    });

    /* ---------- Berechnung ---------- */
    function zeile(k, v) { return '<div class="qc-fact"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

    function berechne() {
      var kwh = parseFloat(String(inKwh.value).replace(/[.\s]/g, '').replace(',', '.')) || 0;
      if (kwh <= 0) {
        if (errBox) errBox.hidden = false;
        resBox.hidden = true;
        markiere(null);
        return;
      }
      if (errBox) errBox.hidden = true;

      var a = waehleVariante(kwh, 0, '');
      resBox.hidden = false;
      noteEl.hidden = true;

      if (!a) {
        priceEl.classList.add('is-empty');
        lblEl.textContent = T.noCalcLbl;
        valEl.innerHTML = T.noCalcVal;
        subEl.textContent = T.noCalcSub.replace('%s', fmtKwh(kwh));
        factsEl.innerHTML = zeile(T.fInput, fmtKwh(kwh) + T.kwhMonat)
          + zeile(T.fEst, T.approx + Math.max(1, Math.round(kwh / 7000)));
        noteEl.hidden = false;
        noteEl.innerHTML = T.noteOut;
        markiere(null);
        try { resBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        return;
      }

      var v = a.v, basis = a.kwhRechnung, rate = variantenPreis(v, basis);
      priceEl.classList.remove('is-empty');
      lblEl.textContent = T.priceLbl;
      valEl.innerHTML = fmtPreis(rate) + ' <small>' + T.unit + '</small>';
      subEl.textContent = T.priceSub.replace('%v', v.badge).replace('%k', fmtKwh(basis));

      factsEl.innerHTML =
          zeile(T.fInput, fmtKwh(kwh) + T.kwhMonat)
        + zeile(T.fBasis, fmtKwh(basis) + T.kwhMonat)
        + zeile(T.fLevel, v.badge + ' \u00b7 ' + v.format)
        + zeile(T.fTech, v.ladepunkte + T.lp + ' \u00b7 ' + v.netzKw + T.netz + ' \u00b7 ' + fmtKwh(v.speicher) + ' kWh')
        + zeile(T.fTrucks, v.lvMin + '\u2013' + v.lvMax)
        + zeile(T.fMonth, T.approx + eurFmt(rate * basis));

      if (a.mindest) {
        noteEl.hidden = false;
        noteEl.innerHTML = T.noteMin.replace('%s', fmtKwh(kwh)).replace('%k', fmtKwh(basis)).replace('%v', v.badge);
      }
      markiere(v.id);
      try { resBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); berechne(); });
    inKwh.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); berechne(); } });
  });
})();

