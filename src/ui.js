import player from './player.js';
import { CURATED_TRACKS } from './tracks.js';
import * as storage from './storage.js';

// Global state for UI
let currentView = 'home';
let playlists = [];
let favoriteTrackIds = [];
let offlineTracks = [];
let isOfflineMode = false;
let selectedTrackForPlaylist = null;
let pendingCustomFile = null;
let trendingTracks = [];

// DOM Elements
const sidebarItems = document.querySelectorAll('.nav-item');
const viewPanels = document.querySelectorAll('.view-panel');
const searchBar = document.getElementById('search-bar');
const offlineModeSwitch = document.getElementById('offline-mode-switch');
const pwaInstallBtn = document.getElementById('pwa-install-btn');

// Catalog / Lists containers
const curatedSongsList = document.getElementById('curated-songs-list');
const favoritesListContainer = document.getElementById('favorites-list-container');
const playlistsListContainer = document.getElementById('playlists-list-container');
const playlistSongsContainer = document.getElementById('playlist-songs-container');
const librarySongsContainer = document.getElementById('library-songs-container');

// Player Bar UI Elements
const playerTrackCover = document.getElementById('player-track-cover');
const playerTrackTitle = document.getElementById('player-track-title');
const playerTrackArtist = document.getElementById('player-track-artist');
const playerPlayPauseBtn = document.getElementById('player-play-pause-btn');
const playPauseSvgIcon = document.getElementById('play-pause-svg-icon');
const playerPrevBtn = document.getElementById('player-prev-btn');
const playerNextBtn = document.getElementById('player-next-btn');
const playerShuffleBtn = document.getElementById('player-shuffle-btn');
const playerRepeatBtn = document.getElementById('player-repeat-btn');
const playerFavBtn = document.getElementById('player-fav-btn');
const playerPlaylistBtn = document.getElementById('player-playlist-btn');
const playerCurrentTime = document.getElementById('player-current-time');
const playerTotalTime = document.getElementById('player-total-time');
const playerProgressContainer = document.getElementById('player-progress-container');
const playerProgressFill = document.getElementById('player-progress-fill');
const playerProgressThumb = document.getElementById('player-progress-thumb');
const playerVolumeBtn = document.getElementById('player-volume-btn');
const volumeIcon = document.getElementById('volume-icon');
const playerVolumeContainer = document.getElementById('player-volume-container');
const playerVolumeFill = document.getElementById('player-volume-fill');
const playerVolumeThumb = document.getElementById('player-volume-thumb');

// Storage Indicators
const storagePercentage = document.getElementById('storage-percentage');
const storageBar = document.getElementById('storage-bar');
const storageDetails = document.getElementById('storage-details');

// Modals
const modalCreatePlaylist = document.getElementById('modal-create-playlist');
const playlistNameInput = document.getElementById('playlist-name-input');
const btnCancelCreatePlaylist = document.getElementById('btn-cancel-create-playlist');
const btnConfirmCreatePlaylist = document.getElementById('btn-confirm-create-playlist');

const modalSelectPlaylist = document.getElementById('modal-select-playlist');
const playlistSelectorListItems = document.getElementById('playlist-selector-list-items');
const btnCloseSelectPlaylist = document.getElementById('btn-close-select-playlist');

const modalEditCustomTrack = document.getElementById('modal-edit-custom-track');
const customTrackTitleInput = document.getElementById('custom-track-title-input');
const customTrackArtistInput = document.getElementById('custom-track-artist-input');
const customTrackAlbumInput = document.getElementById('custom-track-album-input');
const btnCancelCustomTrack = document.getElementById('btn-cancel-custom-track');
const btnConfirmCustomTrack = document.getElementById('btn-confirm-custom-track');

// Drag and drop zone
const dragDropZone = document.getElementById('drag-drop-zone');
const fileUploadInput = document.getElementById('file-upload-input');

// URL import elements
const urlUploadInput = document.getElementById('url-upload-input');
const btnImportUrl = document.getElementById('btn-import-url');
const btnPasteUrl = document.getElementById('btn-paste-url');

// Initialize UI
export async function initUI() {
  await storage.initDB();
  await loadStateFromDB();

  setupNavigation();
  setupPlayerControls();
  setupSliders();
  setupStorageDragAndDrop();
  setupUrlImport();
  setupModals();
  setupOfflineSwitch();
  setupGenrePills();

  // Load Home View by default
  renderHomeView();
  updateStorageMeter();

  // Fetch trending tracks asynchronously
  fetchTrendingTracks().then(() => {
    if (currentView === 'home') {
      renderHomeView();
    }
  });

  // Set up play random button in hero banner
  const playRandomBtn = document.getElementById('hero-play-random-btn');
  if (playRandomBtn) {
    playRandomBtn.addEventListener('click', () => {
      const available = CURATED_TRACKS.filter(track => {
        const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
        if (isOfflineMode && !isDownloaded) return false;
        return true;
      });
      if (available.length > 0) {
        const randomTrack = available[Math.floor(Math.random() * available.length)];
        playTrack(randomTrack, available);
      } else {
        showToast('Tidak ada lagu yang tersedia untuk diputar.', 'error');
      }
    });
  }

  // Listen to player updates
  player.addEventListener('trackchange', handleTrackChange);
  player.addEventListener('playstate', handlePlayStateChange);
  player.addEventListener('timeupdate', handleTimeUpdate);
  player.addEventListener('volumechange', handleVolumeChange);

  // Sync initial volume
  player.setVolume(0.8);
  updateVolumeUI(0.8);

  setupSearchScrollListener();

  showToast('Selamat datang di JeffPlay!', 'info');
}

// ==========================================
// DB STATE LOADING & SYNC
// ==========================================
async function loadStateFromDB() {
  try {
    playlists = await storage.getPlaylists();
    favoriteTrackIds = await storage.getFavorites();
    offlineTracks = await storage.getOfflineTracks();
  } catch (e) {
    console.error('Failed to load initial data from DB', e);
  }
}

async function refreshOfflineState() {
  offlineTracks = await storage.getOfflineTracks();
  updateStorageMeter();
}

// ==========================================
// NAVIGATION CONTROLLERS
// ==========================================
function setupNavigation() {
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });

  let searchDebounceTimer = null;

  searchBar.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Auto-filter local view for tiny queries
    filterTracks(query.toLowerCase());

    // Debounce global online search
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (query.length > 2) {
      searchDebounceTimer = setTimeout(() => {
        triggerGlobalSearch(query);
      }, 700); // 700ms debounce
    } else if (query.length === 0) {
      switchView('home');
    }
  });

  searchBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchBar.value.trim();
      if (query) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        triggerGlobalSearch(query);
      }
    }
  });
}

function switchView(viewName) {
  currentView = viewName;
  
  // Update Active navigation item
  sidebarItems.forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch visible views
  viewPanels.forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active-view');
    } else {
      panel.classList.remove('active-view');
    }
  });

  // Load specific view content
  switch (viewName) {
    case 'home':
      renderHomeView();
      break;
    case 'favorites':
      renderFavoritesView();
      break;
    case 'playlists':
      renderPlaylistsView();
      break;
    case 'library':
      renderLibraryView();
      break;
  }
}

// ==========================================
// TRACK RENDERERS & ACTIONS
// ==========================================
function renderHomeView() {
  const query = searchBar.value.trim().toLowerCase();
  
  const pillsContainer = document.getElementById('genre-pills-container');
  if (pillsContainer) {
    pillsContainer.style.display = 'none'; // Hide genre pills
  }

  // Handle Category Playlists Section visibility and rendering
  const catContainer = document.getElementById('category-playlists-container');
  if (catContainer) {
    const parentSection = catContainer.parentElement;
    if (query || isOfflineMode) {
      if (parentSection) parentSection.style.display = 'none';
    } else {
      if (parentSection) parentSection.style.display = 'block';
      renderCategoryPlaylists();
    }
  }

  if (!curatedSongsList) return;
  curatedSongsList.innerHTML = '';

  // Determine source list based on offline mode
  const sourceTracks = isOfflineMode ? offlineTracks : trendingTracks;

  if (!isOfflineMode && trendingTracks.length === 0) {
    curatedSongsList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="spinner" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--accent-color); border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 15px auto;"></div>
        <p>Memuat lagu hits terpopuler...</p>
      </div>
    `;
    return;
  }

  // Filter based on search query
  const filtered = sourceTracks.filter(track => {
    if (query) {
      return track.title.toLowerCase().includes(query) || 
             track.artist.toLowerCase().includes(query) || 
             track.album.toLowerCase().includes(query);
    }
    return true;
  });

  if (filtered.length === 0) {
    curatedSongsList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
        <h3>Tidak Ada Lagu</h3>
        <p>${isOfflineMode ? 'Library offline Anda kosong.' : 'Cari dengan kata kunci lain.'}</p>
      </div>
    `;
    return;
  }

  filtered.forEach(track => {
    const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
    const card = document.createElement('div');
    card.className = 'track-card';
    card.setAttribute('data-id', track.id);
    card.setAttribute('data-color', track.themeColor || '#ff007f');

    const coverSrc = track.coverBlob 
      ? URL.createObjectURL(track.coverBlob) 
      : (track.coverUrl || '/default_cover.png');

    card.innerHTML = `
      <div class="card-badges">
        ${isDownloaded ? `
          <div class="badge downloaded" title="Tersedia Offline">
            <svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
          </div>
        ` : ''}
      </div>
      <div class="card-img-container">
        <img class="card-img" src="${coverSrc}" alt="${track.title}" loading="lazy" />
        <div class="card-overlay">
          <div class="play-btn-card">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
      <div class="card-info">
        <span class="card-title">${track.title}</span>
        <span class="card-artist">${track.artist}</span>
      </div>
    `;

    card.querySelector('.play-btn-card').addEventListener('click', (e) => {
      e.stopPropagation();
      playTrack(track, filtered);
    });

    card.addEventListener('click', () => {
      playTrack(track, filtered);
    });

    curatedSongsList.appendChild(card);
  });
}

