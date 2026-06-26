// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  baseImages:    [],
  patternImages: [],
  destination:   null,
  isRunning:     false
};

const kdState = {
  baseImagePairs: [], // [{ base: string, mask: string|null, curtainWidthMm: string }]
  patternImages:  [],
  destination:    null,
  isRunning:      false
};

const spState = {
  sourceImages: [],
  destination:  null,
  isRunning:    false
};

let currentEngine = 'google'; // 'google' | 'kd' | 'sp' | 'crop'

// ─── Crop State ───────────────────────────────────────────────────────────────
const cropState = {
  images:      [],   // [{ path, dataUrl, frameX, frameY, rotation, saved }]
  activeIndex: null,
  image:       null, // current HTMLImageElement
  scale:       1,
  frameX:      0,
  frameY:      0,
  rotation:    0,    // degrees, applied to image for scan correction
  destination: null, // output folder for auto-save
  isDragging:      false,
  dragStartX:      0,
  dragStartY:      0,
  dragStartFrameX: 0,
  dragStartFrameY: 0,
};
let cropFramePx = 2400;

// ─── SP Pattern Options ───────────────────────────────────────────────────────

const SP_PATTERN_OPTIONS = [
  { value: '',                                         label: '— Auto detect —'   },
  { value: 'Seamless repeating stripe pattern',        label: 'Stripe'             },
  { value: 'Seamless geometric pattern',              label: 'Geometric'          },
  { value: 'Seamless abstract pattern',               label: 'Abstract'           },
  { value: 'Seamless floral pattern with flowers',    label: 'Floral'             },
  { value: 'Seamless botanical leaf pattern',         label: 'Botanical / Leaves' },
  { value: 'Seamless damask ornate woven pattern',    label: 'Damask'             },
  { value: 'Seamless paisley pattern',                label: 'Paisley'            },
  { value: 'Seamless herringbone weave pattern',      label: 'Herringbone'        },
  { value: 'Seamless plaid tartan check pattern',     label: 'Plaid / Tartan'     },
  { value: 'Seamless jacquard woven pattern',         label: 'Jacquard'           },
  { value: 'Seamless linen fabric texture',           label: 'Linen Texture'      },
  { value: 'Seamless suede leather texture',          label: 'Suede Texture'      },
  { value: 'Seamless silk fabric texture',            label: 'Silk Texture'       },
  { value: 'Seamless velvet fabric texture',          label: 'Velvet Texture'     },
  { value: 'Seamless ombré gradient color fade',      label: 'Ombré / Gradient'   },
  { value: 'Seamless tropical palm leaf pattern',     label: 'Tropical'           },
  { value: 'Seamless medallion ornamental pattern',   label: 'Medallion'          },
  { value: 'Seamless toile de jouy pastoral print',   label: 'Toile de Jouy'      },
  { value: 'Seamless chevron zigzag pattern',         label: 'Chevron'            },
  { value: 'Seamless animal print pattern',           label: 'Animal Print'       },
];

// ─── Console Panel ───────────────────────────────────────────────────────────

const MAX_ENTRIES = 500;
let consoleEntryCount = 0;
let consoleCollapsed  = false;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function appendConsoleEntry({ timestamp, level = 'info', tag, message }) {
  const body = document.getElementById('consoleBody');
  if (!body) return;

  const placeholder = body.querySelector('.console-empty');
  if (placeholder) placeholder.remove();

  if (consoleEntryCount >= MAX_ENTRIES) {
    if (body.firstChild) body.removeChild(body.firstChild);
    consoleEntryCount--;
  }

  const time     = (timestamp || new Date().toISOString()).slice(11, 23);
  const tagClass = 'tag-' + (tag || 'default').toLowerCase().replace(/[^a-z]/g, '') || 'tag-default';

  const el = document.createElement('div');
  el.className = `console-entry console-entry--${level}`;
  el.innerHTML =
    `<span class="console-ts">${time}</span>` +
    `<span class="console-tag ${tagClass}">${escapeHtml(tag)}</span>` +
    `<span class="console-msg">${escapeHtml(message)}</span>`;

  body.appendChild(el);
  consoleEntryCount++;

  document.getElementById('consoleCount').textContent = consoleEntryCount;
  body.scrollTop = body.scrollHeight;
}

function clearConsole() {
  const body = document.getElementById('consoleBody');
  body.innerHTML = '<div class="console-empty">Console cleared</div>';
  consoleEntryCount = 0;
  document.getElementById('consoleCount').textContent = '0';
}


// ─── Logger ──────────────────────────────────────────────────────────────────

function log(tag, message, level = 'info') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  if      (level === 'error') console.error(`[${ts}] [${tag}]`, message);
  else if (level === 'warn')  console.warn( `[${ts}] [${tag}]`, message);
  else                        console.log(  `[${ts}] [${tag}]`, message);
  appendConsoleEntry({ timestamp: new Date().toISOString(), level, tag, message });
}

const logSuccess = (tag, msg) => log(tag, msg, 'success');
const logWarn    = (tag, msg) => log(tag, msg, 'warn');
const logError   = (tag, msg) => log(tag, msg, 'error');

// ─── Engine Switching ────────────────────────────────────────────────────────

function switchEngine(engine) {
  currentEngine = engine;

  document.getElementById('flowGoogle').classList.toggle('is-active', engine === 'google');
  document.getElementById('flowKD').classList.toggle('is-active',     engine === 'kd');
  document.getElementById('flowSP').classList.toggle('is-active',     engine === 'sp');
  document.getElementById('flowCrop').classList.toggle('is-active',   engine === 'crop');

  // API key row: hide for KD and Crop (no Gemini needed)
  document.getElementById('googleApiKeyRow').style.display = (engine === 'kd' || engine === 'crop') ? 'none' : '';

  document.querySelectorAll('.engine-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.engine === engine);
  });

  setProgress(0, 'Ready to generate', null, '');
  const labels = { google: 'Google AI', kd: 'KD Mockup Generator', sp: 'Seamless Pattern Generator' };
  log('UI', `Engine switched to: ${labels[engine]}`);
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  log('UI', 'Initialising');

  // Forward main-process log entries into the in-app console
  window.electronAPI.onLogEntry(({ timestamp, level, tag, message }) => {
    appendConsoleEntry({ timestamp, level, tag, message });
  });


  // Google AI init
  const savedKey = await window.electronAPI.getApiKey();
  if (savedKey) {
    document.getElementById('apiKey').value = savedKey;
    log('UI', 'Loaded saved API key');
  } else {
    log('UI', 'No API key saved — server default will be used');
  }

  const savedMode = await window.electronAPI.getScaleMode();
  if (savedMode) {
    document.getElementById('scaleMode').value = savedMode;
    log('UI', `Loaded scale mode: ${savedMode}`);
  }

  // KD init
  const kdCfg = await window.electronAPI.getKdConfig();
  document.getElementById('kdScaleMode').value          = kdCfg.scaleMode;
  document.getElementById('kdPatternRotation').value    = kdCfg.patternRotation;
  document.getElementById('kdPatternTileWidthMm').value = kdCfg.patternTileWidthMm;
  log('UI', `Loaded KD config: scale=${kdCfg.scaleMode}, rotation=${kdCfg.patternRotation}°, tile=${kdCfg.patternTileWidthMm}mm`);

  // Restore saved KD base+mask pairs
  const savedPairs = await window.electronAPI.getKdBasePairs();
  if (savedPairs.length) {
    kdState.baseImagePairs = savedPairs;
    renderKdPairList();
    updateKdSummary();
    updateKdRunButton();
    log('UI', `Restored ${savedPairs.length} KD base image pair(s)`);
  }

  bindEvents();
  log('UI', 'Ready');
}

