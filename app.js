const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playlistElement = document.getElementById('playlist');
const clearBtn = document.getElementById('clear-db-btn');

const aboutTitle = document.getElementById('about-title'), aboutArtist = document.getElementById('about-artist'), aboutCover = document.getElementById('about-cover');
const miniTitle = document.getElementById('mini-title'), miniArtist = document.getElementById('mini-artist'), miniCover = document.getElementById('mini-cover');

const playPauseBtn = document.getElementById('play-pause-btn'), playIcon = document.getElementById('play-icon'), pauseIcon = document.getElementById('pause-icon');
const prevBtn = document.getElementById('prev-btn'), nextBtn = document.getElementById('next-btn'), shuffleBtn = document.getElementById('shuffle-btn');
const progressBar = document.getElementById('progress-bar'), currentTimeEl = document.getElementById('current-time'), totalTimeEl = document.getElementById('total-time');

let playlist = [];
let currentTrackIndex = -1;
let isDraggingProgress = false;
let isShuffle = false;
let playOrder = []; 
let currentOrderIndex = -1;

const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' background='%23282828'><rect width='100%' height='100%' fill='%23282828'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='40' fill='%23b3b3b3'>🎵</text></svg>";

// --- IndexedDB Setup ---
let db;
const DB_NAME = 'MusicPlayerDB';
const STORE_NAME = 'tracks';

function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    
    request.onsuccess = (e) => {
        db = e.target.result;
        loadLibraryFromDB();
    };
}

function saveTrackToDB(trackRecord) {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(trackRecord);
}

function loadLibraryFromDB() {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        const savedTracks = request.result;
        if (savedTracks && savedTracks.length > 0) {
            savedTracks.forEach(track => {
                track.url = URL.createObjectURL(track.file);
                playlist.push(track);
            });
            updatePlayOrder();
            renderPlaylist();
        }
    };
}

initDB();

// Clear Storage Logic
clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear your saved library?")) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        
        playlist.forEach(track => URL.revokeObjectURL(track.url));
        
        playlist = [];
        currentTrackIndex = -1;
        audioPlayer.pause();
        audioPlayer.src = "";
        updatePlayPauseUI();
        renderPlaylist();
        
        aboutTitle.textContent = "No track playing"; aboutArtist.textContent = "-"; aboutCover.src = defaultCover;
        miniTitle.textContent = "No track selected"; miniArtist.textContent = "-"; miniCover.src = defaultCover;
    }
});

// --- Drag & Drop ---
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
    
    const wasEmpty = playlist.length === 0;

    for (const file of audioFiles) {
        if (playlist.some(t => t.id === file.name)) continue;
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
        playlist.push(trackRecord);
    }

    updatePlayOrder();
    renderPlaylist();
    if (wasEmpty && playlist.length > 0) loadAndPlayTrack(playOrder[0]);
}

// --- Shuffle & Playback Logic ---
function updatePlayOrder() {
    playOrder = playlist.map((_, i) => i);
    if (isShuffle && playlist.length > 0) {
        for (let i = playOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playOrder[i], playOrder[j]] = [playOrder[j], playOrder[i]];
        }
        if (currentTrackIndex !== -1) {
            const currentIndexInOrder = playOrder.indexOf(currentTrackIndex);
            if (currentIndexInOrder > -1) {
                [playOrder[0], playOrder[currentIndexInOrder]] = [playOrder[currentIndexInOrder], playOrder[0]];
                currentOrderIndex = 0;
            }
        }
    } else {
        currentOrderIndex = currentTrackIndex !== -1 ? currentTrackIndex : 0;
    }
}

shuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active-green', isShuffle);
    updatePlayOrder();
});

function renderPlaylist() {
    playlistElement.innerHTML = ''; 
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = `playlist-item ${index === currentTrackIndex ? 'active' : ''}`;
        li.innerHTML = `<span class="track-number">${index + 1}</span><img class="list-cover" src="${track.cover}"><div class="track-info"><div class="track-title">${track.title}</div><div class="track-artist">${track.artist}</div></div>`;
        li.addEventListener('click', () => { currentOrderIndex = playOrder.indexOf(index); loadAndPlayTrack(index); });
        playlistElement.appendChild(li);
    });
}

function loadAndPlayTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];
    
    audioPlayer.src = track.url;
    audioPlayer.play();
    updatePlayPauseUI();
    
    aboutTitle.textContent = track.title; aboutArtist.textContent = track.artist; aboutCover.src = track.cover;
    miniTitle.textContent = track.title; miniArtist.textContent = track.artist; miniCover.src = track.cover;
    renderPlaylist(); 
}

function playNext() {
    if (playlist.length === 0) return;
    currentOrderIndex = (currentOrderIndex + 1) % playOrder.length;
    loadAndPlayTrack(playOrder[currentOrderIndex]);
}

function playPrev() {
    if (playlist.length === 0) return;
    if (audioPlayer.currentTime > 3) audioPlayer.currentTime = 0;
    else {
        currentOrderIndex = currentOrderIndex - 1 < 0 ? playOrder.length - 1 : currentOrderIndex - 1;
        loadAndPlayTrack(playOrder[currentOrderIndex]);
    }
}

playPauseBtn.addEventListener('click', () => {
    if (playlist.length === 0) return;
    audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
    updatePlayPauseUI();
});

function updatePlayPauseUI() {
    playIcon.style.display = audioPlayer.paused ? 'block' : 'none';
    pauseIcon.style.display = audioPlayer.paused ? 'none' : 'block';
}

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);
audioPlayer.addEventListener('ended', playNext);

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