async function fetchAudiusGenreTracks(genre) {
  try {
    const targetUrl = `https://api.audius.co/v1/tracks/trending?genre=${encodeURIComponent(genre)}&limit=20&app_name=JEFFPLAY`;
    const proxyUrl = `/proxy-api?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Audius genre tracks: ${response.status}`);
    }
    const resData = await response.json();
    return (resData.data || [])
      .filter(item => item.is_streamable)
      .map(item => {
        const streamUrl = `https://api.audius.co/v1/tracks/${item.id}/stream?app_name=JEFFPLAY`;
        return {
          id: `audius_${item.id}`,
          title: item.title,
          artist: item.user?.name || 'Artis Audius',
          album: `${genre} Hits`,
          duration: item.duration || 0,
          coverUrl: item.artwork ? item.artwork['150x150'] : '/default_cover.png',
          audioUrl: `/proxy-api?url=${encodeURIComponent(streamUrl)}`,
          source: 'audius',
          trackId: item.id,
          themeColor: '#ff007f'
        };
      });
  } catch (err) {
    console.error(`Error fetching Audius genre ${genre} tracks:`, err);
    throw err;
  }
}

function renderCategoryPlaylists() {
  const container = document.getElementById('category-playlists-container');
  if (!container) return;
  
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '30px';
  container.style.gridColumn = '1 / -1';
  
  const ONLINE_HITS_PLAYLISTS = [
    {
      id: "audius_genre_pop",
      name: "Pop Hits",
      genre: "Pop",
      coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=350&auto=format&fit=crop",
      desc: "Lagu pop online terpopuler minggu ini",
      source: "audius_genre"
    },
    {
      id: "audius_genre_electronic",
      name: "Electronic & Dance",
      genre: "Electronic",
      coverUrl: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=350&auto=format&fit=crop",
      desc: "Ketukan elektronik energik & dance hits",
      source: "audius_genre"
    },
    {
      id: "audius_genre_hiphop",
      name: "Hip-Hop & Rap",
      genre: "Hip-Hop/Rap",
      coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=350&auto=format&fit=crop",
      desc: "Alunan hip-hop dan rap online terpopuler",
      source: "audius_genre"
    },
    {
      id: "audius_genre_rock",
      name: "Rock & Alternative",
      genre: "Rock",
      coverUrl: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=350&auto=format&fit=crop",
      desc: "Lagu rock dan alternatif online terbaik",
      source: "audius_genre"
    },
    {
      id: "audius_genre_jazz",
      name: "Jazz & Blues",
      genre: "Jazz",
      coverUrl: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=350&auto=format&fit=crop",
      desc: "Musik jazz santai untuk bersantai",
      source: "audius_genre"
    }
  ];

  const ONLINE_CHILL_PLAYLISTS = [
    {
      id: "audius_genre_lofi",
      name: "Lofi & Chill",
      genre: "Lofi",
      coverUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?q=80&w=350&auto=format&fit=crop",
      desc: "Lofi beats rileks untuk fokus & tidur",
      source: "audius_genre"
    },
    {
      id: "audius_genre_ambient",
      name: "Ambient Sleep",
      genre: "Ambient",
      coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=350&auto=format&fit=crop",
      desc: "Musik latar tenang penenang pikiran",
      source: "audius_genre"
    },
    {
      id: "audius_genre_acoustic",
      name: "Acoustic Hits",
      genre: "Acoustic",
      coverUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=350&auto=format&fit=crop",
      desc: "Petikan gitar akustik yang menenangkan",
      source: "audius_genre"
    },
    {
      id: "audius_genre_classical",
      name: "Classical",
      genre: "Classical",
      coverUrl: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?q=80&w=350&auto=format&fit=crop",
      desc: "Komposisi klasik mahakarya dunia",
      source: "audius_genre"
    }
  ];

  const sections = [
    { title: "Rekomendasi Playlist Hits Online 🌟", playlists: ONLINE_HITS_PLAYLISTS },
    { title: "Lagu Santai & Mood Booster 🍹 Chill Hits", playlists: ONLINE_CHILL_PLAYLISTS }
  ];

  sections.forEach(sec => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'home-playlist-section';
    sectionEl.innerHTML = `
      <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 12px; color: #fff; letter-spacing: -0.3px;">${sec.title}</h3>
      <div class="playlists-row-scroll" style="display: flex; overflow-x: auto; gap: 16px; padding: 4px 0 16px 0; scrollbar-width: none;"></div>
    `;

    const rowContainer = sectionEl.querySelector('.playlists-row-scroll');

    sec.playlists.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.setAttribute('data-id', cat.id);
      card.style.flex = '0 0 180px';
      card.style.cursor = 'pointer';

      card.innerHTML = `
        <div class="playlist-card-cover" style="position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; margin-bottom: 8px;">
          <img src="${cat.coverUrl}" alt="${cat.name}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" />
          <div class="card-overlay">
            <div class="play-btn-card">
              <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: #000; margin-left: 2px;"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
        <div class="playlist-card-info">
          <h3 class="playlist-card-title" style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${cat.name}</h3>
          <span class="playlist-card-desc" style="font-size: 12px; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${cat.desc}</span>
        </div>
      `;

      card.querySelector('.play-btn-card').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isOfflineMode) {
          showToast('Tidak dapat memutar playlist online dalam mode offline.', 'error');
          return;
        }
        try {
          showToast(`Mengambil lagu terpopuler dari kategori ${cat.name}...`, 'info');
          const tracks = await fetchAudiusGenreTracks(cat.genre);
          if (tracks.length > 0) {
            playTrack(tracks[0], tracks);
          } else {
            showToast('Kategori kosong atau tidak dapat diakses.', 'error');
          }
        } catch (err) {
          showToast('Gagal memutar playlist.', 'error');
        }
      });

      card.addEventListener('click', () => {
        openPlaylistDetails({
          id: cat.id,
          name: cat.name,
          coverUrl: cat.coverUrl,
          trackIds: [],
          source: cat.source || 'youtube_playlist',
          genre: cat.genre
        });
      });

      rowContainer.appendChild(card);
    });

    container.appendChild(sectionEl);
  });
}
let currentSearchQuery = '';
let currentSearchPage = 1;
let isSearchingMore = false;
let hasMoreSearchResults = true;
let currentSearchYouTubeTracks = [];
let youtubeSearchBuffer = [];

let activeGenreFilter = 'all';

function setupGenrePills() {
  const container = document.getElementById('genre-pills-container');
  if (!container) return;

  const buttons = container.querySelectorAll('.pill-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGenreFilter = btn.getAttribute('data-genre');
      renderHomeView();
    });
  });
}

function renderPopularArtists() {
  const container = document.getElementById('artists-container');
  if (!container) return;
  container.innerHTML = '';

  const artistCounts = {};
  CURATED_TRACKS.forEach(track => {
    artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1;
  });

  const artists = Object.keys(artistCounts).map(name => {
    const firstTrack = CURATED_TRACKS.find(t => t.artist === name);
    return {
      name,
      count: artistCounts[name],
      avatarUrl: firstTrack ? firstTrack.coverUrl : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=200&auto=format&fit=crop'
    };
  });

  artists.forEach(artist => {
    if (isOfflineMode) {
      const artistTracks = CURATED_TRACKS.filter(t => t.artist === artist.name);
      const offlineCount = artistTracks.filter(t => offlineTracks.some(ot => ot.id === t.id)).length;
      if (offlineCount === 0) return;
    }

    const card = document.createElement('div');
    card.className = 'artist-circle-card';
    
    card.innerHTML = `
      <div class="artist-avatar-container">
        <img class="artist-avatar" src="${artist.avatarUrl}" alt="${artist.name}" loading="lazy" />
      </div>
      <span class="artist-circle-name">${artist.name}</span>
      <span class="artist-circle-count">${artist.count} lagu</span>
    `;

    card.addEventListener('click', () => {
      const artistTracks = CURATED_TRACKS.filter(t => t.artist === artist.name);
      if (artistTracks.length > 0) {
        openPlaylistDetails({
          id: `artist_${artist.name.replace(/\s+/g, '_')}`,
          name: artist.name,
          coverUrl: artist.avatarUrl,
          trackIds: artistTracks.map(t => t.id)
        });
      }
    });

    container.appendChild(card);
  });
}

function renderFavoritesView() {
  favoritesListContainer.innerHTML = '';

  const favoriteTracks = [
    ...CURATED_TRACKS,
    ...offlineTracks.filter(ot => ot.source === 'custom')
  ].filter(t => favoriteTrackIds.includes(t.id));

  // Filter if in offline mode
  const filtered = favoriteTracks.filter(track => {
    const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
    const isCustom = track.source === 'custom';
    if (isOfflineMode && !isDownloaded && !isCustom) return false;
    return true;
  });

  if (filtered.length === 0) {
    favoritesListContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        <h3>Belum Ada Favorit</h3>
        <p>Klik tombol hati di lagu yang Anda sukai untuk menambahkannya ke sini.</p>
      </div>
    `;
    return;
  }

  renderTrackList(favoritesListContainer, filtered);
}

function renderLibraryView() {
  librarySongsContainer.innerHTML = '';

  if (offlineTracks.length === 0) {
    librarySongsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
        <h3>Library Offline Kosong</h3>
        <p>Download lagu online atau seret file MP3 lokal Anda ke area atas untuk mendengarkan secara offline.</p>
      </div>
    `;
    return;
  }

  // Library contains custom uploads and downloaded curated tracks
  renderTrackList(librarySongsContainer, offlineTracks);
}

/**
 * Helper to render tracks in a list/table format
 */
