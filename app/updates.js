/* =============================================================
   UPDATES — new versions from the project's GitHub releases.

   Checks a minute after start and every six hours (never in test
   runs or an unpacked copy). A new version downloads quietly in the
   background; then a notification says it's ready, and the tray
   offers "Restart to update". Quitting installs it too. Where this
   kind of install can't update itself (a .deb, say), the
   notification opens the download page instead.
   ============================================================= */
'use strict';
const { app, Notification, shell } = require('electron');

const RELEASES = 'https://github.com/blastlaster/on-air/releases/latest';
const EVERY = 6 * 3600e3;

function setup({ icon, onChange, enabled }) {
    const state = { status: 'idle', version: '', error: '' };       // idle | checking | downloading | ready | none | error | manual
    const tell = () => onChange && onChange({ ...state });
    const page = () => shell.openExternal(RELEASES);
    if (!app.isPackaged || process.env.ONAIR_SMOKE) return { state, check: async () => {}, install() {}, page };

    let updater = null;
    try { updater = require('electron-updater').autoUpdater; } catch { /* not bundled */ }
    // Self-updating works for the Windows installer and the AppImage; anything else gets a link.
    const canSelf = !!updater && (process.platform === 'win32' || !!process.env.APPIMAGE);
    if (updater) {
        updater.autoDownload = canSelf;
        updater.autoInstallOnAppQuit = true;
        updater.logger = null;
        updater.on('checking-for-update', () => { state.status = 'checking'; tell(); });
        updater.on('update-not-available', () => { state.status = 'none'; tell(); });
        updater.on('update-available', (i) => {
            state.version = i.version;
            state.status = canSelf ? 'downloading' : 'manual';
            tell();
            if (!canSelf) notify(`On Air ${i.version} is out`, 'Click to download it.', page);
        });
        updater.on('update-downloaded', (i) => {
            state.version = i.version; state.status = 'ready'; tell();
            notify(`On Air ${i.version} is ready`, 'Click to restart and update (or it installs next time you quit).', install);
        });
        updater.on('error', (e) => { state.status = 'error'; state.error = String(e && e.message || e).slice(0, 200); tell(); });
    }
    function notify(title, body, click) {
        if (!Notification.isSupported()) return;
        const n = new Notification({ title, body, icon: icon(), silent: true });          // the live alert stays the only sound
        n.on('click', click);
        n.show();
    }
    async function check() {
        if (!updater || !enabled()) return;
        try { await updater.checkForUpdates(); } catch (e) { state.status = 'error'; state.error = String(e.message || e).slice(0, 200); tell(); }
    }
    function install() { if (state.status === 'ready') updater.quitAndInstall(false, true); }
    setTimeout(check, 60e3).unref?.();
    setInterval(check, EVERY).unref?.();
    return { state, check, install, page };
}

module.exports = { setup, RELEASES };
