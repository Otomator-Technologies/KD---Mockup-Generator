const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const API_URL    = 'https://fabric-fusion-218867286180.asia-southeast1.run.app/api/apply-pattern';
const KD_API_URL = 'https://mockup-gen.kineticdrapes.com/api/apply-pattern';
const SP_API_URL = 'https://kd-seamless-pattern-gen-218867286180.asia-southeast1.run.app/api/synthesize-pattern';
const configPath = path.join(app.getPath('userData'), 'config.json');

// ─── Logger ──────────────────────────────────────────────────────────────────
// All logs go to the terminal AND are forwarded to the in-app console panel
// via the 'log-entry' IPC event.

let mainWindow = null;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function emit(level, tag, message) {
  // Terminal
  const prefix = `[${ts()}] [${tag}]`;
  if (level === 'error') console.error(prefix, 'ERROR:', message);
  else if (level === 'warn')  console.warn(prefix,  'WARN:',  message);
  else                        console.log(prefix,             message);

  // Renderer console panel
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('log-entry', {
        timestamp: new Date().toISOString(),
        level,
        tag,
        message: String(message)
      });
    } catch (_) {}
  }
}

const log        = (tag, msg) => emit('info',    tag, msg);
const logSuccess = (tag, msg) => emit('success', tag, msg);
const logWarn    = (tag, msg) => emit('warn',    tag, msg);
const logError   = (tag, msg) => emit('error',   tag, msg);

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? '(set)' : '(not set)';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

// ─── Error Parsing ───────────────────────────────────────────────────────────
// Converts raw HTTP/network errors into human-readable messages.

function friendlyError(err) {
  const msg = err.message || String(err);

  if (/HTTP 400/.test(msg))          return 'Bad request (400) — images may be in an unsupported format or too large';
  if (/HTTP 40[13]/.test(msg))       return 'Unauthorized (401/403) — invalid or missing API key, check your Gemini key';
  if (/HTTP 429/.test(msg))          return 'Rate limit exceeded (429) — too many requests, wait a moment then retry';
  if (/HTTP 5\d\d/.test(msg)) {
    const code = (msg.match(/HTTP (\d+)/) || [])[1] || '5xx';
    return `Server error (${code}) — the API service encountered an internal error, try again shortly`;
  }
  if (/timed? out/i.test(msg))       return 'Request timed out (120s) — image may be too large or the network is slow';
  if (/ENOTFOUND/i.test(msg))        return 'DNS lookup failed — check your internet connection';
  if (/ECONNREFUSED/i.test(msg))     return 'Connection refused — the API server is not reachable';
  if (/ECONNRESET/i.test(msg))       return 'Connection reset — the request was interrupted mid-transfer';
  if (/No image|missing imageBase64/i.test(msg)) return 'API returned no image — try a different image or pattern combination';
  if (/not valid JSON|Invalid JSON/i.test(msg))  return 'Unexpected response format — received non-JSON from the API server';

  return msg;
}

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    logError('CONFIG', `Failed to load config: ${err.message}`);
  }
  return {};
}

function saveConfig(data) {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ ...loadConfig(), ...data }, null, 2));
    log('CONFIG', `Saved: ${Object.keys(data).join(', ')}`);
  } catch (err) {
    logError('CONFIG', `Failed to save config: ${err.message}`);
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  log('MAIN', 'Creating window');
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 960,
    minHeight: 660,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    title: 'Mockup Generator'
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
  log('MAIN', 'Window created');
}

app.whenReady().then(() => {
  log('MAIN', `App ready | Electron ${process.versions.electron} | Node ${process.versions.node} | Platform: ${process.platform}`);
  log('MAIN', `Config: ${configPath}`);
  createWindow();
});

app.on('window-all-closed', () => {
  log('MAIN', 'All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    log('MAIN', 'Re-activating — creating window');
    createWindow();
  }
});

// ─── IPC: File Dialogs ───────────────────────────────────────────────────────

ipcMain.handle('select-images', async () => {
  log('IPC', 'select-images → opening dialog');
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  const files = result.filePaths || [];
  if (result.canceled || !files.length) {
    log('IPC', 'select-images → cancelled');
  } else {
    log('IPC', `select-images → ${files.length} file(s) selected`);
    files.forEach(f => log('IPC', `  • ${path.basename(f)}`));
  }
  return files;
});