function renderTrackList(container, tracksList) {
  container.innerHTML = `
    <div class="list-header">
      <div>#</div>
      <div>Judul</div>
      <div>Album</div>
      <div>Durasi</div>
      <div style="text-align: right;">Aksi</div>
    </div>
  `;

  tracksList.forEach((track, index) => {
    const isFav = favoriteTrackIds.includes(track.id);
    const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
    const isCustom = track.source === 'custom';

    const row = document.createElement('div');
    row.className = 'song-row';
    const currentPlaying = player.getCurrentTrack();
    if (currentPlaying && currentPlaying.id === track.id) {
      row.classList.add('active-row');
    }

    const coverSrc = track.coverBlob 
      ? URL.createObjectURL(track.coverBlob) 
      : (track.coverUrl || '/default_cover.png');

    row.innerHTML = `
      <div class="row-index">${index + 1}</div>
      <div class="row-title-info">
        <img class="row-cover" src="${coverSrc}" alt="${track.title}" />
        <div class="row-text">
          <span class="row-title">${track.title}</span>
          <span class="row-artist">${track.artist}</span>
        </div>
      </div>
      <div class="row-album">${track.album || '-'}</div>
      <div class="row-duration">${formatTime(track.duration)}</div>
      <div class="row-actions">
        <!-- Favorite Action -->
        <button class="row-btn fav-btn ${isFav ? 'active-fav' : ''}" title="Sukai">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <!-- Download/Delete Offline Action -->
        ${isCustom ? `
          <button class="row-btn delete-btn" title="Hapus Lagu Lokal" style="color: #ff3b30;">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        ` : `
          <button class="row-btn download-btn ${isDownloaded ? 'downloaded' : ''}" title="${isDownloaded ? 'Hapus Download' : 'Download Offline'}">
            ${isDownloaded ? `
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            ` : `
              <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            `}
          </button>
        `}
        <!-- Playlist Menu -->
        <button class="row-btn add-to-playlist-btn" title="Tambah ke Playlist">
          <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
        </button>
        <!-- Copy Link Action -->
        <button class="row-btn copy-url-btn" title="Salin Link Lagu">
          <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
      </div>
    `;

    // Row Click to play
    row.addEventListener('click', (e) => {
      // Don't play if clicked on buttons
      if (e.target.closest('.row-btn')) return;
      const playQueue = container.id === 'youtube-search-results' ? currentSearchYouTubeTracks : tracksList;
      playTrack(track, playQueue);
    });

    // Favorite Button Handler
    row.querySelector('.fav-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const active = await storage.toggleFavorite(track.id);
      favoriteTrackIds = await storage.getFavorites();
      
      const currentPlaying = player.getCurrentTrack();
      if (currentPlaying && currentPlaying.id === track.id) {
        updatePlayerFavButton(active);
      }

      showToast(active ? 'Lagu ditambahkan ke favorit' : 'Lagu dihapus dari favorit', 'success');
      
      // Re-render current list to sync favorites
      if (currentView === 'favorites') {
        renderFavoritesView();
      } else if (currentView === 'home') {
        renderHomeView();
      } else if (currentView === 'library') {
        renderLibraryView();
      } else if (currentView === 'playlists') {
        // if inside playlist details
        if (viewPanels[3].classList.contains('active-view')) {
          row.querySelector('.fav-btn').classList.toggle('active-fav', active);
        }
      }
    });

    // Download/Delete offline handler
    const dlBtn = row.querySelector('.download-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isDownloaded) {
          // Remove download
          await storage.deleteOfflineTrack(track.id);
          showToast('Unduhan offline dihapus', 'info');
          await refreshOfflineState();
          
          if (currentView === 'library') {
            renderLibraryView();
          } else {
            row.querySelector('.download-btn').classList.remove('downloaded');
            // If offline mode is enabled, remove from view since it's no longer offline
            if (isOfflineMode) renderHomeView();
          }
        } else {
          // Download it
          try {
            showToast('Mengunduh lagu...', 'info');
            dlBtn.style.pointerEvents = 'none';
            dlBtn.style.opacity = '0.5';
            
            let trackToDownload = { ...track };
            
            if (track.source === 'youtube') {
              showToast('Mendapatkan link unduhan YouTube...', 'info');
              const streamUrl = await resolveAudioStream(track.videoId);
              trackToDownload.audioUrl = `/proxy-api?url=${encodeURIComponent(streamUrl)}`;
            }

            await storage.downloadOnlineTrack(trackToDownload);
            showToast('Lagu tersimpan untuk offline!', 'success');
            await refreshOfflineState();
            
            if (currentView === 'library') {
              renderLibraryView();
            } else {
              // Refresh current view to sync downloaded badge
              switchView(currentView);
            }
          } catch (err) {
            console.error(err);
            showToast('Gagal mengunduh lagu', 'error');
          } finally {
            dlBtn.style.pointerEvents = 'auto';
            dlBtn.style.opacity = '1';
          }
        }
      });
    }

    const delBtn = row.querySelector('.delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Hapus lagu lokal ini secara permanen dari browser?')) {
          await storage.deleteOfflineTrack(track.id);
          showToast('Lagu lokal dihapus', 'info');
          
          // If deleted track was playing, pause player
          const playing = player.getCurrentTrack();
          if (playing && playing.id === track.id) {
            player.pause();
          }

          await refreshOfflineState();
          renderLibraryView();
        }
      });
    }

    // Add to playlist selector
    row.querySelector('.add-to-playlist-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedTrackForPlaylist = track;
      openPlaylistSelectorModal();
    });

    // Copy URL Button Handler
    row.querySelector('.copy-url-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      let copyText = '';
      if (track.source === 'youtube') {
        copyText = `https://www.youtube.com/watch?v=${track.videoId}`;
      } else if (track.source === 'audius') {
        copyText = `https://audius.co/tracks/${track.trackId}`;
      } else if (track.audioUrl && track.audioUrl.startsWith('http')) {
        copyText = track.audioUrl;
      }

      if (copyText) {
        navigator.clipboard.writeText(copyText).then(() => {
          showToast('Link lagu berhasil disalin!', 'success');
        }).catch(err => {
          console.error(err);
          showToast('Gagal menyalin link', 'error');
        });
      } else {
        showToast('Lagu ini tidak memiliki link eksternal', 'info');
      }
    });

    container.appendChild(row);
  });
}

// ==========================================
// PLAYLIST VIEW RENDERERS & ACTIONS
// ==========================================
function renderPlaylistsView() {
  playlistsListContainer.innerHTML = '';

  if (playlists.length === 0) {
    playlistsListContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
        <h3>Belum Ada Daftar Putar</h3>
        <p>Buat daftar putar pertama Anda dan isi dengan lagu-lagu kesukaan Anda.</p>
      </div>
    `;
    return;
  }

  playlists.forEach(playlist => {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.setAttribute('data-id', playlist.id);

    card.innerHTML = `
      <button class="playlist-delete-btn" title="Hapus Playlist">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
      <div class="playlist-card-cover">
        <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
      </div>
      <h3 class="playlist-card-title">${playlist.name}</h3>
      <span class="playlist-card-desc">${playlist.trackIds.length} Lagu</span>
    `;

    // Click delete
    card.querySelector('.playlist-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Hapus daftar putar "${playlist.name}"?`)) {
        await storage.deletePlaylist(playlist.id);
        playlists = await storage.getPlaylists();
        renderPlaylistsView();
        showToast('Daftar putar dihapus', 'info');
      }
    });

    // Click playlist card
    card.addEventListener('click', () => {
      openPlaylistDetails(playlist);
    });

    playlistsListContainer.appendChild(card);
  });
}

async function fetchYouTubePlaylistTracks(playlistId) {
  try {
    const url = `/youtube-playlist?list=${playlistId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Gagal memuat playlist dari YouTube (Status: ${response.status})`);
    }
    const html = await response.text();
    
    const marker = 'var ytInitialData =';
    const index = html.indexOf(marker);
    if (index === -1) {
      throw new Error('ytInitialData tidak ditemukan di halaman YouTube');
    }
    
    const start = index + marker.length;
    const jsonStart = html.indexOf('{', start);
    if (jsonStart === -1) {
      throw new Error('Format data playlist tidak valid');
    }
    
    let bracketCount = 0;
    let inString = false;
    let escape = false;
    let jsonStr = '';
    
    for (let i = jsonStart; i < html.length; i++) {
      const char = html[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') {
          bracketCount++;
        } else if (char === '}') {
          bracketCount--;
          if (bracketCount === 0) {
            jsonStr = html.substring(jsonStart, i + 1);
            break;
          }
        }
      }
    }
    
    if (!jsonStr) {
      throw new Error('Ekstraksi JSON playlist gagal');
    }
    
    const data = JSON.parse(jsonStr);
    const tracks = [];
    
    function findLockups(obj) {
      if (!obj || typeof obj !== 'object') return;
      
      if (obj.lockupViewModel) {
        const lockup = obj.lockupViewModel;
        const videoId = lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
        
        if (videoId) {
          const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || 'Unknown Title';
          
          let author = 'Unknown Artist';
          const rows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
          if (rows.length > 0 && rows[0].metadataParts && rows[0].metadataParts.length > 0) {
            author = rows[0].metadataParts[0].text?.content || 'Unknown Artist';
          }
          if (author.endsWith('Check')) {
            author = author.replace(/Check$/, '').trim();
          }
          
          let duration = 0;
          const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
          const timeOverlay = overlays.find(o => o.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text);
          if (timeOverlay) {
            const timeText = timeOverlay.thumbnailBottomOverlayViewModel.badges[0].thumbnailBadgeViewModel.text;
            const parts = timeText.replace('.', ':').split(':').map(Number);
            if (parts.length === 2) {
              duration = parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
              duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }
          
          tracks.push({
            id: `youtube_${videoId}`,
            title: title,
            artist: author,
            album: 'YouTube Music',
            duration: duration,
            coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            audioUrl: '',
            source: 'youtube',
            videoId: videoId
          });
        }
      }
      
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          findLockups(obj[k]);
        }
      }
    }
    
    findLockups(data);
    return tracks;
  } catch (err) {
    console.error('Error fetching YouTube playlist:', err);
    throw err;
  }
}

