const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playlistElement = document.getElementById('playlist');
const clearBtn = document.getElementById('clear-db-btn');
const mainViewTitle = document.getElementById('main-view-title');

const aboutTitle = document.getElementById('about-title'), aboutArtist = document.getElementById('about-artist'), aboutCover = document.getElementById('about-cover');
const miniTitle = document.getElementById('mini-title'), miniArtist = document.getElementById('mini-artist'), miniCover = document.getElementById('mini-cover');

const playPauseBtn = document.getElementById('play-pause-btn'), playIcon = document.getElementById('play-icon'), pauseIcon = document.getElementById('pause-icon');
const prevBtn = document.getElementById('prev-btn'), nextBtn = document.getElementById('next-btn'), shuffleBtn = document.getElementById('shuffle-btn');
const progressBar = document.getElementById('progress-bar'), currentTimeEl = document.getElementById('current-time'), totalTimeEl = document.getElementById('total-time');

// Playlist UI Elements
const navLibrary = document.getElementById('nav-library');
const btnNewPlaylist = document.getElementById('btn-new-playlist');
const sidebarPlaylists = document.getElementById('sidebar-playlists');
const playlistModal = document.getElementById('playlist-modal');
const modalPlaylistOptions = document.getElementById('modal-playlist-options');
const closeModalBtn = document.getElementById('close-modal-btn');

let allLibraryTracks = []; // Master list of everything in DB
let activeViewTracks = []; // The tracks currently shown on screen
let savedPlaylists = []; // Array of user-created playlists
let currentViewId = 'library'; // 'library' or a playlist ID

let currentPlayingTrack = null; 
let isDraggingProgress = false;
let isShuffle = false;
let playOrder = []; 
let currentOrderIndex = -1;

let trackIdToAdd = null; // Stores ID temporarily when opening the modal

const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' background='%23282828'><rect width='100%' height='100%' fill='%23282828'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='40' fill='%23b3b3b3'>🎵</text></svg>";

// --- IndexedDB Setup ---
let db;
const DB_NAME = 'MusicPlayerDB';
const STORE_TRACKS = 'tracks';
const STORE_PLAYLISTS = 'playlists';

function initDB() {
    // Upgraded DB version to 2 to add playlists
    const request = indexedDB.open(DB_NAME, 2);
    
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_TRACKS)) db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
    };
    
    request.onsuccess = (e) => {
        db = e.target.result;
        loadDataFromDB();
    };
}

function loadDataFromDB() {
    if (!db) return;
    const trans = db.transaction([STORE_TRACKS, STORE_PLAYLISTS], 'readonly');
    
    const trackStore = trans.objectStore(STORE_TRACKS);
    trackStore.getAll().onsuccess = (e) => {
        allLibraryTracks = e.target.result || [];
        allLibraryTracks.forEach(track => track.url = URL.createObjectURL(track.file));
        
        const playlistStore = trans.objectStore(STORE_PLAYLISTS);
        playlistStore.getAll().onsuccess = (e2) => {
            savedPlaylists = e2.target.result || [];
            
            renderSidebarPlaylists();
            switchView('library');
        };
    };
}

function saveTrackToDB(trackRecord) {
    if (!db) return;
    db.transaction([STORE_TRACKS], 'readwrite').objectStore(STORE_TRACKS).put(trackRecord);
}

function savePlaylistToDB(playlistObj) {
    if (!db) return;
    db.transaction([STORE_PLAYLISTS], 'readwrite').objectStore(STORE_PLAYLISTS).put(playlistObj);
}

initDB();

// --- Sidebar & Views Logic ---
btnNewPlaylist.addEventListener('click', () => {
    const name = prompt("Enter a name for your new playlist:");
    if (name && name.trim() !== "") {
        const newPlaylist = {
            id: 'pl_' + Date.now(),
            name: name.trim(),
            trackIds: []
        };
        savedPlaylists.push(newPlaylist);
        savePlaylistToDB(newPlaylist);
        renderSidebarPlaylists();
        switchView(newPlaylist.id);
    }
});

navLibrary.addEventListener('click', () => switchView('library'));

function renderSidebarPlaylists() {
    sidebarPlaylists.innerHTML = '';
    savedPlaylists.forEach(pl => {
        const li = document.createElement('li');
        li.className = `playlist-nav-item ${currentViewId === pl.id ? 'active' : ''}`;
        li.textContent = pl.name;
        li.addEventListener('click', () => switchView(pl.id));
        sidebarPlaylists.appendChild(li);
    });
}

