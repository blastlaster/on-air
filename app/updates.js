/* =============================================================
   UPDATES — new versions from the project's GitHub releases.

   Checks a minute after start and every six hours (never in test
   runs or an unpacked copy). A new version downloads quietly in the
   background; then a notification says it's ready, and the tray
   offers "Restart to update". Quitting installs it too. Either way
   On Air opens again on the new version (after a quit, it first
   asks whether to open or close). Where this
   kind of install can't update itself (a .deb, say), the
   notification opens the download page instead.
   ============================================================= */
'use strict';
const { app, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RELEASES = 'https://github.com/blastlaster/on-air/releases/latest';
const EVERY = 6 * 3600e3;

function setup({ icon, onChange, enabled, onInstall }) {
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
        // Not electron-updater's own install-on-quit: that one never reopens the app. Quitting calls install('quit').
        updater.autoInstallOnAppQuit = false;
        // A short log of what the updater did, for when an update misbehaves (userData/logs/updates.log).
        const LOG = path.join(app.getPath('userData'), 'logs', 'updates.log');
        const line = (lv) => (m) => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); if (fs.existsSync(LOG) && fs.statSync(LOG).size > 200e3) fs.renameSync(LOG, LOG + '.old'); fs.appendFileSync(LOG, new Date().toISOString() + ' ' + lv + ' ' + String(m) + '\n'); } catch { /* no log, no matter */ } };
        updater.logger = { info: line('info'), warn: line('warn'), error: line('error'), debug: () => {} };
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
    /** Install the downloaded version and open On Air again on it. how: 'restart' (asked for) or 'quit' (it asks first, then). */
    function install(how) {
        if (state.status !== 'ready') return false;
        if (onInstall) onInstall(state.version, how || 'restart');
        state.status = 'installing'; tell();
        if (process.platform === 'win32') reopenAfter();
        updater.quitAndInstall(true, true);         // quietly, then run the new version
        return true;
    }
    /**
     * The installer starts the new version itself (build/installer.nsh). As a fallback, a small
     * hidden helper waits for this app to close and the installer to finish, then starts On Air
     * if it isn't running yet; it notes what it did in the update log. (Windows; the AppImage reopens itself.)
     */
    function reopenAfter() {
        const q = (x) => "'" + String(x).replace(/'/g, "''") + "'";
        const LOG = path.join(app.getPath('userData'), 'logs', 'updates.log');
        const ps = [
            '$me=' + process.pid + '; $exe=' + q(process.execPath) + '; $name=' + q(path.basename(process.execPath, '.exe')) + '; $log=' + q(LOG) + '; $t=(Get-Date).AddMinutes(4)',
            'function say($m) { try { Add-Content -LiteralPath $log -Value ((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ") + " info reopen helper: " + $m) } catch {} }',
            'say "waiting for On Air to close"',
            'while ((Get-Process -Id $me -EA 0) -and (Get-Date) -lt $t) { Start-Sleep -m 400 }',
            'Start-Sleep -s 3',
            "while ((Get-Date) -lt $t -and (Get-Process -EA 0 | ? { ($_.Path -like '*\\pending\\*') -or ($_.ProcessName -like 'Un_*') })) { Start-Sleep -m 700 }",
            'Start-Sleep -s 3',
            'if (Get-Process -Name $name -EA 0) { say "On Air is running again" } elseif (Test-Path $exe) { say "starting On Air"; Start-Process -FilePath $exe } else { say "On Air is not where it was" }'
        ].join('\n');
        const log = (lv, m) => { if (updater.logger) updater.logger[lv]('reopen helper: ' + m); };
        // Windows PowerShell by its full path: the app's PATH can't be counted on.
        const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        try {
            const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
                { detached: true, stdio: 'ignore', windowsHide: true });
            child.on('error', (e) => log('warn', e.message));
            child.unref();
            log('info', 'started (pid ' + child.pid + ')');
        } catch (e) { log('warn', e.message); }
    }
    setTimeout(check, 60e3).unref?.();
    setInterval(check, EVERY).unref?.();
    return { state, check, install, page };
}

module.exports = { setup, RELEASES };