async function openPlaylistDetails(playlist) {
  // Switch to details view (index 3 in view panels)
  viewPanels.forEach(panel => panel.classList.remove('active-view'));
  document.getElementById('view-playlist-details').classList.add('active-view');

  document.getElementById('selected-playlist-name').textContent = playlist.name;
  
  const countElement = document.getElementById('selected-playlist-count');
  countElement.textContent = 'Memuat lagu...';

  // Set the playlist cover image dynamically
  const coverContainer = document.querySelector('.playlist-cover-art');
  if (coverContainer) {
    if (playlist.coverUrl) {
      coverContainer.innerHTML = `<img src="${playlist.coverUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 16px;" />`;
    } else {
      coverContainer.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`;
    }
  }

  playlistSongsContainer.innerHTML = `
    <div class="empty-state" style="padding: 40px 0;">
      <div class="spinner" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--accent-color); border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 15px auto;"></div>
      <p>Mengambil daftar lagu langsung dari YouTube Music...</p>
    </div>
  `;

  const isYouTubePlaylist = playlist.id && (playlist.id.startsWith('PL') || playlist.source === 'youtube_playlist');
  const isAudiusGenrePlaylist = playlist.source === 'audius_genre';
  
  if (isAudiusGenrePlaylist) {
    if (isOfflineMode) {
      countElement.textContent = '0 Lagu';
      playlistSongsContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Mode Offline Aktif</h3>
          <p>Kategori musik online tidak dapat dimuat saat offline.</p>
        </div>
      `;
      return;
    }
    
    try {
      const tracks = await fetchAudiusGenreTracks(playlist.genre);
      countElement.textContent = `${tracks.length} Lagu`;
      
      if (tracks.length === 0) {
        playlistSongsContainer.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
            <h3>Tidak Ada Lagu</h3>
            <p>Tidak ada lagu terpopuler yang ditemukan untuk kategori ini.</p>
          </div>
        `;
        return;
      }
      
      renderTrackList(playlistSongsContainer, tracks);
    } catch (err) {
      countElement.textContent = 'Gagal memuat';
      playlistSongsContainer.innerHTML = `
        <div class="empty-state" style="color: #ff3b30;">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Gagal Memuat Kategori</h3>
          <p>Terjadi kesalahan koneksi atau proxy saat mengambil data dari Audius.</p>
        </div>
      `;
    }
  } else if (isYouTubePlaylist) {
    if (isOfflineMode) {
      countElement.textContent = '0 Lagu';
      playlistSongsContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Mode Offline Aktif</h3>
          <p>Daftar putar online dari YouTube Music tidak dapat dimuat saat offline.</p>
        </div>
      `;
      return;
    }
    
    try {
      const tracks = await fetchYouTubePlaylistTracks(playlist.id);
      countElement.textContent = `${tracks.length} Lagu`;
      
      if (tracks.length === 0) {
        playlistSongsContainer.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
            <h3>Tidak Ada Lagu</h3>
            <p>Tidak ada lagu yang ditemukan di daftar putar ini.</p>
          </div>
        `;
        return;
      }
      
      renderTrackList(playlistSongsContainer, tracks);
    } catch (err) {
      countElement.textContent = 'Gagal memuat';
      playlistSongsContainer.innerHTML = `
        <div class="empty-state" style="color: #ff3b30;">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Gagal Memuat Daftar Putar</h3>
          <p>Terjadi kesalahan koneksi atau proxy saat mengambil data dari YouTube.</p>
        </div>
      `;
    }
  } else {
    const allAvailableTracks = [
      ...CURATED_TRACKS,
      ...offlineTracks
    ];

    const playlistSongs = [];
    const addedIds = new Set();
    
    playlist.trackIds.forEach(trackId => {
      if (addedIds.has(trackId)) return;
      const song = allAvailableTracks.find(t => t.id === trackId);
      if (song) {
        playlistSongs.push(song);
        addedIds.add(trackId);
      }
    });

    const filtered = playlistSongs.filter(track => {
      const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
      const isCustom = track.source === 'custom';
      if (isOfflineMode && !isDownloaded && !isCustom) return false;
      return true;
    });

    countElement.textContent = `${filtered.length} Lagu`;

    if (filtered.length === 0) {
      playlistSongsContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Kosong</h3>
          <p>Tidak ada lagu di playlist ini ${isOfflineMode ? '(atau lagu online belum didownload)' : ''}.</p>
        </div>
      `;
      return;
    }

    renderTrackList(playlistSongsContainer, filtered);
  }
}

// ==========================================
// PLAYBACK TRIGGER
// ==========================================
async function playTrack(track, queue) {
  const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
  const isCustom = track.source === 'custom';
  
  if (isOfflineMode && !isDownloaded && !isCustom) {
    showToast('Lagu ini tidak tersedia dalam mode offline.', 'error');
    return;
  }

  player.setQueue(queue, track.id);
  
  document.querySelectorAll('.song-row').forEach(row => {
    const title = row.querySelector('.row-title')?.textContent;
    if (title === track.title) {
      row.classList.add('active-row');
    } else {
      row.classList.remove('active-row');
    }
  });
}

// ==========================================
// AUDIO PLAYER CALLBACK EVENT HANDLERS
// ==========================================
function handleTrackChange(track) {
  if (!track) return;

  // Update cover and text
  const isCustom = track.source === 'custom';
  
  // For custom tracks, resolve the coverBlob object URL if it exists
  if (track.coverBlob) {
    playerTrackCover.src = URL.createObjectURL(track.coverBlob);
  } else if (isCustom) {
    playerTrackCover.src = '/default_cover.png';
  } else {
    playerTrackCover.src = track.coverUrl;
  }

  playerTrackTitle.textContent = track.title;
  playerTrackArtist.textContent = track.artist;

  // Enable active visual styling on player bar
  document.getElementById('player-bar').classList.add('player-bar-active');

  // Dynamically change UI color based on theme
  const accentColor = track.themeColor || '#8a2be2';
  updateDynamicAccentColor(accentColor);

  // Sync favorites button
  const isFav = favoriteTrackIds.includes(track.id);
  updatePlayerFavButton(isFav);

  // Synchronize rows
  document.querySelectorAll('.song-row').forEach(row => {
    const title = row.querySelector('.row-title')?.textContent;
    if (title === track.title) {
      row.classList.add('active-row');
    } else {
      row.classList.remove('active-row');
    }
  });
}

function handlePlayStateChange({ isPlaying }) {
  if (isPlaying) {
    // Show pause icon
    playPauseSvgIcon.innerHTML = `
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    `;
    playerPlayPauseBtn.title = 'Jeda';
  } else {
    // Show play icon
    playPauseSvgIcon.innerHTML = `
      <path d="M8 5v14l11-7z"/>
    `;
    playerPlayPauseBtn.title = 'Putar';
  }
}

function handleTimeUpdate({ currentTime, duration, percentage }) {
  playerCurrentTime.textContent = formatTime(currentTime);
  playerTotalTime.textContent = formatTime(duration || 0);

  // Update slider fill and thumb position
  playerProgressFill.style.width = `${percentage}%`;
  playerProgressThumb.style.left = `${percentage}%`;
}

function handleVolumeChange(volume) {
  updateVolumeUI(volume);
}

function updateVolumeUI(volume) {
  const percent = volume * 100;
  playerVolumeFill.style.width = `${percent}%`;
  playerVolumeThumb.style.left = `${percent}%`;

  // Change volume icons based on level
  if (volume === 0) {
    volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  } else if (volume < 0.4) {
    volumeIcon.innerHTML = '<path d="M7 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
  } else {
    volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
}

function updatePlayerFavButton(isFav) {
  if (isFav) {
    playerFavBtn.style.color = 'var(--accent-color)';
    playerFavBtn.querySelector('svg').style.fill = 'var(--accent-color)';
  } else {
    playerFavBtn.style.color = 'var(--text-muted)';
    playerFavBtn.querySelector('svg').style.fill = 'none';
  }
}

// ==========================================
// DYNAMIC COLOR ADJUSTMENTS
// ==========================================
function updateDynamicAccentColor(hexColor) {
  document.documentElement.style.setProperty('--accent-color', hexColor);

  // Convert Hex to RGB channels for rgba alpha utilities
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  document.documentElement.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);

  // Slow color shift on active background glow circle
  const glow = document.getElementById('ambient-glow-1');
  if (glow) {
    glow.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.25) 0%, rgba(5, 4, 9, 0) 70%)`;
  }
}

// ==========================================
// PLAYER HARDWARE CONTROLS HANDLERS
// ==========================================
function setupPlayerControls() {
  playerPlayPauseBtn.addEventListener('click', () => {
    if (player.isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  });

  playerPrevBtn.addEventListener('click', () => {
    player.previous();
  });

  playerNextBtn.addEventListener('click', () => {
    player.next();
  });

  playerShuffleBtn.addEventListener('click', () => {
    const isShuffle = player.toggleShuffle();
    playerShuffleBtn.classList.toggle('active-control', isShuffle);
    showToast(isShuffle ? 'Mode acak diaktifkan' : 'Mode acak dimatikan', 'info');
  });

  playerRepeatBtn.addEventListener('click', () => {
    const repeatMode = player.toggleRepeat();
    
    // reset icon coloring based on mode
    playerRepeatBtn.classList.toggle('active-control', repeatMode !== 'none');
    
    if (repeatMode === 'one') {
      playerRepeatBtn.title = 'Ulang Satu Lagu';
      showToast('Mengulang satu lagu', 'info');
    } else if (repeatMode === 'all') {
      playerRepeatBtn.title = 'Ulang Semua Lagu';
      showToast('Mengulang semua lagu', 'info');
    } else {
      playerRepeatBtn.title = 'Jangan Ulang';
      showToast('Tidak mengulang putaran', 'info');
    }
  });

  // Player bottom fav click
  playerFavBtn.addEventListener('click', async () => {
    const track = player.getCurrentTrack();
    if (!track) return;

    const active = await storage.toggleFavorite(track.id);
    favoriteTrackIds = await storage.getFavorites();
    updatePlayerFavButton(active);

    showToast(active ? 'Lagu ditambahkan ke favorit' : 'Lagu dihapus dari favorit', 'success');
    
    // Sync views
    if (currentView === 'favorites') {
      renderFavoritesView();
    } else if (currentView === 'home') {
      renderHomeView();
    } else if (currentView === 'library') {
      renderLibraryView();
    }
  });

  // Player bottom playlist menu click
  playerPlaylistBtn.addEventListener('click', () => {
    const track = player.getCurrentTrack();
    if (!track) return;
    selectedTrackForPlaylist = track;
    openPlaylistSelectorModal();
  });

  // Player volume mute toggle click
  playerVolumeBtn.addEventListener('click', () => {
    if (player.audio.volume > 0) {
      player.setVolume(0);
    } else {
      player.setVolume(0.8);
    }
  });
}

// ==========================================
// RANGE SCRUBBER SLIDERS CONTROLLERS
// ==========================================
function setupSliders() {
  // Track seeking slider
  setupSliderInteraction(playerProgressContainer, (percentage) => {
    if (player.audio.duration) {
      const targetTime = (percentage / 100) * player.audio.duration;
      player.seek(targetTime);
    }
  });

  // Volume adjusting slider
  setupSliderInteraction(playerVolumeContainer, (percentage) => {
    const targetVolume = percentage / 100;
    player.setVolume(targetVolume);
  });
}

/**
 * Normalizes mouse and touch drag inputs on customized CSS sliders
 */
function setupSliderInteraction(container, onValueChange) {
  let isDragging = false;

  const updateValue = (e) => {
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clickX = clientX - rect.left;
    const width = rect.width;
    let percentage = (clickX / width) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    
    onValueChange(percentage);
  };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateValue(e);
  });

  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    updateValue(e);
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) updateValue(e);
  });

  window.addEventListener('touchmove', (e) => {
    if (isDragging) updateValue(e);
  }, { passive: true });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// ==========================================
// OFFLINE MODE FILTER TOGGLE
// ==========================================
function setupOfflineSwitch() {
  offlineModeSwitch.addEventListener('change', (e) => {
    isOfflineMode = e.target.checked;
    
    if (isOfflineMode) {
      showToast('Aplikasi masuk ke Mode Offline', 'info');
      // If currently playing online track that is not downloaded, pause it
      const playing = player.getCurrentTrack();
      if (playing) {
        const isDownloaded = offlineTracks.some(ot => ot.id === playing.id);
        const isCustom = playing.source === 'custom';
        if (!isDownloaded && !isCustom) {
          player.pause();
          showToast('Lagu online dihentikan karena offline.', 'info');
        }
      }
    } else {
      showToast('Aplikasi kembali Online', 'info');
    }

    // Refresh active panel view
    switchView(currentView);
  });
}

// ==========================================
// DRAG AND DROP FILE IMPORT LOGIC
// ==========================================
function setupStorageDragAndDrop() {
  // Click triggers file selector input
  dragDropZone.addEventListener('click', () => {
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processSelectedFiles(files);
    }
  });

  dragDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragDropZone.classList.add('dragover');
  });

  dragDropZone.addEventListener('dragleave', () => {
    dragDropZone.classList.remove('dragover');
  });

  dragDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processSelectedFiles(files);
    }
  });
}

// ==========================================
// URL FILE IMPORT LOGIC
// ==========================================
function extractYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function resolveYouTubeVideoInfo(videoId) {
  // 1. Try our local ytdl-backed API endpoint
  try {
    const res = await fetch(`/api/yt-info?id=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        artist: data.artist,
        duration: data.duration || 0,
        coverUrl: data.coverUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        videoId: videoId
      };
    }
  } catch (e) {
    console.warn('Local yt-info API failed, trying oembed/Invidious...', e);
  }

  // 2. Fallback to oembed (guaranteed metadata for title/author) + default cover
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const proxyUrl = `/proxy-api?url=${encodeURIComponent(oembedUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title,
        artist: data.author_name || 'Artis YouTube',
        duration: 0, // oembed has no duration
        coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        videoId: videoId
      };
    }
  } catch (e) {
    console.warn('OEmbed fallback failed, trying Invidious...', e);
  }

  // 3. Fallback to Invidious
  try {
    const instances = await loadInvidiousInstances();
    const shuffled = [...instances].sort(() => 0.5 - Math.random()).slice(0, 5);
    for (const instance of shuffled) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const targetUrl = `${instance}/api/v1/videos/${videoId}?local=true`;
        const response = await fetch(`/proxy-api?url=${encodeURIComponent(targetUrl)}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const videoData = await response.json();
          return {
            title: videoData.title,
            artist: videoData.author,
            duration: videoData.lengthSeconds || 0,
            coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            videoId: videoId
          };
        }
      } catch (e) {
        // ignore and try next
      }
    }
  } catch (err) {
    console.warn('Invidious fallback failed', err);
  }

  throw new Error('Gagal memuat detail video YouTube');
}

