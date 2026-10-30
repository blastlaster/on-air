/* The radio's windows, in the order of its buttons. `needs` = only when the
   station offers it (its extras.json, or what the studio says). */
window.ELEMENTS = [
    { id: 'chat', icon: '💬', label: 'Chat', about: 'The live room during a show, the community chat the rest of the time' },
    { id: 'request', icon: '🎵', label: 'Request', about: 'Search the station’s music and ask for a song', needs: 'requests' },
    { id: 'playlist', icon: '🕘', label: 'Playlist', about: 'Coming up next, and what just played' },
    { id: 'studio', icon: '📞', label: 'Call in', about: 'Call the show, leave a voicemail, check in as a guest, see who is on the line' },
    { id: 'banner', icon: '📟', label: 'Sign', about: 'The station’s LED sign, as its own strip — park it anywhere' },
    { id: 'albums', icon: '📀', label: 'Albums', about: 'The station’s albums: play them here, or download them', needs: 'albums' },
    { id: 'board', icon: '📋', label: 'Board', about: 'The station’s message board (18+)', needs: 'board', nsfw: true },
    { id: 'tv', icon: '📺', label: 'TV', about: 'The station’s video stream when it is on (its channel when it is not)', needs: 'tv' },
    { id: 'interface', icon: '🟩', label: 'Interface', about: 'The board with its green posts and the community’s green threads', needs: 'board', nsfw: true, secret: true },
    { id: 'links', icon: '💫', label: 'Links', about: 'The station’s friends and links', needs: 'links' },
    { id: 'settings', icon: '⚙️', label: 'Settings', about: 'Looks, text size, windows, effects, downloads', always: true }
];
