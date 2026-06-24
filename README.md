# Mockup Generator

A desktop app for generating fabric mockup images. Upload curtain base images and design patterns — the app calls the Fabric Fusion AI API to apply each pattern onto each base image and saves the results in organised folders.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | **v18.0 or later** (v22 recommended) | Built and tested on v22.3.0 |
| npm | **v9 or later** | Comes with Node.js. Tested on v10.8.1 |
| OS | macOS, Windows, or Linux | macOS required to build the Mac `.dmg` |

> **Check your versions:**
> ```bash
> node --version   # should print v18.x.x or higher
> npm --version    # should print 9.x.x or higher
> ```
> If Node is not installed, download it from [nodejs.org](https://nodejs.org) (choose the LTS version).

---

## Dependencies

The app has **no runtime dependencies** — it uses only Node.js built-in modules (`fs`, `https`, `path`) and the Electron runtime which is bundled into the build.

| Package | Version | Type | Purpose |
|---|---|---|---|
| [electron](https://electronjs.org) | ^33.0.0 | dev | Desktop app shell, bundles Node.js v20 + Chromium |
| [electron-builder](https://www.electron.build) | ^25.1.8 | dev | Packages the app into DMG / EXE / AppImage for distribution |

Dev dependencies are only needed to **run in development or build**. End users who install the `.dmg` / `.exe` need nothing installed on their machine.

---

## Setup

```bash
git clone <repo-url>
cd Mockup-Gen
npm install
```

---

## Running in Development

```bash
npm start
```

Opens the app window directly. Logs appear in two places:
- **Terminal** — main process logs (API calls, file I/O, errors)
- **In-app Console panel** — live feed at the bottom of the window
- **DevTools** (`Cmd+Option+I` on Mac, `Ctrl+Shift+I` on Windows) — renderer logs

---

## Building for Production

### macOS (run this on a Mac)

```bash
npm run build
```

Output in `dist/`:
```
dist/
  Mockup Generator-1.0.0-universal.dmg   ← share this
  mac-universal/Mockup Generator.app     ← or drag this to /Applications
```

The DMG is a **universal binary** — works on both Intel and Apple Silicon Macs.

**Installing on macOS Sequoia / Ventura / Sonoma:**
Since the app isn't notarized by Apple, macOS will block it on first launch.

_Option A — System Settings (no Terminal needed):_
1. Drag the app to Applications and try to open it → click Done on the warning
2. Go to **System Settings → Privacy & Security**
3. Scroll down → click **Open Anyway** → enter password → click **Open**

_Option B — Terminal (one command):_
```bash
sudo xattr -rd com.apple.quarantine "/Applications/Mockup Generator.app"
```

---

### Windows (run this on a Windows machine)

```bash
npm run build:win
```

Output: `dist/Mockup Generator Setup 1.0.0.exe`

Standard installer — double-click to install, choose install directory.

---

### Linux

```bash
npm run build:linux
```

Output: `dist/Mockup Generator-1.0.0.AppImage`

```bash
chmod +x "Mockup Generator-1.0.0.AppImage"
./"Mockup Generator-1.0.0.AppImage"
```

---

## How to Use

1. **Section 1 — Base Images:** Click **Add Images** to select one or more curtain/product photos (JPG, PNG, WebP)
2. **Section 2 — Design Patterns:** Click **Add Patterns** to select one or more fabric pattern images
3. **Section 3 — Settings:**
   - Enter a **Catalogue Name** (used as a folder name prefix)
   - Click **Browse** to select the output destination folder
   - Choose a **Pattern Scale** mode
   - Optionally enter a **Gemini API Key** if you want to use your own key
4. Click **Generate Mockups**

The app calls the API once for every base × pattern combination. For 4 base images and 5 patterns that's 20 API calls.

**Output folder structure:**
```
destination/
  {CatalogueName}{PatternName}/
    1.png    ← base image 1 + this pattern
    2.png    ← base image 2 + this pattern
    3.png    ← base image 3 + this pattern
  {CatalogueName}{Pattern2Name}/
    1.png
    2.png
    3.png
```

---

## Pattern Scale Modes

| Mode | Description |
|---|---|
| `a4-scan` | Realistic proportions for standard drapes (default) |
| `fine-detail` | Micro-tiled for dense patterns |
| `large-accent` | Prominent large-scale motifs |

---

## API Key

The app connects to the Fabric Fusion API which has a default Gemini key configured server-side. You can optionally override it per-session by entering your own [Gemini API key](https://aistudio.google.com/apikey) in the header and clicking **Save Key**. The key is stored locally on your machine and never sent anywhere except the API endpoint.

---

## Project Structure

```
Mockup-Gen/
├── main.js          # Electron main process — window, IPC handlers, API calls, file I/O
├── preload.js       # Context bridge between main and renderer
├── index.html       # App UI markup
├── styles.css       # Styles
├── renderer.js      # UI logic and in-app console
├── build/
│   └── afterSign.js # Post-build hook — ad-hoc signs the .app before DMG packaging
└── package.json
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | [Electron](https://electronjs.org) | v33 (bundles Node.js v20 + Chromium 130) |
| Build tooling | [electron-builder](https://www.electron.build) | v25 |
| Image generation | Fabric Fusion API (Google Gemini backend) | — |
| Frontend | Vanilla JS / HTML / CSS | — |
| Runtime deps | None | Uses Node.js built-ins only (`fs`, `https`, `path`) |
