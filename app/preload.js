/* =============================================================
   The bridge between the app's pages and the app around them.

   Sandboxed: the pages get only these calls. The radio and its
   windows share one process (the radio opens them), but each has
   its own copy of this bridge, so the app always knows which
   window is asking.
   ============================================================= */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const listen = (ch) => (fn) => {
    const h = (e, ...a) => fn(...a);
    ipcRenderer.on(ch, h);
    return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('onairApp', {
    isApp: true,
    // Settings, for the whole app and for this window
    ui: () => ipcRenderer.invoke('ui'),
    setUi: (patch) => ipcRenderer.invoke('ui-set', patch),
    onUi: listen('ui'),
    setWin: (patch) => ipcRenderer.send('win-set', patch),
    onWin: listen('win'),
    onFullscreen: listen('fullscreen'),
    board: (cmd, arg) => ipcRenderer.send('board', cmd, arg),
    iface: (req) => ipcRenderer.invoke('iface-req', req),
    ifaceToken: (server, token, station) => ipcRenderer.invoke('iface-token', server, token, station),
    boardGoto: (url) => ipcRenderer.send('board-goto', url),
    onBoardBlocked: listen('board-blocked'),
    boardClip: (anyLink) => ipcRenderer.invoke('board-clip', !!anyLink),
    boardPosts: () => ipcRenderer.invoke('board-posts'),
    onBoardPosted: listen('board-posted'),
    saveImage: (url, name) => ipcRenderer.invoke('save-image', url, name),
    imageMenu: (url, name) => ipcRenderer.send('image-menu', url, name),
    onToast: listen('toast'),
    scripts: {
        list: () => ipcRenderer.invoke('us-list'),
        fetch: (url) => ipcRenderer.invoke('us-fetch', url),
        install: (key) => ipcRenderer.invoke('us-install', key),
        set: (id, on) => ipcRenderer.invoke('us-set', id, on),
        remove: (id) => ipcRenderer.invoke('us-remove', id)
    },
    winCmd: (cmd, arg) => ipcRenderer.send('win-cmd', cmd, arg),
    pickFolder: () => ipcRenderer.invoke('pick-folder'),
    updateCmd: (cmd) => ipcRenderer.invoke('update-cmd', cmd),
    // The radio: its windows, and what the tray asks of it
    element: (id, show) => ipcRenderer.send('element', id, show),
    onElements: listen('elements'),
    onOpenElement: listen('open-element'),
    onTogglePlay: listen('toggle-play'),
    onPlay: listen('play'),
    status: (s) => ipcRenderer.send('page-status', s),
    ping: (p) => ipcRenderer.send('ping', p),
    // Fetching what a station publishes (its site may not allow pages to read it directly)
    getJSON: (url) => ipcRenderer.invoke('get-json', url),
    skipVote: (musicId) => ipcRenderer.invoke('skip-vote', musicId),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    // Albums
    download: (job) => ipcRenderer.invoke('download-album', job),
    stopDownload: (key) => ipcRenderer.invoke('download-stop', key),
    onDownload: listen('download'),
    showFolder: (dir) => ipcRenderer.invoke('show-folder', dir),
    // The stations screen
    addStation: (url) => ipcRenderer.invoke('add-station', url),
    stations: () => ipcRenderer.invoke('stations'),
    pickStation: (i) => ipcRenderer.invoke('pick-station', i),
    removeStation: (i) => ipcRenderer.invoke('remove-station', i),
    setIcon: (i) => ipcRenderer.invoke('set-icon', i),
    resetIcon: (i) => ipcRenderer.invoke('reset-icon', i),
    stationsWindow: () => ipcRenderer.invoke('stations-window'),
    back: () => ipcRenderer.send('back')
});