function switchView(viewId) {
    currentViewId = viewId;
    
    // Update active classes
    navLibrary.classList.toggle('active', viewId === 'library');
    document.querySelectorAll('.playlist-nav-item').forEach(el => {
        el.classList.remove('active');
        if (el.textContent === savedPlaylists.find(p => p.id === viewId)?.name) {
            el.classList.add('active');
        }
    });

    if (viewId === 'library') {
        mainViewTitle.textContent = "Your Library";
        activeViewTracks = [...allLibraryTracks];
    } else {
        const pl = savedPlaylists.find(p => p.id === viewId);
        mainViewTitle.textContent = pl ? pl.name : "Playlist";
        // Filter the library tracks by the IDs saved in this playlist
        activeViewTracks = allLibraryTracks.filter(t => pl.trackIds.includes(t.id));
    }
    
    updatePlayOrder();
    renderMainTrackList();
}

// --- Main Track List Rendering ---
function renderMainTrackList() {
    playlistElement.innerHTML = ''; 
    activeViewTracks.forEach((track, index) => {
        const isPlaying = currentPlayingTrack && currentPlayingTrack.id === track.id;
        
        const li = document.createElement('li');
        li.className = `playlist-item ${isPlaying ? 'active' : ''}`;
        
        li.innerHTML = `
            <span class="track-number">${index + 1}</span>
            <img class="list-cover" src="${track.cover}">
            <div class="track-info">
                <div class="track-title">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
            </div>
            <button class="add-to-playlist-btn" title="Add to Playlist">➕</button>
        `;
        
        // Play song on click
        li.addEventListener('click', (e) => {
            // Prevent playing if they clicked the add button
            if(e.target.classList.contains('add-to-playlist-btn')) return; 
            currentOrderIndex = playOrder.indexOf(index); 
            loadAndPlayTrack(index); 
        });

        // Add button logic
        const addBtn = li.querySelector('.add-to-playlist-btn');
        addBtn.addEventListener('click', () => openPlaylistModal(track.id));

        playlistElement.appendChild(li);
    });
}

// --- Playlist Modal Logic ---
function openPlaylistModal(trackId) {
    trackIdToAdd = trackId;
    modalPlaylistOptions.innerHTML = '';
    
    if (savedPlaylists.length === 0) {
        modalPlaylistOptions.innerHTML = '<li style="color:var(--text-sub);">No playlists created yet. Create one on the left!</li>';
    } else {
        savedPlaylists.forEach(pl => {
            const li = document.createElement('li');
            li.className = 'modal-playlist-item';
            li.textContent = pl.name;
            li.addEventListener('click', () => {
                if (!pl.trackIds.includes(trackIdToAdd)) {
                    pl.trackIds.push(trackIdToAdd);
                    savePlaylistToDB(pl);
                    // Refresh view if we are currently looking at that playlist
                    if(currentViewId === pl.id) switchView(pl.id);
                }
                playlistModal.style.display = 'none';
            });
            modalPlaylistOptions.appendChild(li);
        });
    }
    playlistModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => playlistModal.style.display = 'none');

// --- Playback Logic ---
function loadAndPlayTrack(index) {
    if (index < 0 || index >= activeViewTracks.length) return;
    
    currentPlayingTrack = activeViewTracks[index];
    
    audioPlayer.src = currentPlayingTrack.url;
    audioPlayer.play();
    updatePlayPauseUI();
    
    aboutTitle.textContent = currentPlayingTrack.title; aboutArtist.textContent = currentPlayingTrack.artist; aboutCover.src = currentPlayingTrack.cover;
    miniTitle.textContent = currentPlayingTrack.title; miniArtist.textContent = currentPlayingTrack.artist; miniCover.src = currentPlayingTrack.cover;
    
    renderMainTrackList(); 
}

function updatePlayOrder() {
    playOrder = activeViewTracks.map((_, i) => i);
    if (isShuffle && activeViewTracks.length > 0) {
        for (let i = playOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playOrder[i], playOrder[j]] = [playOrder[j], playOrder[i]];
        }
        if (currentPlayingTrack) {
            const currentIndexInActive = activeViewTracks.findIndex(t => t.id === currentPlayingTrack.id);
            const currentIndexInOrder = playOrder.indexOf(currentIndexInActive);
            if (currentIndexInOrder > -1) {
                [playOrder[0], playOrder[currentIndexInOrder]] = [playOrder[currentIndexInOrder], playOrder[0]];
                currentOrderIndex = 0;
            }
        }
    } else {
        if (currentPlayingTrack) {
            currentOrderIndex = activeViewTracks.findIndex(t => t.id === currentPlayingTrack.id);
        } else {
            currentOrderIndex = 0;
        }
    }
}

shuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active-green', isShuffle);
    updatePlayOrder();
});

function playNext() {
    if (activeViewTracks.length === 0) return;
    currentOrderIndex = (currentOrderIndex + 1) % playOrder.length;
    loadAndPlayTrack(playOrder[currentOrderIndex]);
}

