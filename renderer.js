const state = {
  baseImages: [],
  patternImages: [],
  destination: null,
  isRunning: false
};

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

  // Remove placeholder on first real entry
  const placeholder = body.querySelector('.console-empty');
  if (placeholder) placeholder.remove();

  // Trim oldest when over limit
  if (consoleEntryCount >= MAX_ENTRIES) {
    if (body.firstChild) body.removeChild(body.firstChild);
    consoleEntryCount--;
  }

  const time     = (timestamp || new Date().toISOString()).slice(11, 23); // HH:MM:SS.mmm
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
  if      (level === 'error')   console.error(`[${ts}] [${tag}]`, message);
  else if (level === 'warn')    console.warn( `[${ts}] [${tag}]`, message);
  else                          console.log(  `[${ts}] [${tag}]`, message);
  appendConsoleEntry({ timestamp: new Date().toISOString(), level, tag, message });
}

const logSuccess = (tag, msg) => log(tag, msg, 'success');
const logWarn    = (tag, msg) => log(tag, msg, 'warn');
const logError   = (tag, msg) => log(tag, msg, 'error');

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  log('UI', 'Initialising');

  // Forward main-process log entries into the in-app console
  window.electronAPI.onLogEntry(({ timestamp, level, tag, message }) => {
    appendConsoleEntry({ timestamp, level, tag, message });
  });

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

  bindEvents();
  log('UI', 'Ready');
}

// ─── Events ─────────────────────────────────────────────────────────────────

function bindEvents() {
  // API key
  document.getElementById('saveApiKey').addEventListener('click', async () => {
    const key = document.getElementById('apiKey').value.trim();
    if (!key) { logWarn('UI', 'Save key clicked but field is empty'); return; }
    await window.electronAPI.saveApiKey(key);
    logSuccess('UI', 'API key saved');
    const badge = document.getElementById('apiKeySaved');
    badge.hidden = false;
    setTimeout(() => { badge.hidden = true; }, 2500);
  });

  // Base images
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

  // Pattern images
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

  // Destination
  document.getElementById('selectDestination').addEventListener('click', async () => {
    log('UI', 'Opening folder picker');
    const dir = await window.electronAPI.selectDestination();
    if (!dir) { log('UI', 'Folder picker cancelled'); return; }
    state.destination = dir;
    document.getElementById('destinationPath').value = dir;
    logSuccess('UI', `Destination set: ${dir}`);
    updateRunButton();
  });

  // Catalogue name
  document.getElementById('catalogueName').addEventListener('input', (e) => {
    updateRunButton();
    if (e.target.value.trim()) log('UI', `Catalogue name: "${e.target.value.trim()}"`);
  });

  // Scale mode
  document.getElementById('scaleMode').addEventListener('change', async (e) => {
    await window.electronAPI.saveScaleMode(e.target.value);
    log('UI', `Scale mode changed to: ${e.target.value}`);
  });

  // Run button
  document.getElementById('runBtn').addEventListener('click', runGeneration);

  // Console: clear
  document.getElementById('consoleClear').addEventListener('click', () => {
    clearConsole();
    log('UI', 'Console cleared');
  });

  // Console: collapse / expand
  document.getElementById('consoleToggle').addEventListener('click', () => {
    consoleCollapsed = !consoleCollapsed;
    document.getElementById('consolePanel').classList.toggle('is-collapsed', consoleCollapsed);
    const chevron = document.getElementById('consoleChevron');
    chevron.style.transform = consoleCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  });
}

// ─── Grid Rendering ──────────────────────────────────────────────────────────

function renderGrid(containerId, images, type) {
  const grid = document.getElementById(containerId);

  if (images.length === 0) {
    const [label, hint] = type === 'base'
      ? ['No base images selected', 'Curtain photos, renders or flats']
      : ['No patterns selected',    'Fabric prints, textures or designs'];
    const icon = type === 'base'
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
      <button class="thumb-remove" data-type="${type}" data-index="${i}" title="Remove">×</button>
      <div class="thumb-name">${escapeHtml(fileName)}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.thumb-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      const t   = e.currentTarget.dataset.type;
      if (t === 'base') {
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

// ─── UI State ────────────────────────────────────────────────────────────────

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
  const btn = document.getElementById('runBtn');
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

// ─── Generation ──────────────────────────────────────────────────────────────

async function runGeneration() {
  const apiKey       = document.getElementById('apiKey').value.trim();
  const catalogueName = document.getElementById('catalogueName').value.trim();
  const scaleMode    = document.getElementById('scaleMode').value;

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

  // Auto-expand console during generation so user can see activity
  if (consoleCollapsed) {
    consoleCollapsed = false;
    document.getElementById('consolePanel').classList.remove('is-collapsed');
    document.getElementById('consoleChevron').style.transform = 'rotate(0deg)';
  }

  window.electronAPI.onProgressUpdate(({ completed, total: t, status, message }) => {
    const pct = Math.round((completed / t) * 100);
    setProgress(pct, message, status, `${completed} / ${t}`);
    // Progress events are already logged by main process; don't double-log here
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

// ─── Start ───────────────────────────────────────────────────────────────────

init();
