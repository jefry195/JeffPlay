const DB_NAME = 'jeffplay_db';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store for tracks (both downloaded online tracks and custom uploads)
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      }

      // Store for playlists
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }

      // Store for favorites
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('Database failed to open:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

let offlineTracksCache = [];

/**
 * Synchronously retrieves a track from the offline cache.
 * @param {string} id - Track ID
 * @returns {Object|null}
 */
export function getOfflineTrackSync(id) {
  return offlineTracksCache.find(t => t.id === id) || null;
}

/**
 * Retrieves all offline tracks (downloaded online songs + custom uploads).
 * @returns {Promise<Array>}
 */
export async function getOfflineTracks() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readonly');
    const store = transaction.objectStore('tracks');
    const request = store.getAll();
    request.onsuccess = () => {
      offlineTracksCache = request.result || [];
      resolve(offlineTracksCache);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Fetches and saves an online track (audio file + artwork) to IndexedDB for offline play.
 * @param {Object} track - The track object to download.
 * @returns {Promise<Object>} The downloaded track metadata.
 */
export async function downloadOnlineTrack(track) {
  const db = await initDB();
  
  // Fetch the audio file
  const response = await fetch(track.audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio file: ${response.statusText}`);
  }
  const fileBlob = await response.blob();

  // Fetch cover art if available
  let coverBlob = null;
  if (track.coverUrl) {
    try {
      const coverResponse = await fetch(track.coverUrl);
      if (coverResponse.ok) {
        coverBlob = await coverResponse.blob();
      }
    } catch (e) {
      console.warn('Failed to cache cover image, falling back to URL', e);
    }
  }

  const offlineTrack = {
    ...track,
    fileBlob,
    coverBlob,
    source: 'online', // mark as online but offline-available
    downloadedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readwrite');
    const store = transaction.objectStore('tracks');
    const request = store.put(offlineTrack);
    request.onsuccess = () => {
      offlineTracksCache = offlineTracksCache.filter(t => t.id !== offlineTrack.id);
      offlineTracksCache.push(offlineTrack);
      resolve(offlineTrack);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a user-uploaded custom track into IndexedDB.
 * @param {Object} data
 * @param {string} data.title
 * @param {string} data.artist
 * @param {string} data.album
 * @param {number} data.duration - in seconds
 * @param {Blob} data.fileBlob - Audio file
 * @param {Blob|null} data.coverBlob - Cover art blob
 * @returns {Promise<Object>} The saved track object.
 */
export async function saveCustomTrack({ title, artist, album, duration, fileBlob, coverBlob, source, videoId }) {
  const db = await initDB();
  const trackId = source === 'youtube' ? `youtube_${videoId}` : `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const track = {
    id: trackId,
    title: title || 'Unknown Title',
    artist: artist || 'Unknown Artist',
    album: album || 'Unknown Album',
    duration: duration || 0,
    source: source || 'custom',
    videoId: videoId || null,
    fileBlob,
    coverBlob: coverBlob || null,
    createdAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readwrite');
    const store = transaction.objectStore('tracks');
    const request = store.add(track);
    request.onsuccess = () => {
      offlineTracksCache.push(track);
      resolve(track);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Removes a track from IndexedDB (deletes custom upload or downloaded track metadata/audio).
 * @param {string} id - Track ID
 * @returns {Promise<void>}
 */
export async function deleteOfflineTrack(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readwrite');
    const store = transaction.objectStore('tracks');
    const request = store.delete(id);
    request.onsuccess = () => {
      offlineTracksCache = offlineTracksCache.filter(t => t.id !== id);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Checks if a track is available offline (either downloaded or custom).
 * @param {string} id - Track ID
 * @returns {Promise<boolean>}
 */
export async function isTrackDownloaded(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tracks', 'readonly');
    const store = transaction.objectStore('tracks');
    const request = store.get(id);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => resolve(false);
  });
}

/**
 * Retrieves all playlists.
 * @returns {Promise<Array>}
 */
export async function getPlaylists() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readonly');
    const store = transaction.objectStore('playlists');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Creates a new playlist.
 * @param {string} name - Playlist name
 * @returns {Promise<Object>} The created playlist.
 */
export async function createPlaylist(name) {
  const db = await initDB();
  const playlist = {
    id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    trackIds: [],
    createdAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readwrite');
    const store = transaction.objectStore('playlists');
    const request = store.add(playlist);
    request.onsuccess = () => resolve(playlist);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a playlist.
 * @param {string} id - Playlist ID
 * @returns {Promise<void>}
 */
export async function deletePlaylist(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readwrite');
    const store = transaction.objectStore('playlists');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Updates the tracks array inside a playlist.
 * @param {string} playlistId
 * @param {Array<string>} trackIds
 * @returns {Promise<Object>} The updated playlist.
 */
export async function updatePlaylistTracks(playlistId, trackIds) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('playlists', 'readwrite');
    const store = transaction.objectStore('playlists');

    const getRequest = store.get(playlistId);
    getRequest.onsuccess = () => {
      const playlist = getRequest.result;
      if (!playlist) {
        reject(new Error('Playlist not found'));
        return;
      }
      playlist.trackIds = trackIds;
      const putRequest = store.put(playlist);
      putRequest.onsuccess = () => resolve(playlist);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Gets the list of favorited track IDs.
 * @returns {Promise<Array<string>>}
 */
export async function getFavorites() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('favorites', 'readonly');
    const store = transaction.objectStore('favorites');
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).map(f => f.id));
    request.onerror = () => reject(request.error);
  });
}

/**
 * Toggles a track favorite state.
 * @param {string} trackId
 * @returns {Promise<boolean>} Resolves to true if added, false if removed.
 */
export async function toggleFavorite(trackId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('favorites', 'readwrite');
    const store = transaction.objectStore('favorites');

    const getRequest = store.get(trackId);
    getRequest.onsuccess = () => {
      if (getRequest.result) {
        // Already favorited, remove it
        const deleteRequest = store.delete(trackId);
        deleteRequest.onsuccess = () => resolve(false);
        deleteRequest.onerror = () => reject(deleteRequest.error);
      } else {
        // Not favorited, add it
        const addRequest = store.add({ id: trackId, addedAt: Date.now() });
        addRequest.onsuccess = () => resolve(true);
        addRequest.onerror = () => reject(addRequest.error);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Checks if a track is favorited.
 * @param {string} trackId
 * @returns {Promise<boolean>}
 */
export async function isFavorite(trackId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('favorites', 'readonly');
    const store = transaction.objectStore('favorites');
    const request = store.get(trackId);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => resolve(false);
  });
}

/**
 * Calculates current IndexedDB storage statistics.
 * @returns {Promise<Object>} { usage, quota, percentage } in bytes.
 */
export async function getStorageStats() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: estimate.usage && estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
      };
    } catch (e) {
      console.warn('Could not estimate storage usage', e);
    }
  }
  return { usage: 0, quota: 0, percentage: 0 };
}