function playPrev() {
    if (activeViewTracks.length === 0) return;
    if (audioPlayer.currentTime > 3) audioPlayer.currentTime = 0;
    else {
        currentOrderIndex = currentOrderIndex - 1 < 0 ? playOrder.length - 1 : currentOrderIndex - 1;
        loadAndPlayTrack(playOrder[currentOrderIndex]);
    }
}

playPauseBtn.addEventListener('click', () => {
    if (!currentPlayingTrack && activeViewTracks.length > 0) loadAndPlayTrack(playOrder[0]);
    else if (currentPlayingTrack) audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
    updatePlayPauseUI();
});

function updatePlayPauseUI() {
    playIcon.style.display = audioPlayer.paused ? 'block' : 'none';
    pauseIcon.style.display = audioPlayer.paused ? 'none' : 'block';
}

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);
audioPlayer.addEventListener('ended', playNext);

// --- File Handling ---
dropZone.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    document.body.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
});
['dragenter', 'dragover'].forEach(eventName => dropZone.classList.add('dragover'));
['dragleave', 'drop'].forEach(eventName => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function extractTags(file) {
    return new Promise((resolve) => {
        if (!window.jsmediatags) return resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: "Unknown Artist", cover: defaultCover });
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                let coverUrl = defaultCover;
                if (tag.tags.picture) {
                    let base64 = "";
                    for (let i = 0; i < tag.tags.picture.data.length; i++) base64 += String.fromCharCode(tag.tags.picture.data[i]);
                    coverUrl = `data:${tag.tags.picture.format};base64,${window.btoa(base64)}`;
                }
                resolve({ title: tag.tags.title || file.name.replace(/\.[^/.]+$/, ""), artist: tag.tags.artist || "Unknown", cover: coverUrl });
            },
            onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: "Unknown", cover: defaultCover })
        });
    });
}

async function handleFiles(files) {
    const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
    if (audioFiles.length === 0) return;
    
    let addedCount = 0;

    for (const file of audioFiles) {
        if (allLibraryTracks.some(t => t.id === file.name)) continue;
        const tags = await extractTags(file);
        
        const trackRecord = {
            id: file.name,
            file: file,
            title: tags.title,
            artist: tags.artist,
            cover: tags.cover
        };
        
        saveTrackToDB(trackRecord);
        trackRecord.url = URL.createObjectURL(file);
        allLibraryTracks.push(trackRecord);
        addedCount++;
    }

    if(addedCount > 0) {
        // If they drop files while viewing a custom playlist, jump back to Library to show the new files
        if (currentViewId !== 'library') {
            switchView('library');
        } else {
            switchView('library'); // Just re-renders it properly
        }
    }
}

// Clear Entire DB (Nuclear Option)
clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to completely clear your saved library AND all playlists?")) {
        const trans = db.transaction([STORE_TRACKS, STORE_PLAYLISTS], 'readwrite');
        trans.objectStore(STORE_TRACKS).clear();
        trans.objectStore(STORE_PLAYLISTS).clear();
        
        allLibraryTracks.forEach(track => URL.revokeObjectURL(track.url));
        
        allLibraryTracks = [];
        savedPlaylists = [];
        currentPlayingTrack = null;
        
        audioPlayer.pause();
        audioPlayer.src = "";
        updatePlayPauseUI();
        
        aboutTitle.textContent = "No track playing"; aboutArtist.textContent = "-"; aboutCover.src = defaultCover;
        miniTitle.textContent = "No track selected"; miniArtist.textContent = "-"; miniCover.src = defaultCover;
        
        renderSidebarPlaylists();
        switchView('library');
    }
});

// --- Progress Bar ---
function formatTime(s) { if (isNaN(s)) return "0:00"; const m = Math.floor(s/60), secs = Math.floor(s%60); return `${m}:${secs<10?'0':''}${secs}`; }

audioPlayer.addEventListener('timeupdate', () => {
    if (isDraggingProgress || !audioPlayer.duration) return; 
    const p = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = p; progressBar.style.setProperty('--val', `${p}%`);
    progressBar.style.background = `linear-gradient(to right, var(--text-main) ${p}%, var(--progress-bg) ${p}%)`;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime); totalTimeEl.textContent = formatTime(audioPlayer.duration);
});

progressBar.addEventListener('mousedown', () => isDraggingProgress = true);

progressBar.addEventListener('input', () => {
    const p = progressBar.value; progressBar.style.setProperty('--val', `${p}%`);
    progressBar.style.background = `linear-gradient(to right, var(--spotify-green) ${p}%, var(--progress-bg) ${p}%)`;
    if (audioPlayer.duration) currentTimeEl.textContent = formatTime((p/100) * audioPlayer.duration);
});

progressBar.addEventListener('change', () => { 
    if (audioPlayer.duration) audioPlayer.currentTime = (progressBar.value/100) * audioPlayer.duration; 
    isDraggingProgress = false; 
});