// ─── Events ──────────────────────────────────────────────────────────────────

function bindEvents() {
  // Engine toggle
  document.getElementById('engineGoogle').addEventListener('click', () => switchEngine('google'));
  document.getElementById('engineKD').addEventListener('click',     () => switchEngine('kd'));
  document.getElementById('engineSP').addEventListener('click',     () => switchEngine('sp'));
  document.getElementById('engineCrop').addEventListener('click',   () => switchEngine('crop'));

  initCropPage();

  // ── Google AI: API key ──
  document.getElementById('saveApiKey').addEventListener('click', async () => {
    const key = document.getElementById('apiKey').value.trim();
    if (!key) { logWarn('UI', 'Save key clicked but field is empty'); return; }
    await window.electronAPI.saveApiKey(key);
    logSuccess('UI', 'API key saved');
    const badge = document.getElementById('apiKeySaved');
    badge.hidden = false;
    setTimeout(() => { badge.hidden = true; }, 2500);
  });

  // ── Google AI: Base images ──
  document.getElementById('addBaseImages').addEventListener('click', async () => {
    log('UI', 'Opening image picker for base images');
    const paths = await window.electronAPI.selectImages();
    if (!paths.length) { log('UI', 'Image picker cancelled'); return; }

    const existing = new Set(state.baseImages);
    let dupes = 0;
    paths.forEach(p => { if (existing.has(p)) { dupes++; return; } state.baseImages.push(p); });
    const added = paths.length - dupes;

    log('UI', `Base images: +${added} added${dupes ? `, ${dupes} duplicate(s) skipped` : ''} → total ${state.baseImages.length}`);
    paths.filter(p => !existing.has(p)).forEach(p => log('UI', `  + ${p.split('/').pop()}`));

    renderGrid('baseImageGrid', state.baseImages, 'base');
    updateCount('baseCount', state.baseImages.length);
    updateSummary();
    updateRunButton();
  });

  // ── Google AI: Pattern images ──
  document.getElementById('addPatternImages').addEventListener('click', async () => {
    log('UI', 'Opening image picker for patterns');
    const paths = await window.electronAPI.selectImages();
    if (!paths.length) { log('UI', 'Image picker cancelled'); return; }

    const existing = new Set(state.patternImages);
    let dupes = 0;
    paths.forEach(p => { if (existing.has(p)) { dupes++; return; } state.patternImages.push(p); });
    const added = paths.length - dupes;

    log('UI', `Patterns: +${added} added${dupes ? `, ${dupes} duplicate(s) skipped` : ''} → total ${state.patternImages.length}`);
    paths.filter(p => !existing.has(p)).forEach(p => log('UI', `  + ${p.split('/').pop()}`));

    renderGrid('patternImageGrid', state.patternImages, 'pattern');
    updateCount('patternCount', state.patternImages.length);
    updateSummary();
    updateRunButton();
  });

  // ── Google AI: Destination ──
  document.getElementById('selectDestination').addEventListener('click', async () => {
    log('UI', 'Opening folder picker');
    const dir = await window.electronAPI.selectDestination();
    if (!dir) { log('UI', 'Folder picker cancelled'); return; }
    state.destination = dir;
    document.getElementById('destinationPath').value = dir;
    logSuccess('UI', `Destination set: ${dir}`);
    updateRunButton();
  });

  // ── Google AI: Catalogue name ──
  document.getElementById('catalogueName').addEventListener('input', (e) => {
    updateRunButton();
    if (e.target.value.trim()) log('UI', `Catalogue name: "${e.target.value.trim()}"`);
  });

  // ── Google AI: Scale mode ──
  document.getElementById('scaleMode').addEventListener('change', async (e) => {
    await window.electronAPI.saveScaleMode(e.target.value);
    log('UI', `Scale mode changed to: ${e.target.value}`);
  });

  // ── Google AI: Run button ──
  document.getElementById('runBtn').addEventListener('click', runGeneration);

  // ── KD: Base images ──
  document.getElementById('kdAddBaseImages').addEventListener('click', async () => {
    log('KD', 'Opening image picker for KD base images');
    const paths = await window.electronAPI.selectImages();
    if (!paths.length) { log('KD', 'Image picker cancelled'); return; }

    const existing = new Set(kdState.baseImagePairs.map(p => p.base));
    let dupes = 0;
    paths.forEach(p => {
      if (existing.has(p)) { dupes++; return; }
      kdState.baseImagePairs.push({ base: p, mask: null, curtainWidthMm: '' });
    });
    const added = paths.length - dupes;

    log('KD', `Base images: +${added} added${dupes ? `, ${dupes} duplicate(s) skipped` : ''} → total ${kdState.baseImagePairs.length}`);
    renderKdPairList();
    updateKdSummary();
    updateKdRunButton();
    saveKdBasePairs();
  });

  // ── KD: Pattern images ──
  document.getElementById('kdAddPatternImages').addEventListener('click', async () => {
    const paths = await window.electronAPI.selectImages();
    if (!paths.length) return;

    const defaultWidth = document.getElementById('kdPatternTileWidthMm').value || '210';
    const existing = new Set(kdState.patternImages.map(p => p.path));
    let dupes = 0;
    paths.forEach(p => {
      if (existing.has(p)) { dupes++; return; }
      const item = { path: p, tileWidthMm: defaultWidth, resolution: null };
      kdState.patternImages.push(item);
      const img = new Image();
      img.onload = () => { item.resolution = { w: img.naturalWidth, h: img.naturalHeight }; renderKdPatternGrid(); };
      img.src = encodeURI('file://' + p);
    });
    const added = paths.length - dupes;
    log('KD', `Patterns: +${added} added${dupes ? `, ${dupes} duplicate(s) skipped` : ''} → total ${kdState.patternImages.length}`);
    renderKdPatternGrid();
    updateCount('kdPatternCount', kdState.patternImages.length);
    updateKdSummary();
    updateKdRunButton();
  });

  // ── KD: Destination ──
  document.getElementById('kdSelectDestination').addEventListener('click', async () => {
    log('KD', 'Opening folder picker');
    const dir = await window.electronAPI.selectDestination();
    if (!dir) { log('KD', 'Folder picker cancelled'); return; }
    kdState.destination = dir;
    document.getElementById('kdDestinationPath').value = dir;
    logSuccess('KD', `Destination set: ${dir}`);
    updateKdRunButton();
  });

  // ── KD: Catalogue name ──
  document.getElementById('kdCatalogueName').addEventListener('input', () => updateKdRunButton());

  // ── KD: Config autosave ──
  ['kdScaleMode', 'kdPatternRotation'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveKdConfig);
  });
  document.getElementById('kdPatternTileWidthMm').addEventListener('input', saveKdConfig);

  // ── KD: Run button ──
  document.getElementById('kdRunBtn').addEventListener('click', runKdGeneration);

  // ── Seamless Patterns: source images ──
  document.getElementById('spAddSourceImages').addEventListener('click', async () => {
    log('SP', 'Opening image picker for source images');
    const paths = await window.electronAPI.selectImages();
    if (!paths.length) { log('SP', 'Image picker cancelled'); return; }

    const existing = new Set(spState.sourceImages.map(s => s.path));
    let dupes = 0;
    paths.forEach(p => {
      if (existing.has(p)) { dupes++; return; }
      spState.sourceImages.push({ path: p, patternType: '', status: 'idle', error: null });
    });
    const added = paths.length - dupes;

    log('SP', `Source images: +${added} added${dupes ? `, ${dupes} duplicate(s) skipped` : ''} → total ${spState.sourceImages.length}`);
    renderSpSourceList();
    updateCount('spSourceCount', spState.sourceImages.length);
    updateSpSummary();
    updateSpRunButtons();
  });

  // ── Seamless Patterns: destination ──
  document.getElementById('spSelectDestination').addEventListener('click', async () => {
    log('SP', 'Opening folder picker');
    const dir = await window.electronAPI.selectDestination();
    if (!dir) { log('SP', 'Folder picker cancelled'); return; }
    spState.destination = dir;
    document.getElementById('spDestinationPath').value = dir;
    logSuccess('SP', `Destination set: ${dir}`);
    updateSpRunButtons();
  });

  // ── Seamless Patterns: run buttons ──
  document.getElementById('spCatalogueName').addEventListener('input', () => updateSpRunButtons());
  document.getElementById('spRunPendingBtn').addEventListener('click', runSpPending);
  document.getElementById('spRunAllBtn').addEventListener('click', runSpAll);
  document.getElementById('spStopBtn').addEventListener('click', stopSpBatch);

  // ── Console: clear ──
  document.getElementById('consoleClear').addEventListener('click', () => {
    clearConsole();
    log('UI', 'Console cleared');
  });

  // ── Console: collapse / expand ──
  document.getElementById('consoleToggle').addEventListener('click', () => {
    consoleCollapsed = !consoleCollapsed;
    document.getElementById('consolePanel').classList.toggle('is-collapsed', consoleCollapsed);
    const chevron = document.getElementById('consoleChevron');
    chevron.style.transform = consoleCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  });
}