function setupUrlImport() {
  btnImportUrl.addEventListener('click', () => {
    handleUrlImport();
  });

  urlUploadInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleUrlImport();
    }
  });

  if (btnPasteUrl) {
    btnPasteUrl.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlUploadInput.value = text.trim();
          showToast('Teks disalin dari clipboard!', 'success');
        }
      } catch (err) {
        console.error(err);
        showToast('Gagal membaca clipboard. Berikan izin akses.', 'error');
      }
    });
  }
}

async function handleUrlImport() {
  const url = urlUploadInput.value.trim();
  if (!url) {
    showToast('Masukkan URL terlebih dahulu', 'error');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showToast('URL harus diawali dengan http:// atau https://', 'error');
    return;
  }

  try {
    btnImportUrl.disabled = true;
    btnImportUrl.style.opacity = '0.5';

    const youtubeVideoId = extractYouTubeVideoId(url);
    if (youtubeVideoId) {
      showToast('Mengambil detail lagu YouTube...', 'info');
      const info = await resolveYouTubeVideoInfo(youtubeVideoId);
      
      showToast('Mengunduh stream audio YouTube...', 'info');
      const streamUrl = await resolveAudioStream(youtubeVideoId);
      const proxyUrl = `/proxy-api?url=${encodeURIComponent(streamUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Gagal mengunduh audio: ${response.statusText}`);
      }
      const fileBlob = await response.blob();

      // Download cover art
      let coverBlob = null;
      try {
        const coverResponse = await fetch(`/proxy-api?url=${encodeURIComponent(info.coverUrl)}`);
        if (coverResponse.ok) {
          coverBlob = await coverResponse.blob();
        }
      } catch (e) {
        console.warn('Failed to fetch cover blob:', e);
      }

      pendingCustomFile = fileBlob;
      pendingCustomFile.duration = info.duration;
      pendingCustomFile.coverBlob = coverBlob;
      pendingCustomFile.source = 'youtube';
      pendingCustomFile.videoId = youtubeVideoId;

      customTrackTitleInput.value = info.title;
      customTrackArtistInput.value = info.artist;
      customTrackAlbumInput.value = 'YouTube Downloads';

      openModal(modalEditCustomTrack);
      urlUploadInput.value = '';
      return;
    }

    // Direct audio URL fallback
    showToast('Memverifikasi URL audio...', 'info');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Gagal memuat URL audio: ${response.statusText}`);
    }

    const fileBlob = await response.blob();

    if (!fileBlob.type.startsWith('audio/') && !url.endsWith('.mp3') && !url.endsWith('.wav') && !url.endsWith('.m4a') && !url.endsWith('.ogg')) {
      showToast('URL tidak merujuk ke file audio yang valid', 'error');
      return;
    }

    const tempFile = new File([fileBlob], "temp_audio_file");
    const duration = await getAudioDuration(tempFile);

    const filename = url.substring(url.lastIndexOf('/') + 1);
    const parsed = parseFileName(filename);

    pendingCustomFile = fileBlob;
    pendingCustomFile.duration = duration;
    pendingCustomFile.source = 'custom';

    customTrackTitleInput.value = parsed.title;
    customTrackArtistInput.value = parsed.artist;
    customTrackAlbumInput.value = '';

    openModal(modalEditCustomTrack);
    urlUploadInput.value = '';
  } catch (err) {
    console.error(err);
    showToast('Gagal memproses URL (' + err.message + ')', 'error');
  } finally {
    btnImportUrl.disabled = false;
    btnImportUrl.style.opacity = '1';
  }
}

async function processSelectedFiles(files) {
  // Process the first audio file found
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith('audio/')) {
      pendingCustomFile = file;
      
      // Auto-parse filename (Artist - Title)
      const parsed = parseFileName(file.name);
      
      // Auto-extract audio duration using dummy Audio element
      showToast('Memproses file audio...', 'info');
      const duration = await getAudioDuration(file);
      pendingCustomFile.duration = duration;

      // Prefill Edit Modal fields
      customTrackTitleInput.value = parsed.title;
      customTrackArtistInput.value = parsed.artist;
      customTrackAlbumInput.value = '';

      openModal(modalEditCustomTrack);
      return; // handle one file at a time
    }
  }
  showToast('Format file tidak didukung! Pilih file audio.', 'error');
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = objectUrl;
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(objectUrl);
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    });
  });
}

function parseFileName(name) {
  // strip file extension
  const baseName = name.replace(/\.[^/.]+$/, "");
  const parts = baseName.split(" - ");
  if (parts.length > 1) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim()
    };
  }
  return {
    artist: "Unknown Artist",
    title: baseName.trim()
  };
}

// ==========================================
// MODALS CONTROLLER LOGIC
// ==========================================
function setupModals() {
  // Create Playlist Modal listeners
  const createBtn = document.getElementById('create-playlist-btn');
  createBtn.addEventListener('click', () => {
    playlistNameInput.value = '';
    openModal(modalCreatePlaylist);
    playlistNameInput.focus();
  });

  btnCancelCreatePlaylist.addEventListener('click', () => {
    closeModal(modalCreatePlaylist);
  });

  btnConfirmCreatePlaylist.addEventListener('click', async () => {
    const name = playlistNameInput.value.trim();
    if (!name) {
      showToast('Nama daftar putar tidak boleh kosong', 'error');
      return;
    }
    await storage.createPlaylist(name);
    playlists = await storage.getPlaylists();
    renderPlaylistsView();
    closeModal(modalCreatePlaylist);
    showToast(`Daftar putar "${name}" berhasil dibuat!`, 'success');
  });

  // Select Playlist Modal listeners
  btnCloseSelectPlaylist.addEventListener('click', () => {
    closeModal(modalSelectPlaylist);
  });

  // Custom File metadata Modal listeners
  btnCancelCustomTrack.addEventListener('click', () => {
    closeModal(modalEditCustomTrack);
    pendingCustomFile = null;
  });

  btnConfirmCustomTrack.addEventListener('click', async () => {
    if (!pendingCustomFile) return;

    const title = customTrackTitleInput.value.trim();
    const artist = customTrackArtistInput.value.trim();
    const album = customTrackAlbumInput.value.trim();

    try {
      showToast('Menyimpan lagu ke browser...', 'info');
      
      await storage.saveCustomTrack({
        title: title || (pendingCustomFile.source === 'youtube' ? 'Lagu YouTube Tanpa Judul' : 'Lagu Lokal Tanpa Judul'),
        artist: artist || (pendingCustomFile.source === 'youtube' ? 'Artis YouTube' : 'Penyanyi Misterius'),
        album: album || (pendingCustomFile.source === 'youtube' ? 'YouTube Downloads' : 'Album Lokal'),
        duration: pendingCustomFile.duration || 0,
        fileBlob: pendingCustomFile,
        coverBlob: pendingCustomFile.coverBlob || null,
        source: pendingCustomFile.source || 'custom',
        videoId: pendingCustomFile.videoId || null
      });

      closeModal(modalEditCustomTrack);
      showToast('Lagu berhasil diimpor!', 'success');
      pendingCustomFile = null;

      await refreshOfflineState();
      if (currentView === 'library') {
        renderLibraryView();
      }
    } catch (e) {
      console.error(e);
      showToast('Gagal menyimpan lagu', 'error');
    }
  });

  // Close modals on overlay click
  [modalCreatePlaylist, modalSelectPlaylist, modalEditCustomTrack].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
        if (modal === modalEditCustomTrack) pendingCustomFile = null;
      }
    });
  });
}

function openModal(modalElement) {
  modalElement.classList.add('active-modal');
}

function closeModal(modalElement) {
  modalElement.classList.remove('active-modal');
}

// ==========================================
// PLAYLIST SELECTION MODAL POPULATOR
// ==========================================
function openPlaylistSelectorModal() {
  playlistSelectorListItems.innerHTML = '';
  
  if (playlists.length === 0) {
    playlistSelectorListItems.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <p>Anda belum memiliki Daftar Putar.</p>
        <button id="modal-nav-create-playlist" class="btn-primary" style="margin-top: 10px;">Buat Sekarang</button>
      </div>
    `;
    
    openModal(modalSelectPlaylist);

    document.getElementById('modal-nav-create-playlist').addEventListener('click', () => {
      closeModal(modalSelectPlaylist);
      playlistNameInput.value = '';
      openModal(modalCreatePlaylist);
    });
    return;
  }

  playlists.forEach(playlist => {
    const item = document.createElement('div');
    item.className = 'playlist-select-item';
    
    // Check if song already exists in playlist
    const exists = playlist.trackIds.includes(selectedTrackForPlaylist.id);

    item.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
      <span class="playlist-select-name" style="flex: 1;">${playlist.name}</span>
      ${exists ? `
        <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">SUDAH ADA</span>
      ` : ''}
    `;

    item.addEventListener('click', async () => {
      if (exists) {
        showToast('Lagu sudah ada di daftar putar ini', 'info');
        return;
      }

      const updatedTrackIds = [...playlist.trackIds, selectedTrackForPlaylist.id];
      await storage.updatePlaylistTracks(playlist.id, updatedTrackIds);
      
      // refresh playlist local states
      playlists = await storage.getPlaylists();
      closeModal(modalSelectPlaylist);
      showToast(`Berhasil menambahkan ke "${playlist.name}"`, 'success');
      
      // Sync playlist views if active
      if (currentView === 'playlists') {
        renderPlaylistsView();
      }
    });

    playlistSelectorListItems.appendChild(item);
  });

  openModal(modalSelectPlaylist);
}

// ==========================================
// STORAGE STATISTICS METER
// ==========================================
async function updateStorageMeter() {
  const stats = await storage.getStorageStats();
  
  // Format sizes
  const usageMB = (stats.usage / (1024 * 1024)).toFixed(1);
  const quotaMB = (stats.quota / (1024 * 1024)).toFixed(0);

  // Update text
  storagePercentage.textContent = `${stats.percentage.toFixed(1)}%`;
  storageBar.style.width = `${stats.percentage}%`;
  storageDetails.textContent = `${usageMB} MB terpakai dari ${quotaMB} MB`;
}

// ==========================================
// SEARCH BAR FILTERING LOGIC
// ==========================================
function filterTracks(query) {
  if (currentView === 'home') {
    renderHomeView();
  } else if (currentView === 'favorites') {
    renderFavoritesView();
  } else if (currentView === 'library') {
    renderLibraryView();
  }
}

// ==========================================
// TOAST SYSTEM
// ==========================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Add simple matching symbol
  let icon = '';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'info') icon = 'ℹ';

  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 16px;">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation next tick
  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 50);

  // Remove toast after duration
  setTimeout(() => {
    toast.classList.remove('toast-show');
    // Delete DOM node after transition completes
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3000);
}

// ==========================================
// TIME PARSER HELPERS
// ==========================================
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ==========================================
// PIPED API CLIENT & YOUTUBE MUSIC SEARCH
// ==========================================
let pipedInstances = [];

async function loadPipedInstances() {
  if (pipedInstances.length > 0) return pipedInstances;
  
  try {
    const res = await fetch('https://raw.githubusercontent.com/TeamPiped/piped-uptime/master/history/summary.json');
    if (!res.ok) throw new Error('Failed to fetch piped summary');
    const data = await res.json();
    
    // Extract base URLs of UP instances
    pipedInstances = data
      .filter(item => item.status === 'up')
      .map(item => item.url.replace('/healthcheck', ''));
      
    console.log(`Loaded ${pipedInstances.length} active Piped instances dynamically!`);
  } catch (e) {
    console.error('Failed to load Piped instances dynamically, using fallbacks', e);
  }

  // Ensure we have at least a few instances even if fetch fails
  if (pipedInstances.length === 0) {
    pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://api.piped.privacydev.net',
      'https://yapi.vyper.me',
      'https://api.looleh.xyz',
      'https://pipedapi.palveluntarjoaja.eu'
    ];
  }
  return pipedInstances;
}

async function fetchFromPiped(endpoint) {
  const instances = await loadPipedInstances();
  let lastError = null;
  
  // Shuffle and try up to 6 instances to bypass rate limits and downtime
  const shuffled = [...instances].sort(() => 0.5 - Math.random()).slice(0, 6);
  
  for (const instance of shuffled) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout
      
      const targetUrl = `${instance}${endpoint}`;
      const proxyUrl = `/proxy-api?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const text = await response.text();
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          return JSON.parse(text);
        }
        throw new Error('Response was not valid JSON');
      }
    } catch (e) {
      console.warn(`Piped instance ${instance} failed:`, e);
      lastError = e;
    }
  }
  throw lastError || new Error('Semua server Piped API gagal dihubungi');
}

