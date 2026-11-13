// VOIDBLOOM desktop shell: loads the web build and keeps itself up to date.
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke-test');   // CI: start, check the game booted, exit
let win;

// ---- remembered window preference (fullscreen or windowed) ----
const prefsFile = () => path.join(app.getPath('userData'), 'window-prefs.json');
function loadPrefs() {
  try { return Object.assign({ fullscreen: true }, JSON.parse(fs.readFileSync(prefsFile(), 'utf8'))); }
  catch (e) { return { fullscreen: true }; }
}
function savePrefs(p) {
  try { fs.writeFileSync(prefsFile(), JSON.stringify(p)); } catch (e) { /* not worth interrupting play */ }
}
function setFullscreen(on) {
  if (!win) return false;
  win.setFullScreen(!!on);
  savePrefs({ fullscreen: !!on });
  return !!on;
}

function createWindow() {
  const prefs = loadPrefs();
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#04050c',
    title: 'VOIDBLOOM',
    autoHideMenuBar: true,
    show: !SMOKE,
    fullscreen: !SMOKE && prefs.fullscreen,   // F11 or Settings switches to a window
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  // F11 toggles fullscreen, F12 opens devtools.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { setFullscreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // links never open inside the game window
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (SMOKE) runSmokeTest();
}

ipcMain.handle('vb:is-fullscreen', () => !!(win && win.isFullScreen()));
ipcMain.handle('vb:set-fullscreen', (e, on) => setFullscreen(on));

// ---- CI smoke test: did the page load, did the game boot, does the bridge work? ----
function runSmokeTest() {
  const fail = why => { console.error('SMOKE TEST FAILED: ' + why); app.exit(1); };
  const timer = setTimeout(() => fail('timed out'), 30000);
  win.webContents.on('did-fail-load', (e, code, desc) => fail('page failed to load: ' + desc));
  win.webContents.on('render-process-gone', () => fail('renderer crashed'));
  win.webContents.on('did-finish-load', async () => {
    try {
      await new Promise(r => setTimeout(r, 1500));
      const r = await win.webContents.executeJavaScript(`(async () => ({
        game: typeof G !== 'undefined' && G.state,
        ships: document.querySelectorAll('.char-card').length,
        version: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : null,
        bridge: !!window.desktop && typeof (await window.desktop.isFullscreen()) === 'boolean' &&
                (await window.desktop.setFullscreen(false)) === false,
        desktopClass: document.body.classList.contains('is-desktop-app'),
      }))()`);
      clearTimeout(timer);
      console.log('SMOKE TEST RESULT: ' + JSON.stringify(r));
      const ok = r.game === 'title' && r.ships >= 3 && r.bridge && r.desktopClass && r.version === app.getVersion();
      if (!ok) return fail('unexpected state ' + JSON.stringify(r) + ' (app version ' + app.getVersion() + ')');
      console.log('SMOKE TEST PASSED');
      app.exit(0);
    } catch (err) { fail(String(err)); }
  });
}

// ---- auto-update from GitHub Releases ----
// Only for copies installed with the Setup .exe. Store builds (Steam, itch.io) ship
// without app-update.yml because the store updates them; the portable .exe can't self-update.
function setupUpdates() {
  if (SMOKE || !app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = true;              // fetch quietly in the background
  autoUpdater.autoInstallOnAppQuit = true;      // if you say "later", it installs when you quit
  autoUpdater.on('update-downloaded', async info => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'VOIDBLOOM update',
      message: `VOIDBLOOM ${info.version} is ready to install.`,
      detail: 'Restart now to update? Your progress is kept. If you choose Later, it installs when you close the game.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => { /* offline or GitHub unreachable: just play the current version */ });
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => { createWindow(); setupUpdates(); });
app.on('window-all-closed', () => app.quit());