ipcMain.handle('select-destination', async () => {
  log('IPC', 'select-destination → opening dialog');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder'
  });
  const dir = result.filePaths[0] || null;
  if (result.canceled || !dir) {
    log('IPC', 'select-destination → cancelled');
  } else {
    log('IPC', `select-destination → ${dir}`);
  }
  return dir;
});

// ─── IPC: Config ─────────────────────────────────────────────────────────────

ipcMain.handle('get-api-key', () => {
  const key = loadConfig().apiKey || '';
  log('IPC', `get-api-key → ${maskKey(key)}`);
  return key;
});

ipcMain.handle('save-api-key', (_, key) => {
  log('IPC', `save-api-key → ${maskKey(key)}`);
  saveConfig({ apiKey: key });
});

ipcMain.handle('get-scale-mode', () => {
  const mode = loadConfig().scaleMode || 'a4-scan';
  log('IPC', `get-scale-mode → ${mode}`);
  return mode;
});

ipcMain.handle('save-scale-mode', (_, mode) => {
  log('IPC', `save-scale-mode → ${mode}`);
  saveConfig({ scaleMode: mode });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
}

function toWebp(buf, quality = 90) {
  return new Promise((resolve, reject) => {
    if (!mainWindow) { reject(new Error('No window for WebP conversion')); return; }
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(`webp-result-${id}`);
      reject(new Error('WebP conversion timed out'));
    }, 20000);
    ipcMain.once(`webp-result-${id}`, (_, webpBase64) => {
      clearTimeout(timer);
      resolve(Buffer.from(webpBase64, 'base64'));
    });
    mainWindow.webContents.send('convert-to-webp', { id, base64: buf.toString('base64'), quality });
  });
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const payloadBytes = Buffer.byteLength(payload);
    const parsed = new URL(url);

    log('HTTP', `→ POST ${parsed.hostname}${parsed.pathname} | payload: ${kb(payloadBytes)}`);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payloadBytes
      }
    };

    const startTime = Date.now();

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        const rawBuf = Buffer.concat(chunks);
        const size = kb(rawBuf.length);

        if (res.statusCode !== 200) {
          const preview = rawBuf.toString().slice(0, 400);
          const errMsg = `HTTP ${res.statusCode}: ${preview}`;
          logError('HTTP', `← ${res.statusCode} in ${elapsed}ms | ${size} | ${preview.slice(0, 120)}`);
          reject(new Error(errMsg));
          return;
        }

        log('HTTP', `← ${res.statusCode} OK in ${elapsed}ms | response: ${size}`);
        try {
          resolve(JSON.parse(rawBuf.toString()));
        } catch {
          reject(new Error('Response is not valid JSON'));
        }
      });
    });

    req.on('error', (err) => {
      logError('HTTP', `Network error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(120000, () => {
      logError('HTTP', 'Request timed out after 120s');
      req.destroy(new Error('Request timed out after 120s'));
    });

    req.write(payload);
    req.end();
  });
}

// ─── IPC: Generate ───────────────────────────────────────────────────────────

ipcMain.handle('generate-mockups', async (event, { apiKey, baseImages, patternImages, destination, catalogueName, scaleMode }) => {
  const total = baseImages.length * patternImages.length;

  log('GEN', '─'.repeat(56));
  log('GEN', `Batch start — ${baseImages.length} base × ${patternImages.length} patterns = ${total} calls`);
  log('GEN', `Catalogue: "${catalogueName}" | Scale: ${scaleMode || 'a4-scan'} | Key: ${maskKey(apiKey)}`);
  log('GEN', `Destination: ${destination}`);
  log('GEN', '─'.repeat(56));

  let completed = 0;
  const errors = [];
  const batchStart = Date.now();

  for (let pi = 0; pi < patternImages.length; pi++) {
    const patternPath = patternImages[pi];
    const patternBaseName = path.basename(patternPath, path.extname(patternPath));
    const folderName = sanitizeName(catalogueName) + sanitizeName(patternBaseName);
    const outputDir = path.join(destination, folderName);

    log('GEN', `Pattern ${pi + 1}/${patternImages.length}: "${path.basename(patternPath)}" → /${folderName}`);

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      log('FS', `Output dir: ${outputDir}`);
    } catch (err) {
      logError('FS', `Cannot create output dir: ${err.message}`);
    }

    try {
      const patternCopyPath = path.join(outputDir, path.basename(patternPath));
      fs.copyFileSync(patternPath, patternCopyPath);
      log('FS', `Pattern copied: ${path.basename(patternPath)}`);
    } catch (err) {
      logError('FS', `Cannot copy pattern: ${err.message}`);
    }

    let imageIndex = 1;

    for (let bi = 0; bi < baseImages.length; bi++) {
      const basePath = baseImages[bi];
      const baseFile = path.basename(basePath);
      const patternFile = path.basename(patternPath);
      const callNum = completed + 1;

      log('GEN', `[${callNum}/${total}] ${baseFile} + ${patternFile}`);

      event.sender.send('progress-update', {
        completed,
        total,
        status: 'running',
        message: `Generating ${callNum}/${total}: ${baseFile} + ${patternFile}`
      });

      try {
        // Read source files
        const curtainBuf = fs.readFileSync(basePath);
        const patternBuf = fs.readFileSync(patternPath);
        log('FS', `Read: ${baseFile} (${kb(curtainBuf.length)}) + ${patternFile} (${kb(patternBuf.length)})`);

        // Call API
        const data = await postJson(API_URL, {
          curtainBase64:  curtainBuf.toString('base64'),
          curtainMimeType: getMimeType(basePath),
          patternBase64:  patternBuf.toString('base64'),
          patternMimeType: getMimeType(patternPath),
          scaleMode:      scaleMode || 'a4-scan',
          apiKeyOverride: apiKey || ''
        });

        if (!data.imageBase64) {
          throw new Error('API response missing imageBase64 field');
        }

        // Save output
        const outputBuf  = await toWebp(Buffer.from(data.imageBase64, 'base64'));
        const outputPath = path.join(outputDir, `${imageIndex}.webp`);
        fs.writeFileSync(outputPath, outputBuf);

        completed++;
        logSuccess('GEN', `✓ [${callNum}/${total}] Saved ${imageIndex}.webp (${kb(outputBuf.length)}) → ${folderName}`);

        event.sender.send('progress-update', {
          completed,
          total,
          status: 'success',
          message: `✓ Saved ${imageIndex}.webp → ${folderName}`
        });

      } catch (err) {
        const friendly = friendlyError(err);
        logError('GEN', `✗ [${callNum}/${total}] ${baseFile} + ${patternFile}: ${err.message}`);
        logError('GEN', `  → ${friendly}`);

        errors.push({ base: baseFile, pattern: patternFile, error: friendly });
        completed++;

        event.sender.send('progress-update', {
          completed,
          total,
          status: 'error',
          message: `✗ ${baseFile} + ${patternFile}: ${friendly}`
        });
      }

      imageIndex++;
    }
  }

  const batchMs = Date.now() - batchStart;
  const successCount = completed - errors.length;

  log('GEN', '─'.repeat(56));
  if (errors.length === 0) {
    logSuccess('GEN', `Batch done in ${(batchMs / 1000).toFixed(1)}s — ${successCount}/${total} succeeded`);
  } else {
    logWarn('GEN', `Batch done in ${(batchMs / 1000).toFixed(1)}s — ${successCount}/${total} succeeded, ${errors.length} failed`);
    errors.forEach(e => logError('GEN', `  ✗ ${e.base} + ${e.pattern}: ${e.error}`));
  }
  log('GEN', '─'.repeat(56));

  return { completed, total, errors };
});

// ─── IPC: Select Single Image ─────────────────────────────────────────────────

// ─── IPC: Generate Single Pattern (Google AI) ────────────────────────────────

ipcMain.handle('generate-mockup-single', async (event, { apiKey, pattern, baseImages, destination, catalogueName, scaleMode }) => {
  const patternPath     = pattern;
  const patternBaseName = path.basename(patternPath, path.extname(patternPath));
  const folderName      = sanitizeName(catalogueName) + sanitizeName(patternBaseName);
  const outputDir       = path.join(destination, folderName);
  const total           = baseImages.length;

  log('GEN', `Single: "${path.basename(patternPath)}" | ${total} base → /${folderName}`);

  try { fs.mkdirSync(outputDir, { recursive: true }); }
  catch (err) { logError('FS', `Cannot create output dir: ${err.message}`); }

  try { fs.copyFileSync(patternPath, path.join(outputDir, path.basename(patternPath))); }
  catch (err) { logError('FS', `Cannot copy pattern: ${err.message}`); }

  let completed = 0;
  const errors  = [];

  for (let bi = 0; bi < baseImages.length; bi++) {
    const basePath    = baseImages[bi];
    const baseFile    = path.basename(basePath);
    const patternFile = path.basename(patternPath);
    const callNum     = bi + 1;

    event.sender.send('progress-update', {
      completed, total,
      status:  'running',
      message: `${callNum}/${total}: ${baseFile} + ${patternFile}`
    });

    try {
      const curtainBuf = fs.readFileSync(basePath);
      const patternBuf = fs.readFileSync(patternPath);

      const data = await postJson(API_URL, {
        curtainBase64:   curtainBuf.toString('base64'),
        curtainMimeType: getMimeType(basePath),
        patternBase64:   patternBuf.toString('base64'),
        patternMimeType: getMimeType(patternPath),
        scaleMode:       scaleMode || 'a4-scan',
        apiKeyOverride:  apiKey || ''
      });

      if (!data.imageBase64) throw new Error('API response missing imageBase64 field');

      const outputBuf  = await toWebp(Buffer.from(data.imageBase64, 'base64'));
      const outputPath = path.join(outputDir, `${callNum}.webp`);
      fs.writeFileSync(outputPath, outputBuf);

      completed++;
      logSuccess('GEN', `✓ ${callNum}.webp → ${folderName}`);

      event.sender.send('progress-update', {
        completed, total,
        status:  'success',
        message: `✓ Saved ${callNum}.webp → ${folderName}`
      });

    } catch (err) {
      const friendly = friendlyError(err);
      logError('GEN', `✗ [${callNum}] ${baseFile}: ${err.message}`);
      errors.push({ base: baseFile, pattern: patternFile, error: friendly });
      completed++;
      event.sender.send('progress-update', {
        completed, total,
        status:  'error',
        message: `✗ ${baseFile}: ${friendly}`
      });
    }
  }

  const imagesSaved = completed - errors.length;
  if (errors.length === 0) {
    logSuccess('GEN', `Done: ${path.basename(patternPath)} → ${imagesSaved} mockup(s)`);
  } else {
    logWarn('GEN', `Done: ${path.basename(patternPath)} → ${imagesSaved}/${completed} ok`);
  }

  return { success: errors.length === 0, errors, imagesSaved };
});

ipcMain.handle('select-single-image', async () => {
  log('IPC', 'select-single-image → opening dialog');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (result.canceled || !result.filePaths.length) {
    log('IPC', 'select-single-image → cancelled');
    return null;
  }
  log('IPC', `select-single-image → ${path.basename(result.filePaths[0])}`);
  return result.filePaths[0];
});

// ─── IPC: KD Config ──────────────────────────────────────────────────────────

ipcMain.handle('get-kd-config', () => {
  const cfg = loadConfig();
  const result = {
    scaleMode:          cfg.kdScaleMode          || 'a4-scan',
    patternRotation:    cfg.kdPatternRotation     ?? 0,
    patternTileWidthMm: cfg.kdPatternTileWidthMm || 210
  };
  log('IPC', `get-kd-config → ${JSON.stringify(result)}`);
  return result;
});

ipcMain.handle('save-kd-config', (_, cfg) => {
  log('IPC', `save-kd-config → ${JSON.stringify(cfg)}`);
  saveConfig({
    kdScaleMode:          cfg.scaleMode,
    kdPatternRotation:    cfg.patternRotation,
    kdPatternTileWidthMm: cfg.patternTileWidthMm
  });
});

ipcMain.handle('save-kd-base-pairs', (_, pairs) => {
  saveConfig({ kdBasePairs: pairs });
  log('IPC', `save-kd-base-pairs → ${pairs.length} pair(s) saved`);
});

ipcMain.handle('get-kd-base-pairs', () => {
  const saved = loadConfig().kdBasePairs || [];
  // Filter out entries whose base file no longer exists; clear stale mask paths
  const valid = saved.reduce((acc, { base, mask, curtainWidthMm, selected }) => {
    if (!fs.existsSync(base)) {
      logWarn('IPC', `get-kd-base-pairs: base file missing, skipping — ${path.basename(base)}`);
      return acc;
    }
    const safeMask = (mask && fs.existsSync(mask)) ? mask : null;
    if (mask && !safeMask) {
      logWarn('IPC', `get-kd-base-pairs: mask file missing, cleared — ${path.basename(mask)}`);
    }
    acc.push({ base, mask: safeMask, curtainWidthMm: curtainWidthMm || '', selected: selected !== false });
    return acc;
  }, []);
  log('IPC', `get-kd-base-pairs → ${valid.length}/${saved.length} pair(s) valid`);
  return valid;
});

// ─── IPC: KD Generate ────────────────────────────────────────────────────────

ipcMain.handle('generate-mockups-kd', async (event, {
  baseImagePairs, patternImages, destination, catalogueName,
  scaleMode, patternRotation, patternTileWidthMm
}) => {
  // patternImages is [{ path, tileWidthMm }]; patternTileWidthMm is the global fallback
  const total = baseImagePairs.length * patternImages.length;

  log('KD', '─'.repeat(56));
  log('KD', `Batch start — ${baseImagePairs.length} base × ${patternImages.length} patterns = ${total} calls`);
  log('KD', `Catalogue: "${catalogueName}" | Scale: ${scaleMode} | Rotation: ${patternRotation}°`);
  log('KD', `Destination: ${destination}`);
  log('KD', '─'.repeat(56));

  let completed = 0;
  const errors = [];
  const batchStart = Date.now();

  for (let pi = 0; pi < patternImages.length; pi++) {
    const pattern     = patternImages[pi];
    const patternPath = pattern.path;
    const patternBaseName = path.basename(patternPath, path.extname(patternPath));
    const folderName  = sanitizeName(catalogueName) + sanitizeName(patternBaseName);
    const outputDir   = path.join(destination, folderName);
    const tileWidthMm = parseFloat(pattern.tileWidthMm) || parseFloat(patternTileWidthMm) || 210;

    log('KD', `Pattern ${pi + 1}/${patternImages.length}: "${path.basename(patternPath)}" | tile=${tileWidthMm}mm → /${folderName}`);

    try { fs.mkdirSync(outputDir, { recursive: true }); }
    catch (err) { logError('KD', `Cannot create output dir: ${err.message}`); }

    try { fs.copyFileSync(patternPath, path.join(outputDir, path.basename(patternPath))); }
    catch (err) { logError('KD', `Cannot copy pattern: ${err.message}`); }

    let imageIndex = 1;

    for (let bi = 0; bi < baseImagePairs.length; bi++) {
      const { base: basePath, mask: maskPath, curtainWidthMm } = baseImagePairs[bi];
      const baseFile    = path.basename(basePath);
      const patternFile = path.basename(patternPath);
      const callNum     = completed + 1;

      event.sender.send('progress-update', {
        completed,
        total,
        status:  'running',
        message: `Generating ${callNum}/${total}: ${baseFile} + ${patternFile}`
      });

      try {
        const curtainBuf = fs.readFileSync(basePath);
        const patternBuf = fs.readFileSync(patternPath);

        const body = {
          curtainBase64:      curtainBuf.toString('base64'),
          curtainMimeType:    getMimeType(basePath),
          patternBase64:      patternBuf.toString('base64'),
          patternMimeType:    getMimeType(patternPath),
          scaleMode:          scaleMode || 'a4-scan',
          patternRotation:    parseInt(patternRotation) || 0,
          patternRealWidthMm: tileWidthMm
        };

        if (maskPath) {
          const maskBuf = fs.readFileSync(maskPath);
          body.maskBase64   = maskBuf.toString('base64');
          body.maskMimeType = getMimeType(maskPath);
        }

        if (curtainWidthMm && parseFloat(curtainWidthMm) > 0) {
          body.curtainRealWidthMm = parseFloat(curtainWidthMm);
        }

        const data = await postJson(KD_API_URL, body);

        if (!data.imageBase64) throw new Error('KD API response missing imageBase64 field');

        const outputBuf  = await toWebp(Buffer.from(data.imageBase64, 'base64'));
        const outputPath = path.join(outputDir, `${imageIndex}.webp`);
        fs.writeFileSync(outputPath, outputBuf);

        completed++;
        logSuccess('KD', `✓ [${callNum}/${total}] ${imageIndex}.webp → ${folderName}`);

        event.sender.send('progress-update', {
          completed, total,
          status:  'success',
          message: `✓ Saved ${imageIndex}.webp → ${folderName}`
        });

      } catch (err) {
        const friendly = friendlyError(err);
        logError('KD', `✗ [${callNum}/${total}] ${baseFile} + ${patternFile}: ${err.message}`);
        errors.push({ base: baseFile, pattern: patternFile, error: friendly });
        completed++;
        event.sender.send('progress-update', {
          completed, total,
          status:  'error',
          message: `✗ ${baseFile} + ${patternFile}: ${friendly}`
        });
      }

      imageIndex++;
    }
  }

  const batchMs      = Date.now() - batchStart;
  const successCount = completed - errors.length;
  const elapsed      = (batchMs / 1000).toFixed(1);

  log('KD', '─'.repeat(56));
  if (errors.length === 0) {
    logSuccess('KD', `Done — ${successCount}/${total} mockups in ${elapsed}s`);
  } else {
    logWarn('KD', `Done — ${successCount}/${total} ok, ${errors.length} failed | ${elapsed}s`);
    errors.forEach(e => logError('KD', `  ✗ ${e.base} + ${e.pattern}: ${e.error}`));
  }
  log('KD', '─'.repeat(56));

  return { completed, total, errors };
});

// ─── IPC: KD Single Pattern Generate ─────────────────────────────────────────

ipcMain.handle('generate-kd-pattern-single', async (event, {
  pattern, baseImagePairs, destination, catalogueName,
  scaleMode, patternRotation, patternTileWidthMm
}) => {
  const patternPath     = pattern.path;
  const tileWidthMm     = parseFloat(pattern.tileWidthMm) || parseFloat(patternTileWidthMm) || 210;
  const patternBaseName = path.basename(patternPath, path.extname(patternPath));
  const folderName      = sanitizeName(catalogueName) + sanitizeName(patternBaseName);
  const outputDir       = path.join(destination, folderName);
  const total           = baseImagePairs.length;

  log('KD', `Single: "${path.basename(patternPath)}" | tile=${tileWidthMm}mm | ${total} base → /${folderName}`);

  try { fs.mkdirSync(outputDir, { recursive: true }); }
  catch (err) { logError('KD', `Cannot create output dir: ${err.message}`); }

  try { fs.copyFileSync(patternPath, path.join(outputDir, path.basename(patternPath))); }
  catch (err) { logError('KD', `Cannot copy pattern: ${err.message}`); }

  let completed = 0;
  const errors  = [];

  for (let bi = 0; bi < baseImagePairs.length; bi++) {
    const { base: basePath, mask: maskPath, curtainWidthMm } = baseImagePairs[bi];
    const baseFile    = path.basename(basePath);
    const patternFile = path.basename(patternPath);
    const callNum     = bi + 1;

    event.sender.send('progress-update', {
      completed, total,
      status:  'running',
      message: `${callNum}/${total}: ${baseFile}`
    });

    try {
      const curtainBuf = fs.readFileSync(basePath);
      const patternBuf = fs.readFileSync(patternPath);

      const body = {
        curtainBase64:      curtainBuf.toString('base64'),
        curtainMimeType:    getMimeType(basePath),
        patternBase64:      patternBuf.toString('base64'),
        patternMimeType:    getMimeType(patternPath),
        scaleMode:          scaleMode || 'a4-scan',
        patternRotation:    parseInt(patternRotation) || 0,
        patternRealWidthMm: tileWidthMm
      };

      if (maskPath) {
        const maskBuf = fs.readFileSync(maskPath);
        body.maskBase64   = maskBuf.toString('base64');
        body.maskMimeType = getMimeType(maskPath);
      }

      if (curtainWidthMm && parseFloat(curtainWidthMm) > 0) {
        body.curtainRealWidthMm = parseFloat(curtainWidthMm);
      }

      const data = await postJson(KD_API_URL, body);
      if (!data.imageBase64) throw new Error('KD API response missing imageBase64 field');

      const outputBuf  = await toWebp(Buffer.from(data.imageBase64, 'base64'));
      const outputPath = path.join(outputDir, `${callNum}.webp`);
      fs.writeFileSync(outputPath, outputBuf);

      completed++;
      logSuccess('KD', `✓ ${callNum}.webp → ${folderName}`);

      event.sender.send('progress-update', {
        completed, total,
        status:  'success',
        message: `✓ Saved ${callNum}.webp → ${folderName}`
      });

    } catch (err) {
      const friendly = friendlyError(err);
      logError('KD', `✗ [${callNum}] ${baseFile}: ${err.message}`);
      errors.push({ base: baseFile, pattern: patternFile, error: friendly });
      completed++;
      event.sender.send('progress-update', {
        completed, total,
        status:  'error',
        message: `✗ ${baseFile}: ${friendly}`
      });
    }
  }

  const imagesSaved = completed - errors.length;
  if (errors.length === 0) {
    logSuccess('KD', `Done: ${path.basename(patternPath)} → ${imagesSaved} mockup(s)`);
  } else {
    logWarn('KD', `Done: ${path.basename(patternPath)} → ${imagesSaved}/${completed} ok`);
  }

  return { success: errors.length === 0, errors, imagesSaved };
});

// ─── IPC: Seamless Pattern Generate ──────────────────────────────────────────

ipcMain.handle('generate-seamless-patterns', async (event, {
  sourceImages, destination, catalogueName, apiKey
}) => {
  const total = sourceImages.length;

  log('SP', '─'.repeat(56));
  log('SP', `Batch start — ${total} image(s) → seamless tiles`);
  log('SP', `Catalogue: "${catalogueName}"`);
  log('SP', `Destination: ${destination}`);
  log('SP', '─'.repeat(56));

  const outputDir = path.join(destination, sanitizeName(catalogueName));
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    log('FS', `Output dir: ${outputDir}`);
  } catch (err) {
    logError('FS', `Cannot create output dir: ${err.message}`);
  }

  let completed = 0;
  const errors  = [];
  const batchStart = Date.now();

  for (let i = 0; i < sourceImages.length; i++) {
    const { path: srcPath, patternType } = sourceImages[i];
    const srcFile  = path.basename(srcPath);
    const callNum  = i + 1;

    log('SP', `[${callNum}/${total}] ${srcFile} | type: ${patternType || '(auto)'}`);

    event.sender.send('progress-update', {
      completed, total, status: 'running',
      message: `Synthesising ${callNum}/${total}: ${srcFile}`
    });
    event.sender.send('sp-image-status', { index: i, status: 'running' });

    try {
      const srcBuf   = fs.readFileSync(srcPath);
      const mimeType = getMimeType(srcPath);
      const dataUrl  = `data:${mimeType};base64,${srcBuf.toString('base64')}`;
      log('FS', `Read: ${srcFile} (${kb(srcBuf.length)})`);

      const body = { imageBase64: dataUrl, apiKey: apiKey || '' };
      if (patternType && patternType.trim()) body.patternPrompt = patternType.trim();

      const data = await postJson(SP_API_URL, body);

      if (data.error) throw new Error(data.error);
      if (!data.image) throw new Error('API response missing image field');

      const match = data.image.match(/^data:(image\/(\w+));base64,(.+)$/s);
      if (!match) throw new Error('API returned invalid image data URL');
      const [, , fmt, b64] = match;

      const baseName   = path.basename(srcPath, path.extname(srcPath));
      const outputPath = path.join(outputDir, `${sanitizeName(baseName)}-seamless.${fmt}`);
      const outputBuf  = Buffer.from(b64, 'base64');
      fs.writeFileSync(outputPath, outputBuf);

      completed++;
      logSuccess('SP', `✓ [${callNum}/${total}] Saved ${path.basename(outputPath)} (${kb(outputBuf.length)})`);

      event.sender.send('progress-update', {
        completed, total, status: 'success',
        message: `✓ Saved ${path.basename(outputPath)}`
      });
      event.sender.send('sp-image-status', { index: i, status: 'done' });

    } catch (err) {
      const friendly = friendlyError(err);
      logError('SP', `✗ [${callNum}/${total}] ${srcFile}: ${err.message}`);
      logError('SP', `  → ${friendly}`);

      errors.push({ source: srcFile, error: friendly });
      completed++;

      event.sender.send('progress-update', {
        completed, total, status: 'error',
        message: `✗ ${srcFile}: ${friendly}`
      });
      event.sender.send('sp-image-status', { index: i, status: 'error', error: friendly });
    }
  }

  const batchMs      = Date.now() - batchStart;
  const successCount = completed - errors.length;

  log('SP', '─'.repeat(56));
  if (errors.length === 0) {
    logSuccess('SP', `Batch done in ${(batchMs / 1000).toFixed(1)}s — ${successCount}/${total} succeeded`);
  } else {
    logWarn('SP', `Batch done in ${(batchMs / 1000).toFixed(1)}s — ${successCount}/${total} succeeded, ${errors.length} failed`);
    errors.forEach(e => logError('SP', `  ✗ ${e.source}: ${e.error}`));
  }
  log('SP', '─'.repeat(56));

  return { completed, total, errors };
});

// ─── Crop Pattern IPC ─────────────────────────────────────────────────────────

ipcMain.handle('read-file-as-data-url', (_event, filePath) => {
  try {
    const buf      = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    return { success: true, dataUrl: `data:${mimeType};base64,${buf.toString('base64')}` };
  } catch (err) {
    logError('Crop', `Cannot read file: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-cropped-image', async (_event, { dataUrl, defaultName, folderPath }) => {
  let filePath;
  if (folderPath) {
    filePath = path.join(folderPath, defaultName);
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { success: false, cancelled: true };
    filePath = result.filePath;
  }
  try {
    const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    logSuccess('Crop', `Saved: ${filePath}`);
    return { success: true, savedPath: filePath };
  } catch (err) {
    logError('Crop', `Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('generate-seamless-pattern-single', async (_event, {
  sourcePath, patternType, destination, catalogueName, apiKey
}) => {
  const outputDir = path.join(destination, sanitizeName(catalogueName));
  try { fs.mkdirSync(outputDir, { recursive: true }); } catch (_) {}

  const srcFile = path.basename(sourcePath);
  log('SP', `[Retry] ${srcFile} | type: ${patternType || '(auto)'}`);

  try {
    const srcBuf   = fs.readFileSync(sourcePath);
    const mimeType = getMimeType(sourcePath);
    const dataUrl  = `data:${mimeType};base64,${srcBuf.toString('base64')}`;

    const body = { imageBase64: dataUrl, apiKey: apiKey || '' };
    if (patternType && patternType.trim()) body.patternPrompt = patternType.trim();

    const data = await postJson(SP_API_URL, body);
    if (data.error) throw new Error(data.error);
    if (!data.image) throw new Error('API response missing image field');

    const match = data.image.match(/^data:(image\/(\w+));base64,(.+)$/s);
    if (!match) throw new Error('API returned invalid image data URL');
    const [, , fmt, b64] = match;

    const baseName   = path.basename(sourcePath, path.extname(sourcePath));
    const outputPath = path.join(outputDir, `${sanitizeName(baseName)}-seamless.${fmt}`);
    const outputBuf  = Buffer.from(b64, 'base64');
    fs.writeFileSync(outputPath, outputBuf);

    logSuccess('SP', `✓ [Retry] Saved ${path.basename(outputPath)} (${kb(outputBuf.length)})`);
    return { success: true };
  } catch (err) {
    const friendly = friendlyError(err);
    logError('SP', `✗ [Retry] ${srcFile}: ${err.message}`);
    return { success: false, error: friendly };
  }
});