// ─── KD: Save Config / Base Pairs ────────────────────────────────────────────

async function saveKdConfig() {
  await window.electronAPI.saveKdConfig({
    scaleMode:          document.getElementById('kdScaleMode').value,
    patternRotation:    document.getElementById('kdPatternRotation').value,
    patternTileWidthMm: document.getElementById('kdPatternTileWidthMm').value
  });
}

async function saveKdBasePairs() {
  await window.electronAPI.saveKdBasePairs(kdState.baseImagePairs);
}

// ─── Grid Rendering ──────────────────────────────────────────────────────────

function renderGrid(containerId, images, type, onRemove) {
  const grid = document.getElementById(containerId);

  if (images.length === 0) {
    const [label, hint] =
      type === 'base'
        ? ['No base images selected',   'Curtain photos, renders or flats']
        : type === 'sp-source'
        ? ['No source images selected', 'Raw fabric scans to synthesise into seamless tiles']
        : ['No patterns selected',      'Fabric prints, textures or designs'];
    const icon = type === 'base' || type === 'sp-source'
      ? `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="17" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 27l8-8 6 6 4-4 10 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="22" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="22" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>`;
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><p class="empty-label">${label}</p><p class="empty-hint">${hint}</p></div>`;
    return;
  }

  grid.innerHTML = images.map((imgPath, i) => {
    const fileName = imgPath.split('/').pop();
    const fileUrl  = encodeURI('file://' + imgPath);
    return `<div class="thumb-card" title="${escapeHtml(fileName)}">
      <img src="${fileUrl}" alt="${escapeHtml(fileName)}" class="thumb-img" draggable="false">
      <button class="thumb-remove" data-index="${i}" title="Remove">×</button>
      <div class="thumb-name">${escapeHtml(fileName)}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.thumb-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);

      if (onRemove) {
        onRemove(idx);
        return;
      }

      if (type === 'base') {
        const removed = state.baseImages.splice(idx, 1)[0];
        log('UI', `Removed base image: ${removed.split('/').pop()} → total ${state.baseImages.length}`);
        renderGrid('baseImageGrid', state.baseImages, 'base');
        updateCount('baseCount', state.baseImages.length);
      } else {
        const removed = state.patternImages.splice(idx, 1)[0];
        log('UI', `Removed pattern: ${removed.split('/').pop()} → total ${state.patternImages.length}`);
        renderGrid('patternImageGrid', state.patternImages, 'pattern');
        updateCount('patternCount', state.patternImages.length);
      }
      updateSummary();
      updateRunButton();
    });
  });
}

// ─── KD: Pattern List ────────────────────────────────────────────────────────

function renderKdPatternGrid() {
  const container = document.getElementById('kdPatternList');
  updateCount('kdPatternCount', kdState.patternImages.length);

  if (kdState.patternImages.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="22" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="22" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/></svg></div>
      <p class="empty-label">No patterns selected</p>
      <p class="empty-hint">Fabric prints, textures or designs</p>
    </div>`;
    return;
  }

  const dis = kdState.isRunning ? 'disabled' : '';
  container.innerHTML = kdState.patternImages.map((item, i) => {
    const name    = item.path.split('/').pop();
    const fileUrl = encodeURI('file://' + item.path);
    const resText = item.resolution ? `${item.resolution.w} × ${item.resolution.h} px` : '—';
    return `<div class="pair-item" data-index="${i}">
      <div class="pair-base-section">
        <img src="${fileUrl}" alt="${escapeHtml(name)}" class="pair-thumb" draggable="false">
        <button class="kd-pattern-remove pair-base-remove" data-index="${i}" title="Remove" ${dis}>×</button>
      </div>
      <div class="pair-footer">
        <div class="pair-filename" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="kd-pattern-res">${resText}</div>
        <div class="pair-width">
          <span class="pair-width-label">Tile:</span>
          <input type="number" class="pair-width-input kd-pattern-tile-input" data-index="${i}"
            placeholder="210" min="1" step="0.1"
            value="${escapeHtml(item.tileWidthMm || '')}" ${dis}>
          <span class="pair-width-unit">mm</span>
        </div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.kd-pattern-tile-input').forEach(input => {
    input.addEventListener('input', (e) => {
      kdState.patternImages[parseInt(e.currentTarget.dataset.index)].tileWidthMm = e.currentTarget.value;
    });
  });

  container.querySelectorAll('.kd-pattern-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      const removed = kdState.patternImages.splice(idx, 1)[0];
      log('KD', `Removed pattern: ${removed.path.split('/').pop()} → total ${kdState.patternImages.length}`);
      renderKdPatternGrid();
      updateKdSummary();
      updateKdRunButton();
    });
  });
}

// ─── KD: Pair List Rendering ─────────────────────────────────────────────────

