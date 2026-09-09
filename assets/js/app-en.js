/* ============================================================
   AW Automotive PowerCube — selection matrix, PPU logic
   and panel navigation (English version, one panel at a time).
   PPU calculation is based on the yellow input fields of
   "Berechnung-PPU-Modell_Sped_Sommer.xlsx".
   ============================================================ */

/* ----- PPU rate based on total monthly energy demand -----
   Energy demand (kWh/month) = sum( number of e-trucks × distance km/day × operating days/month ), 1 km = 1 kWh.
   Tiers:
     < 24,000 kWh            -> no reliable calculation (consultation)
     24,000 – < 30,400 kWh   -> from €0.14/kWh
     30,400 – < 38,000 kWh   -> from €0.14/kWh
     38,000 – < 45,000 kWh   -> from €0.14/kWh
     ≥ 45,000 kWh            -> no reliable calculation (consultation)
   Returns: number (€/kWh) or null if no calculation is possible. */
function ppuRate(kwh){
  if(kwh < 24000) return null;
  if(kwh >= 45000) return null;
  if(kwh >= 38000) return 0.14;
  if(kwh >= 30400) return 0.14;
  if(kwh >= 24000) return 0.14;
  return null;
}

document.addEventListener('DOMContentLoaded', () => {

  /* ===================================================================
     PANEL NAVIGATION — one section at a time, not scrollable
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
  const dotLabels = { hero:'Start', vorteile:'Benefits', product:'Product', matrix:'Configurator', kontakt:'Contact', downloads:'Downloads' };
  panels.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = dotLabels[p.dataset.panel] || ('Step ' + (i+1));
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
     WIZARD (inside the configurator panel)
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
    // Keep the active step visible in the progress bar (scrollable on mobile)
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
      const showKw = inp.value.includes('Direct');
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
      `<div><label>Make</label><input type="text" name="t_brand_${n}" placeholder="e.g. MAN, Scania"></div>`;
    return `<div class="truck-row" data-row="${n}">
      <div class="idx">${n}</div>
      ${brand}
      <div><label>Number</label><input type="number" min="1" name="t_qty_${n}" value="1"></div>
      <div><label>Type / use</label><input type="text" name="t_type_${n}" placeholder="e.g. 3-axle, distribution"></div>
      <div><label>Battery kWh</label><input type="number" min="0" name="t_akku_${n}" placeholder="e.g. 480"></div>
      <button type="button" class="icon-btn remove-truck" title="Remove" aria-label="Remove row">
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
      profileList.innerHTML = `<div class="profile-empty">Please add at least one e-truck in step 1 first.</div>`;
      return;
    }
    profileList.innerHTML = trucks.map(t => {
      const label = [t.brand, t.type].filter(Boolean).join(' · ') || 'e-truck';
      const n = t.row;
      return `<div class="profile-card" data-row="${n}">
        <div class="pc-head"><span class="pc-badge">${t.qty}×</span><span>${label}</span><span class="pc-sub">Row ${n} from step 1</span></div>
        <div class="row3">
          <div class="field"><label>Distance driven <span class="hint">(km / 24 h)</span></label><input type="number" name="p_km_${n}" placeholder="e.g. 220"></div>
          <div class="field"><label>Operating days <span class="hint">(per month)</span></label><input type="number" name="p_tage_${n}" placeholder="e.g. 20"></div>
          <div class="field"><label>Operating hours</label><input type="text" name="p_zeit_${n}" placeholder="e.g. Mon–Fri, 6 am–6 pm"></div>
        </div>
        <div class="scenario-label">Planned charging scenarios</div>
        <div class="choice-cards">
          <label class="choice-card"><input type="checkbox" name="p_uebernacht_${n}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg><div><div class="t">Overnight charging</div><div class="d">Full charging at the depot overnight.</div></div></label>
          <label class="choice-card"><input type="checkbox" name="p_zwischen_${n}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><div><div class="t">Intermediate charging during the day</div><div class="d">Short top-up charging during daytime operation.</div></div></label>
        </div>
        <div class="field" style="margin-top:14px"><label>Time window for intermediate charging <span class="hint">(if planned)</span></label><input type="text" name="p_fenster_${n}" placeholder="e.g. 11 am–1 pm (lunch break)"></div>
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
      const label = [t.brand, t.type].filter(Boolean).join(' · ') || 'e-truck';
      const km = val(`p_km_${n}`), tage = val(`p_tage_${n}`), zeit = val(`p_zeit_${n}`);
      const scen = [];
      if(wizard.querySelector(`[name="p_uebernacht_${n}"]`)?.checked) scen.push('Overnight');
      if(wizard.querySelector(`[name="p_zwischen_${n}"]`)?.checked){
        const f = val(`p_fenster_${n}`);
        scen.push('Intermediate charging' + (f ? ` (${f})` : ''));
      }
      const parts = [];
      parts.push(`<b>${t.qty}× ${label}</b>`);
      if(t.akku) parts.push(`Battery ${t.akku} kWh`);
      if(km) parts.push(`${km} km/24 h`);
      if(tage) parts.push(`${tage} days/month`);
      if(zeit) parts.push(zeit);
      if(scen.length) parts.push(scen.join(', '));
      return `<div class="rs-truck">${parts.map(p=>`<span>${p}</span>`).join('')}</div>`;
    }).join('');
    let html = `<div class="rs-trucks"><div class="rs-item"><span class="rs-k">Planned e-trucks</span><span class="rs-v">${total} vehicle${total===1?'':'s'}${trucks.length>1?` · ${trucks.length} groups`:''}</span></div>${truckRows}</div>`;

    // PV
    const pvMap = { vorhanden:'PV/own power existing', geplant:'PV purchase planned', keine:'No PV planned' };
    const pv = (wizard.querySelector('input[name="pv"]:checked')||{}).value;
    if(pv){
      let pvText = pvMap[pv] || pv;
      const kwp = val('pv_kwp'); if(kwp) pvText += ` · ${kwp} kWp`;
      html += rsItem('On-site power / PV', pvText);
      if(wizard.querySelector('input[name="pv_ppu"]')?.checked)
        html += rsItem('PV in the PPU model', 'Interested');
    }
    // Grid connection
    html += rsItem('Grid connection', (netz || 'to be determined') + (netzKw ? ` · max. ${netzKw} kW` : ''));
    // Charging capacity (with note)
    if(capacity){
      html += rsItem('Charging capacity', `${capacity}${capacityNote ? `<span class="rs-note">${capacityNote}</span>` : ''}`);
    }
    // Total energy demand
    if(totalKwh){
      const kwhStr = Math.round(totalKwh).toLocaleString('en-US');
      html += rsItem('Energy demand', `${kwhStr} kWh / month`);
    }

    grid.innerHTML = html;
  }
  function rsItem(k, v){ return `<div class="rs-item"><span class="rs-k">${k}</span><span class="rs-v">${v}</span></div>`; }

  // Stores the most recently calculated result data (for PDF & contact form)
  let lastResult = null;

  const computeBtn = document.getElementById('compute-btn');
  if(computeBtn){
    computeBtn.addEventListener('click', () => {
      const trucks = readTrucks();
      let total = trucks.reduce((s, t) => s + (t.qty || 0), 0);
      if(total === 0) total = 1;

      // Monthly energy demand: sum(number × km/day × operating days/month), 1 km = 1 kWh
      const totalKwh = trucks.reduce((s, t) => {
        const km   = parseFloat(val(`p_km_${t.row}`)) || 0;
        const tage = parseFloat(val(`p_tage_${t.row}`)) || 0;
        return s + (t.qty || 0) * km * tage;
      }, 0);

      const netz = (wizard.querySelector('input[name="netz"]:checked')||{}).value || 'CEE 5/125 A';
      const netzKw = val('netz_kw');
      const isCee = !netz.includes('Direct');

      // --- Recommended cube (with CEE 5/125 A & ≤ 5 e-trucks: PowerCube 400 kW · 756 kWh) ---
      const cubeName = 'PowerCube 400 kW · 756 kWh';
      document.getElementById('res-cube-name').textContent = cubeName;
      document.getElementById('res-trucks').textContent = total;
      document.getElementById('res-netz').textContent = netz + (netzKw ? ` (${netzKw} kW)` : '');

      // --- Charging capacity by grid connection ---
      // CEE 5/125 A                    -> up to 5 e-trucks / 24 h
      // Direct grid connection ≥150 kW -> up to 10 e-trucks / 24 h
      // Direct grid connection <150 kW -> up to 5 e-trucks / 24 h
      const CAPACITY_NOTE = 'Depends on the planned deployment and charging profile of the vehicles.';
      let capacityValue;
      if(isCee){
        capacityValue = 'up to 5 e-trucks / 24 h';
      } else {
        const kwNum = parseFloat(netzKw) || 0;
        capacityValue = (kwNum >= 150) ? 'up to 10 e-trucks / 24 h' : 'up to 5 e-trucks / 24 h';
      }
      const capacity = capacityValue;
      document.getElementById('res-capacity').textContent = capacity;
      document.getElementById('res-cube-desc').innerHTML =
        `With integrated Alpitronic HYC400. Charges <strong id="res-capacity">${capacity}</strong> when operated on <strong id="res-netz">${netz}${netzKw ? ` (${netzKw} kW)` : ''}</strong>. For your <strong id="res-trucks">${total}</strong> planned e-trucks.<br><span class="cap-note">${CAPACITY_NOTE}</span>`;

      // --- PPU rate ---
      const rate = ppuRate(totalKwh);
      const ppuBox    = document.getElementById('ppu-box');
      const ppuNocalc = document.getElementById('ppu-nocalc');
      const cubeBlock = document.getElementById('result-cube');
      const videoBlock = document.getElementById('result-video');
      const videoEl   = document.getElementById('result-video-el');
      let rateLabel;
      // Charging capacity for summary/PDF: in the no-calc case, refer to separate configuration
      let summaryCapacity = capacity;
      let summaryCapacityNote = CAPACITY_NOTE;
      if(rate === null){
        // no reliable calculation possible -> consultation text + video placeholder instead of cube recommendation
        ppuBox.style.display = 'none';
        ppuNocalc.classList.add('show');
        if(cubeBlock) cubeBlock.style.display = 'none';
        if(videoBlock) videoBlock.classList.add('show');
        if(videoEl){ try { videoEl.currentTime = 0; const pr = videoEl.play(); if(pr && pr.catch) pr.catch(()=>{}); } catch(e){} }
        rateLabel = 'Individual consultation required';
        summaryCapacity = 'Part of the separate PowerCube configuration';
        summaryCapacityNote = '';
      } else {
        const rateStr = rate.toFixed(2);
        document.getElementById('ppu-rate-val').innerHTML = `from €${rateStr} <small>/kWh</small>`;
        ppuBox.style.display = '';
        ppuNocalc.classList.remove('show');
        if(cubeBlock) cubeBlock.style.display = '';
        if(videoBlock) videoBlock.classList.remove('show');
        if(videoEl){ try { videoEl.pause(); } catch(e){} }
        rateLabel = `from €${rateStr}/kWh`;
      }

      buildSummary(trucks, total, netz, netzKw, totalKwh, summaryCapacity, summaryCapacityNote);

      // Remember result for PDF / contact form
      const pvSel = (wizard.querySelector('input[name="pv"]:checked')||{}).value;
      const pvKwp = val('pv_kwp');
      const pvPpu = wizard.querySelector('input[name="pv_ppu"]')?.checked || false;
      lastResult = { trucks, total, totalKwh, netz, netzKw, rate, rateLabel, cubeName, capacity: summaryCapacity, capacityNote: summaryCapacityNote, pv: pvSel, pvKwp, pvPpu };

      document.getElementById('result-panel').classList.add('show');
      showStep(steps.length - 1);
    });
  }

  /* ===================================================================
     SUMMARY AS PDF  (jsPDF)
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
    doc.text('Summary of your configuration', mL, y); y += 4;
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
      heading('Your individual charging solution');
      const txt = 'Based on your details, we will configure your PowerCube to fit precisely. The PowerCube is modular and can be flexibly adapted to your deployment and charging profile \u2013 from storage size and charging power to the grid connection. A personal consultation provides the basis for a tailored concept.';
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,66,78);
      const l = doc.splitTextToSize(txt, contentW); doc.text(l, mL, y); y += l.length * 5 + 3;
      if(lastResult.capacity) kv('Charging capacity', lastResult.capacity);
    } else {
      heading('Recommended charging solution');
      kv('Solution', lastResult.cubeName);
      kv('CCS charging power', 'up to 400 kW');
      kv('Battery storage', '756 kWh');
      kv('Form factor', '10-ft design container');
      kv('Operating mode', 'Hybrid PV/battery/grid \u2013 PV use prioritised');
      kv('Charging capacity', lastResult.capacity);
      if(lastResult.capacityNote){
        doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
        const nl = doc.splitTextToSize(lastResult.capacityNote, contentW - 55); doc.text(nl, mL + 55, y); y += nl.length * 4 + 1;
        doc.setFont('helvetica','normal');
      }
    }
    y += 2; line(); checkPage();

    heading('Price indication \u00b7 PPU model');
    if(lastResult.rate === null){
      const txt = 'No reliable PPU fee can be calculated from the data provided. We recommend a personal consultation.';
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,66,78);
      const l = doc.splitTextToSize(txt, contentW); doc.text(l, mL, y); y += l.length * 5 + 2;
    } else {
      kv('PPU rate', lastResult.rateLabel);
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
      const dis = 'Non-binding indication, does not include an electricity supply contract. The exact fee can only be determined after a detailed needs analysis.';
      const l = doc.splitTextToSize(dis, contentW); doc.text(l, mL, y); y += l.length * 4 + 2;
    }
    y += 2; line(); checkPage();

    heading('Your details');
    kv('Planned e-trucks', lastResult.total + ' vehicle' + (lastResult.total===1?'':'s') + (lastResult.trucks.length>1?(' (' + lastResult.trucks.length + ' groups)'):''));
    lastResult.trucks.forEach((t) => {
      checkPage();
      const n = t.row;
      const label = [t.brand, t.type].filter(Boolean).join(' \u00b7 ') || 'e-truck';
      const km = val('p_km_' + n), tage = val('p_tage_' + n), zeit = val('p_zeit_' + n);
      const scen = [];
      if(wizard.querySelector('[name="p_uebernacht_' + n + '"]') && wizard.querySelector('[name="p_uebernacht_' + n + '"]').checked) scen.push('Overnight');
      const zw = wizard.querySelector('[name="p_zwischen_' + n + '"]');
      if(zw && zw.checked){ const f = val('p_fenster_' + n); scen.push('Intermediate charging' + (f ? (' (' + f + ')') : '')); }
      const det = [];
      if(t.akku) det.push('Battery ' + t.akku + ' kWh');
      if(km) det.push(km + ' km/24 h');
      if(tage) det.push(tage + ' days/month');
      if(zeit) det.push(zeit);
      if(scen.length) det.push(scen.join(', '));
      kv('\u00bb ' + t.qty + '\u00d7 ' + label, det.length ? det.join(' \u00b7 ') : '\u2013');
    });
    const pvMap = { vorhanden:'PV/own power existing', geplant:'PV purchase planned', keine:'No PV planned' };
    if(lastResult.pv){
      let pvText = pvMap[lastResult.pv] || lastResult.pv;
      if(lastResult.pvKwp) pvText += ' (' + lastResult.pvKwp + ' kWp)';
      kv('On-site power / PV', pvText);
      if(lastResult.pvPpu) kv('PV in the PPU model', 'Interested');
    }
    kv('Grid connection', (lastResult.netz || 'to be determined') + (lastResult.netzKw ? (' (max. ' + lastResult.netzKw + ' kW)') : ''));
    if(lastResult.totalKwh) kv('Energy demand', Math.round(lastResult.totalKwh).toLocaleString('en-US') + ' kWh / month');

    y = 285;
    doc.setDrawColor(220); doc.line(mL, y, pageW - mR, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('AW Automotive GmbH \u00b7 Max-Planck-Str. 23 \u00b7 06796 Sandersdorf-Brehna \u00b7 Germany \u00b7 info@aw-automotive.de \u00b7 www.aw-automotive.de', mL, y);
    doc.text('Created on ' + new Date().toLocaleDateString('en-GB'), mL, y + 4);
    return doc;
  }

  let summaryPdfUrl = null;

  const downloadBtn = document.getElementById('download-summary-btn');
  if(downloadBtn){
    downloadBtn.addEventListener('click', () => {
      const doc = buildSummaryPdf();
      if(!doc){ alert('Please calculate your result first.'); return; }
      doc.save('AW_PowerCube_Summary.pdf');
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


  /* ---- File upload (questionnaire) ---- */
  const uploadInput = document.getElementById('katalog-upload');
  const uploadDrop  = document.getElementById('upload-drop');
  const uploadText  = document.getElementById('upload-text');
  if(uploadInput && uploadDrop){
    const setFile = (file) => {
      if(file){
        uploadText.innerHTML = `<strong>${file.name}</strong> selected`;
        uploadDrop.classList.add('has-file');
      } else {
        uploadText.innerHTML = 'Drag your file here or <strong>choose</strong>';
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

  /* ---- Contact form (sent via Web3Forms to info@aw-automotive.de) ---- */
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

      /* Check file upload (questionnaire): max. 5 MB */
      const katalogInput = document.getElementById('katalog-upload');
      const katalogFile = katalogInput && katalogInput.files && katalogInput.files[0] ? katalogInput.files[0] : null;
      if(katalogFile && katalogFile.size > 5 * 1024 * 1024){
        errBox.textContent = 'The uploaded questionnaire is larger than 5 MB. Please use a smaller file.';
        errBox.hidden = false;
        return;
      }

      const fd = new FormData();
      fd.append('access_key', WEB3FORMS_KEY);
      fd.append('from_name', 'AW PowerCube Landing Page');
      const firma = (form.querySelector('[name="firma"]') || {}).value || '';
      fd.append('subject', 'PowerCube consultation request' + (firma ? ' \u2013 ' + firma : ''));

      /* Contact fields */
      const label = { firma:'Company', ansprech:'Contact person', funktion:'Position', email:'Email', tel:'Phone', zeitraum:'Commissioning period', nachricht:'Message' };
      Object.keys(label).forEach(name => {
        const f = form.querySelector('[name="' + name + '"]');
        if(f) fd.append(label[name], f.value.trim());
      });
      const emailField = form.querySelector('[name="email"]');
      if(emailField) fd.append('email', emailField.value.trim()); // Reply-To
      const bot = form.querySelector('[name="botcheck"]');
      if(bot && bot.checked){ return; } // Honeypot: silently abort for bots

      /* Configurator data as text */
      if(lastResult){
        fd.append('Configurator: Energy demand', Math.round(lastResult.totalKwh).toLocaleString('en-US') + ' kWh/month');
        fd.append('Configurator: Grid connection', lastResult.netz + (lastResult.netzKw ? ' (' + lastResult.netzKw + ' kW)' : ''));
        fd.append('Configurator: Pay-per-Use rate', lastResult.rate === null ? 'Individual quote (separate configuration)' : String(lastResult.rateLabel));
        fd.append('Configurator: Charging capacity', String(lastResult.capacity || ''));
        if(lastResult.pv) fd.append('Configurator: PV system', lastResult.pv + (lastResult.pvKwp ? ' (' + lastResult.pvKwp + ' kWp)' : ''));
      }

      /* Attachments: configuration PDF + optional questionnaire */
      const summaryOn = summaryAttached && !summaryAttached.hidden;
      if(summaryOn){
        const doc = buildSummaryPdf();
        if(doc) fd.append('attachment', doc.output('blob'), 'AW_PowerCube_Summary.pdf');
      }
      if(katalogFile) fd.append('questionnaire', katalogFile, katalogFile.name);

      /* Send */
      const btnHtml = submitBtn ? submitBtn.innerHTML : '';
      if(submitBtn){ submitBtn.disabled = true; submitBtn.innerHTML = 'Sending \u2026'; }
      try{
        /* Important: do not set any headers – with attachments the browser
           sets the correct multipart header (incl. boundary) automatically. */
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
            p.innerHTML = 'Your configuration summary was automatically attached as a PDF.';
            thanks.appendChild(p);
          }
        }
        thanks.classList.add('show');
      }catch(err){
        errBox.textContent = 'Unfortunately your enquiry could not be sent. Please try again or email us directly at info@aw-automotive.de.';
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
