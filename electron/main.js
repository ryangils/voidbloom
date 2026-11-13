// VOIDBLOOM desktop shell: loads the web build and keeps itself up to date.
const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#04050c',
    title: 'VOIDBLOOM',
    autoHideMenuBar: true,
    fullscreen: true,          // launch fullscreen; F11 toggles back to a window
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  // F11 toggles fullscreen, F12 opens devtools.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
}

// ---- auto-update from GitHub Releases (installed copies only, not the portable .exe) ----
function setupUpdates() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
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