// ==========================================
// INVIDIOUS API STREAM RESOLVER
// ==========================================
let invidiousInstances = [];

async function loadInvidiousInstances() {
  if (invidiousInstances.length > 0) return invidiousInstances;
  
  try {
    const res = await fetch(`/proxy-api?url=${encodeURIComponent('https://api.invidious.io/instances.json')}`);
    if (!res.ok) throw new Error('Failed to fetch invidious instances list');
    const data = await res.json();
    
    // Filter instances: type === 'https', monitor.down === false
    invidiousInstances = data
      .filter(item => {
        const info = item[1];
        return info.type === 'https' && 
               info.monitor && 
               info.monitor.down === false;
      })
      .map(item => item[1].uri || `https://${item[0]}`);
      
    console.log(`Loaded ${invidiousInstances.length} active Invidious instances dynamically!`);
  } catch (e) {
    console.error('Failed to load Invidious instances dynamically, using fallbacks', e);
  }

  // Fallback list of stable public Invidious instances
  if (invidiousInstances.length === 0) {
    invidiousInstances = [
      'https://yewtu.be',
      'https://vid.puffyan.us',
      'https://inv.tux.im',
      'https://invidious.namazso.eu',
      'https://invidious.projectsegfau.lt',
      'https://invidious.slipfox.xyz',
      'https://invidious.lunar.icu',
      'https://iv.ggtyler.dev',
      'https://invidious.drgns.space',
      'https://invidious.privacydev.net'
    ];
  }
  return invidiousInstances;
}