function renderKdPairList() {
  const container = document.getElementById('kdBasePairList');

  if (kdState.baseImagePairs.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="17" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 27l8-8 6 6 4-4 10 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <p class="empty-label">No base images added</p>
      <p class="empty-hint">Add curtain images, then optionally pair each with a mask</p>
    </div>`;
    return;
  }

  container.innerHTML = kdState.baseImagePairs.map((pair, i) => {
    const baseName = pair.base.split('/').pop();
    const baseUrl  = encodeURI('file://' + pair.base);
    const maskName = pair.mask ? pair.mask.split('/').pop() : null;
    const maskUrl  = pair.mask ? encodeURI('file://' + pair.mask) : null;

    const maskSlot = maskUrl
      ? `<img src="${maskUrl}" alt="${escapeHtml(maskName)}" class="pair-thumb-mask" draggable="false">
         <button class="pair-mask-remove" data-index="${i}" title="Remove mask">×</button>`
      : `<button class="pair-add-mask btn btn-sm" data-index="${i}">+ Mask</button>`;

    return `<div class="pair-item" data-index="${i}">
      <div class="pair-base-section">
        <img src="${baseUrl}" alt="${escapeHtml(baseName)}" class="pair-thumb" draggable="false">
        <button class="pair-base-remove" data-index="${i}" title="Remove">×</button>
      </div>
      <div class="pair-mask-section">${maskSlot}</div>
      <div class="pair-footer">
        <div class="pair-filename" title="${escapeHtml(baseName)}">${escapeHtml(baseName)}</div>
        <div class="pair-width">
          <span class="pair-width-label">Width:</span>
          <input type="number" class="pair-width-input" data-index="${i}"
            placeholder="—" min="1" step="1"
            value="${escapeHtml(pair.curtainWidthMm || '')}"
            title="Curtain width in mm (optional)">
          <span class="pair-width-unit">mm</span>
        </div>
      </div>
    </div>`;
  }).join('');

  updateCount('kdBaseCount', kdState.baseImagePairs.length);

  // Curtain width per pair
  container.querySelectorAll('.pair-width-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      kdState.baseImagePairs[idx].curtainWidthMm = e.currentTarget.value;
      saveKdBasePairs();
    });
  });

  // Add mask
  container.querySelectorAll('.pair-add-mask').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      log('KD', `Opening mask picker for: ${kdState.baseImagePairs[idx].base.split('/').pop()}`);
      const maskPath = await window.electronAPI.selectSingleImage();
      if (!maskPath) { log('KD', 'Mask picker cancelled'); return; }
      kdState.baseImagePairs[idx].mask = maskPath;
      log('KD', `Mask paired: ${maskPath.split('/').pop()} → ${kdState.baseImagePairs[idx].base.split('/').pop()}`);
      renderKdPairList();
      updateKdSummary();
      saveKdBasePairs();
    });
  });

  // Remove mask
  container.querySelectorAll('.pair-mask-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      log('KD', `Mask removed from: ${kdState.baseImagePairs[idx].base.split('/').pop()}`);
      kdState.baseImagePairs[idx].mask = null;
      renderKdPairList();
      updateKdSummary();
      saveKdBasePairs();
    });
  });

  // Remove base image (and its pair)
  container.querySelectorAll('.pair-base-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      const removed = kdState.baseImagePairs.splice(idx, 1)[0];
      log('KD', `Removed base: ${removed.base.split('/').pop()} → total ${kdState.baseImagePairs.length}`);
      renderKdPairList();
      updateKdSummary();
      updateKdRunButton();
      saveKdBasePairs();
    });
  });
}

// ─── UI State: Google AI ─────────────────────────────────────────────────────

function updateCount(id, count) {
  document.getElementById(id).textContent = count;
}

function updateSummary() {
  const b = state.baseImages.length;
  const p = state.patternImages.length;
  document.getElementById('summaryBase').textContent    = b;
  document.getElementById('summaryPattern').textContent = p;
  document.getElementById('summaryTotal').textContent   = b * p;
}

function updateRunButton() {
  const catalogueName = document.getElementById('catalogueName').value.trim();
  const ready = (
    !state.isRunning &&
    catalogueName.length > 0 &&
    state.baseImages.length > 0 &&
    state.patternImages.length > 0 &&
    state.destination !== null
  );
  const btn  = document.getElementById('runBtn');
  const prev = btn.disabled;
  btn.disabled = !ready;
  if (prev !== btn.disabled) {
    log('UI', ready
      ? `Run button enabled — ${state.baseImages.length}×${state.patternImages.length} = ${state.baseImages.length * state.patternImages.length} calls`
      : 'Run button disabled'
    );
  }
}

function setRunning(running) {
  state.isRunning = running;
  document.getElementById('runBtn').disabled = running;
  document.getElementById('runBtnText').textContent = running ? 'Generating…' : 'Generate Mockups';
  ['addBaseImages', 'addPatternImages', 'selectDestination'].forEach(id => {
    document.getElementById(id).disabled = running;
  });
  document.getElementById('catalogueName').disabled = running;
  document.getElementById('scaleMode').disabled = running;
}

// ─── UI State: KD ────────────────────────────────────────────────────────────

function updateKdSummary() {
  const b = kdState.baseImagePairs.length;
  const m = kdState.baseImagePairs.filter(p => p.mask).length;
  const p = kdState.patternImages.length;
  document.getElementById('kdSummaryBase').textContent    = b;
  document.getElementById('kdSummaryMasks').textContent   = m;
  document.getElementById('kdSummaryPattern').textContent = p;
  document.getElementById('kdSummaryTotal').textContent   = b * p;
}

function updateKdRunButton() {
  const catalogueName = document.getElementById('kdCatalogueName').value.trim();
  const ready = (
    !kdState.isRunning &&
    catalogueName.length > 0 &&
    kdState.baseImagePairs.length > 0 &&
    kdState.patternImages.length > 0 &&
    kdState.destination !== null
  );
  const btn  = document.getElementById('kdRunBtn');
  const prev = btn.disabled;
  btn.disabled = !ready;
  if (prev !== btn.disabled) {
    log('KD', ready
      ? `Run button enabled — ${kdState.baseImagePairs.length} base × ${kdState.patternImages.length} patterns = ${kdState.baseImagePairs.length * kdState.patternImages.length} renders`
      : 'Run button disabled'
    );
  }
}

function setKdRunning(running) {
  kdState.isRunning = running;
  document.getElementById('kdRunBtn').disabled = running;
  document.getElementById('kdRunBtnText').textContent = running ? 'Generating…' : 'Generate Mockups';
  ['kdAddBaseImages', 'kdAddPatternImages', 'kdSelectDestination'].forEach(id => {
    document.getElementById(id).disabled = running;
  });
  document.getElementById('kdCatalogueName').disabled   = running;
  document.getElementById('kdScaleMode').disabled       = running;
  document.getElementById('kdPatternRotation').disabled = running;
  // Disable per-pattern card controls during generation
  document.querySelectorAll('.kd-pattern-tile-input, .kd-pattern-remove').forEach(el => {
    el.disabled = running;
  });
  // Re-render to apply disabled state to newly rendered cards
  renderKdPairList();
  renderKdPatternGrid();
}

// ─── Shared UI Helpers ───────────────────────────────────────────────────────

function showToast(message, duration = 4000) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, duration);
}

function setProgress(pct, message, status, counter) {
  document.getElementById('progressBarFill').style.width = `${pct}%`;
  const msgEl = document.getElementById('progressMessage');
  msgEl.textContent = message;
  msgEl.className   = `progress-message${status ? ' status-' + status : ''}`;
  document.getElementById('progressCounter').textContent = counter || '';
}

// ─── Generation: Google AI ───────────────────────────────────────────────────

async function runGeneration() {
  const apiKey        = document.getElementById('apiKey').value.trim();
  const catalogueName = document.getElementById('catalogueName').value.trim();
  const scaleMode     = document.getElementById('scaleMode').value;

  if (!catalogueName) { logWarn('UI', 'Blocked — no catalogue name'); showToast('Please enter a catalogue name'); return; }
  if (!state.destination) { logWarn('UI', 'Blocked — no destination'); showToast('Please select a destination folder'); return; }

  const total = state.baseImages.length * state.patternImages.length;

  log('UI', '─'.repeat(48));
  log('UI', `Starting: ${state.baseImages.length} base × ${state.patternImages.length} patterns = ${total} calls`);
  log('UI', `Catalogue: "${catalogueName}" | Scale: ${scaleMode} | Dest: ${state.destination}`);
  log('UI', '─'.repeat(48));

  setRunning(true);
  window.electronAPI.removeProgressListeners();
  setProgress(0, `Starting ${total} generation${total !== 1 ? 's' : ''}…`, 'running', `0 / ${total}`);

  if (consoleCollapsed) {
    consoleCollapsed = false;
    document.getElementById('consolePanel').classList.remove('is-collapsed');
    document.getElementById('consoleChevron').style.transform = 'rotate(0deg)';
  }

  window.electronAPI.onProgressUpdate(({ completed, total: t, status, message }) => {
    const pct = Math.round((completed / t) * 100);
    setProgress(pct, message, status, `${completed} / ${t}`);
  });

  const startTime = Date.now();

  try {
    const result = await window.electronAPI.generateMockups({
      apiKey,
      baseImages:    state.baseImages,
      patternImages: state.patternImages,
      destination:   state.destination,
      catalogueName,
      scaleMode
    });

    const elapsed      = ((Date.now() - startTime) / 1000).toFixed(1);
    const { completed, total: t, errors } = result;
    const successCount = completed - errors.length;

    if (errors.length === 0) {
      logSuccess('UI', `Done in ${elapsed}s — ${successCount}/${t} mockups generated`);
      setProgress(100, `All ${t} mockups generated successfully`, 'success', `${t} / ${t}`);
      showToast(`Done! ${successCount} mockup${successCount !== 1 ? 's' : ''} saved`);
    } else {
      logWarn('UI', `Done in ${elapsed}s — ${successCount}/${t} ok, ${errors.length} failed`);
      errors.forEach(e => logError('UI', `  ✗ ${e.base} + ${e.pattern}: ${e.error}`));
      setProgress(100, `Completed with ${errors.length} error${errors.length !== 1 ? 's' : ''}`, 'error', `${t} / ${t}`);
      showToast(`Done: ${successCount} generated, ${errors.length} failed`, 6000);
    }

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logError('UI', `IPC failure after ${elapsed}s: ${err.message}`);
    setProgress(0, `Failed: ${err.message}`, 'error', '');
    showToast(`Error: ${err.message}`, 7000);
    console.error(err);
  }

  setRunning(false);
  updateRunButton();
}

// ─── Generation: KD Mockup Generator ────────────────────────────────────────

async function runKdGeneration() {
  const catalogueName      = document.getElementById('kdCatalogueName').value.trim();
  const scaleMode          = document.getElementById('kdScaleMode').value;
  const patternRotation    = document.getElementById('kdPatternRotation').value;
  const patternTileWidthMm = document.getElementById('kdPatternTileWidthMm').value || '210';

  if (!catalogueName) { logWarn('KD', 'Blocked — no catalogue name'); showToast('Please enter a catalogue name'); return; }
  if (!kdState.destination) { logWarn('KD', 'Blocked — no destination'); showToast('Please select a destination folder'); return; }

  const total = kdState.baseImagePairs.length * kdState.patternImages.length;

  log('KD', '─'.repeat(44));
  log('KD', `Starting: ${kdState.baseImagePairs.length} base × ${kdState.patternImages.length} patterns = ${total} renders`);
  log('KD', `Catalogue: "${catalogueName}" | Scale: ${scaleMode} | Rotation: ${patternRotation}°`);
  log('KD', `Tile: ${patternTileWidthMm} mm`);
  log('KD', '─'.repeat(44));

  setKdRunning(true);
  window.electronAPI.removeProgressListeners();
  setProgress(0, `Starting ${total} render${total !== 1 ? 's' : ''}…`, 'running', `0 / ${total}`);

  window.electronAPI.onProgressUpdate(({ completed, total: t, status, message }) => {
    const pct = Math.round((completed / t) * 100);
    setProgress(pct, message, status, `${completed} / ${t}`);
  });

  const startTime = Date.now();

  try {
    const result = await window.electronAPI.generateMockupsKd({
      baseImagePairs:    kdState.baseImagePairs,
      patternImages:     kdState.patternImages.map(p => ({ path: p.path, tileWidthMm: p.tileWidthMm })),
      destination:       kdState.destination,
      catalogueName,
      scaleMode,
      patternRotation,
      patternTileWidthMm // global fallback if per-pattern is blank
    });

    const elapsed      = ((Date.now() - startTime) / 1000).toFixed(1);
    const { completed, total: t, errors } = result;
    const successCount = completed - errors.length;

    if (errors.length === 0) {
      logSuccess('KD', `Done in ${elapsed}s — ${successCount}/${t} mockups generated`);
      setProgress(100, `All ${t} mockups generated successfully`, 'success', `${t} / ${t}`);
      showToast(`Done! ${successCount} mockup${successCount !== 1 ? 's' : ''} saved`);
    } else {
      logWarn('KD', `Done in ${elapsed}s — ${successCount}/${t} ok, ${errors.length} failed`);
      errors.forEach(e => logError('KD', `  ✗ ${e.base} + ${e.pattern}: ${e.error}`));
      setProgress(100, `Completed with ${errors.length} error${errors.length !== 1 ? 's' : ''}`, 'error', `${t} / ${t}`);
      showToast(`Done: ${successCount} generated, ${errors.length} failed`, 6000);
    }

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logError('KD', `IPC failure after ${elapsed}s: ${err.message}`);
    setProgress(0, `Failed: ${err.message}`, 'error', '');
    showToast(`Error: ${err.message}`, 7000);
    console.error(err);
  }

  setKdRunning(false);
  updateKdRunButton();
}

// ─── Seamless Pattern: Source List ───────────────────────────────────────────

const SP_OPTIONS_HTML = SP_PATTERN_OPTIONS
  .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
  .join('');

function renderSpSourceList() {
  const container = document.getElementById('spSourceList');

  if (spState.sourceImages.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="17" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 27l8-8 6 6 4-4 10 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <p class="empty-label">No source images selected</p>
      <p class="empty-hint">Add fabric scans, then choose a pattern type for each</p>
    </div>`;
    return;
  }

  const running = spState.isRunning;

  container.innerHTML = spState.sourceImages.map((item, i) => {
    const name    = item.path.split('/').pop();
    const fileUrl = encodeURI('file://' + item.path);
    const optionsHtml = SP_PATTERN_OPTIONS
      .map(o => `<option value="${escapeHtml(o.value)}"${o.value === item.patternType ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
      .join('');

    const statusLabel = { idle: '○ Pending', running: '⟳ Processing…', done: '✓ Generated', error: `✗ ${escapeHtml(item.error || 'Failed')}` }[item.status] || '○ Pending';
    const dis = running ? ' disabled' : '';
    const actionBtn = item.status === 'running'
      ? `<button class="sp-card-action sp-card-stop btn btn-sm" data-index="${i}" data-action="stop">■ Stop</button>`
      : item.status === 'done'
        ? `<button class="sp-card-action btn btn-sm" data-index="${i}" data-action="generate"${dis}>↺ Regenerate</button>`
        : item.status === 'error'
          ? `<button class="sp-card-action btn btn-sm" data-index="${i}" data-action="generate"${dis}>↺ Retry</button>`
          : `<button class="sp-card-action btn btn-sm" data-index="${i}" data-action="generate"${dis}>▶ Generate</button>`;

    return `<div class="sp-pattern-card" data-index="${i}">
      <img src="${fileUrl}" alt="${escapeHtml(name)}" class="sp-pattern-card-img" draggable="false">
      <button class="sp-pattern-card-remove" data-index="${i}" title="Remove"${running ? ' disabled' : ''}>×</button>
      <div class="sp-pattern-card-footer">
        <div class="sp-pattern-card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <select class="sp-pattern-select" data-index="${i}"${running ? ' disabled' : ''}>${optionsHtml}</select>
        <div class="sp-card-status sp-card-status--${item.status}">${statusLabel}</div>
        ${actionBtn}
      </div>
    </div>`;
  }).join('');

  // Pattern type change
  container.querySelectorAll('.sp-pattern-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      spState.sourceImages[idx].patternType = e.currentTarget.value;
      const label = SP_PATTERN_OPTIONS.find(o => o.value === e.currentTarget.value)?.label || 'Auto';
      log('SP', `Pattern type for ${spState.sourceImages[idx].path.split('/').pop()}: ${label}`);
    });
  });

  // Remove
  container.querySelectorAll('.sp-pattern-card-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx     = parseInt(e.currentTarget.dataset.index);
      const removed = spState.sourceImages.splice(idx, 1)[0];
      log('SP', `Removed source: ${removed.path.split('/').pop()} → total ${spState.sourceImages.length}`);
      renderSpSourceList();
      updateCount('spSourceCount', spState.sourceImages.length);
      updateSpSummary();
      updateSpRunButtons();
    });
  });

  // Per-image generate / stop
  container.querySelectorAll('.sp-card-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      if (e.currentTarget.dataset.action === 'stop') {
        stopSpImage(idx);
      } else if (!spState.isRunning) {
        generateSpImage(idx);
      }
    });
  });
}

// ─── Seamless Pattern: UI State ───────────────────────────────────────────────

function updateSpSummary() {
  const n = spState.sourceImages.length;
  document.getElementById('spSummarySource').textContent = n;
  document.getElementById('spSummaryTotal').textContent  = n;
}

function updateSpRunButtons() {
  if (spState.isRunning) return;
  const catalogueName = document.getElementById('spCatalogueName').value.trim();
  const baseReady = catalogueName.length > 0 && spState.destination !== null && spState.sourceImages.length > 0;
  const hasPending = spState.sourceImages.some(img => img.status === 'idle');
  document.getElementById('spRunPendingBtn').disabled = !baseReady || !hasPending;
  document.getElementById('spRunAllBtn').disabled     = !baseReady;
}

function setSpRunning(running) {
  spState.isRunning = running;
  document.getElementById('spRunButtons').style.display = running ? 'none' : '';
  document.getElementById('spStopBtn').style.display    = running ? ''     : 'none';
  ['spAddSourceImages', 'spSelectDestination'].forEach(id => {
    document.getElementById(id).disabled = running;
  });
  document.getElementById('spCatalogueName').disabled = running;
  renderSpSourceList();
}

// ─── Seamless Patterns: Per-image Generation ─────────────────────────────────

let spBatchAborted = false;

async function generateSpImage(idx) {
  const item = spState.sourceImages[idx];
  if (!item || item.status === 'running') return;

  const apiKey        = document.getElementById('apiKey').value.trim();
  const catalogueName = document.getElementById('spCatalogueName').value.trim();

  if (!catalogueName) { showToast('Please enter a catalogue name'); return; }
  if (!spState.destination) { showToast('Please select a destination folder'); return; }
  if (!apiKey) { showToast('Please enter your Gemini API key in the header'); return; }

  const name = item.path.split('/').pop();
  item.status = 'running';
  item.error  = null;
  renderSpSourceList();

  const result = await window.electronAPI.generateSeamlessPatternSingle({
    sourcePath: item.path, patternType: item.patternType,
    destination: spState.destination, catalogueName, apiKey
  });

  // Discard if user stopped this card while it was in-flight
  if (spState.sourceImages[idx]?.status !== 'running') return;

  item.status = result.success ? 'done' : 'error';
  item.error  = result.success ? null : (result.error || 'Unknown error');

  if (result.success) { logSuccess('SP', `✓ ${name}`); }
  else                { logError('SP', `✗ ${name}: ${item.error}`); }

  renderSpSourceList();
}

function stopSpImage(idx) {
  const item = spState.sourceImages[idx];
  if (item?.status === 'running') {
    log('SP', `Stopped: ${item.path.split('/').pop()}`);
    item.status = 'idle';
    renderSpSourceList();
  }
}

function stopSpBatch() {
  spBatchAborted = true;
  spState.sourceImages.forEach((_, i) => stopSpImage(i));
  setSpRunning(false);
  updateSpRunButtons();
  log('SP', 'Batch stopped by user');
  setProgress(0, 'Stopped', 'error', '');
}

async function runSpBatch(indices) {
  const apiKey        = document.getElementById('apiKey').value.trim();
  const catalogueName = document.getElementById('spCatalogueName').value.trim();

  if (!catalogueName) { showToast('Please enter a catalogue name'); return; }
  if (!spState.destination) { showToast('Please select a destination folder'); return; }
  if (!apiKey) { showToast('Please enter your Gemini API key in the header'); return; }
  if (!indices.length) { showToast('No images to process'); return; }

  spBatchAborted = false;
  setSpRunning(true);

  const total = indices.length;
  log('SP', '─'.repeat(48));
  log('SP', `Batch: ${total} image${total !== 1 ? 's' : ''} — "${catalogueName}"`);
  log('SP', '─'.repeat(48));

  if (consoleCollapsed) {
    consoleCollapsed = false;
    document.getElementById('consolePanel').classList.remove('is-collapsed');
    document.getElementById('consoleChevron').style.transform = 'rotate(0deg)';
  }

  setProgress(0, `Starting ${total} call${total !== 1 ? 's' : ''}…`, 'running', `0 / ${total}`);
  const startTime = Date.now();
  let doneCount = 0, errCount = 0;

  for (let i = 0; i < indices.length; i++) {
    if (spBatchAborted) break;
    const idx  = indices[i];
    const name = spState.sourceImages[idx]?.path.split('/').pop() || '';
    setProgress(Math.round(i / total * 100), `Processing ${i + 1}/${total}: ${name}`, 'running', `${i} / ${total}`);
    await generateSpImage(idx);
    const st = spState.sourceImages[idx]?.status;
    if (st === 'done')  doneCount++;
    else if (st === 'error') errCount++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!spBatchAborted) {
    if (errCount === 0) {
      logSuccess('SP', `Done in ${elapsed}s — ${doneCount}/${total} generated`);
      setProgress(100, `All ${doneCount} seamless tiles generated`, 'success', `${doneCount} / ${total}`);
      showToast(`Done! ${doneCount} seamless tile${doneCount !== 1 ? 's' : ''} saved`);
    } else {
      logWarn('SP', `Done in ${elapsed}s — ${doneCount} ok, ${errCount} failed`);
      setProgress(100, `Completed with ${errCount} error${errCount !== 1 ? 's' : ''}`, 'error', `${doneCount + errCount} / ${total}`);
      showToast(`Done: ${doneCount} generated, ${errCount} failed`, 6000);
    }
  }

  setSpRunning(false);
  updateSpRunButtons();
}

async function runSpPending() {
  const pendingIndices = spState.sourceImages
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => img.status === 'idle')
    .map(({ i }) => i);
  if (!pendingIndices.length) { showToast('No pending images'); return; }
  await runSpBatch(pendingIndices);
}

async function runSpAll() {
  spState.sourceImages.forEach(img => { img.status = 'idle'; img.error = null; });
  renderSpSourceList();
  await runSpBatch(spState.sourceImages.map((_, i) => i));
}

// ─── Crop Pattern ─────────────────────────────────────────────────────────────

function initCropPage() {
  document.getElementById('cropAddImagesBtn').addEventListener('click', async () => {
    const paths = await window.electronAPI.selectImages();
    if (paths.length) addCropImages(paths);
  });

  const workArea = document.getElementById('cropWorkArea');
  workArea.addEventListener('dragover',  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; workArea.classList.add('drag-over'); });
  workArea.addEventListener('dragleave', ()  => workArea.classList.remove('drag-over'));
  workArea.addEventListener('drop', (e) => {
    e.preventDefault();
    workArea.classList.remove('drag-over');
    const paths = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).map(f => f.path);
    if (paths.length) addCropImages(paths);
  });

  const canvas = document.getElementById('cropCanvas');
  canvas.addEventListener('mousedown',  onCropMouseDown);
  canvas.addEventListener('mousemove',  onCropMouseMove);
  canvas.addEventListener('mouseup',    onCropMouseUp);
  canvas.addEventListener('mouseleave', onCropMouseUp);

  document.getElementById('cropSaveBtn').addEventListener('click', performCrop);
  document.getElementById('cropSaveAsIsBtn').addEventListener('click', saveAsIs);

  document.getElementById('cropSelectDestination').addEventListener('click', async () => {
    const folder = await window.electronAPI.selectDestination();
    if (!folder) return;
    cropState.destination = folder;
    document.getElementById('cropDestinationPath').value = folder;
    log('Crop', `Destination: ${folder}`);
  });

  document.getElementById('cropRemoveAllBtn').addEventListener('click', () => {
    if (!cropState.images.length) return;
    cropState.images      = [];
    cropState.activeIndex = null;
    cropState.image       = null;
    document.getElementById('cropCanvas').style.display    = 'none';
    document.getElementById('cropEmptyState').style.display = '';
    ['cropFileInfoGroup','cropPositionGroup','cropRotationGroup','cropSummaryBox'].forEach(id => {
      document.getElementById(id).style.display = 'none';
    });
    document.getElementById('cropSaveBtn').disabled = true;
    document.getElementById('cropSaveAsIsBtn').disabled = true;
    renderCropImageList();
    log('Crop', 'All images removed');
  });

  document.getElementById('cropFrameSize').addEventListener('change', (e) => {
    cropFramePx = parseInt(e.target.value);
    const label = `${cropFramePx} × ${cropFramePx} px`;
    document.getElementById('cropFrameBadge').textContent = label;
    document.getElementById('cropOutputSize').textContent = label;
    log('Crop', `Frame size: ${cropFramePx}px`);

    // Re-centre frame on active image with new size and redraw
    if (cropState.image) {
      const canvas = document.getElementById('cropCanvas');
      const dispW  = canvas.width, dispH = canvas.height;
      const fDisp  = Math.round(cropFramePx * cropState.scale);
      cropState.frameX = Math.max(0, Math.min(cropState.frameX, dispW - fDisp));
      cropState.frameY = Math.max(0, Math.min(cropState.frameY, dispH - fDisp));
      drawCropCanvas();
    }
  });

  document.getElementById('cropRotationSlider').addEventListener('input', (e) => {
    syncRotation(parseFloat(e.target.value));
  });
  document.getElementById('cropRotationInput').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= -180 && v <= 180) syncRotation(v);
  });
  document.getElementById('cropRotationReset').addEventListener('click', () => {
    syncRotation(0);
  });
}

function syncRotation(deg) {
  cropState.rotation = deg;
  document.getElementById('cropRotationSlider').value = deg;
  document.getElementById('cropRotationInput').value  = parseFloat(deg.toFixed(1));
  if (cropState.activeIndex !== null) {
    cropState.images[cropState.activeIndex].rotation = deg;
  }
  drawCropCanvas();
}

function renderCropImageList() {
  const container = document.getElementById('cropImageList');
  updateCount('cropImageCount', cropState.images.length);
  document.getElementById('cropRemoveAllBtn').disabled = cropState.images.length === 0;

  if (cropState.images.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <p class="empty-label">No images</p>
      <p class="empty-hint">Add images to begin cropping</p>
    </div>`;
    return;
  }

  container.innerHTML = cropState.images.map((item, i) => {
    const name       = item.path.split('/').pop();
    const isActive   = i === cropState.activeIndex;
    const statusCls  = item.saved ? 'crop-list-status--done' : isActive ? 'crop-list-status--editing' : '';
    const statusTxt  = item.saved ? '✓ Saved' : isActive ? 'Editing…' : '○ Pending';
    const thumbHtml  = item.dataUrl
      ? `<img class="crop-list-thumb" src="${item.dataUrl}" draggable="false">`
      : `<div class="crop-list-thumb" style="background:var(--surface);border:1px solid var(--border)"></div>`;
    return `<div class="crop-list-item${isActive ? ' active' : ''}" data-index="${i}">
      ${thumbHtml}
      <div class="crop-list-info">
        <div class="crop-list-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="crop-list-status ${statusCls}">${statusTxt}</div>
      </div>
      <button class="crop-list-remove" data-index="${i}" title="Remove">×</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.crop-list-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('crop-list-remove')) {
        activateCropImage(parseInt(el.dataset.index));
      }
    });
  });

  container.querySelectorAll('.crop-list-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      cropState.images.splice(idx, 1);
      if (cropState.activeIndex === idx) {
        cropState.activeIndex = null;
        cropState.image       = null;
        document.getElementById('cropCanvas').style.display = 'none';
        document.getElementById('cropEmptyState').style.display = '';
        ['cropFileInfoGroup','cropPositionGroup','cropRotationGroup','cropSummaryBox'].forEach(id => {
          document.getElementById(id).style.display = 'none';
        });
        document.getElementById('cropSaveBtn').disabled = true;
    document.getElementById('cropSaveAsIsBtn').disabled = true;
      } else if (cropState.activeIndex > idx) {
        cropState.activeIndex--;
      }
      renderCropImageList();
    });
  });
}

async function addCropImages(paths) {
  const existing = new Set(cropState.images.map(img => img.path));
  let added = 0;
  paths.forEach(p => {
    if (existing.has(p)) return;
    cropState.images.push({ path: p, dataUrl: null, frameX: null, frameY: null, rotation: 0, saved: false });
    added++;
  });
  log('Crop', `+${added} image(s) added${paths.length - added ? `, ${paths.length - added} duplicate(s) skipped` : ''}`);
  renderCropImageList();
  if (cropState.activeIndex === null && cropState.images.length > 0) activateCropImage(0);
}

async function activateCropImage(idx) {
  // Persist current frame and rotation before switching
  if (cropState.activeIndex !== null && cropState.image) {
    cropState.images[cropState.activeIndex].frameX   = cropState.frameX;
    cropState.images[cropState.activeIndex].frameY   = cropState.frameY;
    cropState.images[cropState.activeIndex].rotation = cropState.rotation;
  }

  cropState.activeIndex = idx;
  const item = cropState.images[idx];

  if (!item.dataUrl) {
    const res = await window.electronAPI.readFileAsDataUrl(item.path);
    if (!res.success) { showToast(`Cannot read image: ${res.error}`, 5000); return; }
    item.dataUrl = res.dataUrl;
    renderCropImageList();
  }

  const img = new Image();
  img.onload = () => {
    cropState.image = img;

    const workArea = document.getElementById('cropWorkArea');
    const maxW = workArea.clientWidth  - 40;
    const maxH = workArea.clientHeight - 40;
    cropState.scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);

    const dispW = Math.round(img.naturalWidth  * cropState.scale);
    const dispH = Math.round(img.naturalHeight * cropState.scale);

    const canvas = document.getElementById('cropCanvas');
    canvas.width  = dispW;
    canvas.height = dispH;
    canvas.style.display = 'block';
    document.getElementById('cropEmptyState').style.display = 'none';

    const framePxDisp = Math.round(cropFramePx * cropState.scale);
    if (item.frameX !== null) {
      cropState.frameX = Math.max(0, Math.min(item.frameX, dispW - framePxDisp));
      cropState.frameY = Math.max(0, Math.min(item.frameY, dispH - framePxDisp));
    } else {
      cropState.frameX = Math.max(0, Math.round((dispW - framePxDisp) / 2));
      cropState.frameY = Math.max(0, Math.round((dispH - framePxDisp) / 2));
    }

    const rot = item.rotation ?? 0;
    cropState.rotation = rot;
    document.getElementById('cropRotationSlider').value = rot;
    document.getElementById('cropRotationInput').value  = rot;

    const name = item.path.split('/').pop();
    document.getElementById('cropFileName').textContent    = name;
    document.getElementById('cropDimensions').textContent  = `${img.naturalWidth} × ${img.naturalHeight} px`;
    document.getElementById('cropSummarySize').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
    ['cropFileInfoGroup','cropPositionGroup','cropRotationGroup','cropSummaryBox'].forEach(id => {
      document.getElementById(id).style.display = '';
    });
    document.getElementById('cropSaveBtn').disabled = false;
    document.getElementById('cropSaveAsIsBtn').disabled = false;

    drawCropCanvas();
    renderCropImageList();
    log('Crop', `Active: ${name} | ${img.naturalWidth}×${img.naturalHeight}px`);
  };
  img.src = item.dataUrl;
}

function drawCropCanvas() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || !cropState.image) return;
  const ctx = canvas.getContext('2d');
  const { image, scale, frameX, frameY, rotation } = cropState;
  const dispW = canvas.width, dispH = canvas.height;
  const fs = Math.round(cropFramePx * scale);

  ctx.clearRect(0, 0, dispW, dispH);

  // Dark background visible when rotation exposes canvas edges
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, dispW, dispH);

  // Draw image rotated around its centre
  ctx.save();
  ctx.translate(dispW / 2, dispH / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(image, -dispW / 2, -dispH / 2, dispW, dispH);
  ctx.restore();

  // Dim outside frame
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, dispW, frameY);
  ctx.fillRect(0, frameY + fs, dispW, dispH - frameY - fs);
  ctx.fillRect(0, frameY, frameX, fs);
  ctx.fillRect(frameX + fs, frameY, dispW - frameX - fs, fs);

  // Frame border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(frameX + 1, frameY + 1, fs - 2, fs - 2);

  // Rule-of-thirds
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let t = 1; t <= 2; t++) {
    const x = frameX + Math.round(fs * t / 3);
    const y = frameY + Math.round(fs * t / 3);
    ctx.moveTo(x, frameY); ctx.lineTo(x, frameY + fs);
    ctx.moveTo(frameX, y); ctx.lineTo(frameX + fs, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner handles
  const h = 7;
  ctx.fillStyle = '#ffffff';
  [[frameX, frameY], [frameX+fs, frameY], [frameX, frameY+fs], [frameX+fs, frameY+fs]].forEach(([x, y]) => {
    ctx.fillRect(x - h/2, y - h/2, h, h);
  });

  const ax = Math.round(frameX / scale), ay = Math.round(frameY / scale);
  document.getElementById('cropPosDisplay').textContent = `X: ${ax.toLocaleString()}  Y: ${ay.toLocaleString()}`;
}

function onCropMouseDown(e) {
  const canvas = document.getElementById('cropCanvas');
  const rect   = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const fs = Math.round(cropFramePx * cropState.scale);
  const { frameX, frameY } = cropState;
  if (mx >= frameX && mx <= frameX+fs && my >= frameY && my <= frameY+fs) {
    cropState.isDragging      = true;
    cropState.dragStartX      = mx;
    cropState.dragStartY      = my;
    cropState.dragStartFrameX = frameX;
    cropState.dragStartFrameY = frameY;
    canvas.style.cursor = 'grabbing';
  }
}

function onCropMouseMove(e) {
  const canvas = document.getElementById('cropCanvas');
  const rect   = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const fs = Math.round(cropFramePx * cropState.scale);

  if (!cropState.isDragging) {
    const { frameX, frameY } = cropState;
    canvas.style.cursor = (mx >= frameX && mx <= frameX+fs && my >= frameY && my <= frameY+fs) ? 'grab' : 'default';
    return;
  }
  cropState.frameX = Math.max(0, Math.min(cropState.dragStartFrameX + (mx - cropState.dragStartX), canvas.width  - fs));
  cropState.frameY = Math.max(0, Math.min(cropState.dragStartFrameY + (my - cropState.dragStartY), canvas.height - fs));
  drawCropCanvas();
}

function onCropMouseUp() {
  if (!cropState.isDragging) return;
  cropState.isDragging = false;
  document.getElementById('cropCanvas').style.cursor = 'default';
}

async function saveAsIs() {
  const { image, activeIndex, images, destination } = cropState;
  if (!image || activeIndex === null) return;

  const item     = images[activeIndex];
  const fileName = item.path.split('/').pop();

  log('Crop', `Save As-Is: ${fileName}`);
  const result = await window.electronAPI.saveCroppedImage({
    dataUrl:    item.dataUrl,
    defaultName: fileName,
    folderPath: destination || undefined
  });

  if (result.success) {
    logSuccess('Crop', `Saved: ${result.savedPath.split('/').pop()}`);
    showToast(`Saved: ${result.savedPath.split('/').pop()}`);
  } else if (!result.cancelled) {
    logError('Crop', `Save failed: ${result.error}`);
    showToast(`Save failed: ${result.error}`, 6000);
  }
}

async function performCrop() {
  const { image, scale, frameX, frameY, activeIndex, images, rotation } = cropState;
  if (!image || activeIndex === null) return;

  const item = images[activeIndex];
  const W    = image.naturalWidth;
  const H    = image.naturalHeight;
  const rad  = rotation * Math.PI / 180;

  // Build a full-resolution canvas with the image rotated around its centre.
  // The bounding box grows when the image is rotated.
  const cos   = Math.abs(Math.cos(rad));
  const sin   = Math.abs(Math.sin(rad));
  const bboxW = Math.ceil(W * cos + H * sin);
  const bboxH = Math.ceil(W * sin + H * cos);

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width  = bboxW;
  rotCanvas.height = bboxH;
  const rotCtx = rotCanvas.getContext('2d');
  rotCtx.translate(bboxW / 2, bboxH / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(image, -W / 2, -H / 2);
  rotCtx.setTransform(1, 0, 0, 1, 0, 0);

  // Map frame position from display coords to rotated-canvas coords.
  // Display canvas centre == bboxW/2, bboxH/2 at full resolution.
  const dispCX  = Math.round(W * scale) / 2;
  const dispCY  = Math.round(H * scale) / 2;
  const actualX = Math.round(bboxW / 2 + (frameX - dispCX) / scale);
  const actualY = Math.round(bboxH / 2 + (frameY - dispCY) / scale);

  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = cropFramePx;
  offscreen.getContext('2d').drawImage(rotCanvas, actualX, actualY, cropFramePx, cropFramePx, 0, 0, cropFramePx, cropFramePx);

  const ext      = item.path.split('.').pop().toLowerCase();
  const mime     = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
  const dataUrl  = offscreen.toDataURL(mime, mime === 'image/jpeg' ? 0.95 : undefined);

  const fileName   = item.path.split('/').pop();
  const dotIdx     = fileName.lastIndexOf('.');
  const outputName = dotIdx >= 0
    ? `${fileName.slice(0, dotIdx)}-cropped${fileName.slice(dotIdx)}`
    : `${fileName}-cropped`;

  log('Crop', `Saving (${actualX}, ${actualY}) → ${outputName}`);
  const result = await window.electronAPI.saveCroppedImage({
    dataUrl, defaultName: outputName, folderPath: cropState.destination || undefined
  });

  if (result.success) {
    item.saved = true;
    logSuccess('Crop', `Saved: ${result.savedPath.split('/').pop()}`);
    showToast(`Saved: ${result.savedPath.split('/').pop()}`);
    renderCropImageList();
  } else if (!result.cancelled) {
    logError('Crop', `Save failed: ${result.error}`);
    showToast(`Save failed: ${result.error}`, 6000);
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

init();
