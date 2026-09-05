(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const MAX_PAGES = 20, MAX_SIDE = 2200;
  const state = { pages: [], current: 0, tool: 'pen', drawing: false, start: null, crop: null, zoom: 1, selectedText: -1, dragText: null };
  const display = $('#displayCanvas'), dctx = display.getContext('2d');

  function pageCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function currentPage() { return state.pages[state.current]; }
  function drawTextObject(ctx, item, scale = 1, selected = false) {
    ctx.save();
    ctx.translate(item.x * scale, item.y * scale);
    ctx.rotate((item.rotation || 0) * Math.PI / 180);
    ctx.font = `600 ${item.size * scale}px Arial, sans-serif`;
    ctx.textBaseline = 'top'; ctx.fillStyle = item.color; ctx.globalAlpha = 1;
    ctx.fillText(item.text, 0, 0);
    if (selected) {
      const w = ctx.measureText(item.text).width, h = item.size * scale * 1.2;
      ctx.strokeStyle = '#0969da'; ctx.lineWidth = Math.max(2, 2 * scale); ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.strokeRect(-5 * scale, -5 * scale, w + 10 * scale, h + 10 * scale);
    }
    ctx.restore();
  }
  function drawTexts(ctx, page, scale = 1, showSelection = false) {
    (page.texts || []).forEach((item, i) => drawTextObject(ctx, item, scale, showSelection && i === state.selectedText));
  }
  function composite(page = currentPage(), quality = .9) {
    const c = pageCanvas(page.base.width, page.base.height), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(page.base, 0, 0); x.drawImage(page.ink, 0, 0); drawTexts(x, page);
    return c.toDataURL('image/jpeg', quality);
  }
  function toast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('show'); clearTimeout(t.timer); t.timer = setTimeout(() => t.classList.remove('show'), 2600); }
  function setBusy(on, message = 'Preparing your pages...') { $('#busyText').textContent = message; $('#busy').hidden = !on; }
  function updateHistoryButtons() { const p = currentPage(); $('#undo').disabled = !p || p.historyIndex <= 0; $('#redo').disabled = !p || p.historyIndex >= p.history.length - 1; }
  function saveHistory(page = currentPage()) {
    const snapshot = { base: page.base.toDataURL('image/jpeg', .9), ink: page.ink.toDataURL('image/png'), texts: JSON.parse(JSON.stringify(page.texts || [])) };
    page.history = page.history.slice(0, page.historyIndex + 1); page.history.push(snapshot);
    if (page.history.length > 9) page.history.shift(); else page.historyIndex++;
    page.historyIndex = page.history.length - 1; updateHistoryButtons(); updateThumbnail();
  }
  async function restoreSnapshot(snapshot) {
    const p = currentPage(), [b, i] = await Promise.all([loadImage(snapshot.base), loadImage(snapshot.ink)]);
    p.base = pageCanvas(b.width, b.height); p.base.getContext('2d').drawImage(b, 0, 0);
    p.ink = pageCanvas(i.width, i.height); p.ink.getContext('2d').drawImage(i, 0, 0); p.texts = JSON.parse(JSON.stringify(snapshot.texts || [])); state.selectedText = -1; render(); updateThumbnail(); updateHistoryButtons();
  }
  function loadImage(src) { return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; }); }
  async function normalizeFile(file) {
    let blob = file;
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      if (!window.heic2any) throw new Error('HEIC conversion is not available.');
      blob = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: .9 });
      if (Array.isArray(blob)) blob = blob[0];
    }
    const url = URL.createObjectURL(blob);
    try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
  }
  async function addFiles(files) {
    const incoming = [...files].slice(0, MAX_PAGES - state.pages.length); if (!incoming.length) return;
    setBusy(true, `Adding ${incoming.length} ${incoming.length === 1 ? 'page' : 'pages'}...`);
    let failures = 0;
    for (const file of incoming) {
      try {
        const image = await normalizeFile(file), scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
        const w = Math.round(image.width * scale), h = Math.round(image.height * scale), base = pageCanvas(w, h), ink = pageCanvas(w, h);
        base.getContext('2d').drawImage(image, 0, 0, w, h);
        const page = { base, ink, texts: [], name: file.name, history: [], historyIndex: -1 };
        state.pages.push(page); saveHistory(page);
      } catch (e) { failures++; console.error(e); }
    }
    setBusy(false); state.current = Math.max(0, state.pages.length - incoming.length); syncUI();
    if (failures) toast(`${failures} image${failures > 1 ? 's were' : ' was'} not added. Try JPG or PNG.`);
    if (state.pages.length >= MAX_PAGES) toast('This PDF has reached the 20-page limit.');
  }
  function syncUI() {
    const has = state.pages.length > 0; $('#emptyState').hidden = has; $('#editor').hidden = !has;
    $('#pageCount').textContent = state.pages.length; $('#readyPages').textContent = `${state.pages.length} ${state.pages.length === 1 ? 'page' : 'pages'}`;
    renderThumbnails(); if (has) render(); updateHistoryButtons();
  }
  function renderThumbnails() {
    const host = $('#thumbnails'); host.innerHTML = '';
    state.pages.forEach((p, i) => {
      const card = document.createElement('div'); card.className = `thumb${i === state.current ? ' active' : ''}`; card.setAttribute('role', 'listitem'); card.tabIndex = 0; card.setAttribute('aria-label', `Page ${i + 1}`);
      card.innerHTML = `<div class="thumb-image"><img alt="Preview of page ${i + 1}"></div><div class="thumb-footer"><b>Page ${i + 1}</b><div class="thumb-actions"><button type="button" class="move-up" title="Move page up" aria-label="Move page ${i + 1} earlier">&#8593;</button><button type="button" class="move-down" title="Move page down" aria-label="Move page ${i + 1} later">&#8595;</button><button type="button" class="delete-page" title="Delete page" aria-label="Delete page ${i + 1}">&times;</button></div></div>`;
      card.querySelector('img').src = composite(p, .58); card.onclick = (e) => { if (!e.target.closest('button')) { state.current = i; state.selectedText = -1; syncUI(); } }; card.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); state.current = i; state.selectedText = -1; syncUI(); } };
      card.querySelector('.move-up').onclick = () => movePage(i, -1); card.querySelector('.move-down').onclick = () => movePage(i, 1); card.querySelector('.delete-page').onclick = () => deletePage(i);
      card.querySelector('.move-up').disabled = i === 0; card.querySelector('.move-down').disabled = i === state.pages.length - 1; host.append(card);
    });
  }
  function updateThumbnail() { renderThumbnails(); }
  function movePage(i, delta) { const j = i + delta; if (j < 0 || j >= state.pages.length) return; [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]]; state.current = j; syncUI(); toast(`Moved to page ${j + 1}.`); }
  function deletePage(i) { state.pages.splice(i, 1); state.current = Math.min(state.current, state.pages.length - 1); syncUI(); if (!state.pages.length) toast('All pages removed.'); }
  function displaySize() {
    const p = currentPage(), stage = $('#canvasStage'), fitW = Math.max(280, stage.clientWidth - 48), fitH = Math.max(310, stage.clientHeight - 48);
    const fit = Math.min(fitW / p.base.width, fitH / p.base.height, 1); return { w: Math.round(p.base.width * fit * state.zoom), h: Math.round(p.base.height * fit * state.zoom) };
  }
  function render() {
    const p = currentPage(); if (!p) return; const s = displaySize();
    if (display.width !== s.w) display.width = s.w;
    if (display.height !== s.h) display.height = s.h;
    dctx.clearRect(0, 0, s.w, s.h); dctx.drawImage(p.base, 0, 0, s.w, s.h); dctx.drawImage(p.ink, 0, 0, s.w, s.h);
    drawTexts(dctx, p, s.w / p.base.width, state.tool === 'text');
  }
  function point(e) { const r = display.getBoundingClientRect(); return { x: (e.clientX - r.left) * display.width / r.width, y: (e.clientY - r.top) * display.height / r.height }; }
  function fullPoint(pt) { const p = currentPage(); return { x: pt.x * p.base.width / display.width, y: pt.y * p.base.height / display.height }; }
  function imagePoint(e) {
    const r = display.getBoundingClientRect(), p = currentPage();
    return { x: (e.clientX - r.left) * p.base.width / r.width, y: (e.clientY - r.top) * p.base.height / r.height };
  }
  function hitText(fp) {
    const p = currentPage(), ctx = p.ink.getContext('2d');
    for (let i = (p.texts || []).length - 1; i >= 0; i--) {
      const t = p.texts[i], angle = -(t.rotation || 0) * Math.PI / 180, dx = fp.x - t.x, dy = fp.y - t.y;
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle), ly = dx * Math.sin(angle) + dy * Math.cos(angle);
      ctx.font = `600 ${t.size}px Arial, sans-serif`;
      if (lx >= -10 && lx <= ctx.measureText(t.text).width + 10 && ly >= -10 && ly <= t.size * 1.25 + 10) return i;
    }
    return -1;
  }
  function setTool(tool) {
    state.tool = tool; state.crop = null; $('#cropSelection').hidden = true;
    $$('.tool[data-tool]').forEach(b => { const on = b.dataset.tool === tool; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    $('#textBar').hidden = tool !== 'text'; $('#cropBar').hidden = tool !== 'crop'; $('#toolOptions').hidden = tool === 'crop' || tool === 'text';
    state.selectedText = -1; display.classList.toggle('text-mode', tool === 'text'); display.classList.remove('dragging-text'); render();
  }
  function begin(e) {
    if (!currentPage()) return; e.preventDefault(); const pt = point(e), fp = imagePoint(e);
    if (state.tool === 'text') {
      const hit = hitText(fp);
      if (hit >= 0) {
        state.selectedText = hit; const t = currentPage().texts[hit];
        state.dragText = { index: hit, dx: fp.x - t.x, dy: fp.y - t.y, moved: false };
        state.drawing = true; display.classList.add('dragging-text'); display.setPointerCapture?.(e.pointerId); render(); return;
      }
      addText(fp); return;
    }
    if (state.tool === 'eraser') {
      const hit = hitText(fp);
      if (hit >= 0) { currentPage().texts.splice(hit, 1); state.selectedText = -1; saveHistory(); render(); toast('Text removed.'); return; }
    }
    state.drawing = true; state.start = pt; display.setPointerCapture?.(e.pointerId);
    if (state.tool === 'crop') { state.crop = { x: pt.x, y: pt.y, w: 0, h: 0 }; updateCropBox(); return; }
    const ctx = currentPage().ink.getContext('2d'); ctx.beginPath(); ctx.moveTo(fp.x, fp.y);
  }
  function move(e) {
    if (!state.drawing) return; e.preventDefault(); const pt = point(e);
    if (state.tool === 'text' && state.dragText) {
      const fp = imagePoint(e), t = currentPage().texts[state.dragText.index];
      t.x = fp.x - state.dragText.dx; t.y = fp.y - state.dragText.dy; state.dragText.moved = true; render(); return;
    }
    if (state.tool === 'crop') { state.crop.w = pt.x - state.start.x; state.crop.h = pt.y - state.start.y; updateCropBox(); return; }
    const p = currentPage(), fp = imagePoint(e), ctx = p.ink.getContext('2d'), scale = p.base.width / display.getBoundingClientRect().width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Number($('#size').value) * scale;
    if (state.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = $('#color').value; ctx.globalAlpha = state.tool === 'highlight' ? .28 : 1; }
    ctx.lineTo(fp.x, fp.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; render();
  }
  function end(e) {
    if (!state.drawing) return; state.drawing = false;
    if (state.tool === 'text' && state.dragText) {
      const moved = state.dragText.moved; state.dragText = null; display.classList.remove('dragging-text'); if (moved) saveHistory(); return;
    }
    if (state.tool === 'crop') { $('#applyCrop').disabled = !state.crop || Math.abs(state.crop.w) < 18 || Math.abs(state.crop.h) < 18; return; }
    saveHistory();
  }
  function updateCropBox() {
    const c = state.crop, box = $('#cropSelection'); if (!c) { box.hidden = true; return; } box.hidden = false;
    const sx = display.clientWidth / display.width, sy = display.clientHeight / display.height;
    box.style.left = `${Math.min(c.x, c.x + c.w) * sx}px`; box.style.top = `${Math.min(c.y, c.y + c.h) * sy}px`; box.style.width = `${Math.abs(c.w) * sx}px`; box.style.height = `${Math.abs(c.h) * sy}px`;
  }
  function addText(fp) {
    const text = $('#textInput').value.trim(); if (!text) { toast('Type your text first.'); $('#textInput').focus(); return; }
    const p = currentPage(), scale = p.base.width / display.getBoundingClientRect().width;
    p.texts.push({ text, x: fp.x, y: fp.y, size: Math.max(18, Number($('#size').value) * 4) * scale, color: $('#color').value, rotation: 0 });
    state.selectedText = p.texts.length - 1; $('#textInput').value = ''; saveHistory(); render(); toast('Text added. Drag it to move it.');
  }
  async function rotate() {
    const p = currentPage(); if (!p) return;
    const oldHeight = p.base.height;
    for (const key of ['base','ink']) { const old = p[key], c = pageCanvas(old.height, old.width), x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(old, 0, 0); p[key] = c; }
    p.texts.forEach(t => { const oldX = t.x; t.x = oldHeight - t.y; t.y = oldX; t.rotation = ((t.rotation || 0) + 90) % 360; });
    saveHistory(); render();
  }
  function applyCrop() {
    if (!state.crop) return; const p = currentPage(), a = fullPoint({x: Math.min(state.crop.x, state.crop.x + state.crop.w), y: Math.min(state.crop.y, state.crop.y + state.crop.h)}), b = fullPoint({x: Math.max(state.crop.x, state.crop.x + state.crop.w), y: Math.max(state.crop.y, state.crop.y + state.crop.h)});
    const x = Math.max(0, Math.round(a.x)), y = Math.max(0, Math.round(a.y)), w = Math.min(p.base.width - x, Math.round(b.x - a.x)), h = Math.min(p.base.height - y, Math.round(b.y - a.y)); if (w < 40 || h < 40) return;
    for (const key of ['base','ink']) { const c = pageCanvas(w, h); c.getContext('2d').drawImage(p[key], x, y, w, h, 0, 0, w, h); p[key] = c; }
    p.texts = p.texts.filter(t => t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h).map(t => ({ ...t, x: t.x - x, y: t.y - y }));
    state.crop = null; $('#cropSelection').hidden = true; $('#applyCrop').disabled = true; setTool('pen'); saveHistory(); render(); toast('Page cropped.');
  }
  async function undoRedo(delta) { const p = currentPage(); if (!p) return; const next = p.historyIndex + delta; if (next < 0 || next >= p.history.length) return; p.historyIndex = next; await restoreSnapshot(p.history[next]); }
  function cleanFilename() { return ($('#filename').value.trim() || 'Math172_Assignment').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_'); }
  async function makePdf() {
    if (!window.jspdf?.jsPDF) { toast('The PDF tool did not load. Check your connection and try again.'); return; }
    setBusy(true, 'Creating your PDF...'); await new Promise(r => setTimeout(r, 60));
    try {
      const quality = Number($('#quality').value), { jsPDF } = window.jspdf; let pdf;
      state.pages.forEach((p, i) => {
        const landscape = p.base.width > p.base.height, orientation = landscape ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format: 'letter', compress: true }); else pdf.addPage('letter', orientation);
        const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), margin = 24, ratio = Math.min((pw - 2 * margin) / p.base.width, (ph - 2 * margin) / p.base.height), w = p.base.width * ratio, h = p.base.height * ratio;
        pdf.addImage(composite(p, quality), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST');
      });
      pdf.save(`${cleanFilename()}.pdf`); $('#exportMessage').textContent = 'PDF downloaded. It is ready to upload to Canvas.'; toast('Your PDF is ready.');
    } catch (e) { console.error(e); toast('The PDF could not be created. Try the compact quality setting.'); } finally { setBusy(false); }
  }
  function showPreview() {
    const grid = $('#previewGrid'); grid.innerHTML = ''; state.pages.forEach((p, i) => { const f = document.createElement('figure'); f.className = 'preview-item'; f.innerHTML = `<img alt="Full preview of page ${i + 1}"><figcaption>Page ${i + 1}</figcaption>`; f.querySelector('img').src = composite(p, .72); grid.append(f); }); $('#previewDialog').showModal();
  }
  function resetAll() { state.pages = []; state.current = 0; state.crop = null; $('#confirmDialog').close(); syncUI(); }

  ['#cameraInput','#fileInput','#moreInput'].forEach(id => $(id).addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; }));
  $$('.tool[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool)); $('#rotate').onclick = rotate; $('#undo').onclick = () => undoRedo(-1); $('#redo').onclick = () => undoRedo(1);
  $('#size').oninput = e => $('#sizeOutput').value = e.target.value; $('#zoom').oninput = e => { state.zoom = Number(e.target.value) / 100; $('#zoomOutput').value = `${e.target.value}%`; render(); };
  display.addEventListener('pointerdown', begin); display.addEventListener('pointermove', move); display.addEventListener('pointerup', end); display.addEventListener('pointercancel', end);
  $('#applyCrop').onclick = applyCrop; $('#cancelCrop').onclick = () => setTool('pen'); $('#downloadPdf').onclick = makePdf; $('#dialogDownload').onclick = () => { $('#previewDialog').close(); makePdf(); };
  $('#previewPdf').onclick = showPreview; $('#closePreview').onclick = () => $('#previewDialog').close(); $('#dialogBack').onclick = () => $('#previewDialog').close();
  $('#clearAll').onclick = () => $('#confirmDialog').showModal(); $('#cancelClear').onclick = () => $('#confirmDialog').close(); $('#confirmClear').onclick = resetAll;
  window.addEventListener('resize', () => { if (state.pages.length) render(); });
  window.addEventListener('beforeunload', e => { if (state.pages.length) { e.preventDefault(); e.returnValue = ''; } });
})();