async function resolveAudioStream(videoId) {
  // 1. Try our local ytdl-backed API endpoint first (super fast and 100% working locally)
  try {
    const res = await fetch(`/api/yt-download?id=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        console.log('Successfully resolved stream URL via local yt-dlp API:', data.url);
        return data.url;
      }
    }
  } catch (e) {
    console.warn('Local yt-download API failed, trying public fallbacks...', e);
  }

  // 2. Try Invidious public instances (fallback)
  const instances = await loadInvidiousInstances();
  const shuffled = [...instances].sort(() => 0.5 - Math.random()).slice(0, 6);
  let lastError = null;
  for (const instance of shuffled) {
    try {
      console.log(`Trying Invidious fallback: ${instance}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const targetUrl = `${instance}/api/v1/videos/${videoId}?local=true`;
      const response = await fetch(`/proxy-api?url=${encodeURIComponent(targetUrl)}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const videoData = await response.json();
        if (videoData.adaptiveFormats && videoData.adaptiveFormats.length > 0) {
          const audioFormats = videoData.adaptiveFormats.filter(f => {
            const mime = f.type || f.mimeType;
            return mime && mime.startsWith('audio/');
          });
          if (audioFormats.length > 0) {
            audioFormats.sort((a, b) => {
              const mimeA = a.type || a.mimeType || '';
              const mimeB = b.type || b.mimeType || '';
              return (mimeB.includes('audio/mp4') ? 1 : 0) - (mimeA.includes('audio/mp4') ? 1 : 0);
            });
            let streamUrl = audioFormats[0].url;
            if (streamUrl.startsWith('/')) {
              streamUrl = `${instance}${streamUrl}`;
            }
            return streamUrl;
          }
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  // 3. Fallback to Piped
  try {
    const streamData = await fetchFromPiped(`/streams/${videoId}`);
    if (streamData && streamData.audioStreams && streamData.audioStreams.length > 0) {
      return streamData.audioStreams[0].url;
    }
  } catch (e) {
    lastError = e;
  }

  throw lastError || new Error('Gagal mendapatkan streaming URL dari YouTube');
}

async function searchYouTubeViaProxy(query) {
  try {
    const url = `/youtube-search?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Gagal mencari di YouTube (Status: ${response.status})`);
    }
    const html = await response.text();

    const marker = 'var ytInitialData =';
    const index = html.indexOf(marker);
    if (index === -1) {
      throw new Error('ytInitialData tidak ditemukan di hasil pencarian');
    }

    const start = index + marker.length;
    const jsonStart = html.indexOf('{', start);
    if (jsonStart === -1) {
      throw new Error('Format data hasil pencarian tidak valid');
    }

    let bracketCount = 0;
    let inString = false;
    let escape = false;
    let jsonStr = '';

    for (let i = jsonStart; i < html.length; i++) {
      const char = html[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') {
          bracketCount++;
        } else if (char === '}') {
          bracketCount--;
          if (bracketCount === 0) {
            jsonStr = html.substring(jsonStart, i + 1);
            break;
          }
        }
      }
    }

    if (!jsonStr) {
      throw new Error('Ekstraksi JSON search gagal');
    }

    const data = JSON.parse(jsonStr);
    const videos = [];

    function findVideoRenderers(obj) {
      if (!obj || typeof obj !== 'object') return;

      if (obj.videoRenderer) {
        const vr = obj.videoRenderer;
        const videoId = vr.videoId;
        if (videoId) {
          const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown Title';
          const artist = vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'Unknown Artist';
          
          let duration = 0;
          const timeText = vr.lengthText?.simpleText;
          if (timeText) {
            const parts = timeText.replace('.', ':').split(':').map(Number);
            if (parts.length === 2) {
              duration = parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
              duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }

          videos.push({
            type: 'video',
            videoId: videoId,
            title: title,
            author: artist,
            lengthSeconds: duration
          });
        }
      }

      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          findVideoRenderers(obj[k]);
        }
      }
    }

    findVideoRenderers(data);
    return videos;
  } catch (err) {
    console.error('Error searching YouTube via proxy:', err);
    throw err;
  }
}

async function fetchTrendingTracks() {
  try {
    const targetUrl = 'https://api.audius.co/v1/tracks/trending?app_name=JEFFPLAY';
    const proxyUrl = `/proxy-api?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const resData = await response.json();
      trendingTracks = (resData.data || [])
        .filter(item => item.is_streamable)
        .map(item => {
          const streamUrl = `https://api.audius.co/v1/tracks/${item.id}/stream?app_name=JEFFPLAY`;
          return {
            id: `audius_${item.id}`,
            title: item.title,
            artist: item.user?.name || 'Artis Audius',
            album: 'Audius Hits',
            duration: item.duration || 0,
            coverUrl: item.artwork ? item.artwork['150x150'] : '/default_cover.png',
            audioUrl: `/proxy-api?url=${encodeURIComponent(streamUrl)}`,
            source: 'audius',
            trackId: item.id,
            themeColor: '#ff007f'
          };
        });
    }
  } catch (err) {
    console.error('Failed to fetch trending tracks:', err);
  }
}

async function searchAudius(query) {
  try {
    const targetUrl = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=JEFFPLAY`;
    const proxyUrl = `/proxy-api?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to search Audius: ${response.status}`);
    }
    const resData = await response.json();
    return resData.data || [];
  } catch (err) {
    console.error('Error searching Audius:', err);
    throw err;
  }
}

async function searchYouTubeInvidious(query, page = 1) {
  // 1. Try local yt-dlp search endpoint first
  try {
    const localUrl = `/api/yt-search?q=${encodeURIComponent(query)}&page=${page}`;
    console.log(`Trying local yt-search resolver: ${localUrl}`);
    const response = await fetch(localUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        console.log(`Local search resolver succeeded: found ${data.length} results`);
        return data;
      }
    }
  } catch (e) {
    console.warn('Local yt-search resolver failed, falling back to Invidious...', e);
  }

  // 2. Fallback to public Invidious instances
  const instances = await loadInvidiousInstances();
  const shuffled = [...instances].sort(() => 0.5 - Math.random()).slice(0, 6);
  
  let lastError = null;
  for (const instance of shuffled) {
    try {
      const targetUrl = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&page=${page}&type=video`;
      const proxyUrl = `/proxy-api?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const data = await response.json();
        return data || [];
      }
    } catch (err) {
      lastError = err;
    }
  }
  
  // Fallback to Piped
  try {
    const streamData = await fetchFromPiped(`/search?q=${encodeURIComponent(query)}&filter=all`);
    if (streamData && streamData.items) {
      return streamData.items.map(item => {
        return {
          title: item.title,
          videoId: item.url ? item.url.split('v=')[1] : '',
          author: item.uploaderName,
          lengthSeconds: item.duration || 0
        };
      });
    }
  } catch (err) {
    lastError = err;
  }
  
  throw lastError || new Error('Gagal menghubungi server search YouTube');
}

function appendTrackList(container, tracksList, fullTracksList) {
  const currentCount = container.querySelectorAll('.song-row').length;

  tracksList.forEach((track, index) => {
    const isFav = favoriteTrackIds.includes(track.id);
    const isDownloaded = offlineTracks.some(ot => ot.id === track.id);
    const isCustom = track.source === 'custom';

    const row = document.createElement('div');
    row.className = 'song-row';
    const currentPlaying = player.getCurrentTrack();
    if (currentPlaying && currentPlaying.id === track.id) {
      row.classList.add('active-row');
    }

    const coverSrc = track.coverBlob 
      ? URL.createObjectURL(track.coverBlob) 
      : (track.coverUrl || '/default_cover.png');

    row.innerHTML = `
      <div class="row-index">${currentCount + index + 1}</div>
      <div class="row-title-info">
        <img class="row-cover" src="${coverSrc}" alt="${track.title}" />
        <div class="row-text">
          <span class="row-title">${track.title}</span>
          <span class="row-artist">${track.artist}</span>
        </div>
      </div>
      <div class="row-album">${track.album || '-'}</div>
      <div class="row-duration">${formatTime(track.duration)}</div>
      <div class="row-actions">
        <!-- Favorite Action -->
        <button class="row-btn fav-btn ${isFav ? 'active-fav' : ''}" title="Sukai">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <!-- Download/Delete Offline Action -->
        ${isCustom ? `
          <button class="row-btn delete-btn" title="Hapus Lagu Lokal" style="color: #ff3b30;">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        ` : `
          <button class="row-btn download-btn ${isDownloaded ? 'downloaded' : ''}" title="${isDownloaded ? 'Hapus Download' : 'Download Offline'}">
            ${isDownloaded ? `
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            ` : `
              <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            `}
          </button>
        `}
        <!-- Playlist Menu -->
        <button class="row-btn add-to-playlist-btn" title="Tambah ke Playlist">
          <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
        </button>
        <!-- Copy Link Action -->
        <button class="row-btn copy-url-btn" title="Salin Link Lagu">
          <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
      </div>
    `;

    // Row Click to play
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-btn')) return;
      playTrack(track, fullTracksList);
    });

    // Favorite Button Handler
    row.querySelector('.fav-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const active = await storage.toggleFavorite(track.id);
      favoriteTrackIds = await storage.getFavorites();
      
      const currentPlaying = player.getCurrentTrack();
      if (currentPlaying && currentPlaying.id === track.id) {
        updatePlayerFavButton(active);
      }
      showToast(active ? 'Lagu ditambahkan ke favorit' : 'Lagu dihapus dari favorit', 'success');
      row.querySelector('.fav-btn').classList.toggle('active-fav', active);
    });

    // Download/Delete offline handler
    const dlBtn = row.querySelector('.download-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isDownloaded) {
          await storage.deleteOfflineTrack(track.id);
          showToast('Unduhan offline dihapus', 'info');
          await refreshOfflineState();
          row.querySelector('.download-btn').classList.remove('downloaded');
        } else {
          try {
            showToast('Mengunduh lagu...', 'info');
            dlBtn.style.pointerEvents = 'none';
            dlBtn.style.opacity = '0.5';
            
            let trackToDownload = { ...track };
            if (track.source === 'youtube') {
              const streamUrl = await resolveAudioStream(track.videoId);
              trackToDownload.audioUrl = `/proxy-api?url=${encodeURIComponent(streamUrl)}`;
            }
            await storage.downloadOnlineTrack(trackToDownload);
            showToast('Lagu tersimpan untuk offline!', 'success');
            await refreshOfflineState();
            row.querySelector('.download-btn').classList.add('downloaded');
          } catch (err) {
            console.error(err);
            showToast('Gagal mengunduh lagu', 'error');
          } finally {
            dlBtn.style.pointerEvents = 'auto';
            dlBtn.style.opacity = '1';
          }
        }
      });
    }

    const delBtn = row.querySelector('.delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Hapus lagu lokal ini secara permanen dari browser?')) {
          await storage.deleteOfflineTrack(track.id);
          showToast('Lagu lokal dihapus', 'info');
          
          const playing = player.getCurrentTrack();
          if (playing && playing.id === track.id) {
            player.pause();
          }
          await refreshOfflineState();
          row.remove();
        }
      });
    }

    // Add to playlist selector
    row.querySelector('.add-to-playlist-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedTrackForPlaylist = track;
      openPlaylistSelectorModal();
    });

    // Copy URL Button Handler
    row.querySelector('.copy-url-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      let copyText = '';
      if (track.source === 'youtube') {
        copyText = `https://www.youtube.com/watch?v=${track.videoId}`;
      } else if (track.source === 'audius') {
        copyText = `https://audius.co/tracks/${track.trackId}`;
      } else if (track.audioUrl && track.audioUrl.startsWith('http')) {
        copyText = track.audioUrl;
      }

      if (copyText) {
        navigator.clipboard.writeText(copyText).then(() => {
          showToast('Link lagu berhasil disalin!', 'success');
        }).catch(err => {
          console.error(err);
          showToast('Gagal menyalin link', 'error');
        });
      } else {
        showToast('Lagu ini tidak memiliki link eksternal', 'info');
      }
    });

    container.appendChild(row);
  });
}

