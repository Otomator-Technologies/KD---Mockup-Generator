const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const API_URL = 'https://fabric-fusion-218867286180.asia-southeast1.run.app/api/apply-pattern';
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
        const outputBuf = Buffer.from(data.imageBase64, 'base64');
        const outputPath = path.join(outputDir, `${imageIndex}.png`);
        fs.writeFileSync(outputPath, outputBuf);

        completed++;
        logSuccess('GEN', `✓ [${callNum}/${total}] Saved ${imageIndex}.png (${kb(outputBuf.length)}) → ${folderName}`);

        event.sender.send('progress-update', {
          completed,
          total,
          status: 'success',
          message: `✓ Saved ${imageIndex}.png → ${folderName}`
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