function setupSearchScrollListener() {
  const searchView = document.getElementById('view-search');
  if (!searchView) return;

  searchView.addEventListener('scroll', () => {
    if (currentView !== 'search' || isOfflineMode || isSearchingMore || !hasMoreSearchResults || !currentSearchQuery) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = searchView;
    if (scrollTop + clientHeight >= scrollHeight - 150) {
      loadMoreSearchResults();
    }
  });
}

function syncPlayerQueue(newTracks) {
  if (player.queue && player.queue.length > 0 && currentSearchYouTubeTracks.length > 0) {
    const oldLength = currentSearchYouTubeTracks.length - newTracks.length;
    if (player.queue.length === oldLength && player.queue[0]?.id === currentSearchYouTubeTracks[0]?.id) {
      player.queue.push(...newTracks);
      console.log('Synchronized player queue with infinite scroll. New length:', player.queue.length);
    }
  }
}

async function loadMoreSearchResults() {
  if (isSearchingMore) return;
  isSearchingMore = true;

  const youtubeContainer = document.getElementById('youtube-search-results');
  if (!youtubeContainer) {
    isSearchingMore = false;
    return;
  }

  // 1. If buffer has enough items (>= 10), pull from buffer instantly
  if (youtubeSearchBuffer.length >= 10) {
    const nextTracks = youtubeSearchBuffer.splice(0, 10);
    currentSearchYouTubeTracks.push(...nextTracks);
    appendTrackList(youtubeContainer, nextTracks, currentSearchYouTubeTracks);
    syncPlayerQueue(nextTracks);
    isSearchingMore = false;
    return;
  }

  // 2. Buffer has less than 10 items. Do we have more API results?
  if (hasMoreSearchResults) {
    // Show loading spinner
    let spinner = document.getElementById('search-load-more-spinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'search-load-more-spinner';
      spinner.className = 'empty-state';
      spinner.style.padding = '20px 0';
      spinner.innerHTML = `
        <div class="spinner" style="border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--accent-color); border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; margin: 0 auto 5px auto;"></div>
        <p style="font-size: 12px; color: var(--text-secondary);">Memuat lebih banyak lagu...</p>
      `;
      youtubeContainer.appendChild(spinner);
    }

    try {
      const nextPage = currentSearchPage + 1;
      console.log(`Infinite Scroll: Fetching YouTube Music search results page ${nextPage} for query "${currentSearchQuery}"`);
      const data = await searchYouTubeInvidious(currentSearchQuery, nextPage);
      
      if (data && data.length > 0) {
        const newFetchedTracks = data.map(video => {
          return {
            id: `youtube_${video.videoId}`,
            title: video.title,
            artist: video.author || 'Artis YouTube',
            album: 'YouTube Music Hits',
            duration: video.lengthSeconds || 0,
            coverUrl: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
            audioUrl: '', 
            source: 'youtube',
            videoId: video.videoId,
            themeColor: '#ff0055'
          };
        });

        // Add to buffer
        youtubeSearchBuffer.push(...newFetchedTracks);
        currentSearchPage = nextPage;

        // If returned page size is small, probably reached the end of results
        if (data.length < 15) {
          hasMoreSearchResults = false;
        }
      } else {
        hasMoreSearchResults = false;
      }
    } catch (err) {
      console.error('Failed to fetch more YouTube search results:', err);
      showToast('Gagal menghubungi YouTube Music, menggunakan sisa hasil...', 'info');
      hasMoreSearchResults = false;
    } finally {
      // Remove spinner
      const spinner = document.getElementById('search-load-more-spinner');
      if (spinner) spinner.remove();
    }
  }

  // 3. Take whatever we can (up to 10) from the buffer
  const nextTracks = youtubeSearchBuffer.splice(0, 10);
  if (nextTracks.length > 0) {
    currentSearchYouTubeTracks.push(...nextTracks);
    appendTrackList(youtubeContainer, nextTracks, currentSearchYouTubeTracks);
    syncPlayerQueue(nextTracks);
  }

  // 4. If buffer is completely empty and no more results can be fetched, show end marker
  if (youtubeSearchBuffer.length === 0 && !hasMoreSearchResults) {
    let endMsg = document.getElementById('search-end-marker');
    if (!endMsg) {
      endMsg = document.createElement('div');
      endMsg.id = 'search-end-marker';
      endMsg.className = 'empty-state';
      endMsg.style.padding = '15px 0';
      endMsg.innerHTML = `<p style="font-size: 12px; color: var(--text-muted);">Semua lagu dari YouTube Music telah ditampilkan.</p>`;
      youtubeContainer.appendChild(endMsg);
    }
  }

  isSearchingMore = false;
}

async function triggerGlobalSearch(query) {
  switchView('search');
  
  // Reset pagination state
  currentSearchQuery = query;
  currentSearchPage = 1;
  hasMoreSearchResults = true;
  isSearchingMore = false;
  currentSearchYouTubeTracks = [];
  youtubeSearchBuffer = [];

  const searchView = document.getElementById('view-search');
  if (searchView) searchView.scrollTop = 0;

  // 1. Search locally
  const localResults = CURATED_TRACKS.filter(track => {
    return track.title.toLowerCase().includes(query.toLowerCase()) ||
           track.artist.toLowerCase().includes(query.toLowerCase()) ||
           track.album.toLowerCase().includes(query.toLowerCase());
  });
  
  const localSection = document.getElementById('local-results-section');
  const localContainer = document.getElementById('local-search-results');
  
  if (localResults.length > 0) {
    localSection.style.display = 'block';
    renderTrackList(localContainer, localResults);
  } else {
    localSection.style.display = 'none';
  }

  const youtubeSection = document.getElementById('youtube-results-section');
  const youtubeLoading = document.getElementById('youtube-search-loading');
  const youtubeContainer = document.getElementById('youtube-search-results');

  const onlineSection = document.getElementById('online-results-section');
  const onlineLoading = document.getElementById('online-search-loading');
  const onlineContainer = document.getElementById('online-search-results');

  youtubeContainer.innerHTML = '';
  onlineContainer.innerHTML = '';

  if (isOfflineMode) {
    if (youtubeSection) youtubeSection.style.display = 'none';
    onlineContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
        <h3>Mode Offline Aktif</h3>
        <p>Tidak dapat mencari lagu online saat berada dalam Mode Offline.</p>
      </div>
    `;
    return;
  }

  if (youtubeSection) {
    youtubeSection.style.display = 'block';
    youtubeLoading.style.display = 'flex';
  }
  onlineLoading.style.display = 'flex';

  // 2. Search online YouTube Music via Invidious API
  searchYouTubeInvidious(query, 1).then(data => {
    youtubeLoading.style.display = 'none';
    if (data.length === 0) {
      youtubeContainer.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Tidak Ada Hasil</h3>
          <p>Lagu tidak ditemukan di YouTube Music.</p>
        </div>
      `;
      hasMoreSearchResults = false;
      return;
    }

    const ytTracks = data.map(video => {
      return {
        id: `youtube_${video.videoId}`,
        title: video.title,
        artist: video.author || 'Artis YouTube',
        album: 'YouTube Music Hits',
        duration: video.lengthSeconds || 0,
        coverUrl: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
        audioUrl: '', 
        source: 'youtube',
        videoId: video.videoId,
        themeColor: '#ff0055'
      };
    });

    youtubeSearchBuffer = ytTracks;
    const initialTracks = youtubeSearchBuffer.splice(0, 10);
    currentSearchYouTubeTracks = initialTracks;
    renderTrackList(youtubeContainer, initialTracks);

    if (data.length < 15 && youtubeSearchBuffer.length === 0) {
      hasMoreSearchResults = false;
    }
  }).catch(err => {
    console.error('YouTube search failed:', err);
    youtubeLoading.style.display = 'none';
    youtubeContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px; color: #ff3b30;">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
        <h3>Pencarian YouTube Gagal</h3>
        <p>Gagal memuat lagu dari YouTube Music karena masalah koneksi lokal.</p>
      </div>
    `;
    hasMoreSearchResults = false;
  });

  // 3. Search online Audius via local proxy
  searchAudius(query).then(data => {
    onlineLoading.style.display = 'none';
    if (data.length === 0) {
      onlineContainer.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
          <h3>Tidak Ada Hasil</h3>
          <p>Lagu tidak ditemukan di server Audius.</p>
        </div>
      `;
      return;
    }

    const onlineTracks = data
      .filter(item => item.is_streamable)
      .slice(0, 10)
      .map(item => {
        const streamUrl = `https://api.audius.co/v1/tracks/${item.id}/stream?app_name=JEFFPLAY`;
        return {
          id: `audius_${item.id}`,
          title: item.title || 'Lagu Online',
          artist: item.user?.name || 'Artis Audius',
          album: 'Audius Stream',
          duration: item.duration || 0,
          coverUrl: item.artwork ? item.artwork['150x150'] : '/default_cover.png',
          audioUrl: `/proxy-api?url=${encodeURIComponent(streamUrl)}`,
          source: 'audius',
          trackId: item.id,
          themeColor: '#ff007f'
        };
      });

    renderTrackList(onlineContainer, onlineTracks);
  }).catch(err => {
    console.error('Audius search failed:', err);
    onlineLoading.style.display = 'none';
    onlineContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px; color: #ff3b30;">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg>
        <h3>Pencarian Audius Gagal</h3>
        <p>Gagal memuat hasil pencarian dari Audius (masalah koneksi server atau CORS).</p>
      </div>
    `;
  });
}
