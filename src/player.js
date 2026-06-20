import { getOfflineTrackSync } from './storage.js';

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.shuffleMode = false;
    this.repeatMode = 'none'; // 'none', 'one', 'all'
    this.listeners = {};
    
    // Manage blob URLs to prevent browser memory leaks
    this.currentBlobUrl = null;

    // Hybrid playback properties
    this.activePlayer = 'native'; // 'native' | 'youtube'
    this.ytPlayer = null;
    this.ytPlayerReady = false;
    this.ytTimer = null;

    this._setupAudioListeners();
    this._setupYTAPIHook();
  }

  /**
   * Sets up native HTML5 Audio element listeners to propagate state updates.
   * @private
   */
  _setupAudioListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this.notify('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0,
        percentage: (this.audio.currentTime / (this.audio.duration || 1)) * 100
      });
    });

    this.audio.addEventListener('ended', () => {
      this.next();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notify('playstate', { isPlaying: true });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify('playstate', { isPlaying: false });
    });

    this.audio.addEventListener('volumechange', () => {
      this.notify('volumechange', this.audio.volume);
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio element error:', this.audio.error);
      this.notify('error', this.audio.error);
    });
  }

  /**
   * Sets up YouTube API ready hook.
   * @private
   */
  _setupYTAPIHook() {
    if (window.YT && window.YT.Player) {
      this._initYTPlayer();
      return;
    }

    const prevHook = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevHook) prevHook();
      this._initYTPlayer();
    };

    // Fallback polling for initialization safety
    let attempts = 0;
    const pollInterval = setInterval(() => {
      attempts++;
      if (window.YT && window.YT.Player) {
        clearInterval(pollInterval);
        this._initYTPlayer();
      } else if (attempts >= 40) { // 10 seconds timeout
        clearInterval(pollInterval);
        console.warn('YouTube Iframe API failed to load after 10s.');
      }
    }, 250);
  }

  /**
   * Initializes the off-screen YouTube player.
   * @private
   */
  _initYTPlayer() {
    if (this.ytPlayer) return;
    try {
      this.ytPlayer = new window.YT.Player('yt-player', {
        height: '200',
        width: '200',
        videoId: '',
        playerVars: {
          'playsinline': 1,
          'controls': 0,
          'disablekb': 1,
          'fs': 0,
          'modestbranding': 1,
          'rel': 0
        },
        events: {
          'onReady': () => {
            console.log('YouTube Iframe Player is ready!');
            this.ytPlayerReady = true;
            this.ytPlayer.setVolume(this.audio.volume * 100);
          },
          'onStateChange': (e) => {
            this._handleYTStateChange(e);
          },
          'onError': (e) => {
            console.error('YouTube player error:', e.data);
            this.notify('error', new Error(`YouTube playback error (code ${e.data})`));
          }
        }
      });
    } catch (e) {
      console.error('Failed to initialize YouTube Iframe Player:', e);
    }
  }

  /**
   * Handles YouTube player state transitions.
   * @private
   * @param {Object} event 
   */
  _handleYTStateChange(event) {
    const state = event.data;
    if (state === window.YT.PlayerState.PLAYING) {
      this.isPlaying = true;
      this._startYTProgressTimer();
      this.notify('playstate', { isPlaying: true });
    } else if (state === window.YT.PlayerState.PAUSED) {
      this.isPlaying = false;
      this._stopYTProgressTimer();
      this.notify('playstate', { isPlaying: false });
    } else if (state === window.YT.PlayerState.ENDED) {
      this.isPlaying = false;
      this._stopYTProgressTimer();
      this.next();
    }
  }

  /**
   * Starts polling for progress updates since YouTube iframe player doesn't emit timeupdate.
   * @private
   */
  _startYTProgressTimer() {
    this._stopYTProgressTimer();
    this.ytTimer = setInterval(() => {
      if (this.ytPlayer && this.ytPlayerReady && this.isPlaying) {
        try {
          const currentTime = this.ytPlayer.getCurrentTime() || 0;
          const duration = this.ytPlayer.getDuration() || 0;
          this.notify('timeupdate', {
            currentTime: currentTime,
            duration: duration,
            percentage: duration > 0 ? (currentTime / duration) * 100 : 0
          });
        } catch (e) {
          // ignore transient iframe exceptions
        }
      }
    }, 250);
  }

  /**
   * Stops polling progress updates.
   * @private
   */
  _stopYTProgressTimer() {
    if (this.ytTimer) {
      clearInterval(this.ytTimer);
      this.ytTimer = null;
    }
  }

  /**
   * Subscribes a callback to player events.
   * @param {string} event - event name ('trackchange', 'playstate', 'timeupdate', 'volumechange', 'error')
   * @param {Function} callback 
   */
  addEventListener(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Unsubscribes a callback from player events.
   * @param {string} event 
   * @param {Function} callback 
   */
  removeEventListener(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Triggers callbacks for a specific event.
   * @param {string} event 
   * @param {*} data 
   */
  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      });
    }
  }

  /**
   * Sets the active queue and starts playing a specific track.
   * @param {Array} tracks - Array of track objects
   * @param {string} [startTrackId] - The track ID to start playing
   */
  setQueue(tracks, startTrackId) {
    this.queue = [...tracks];
    if (startTrackId) {
      this.currentIndex = this.queue.findIndex(t => t.id === startTrackId);
    } else {
      this.currentIndex = this.queue.length > 0 ? 0 : -1;
    }
    
    if (this.currentIndex !== -1) {
      this.loadAndPlayCurrent();
    }
  }

  /**
   * Plays a track immediately, adding it to the queue if not already present.
   * @param {Object} track 
   */
  playTrackDirectly(track) {
    const existingIndex = this.queue.findIndex(t => t.id === track.id);
    if (existingIndex !== -1) {
      this.currentIndex = existingIndex;
    } else {
      this.queue.push(track);
      this.currentIndex = this.queue.length - 1;
    }
    this.loadAndPlayCurrent();
  }

  /**
   * Resolves the track audio source (online URL vs IndexedDB blob) and begins playback.
   */
  loadAndPlayCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) return;

    const track = this.queue[this.currentIndex];

    // Revoke previous blob URL to free memory
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.notify('trackchange', track);

    try {
      let isOffline = !!track.fileBlob;
      let offlinePlayUrl = null;

      if (!isOffline) {
        const offlineTrack = getOfflineTrackSync(track.id);
        if (offlineTrack && offlineTrack.fileBlob) {
          isOffline = true;
          this.currentBlobUrl = URL.createObjectURL(offlineTrack.fileBlob);
          offlinePlayUrl = this.currentBlobUrl;
          console.log(`Playing cached offline version of: ${track.title}`);
        }
      } else {
        this.currentBlobUrl = URL.createObjectURL(track.fileBlob);
        offlinePlayUrl = this.currentBlobUrl;
      }

      if (track.source === 'youtube' && !isOffline) {
        console.log(`Streaming online YouTube track: ${track.title} (${track.videoId})`);
        this.activePlayer = 'youtube';

        // Pause native audio player
        this.audio.pause();
        this._stopYTProgressTimer();

        if (this.ytPlayer && this.ytPlayerReady) {
          this.ytPlayer.loadVideoById(track.videoId);
          this.isPlaying = true;
          this.notify('playstate', { isPlaying: true });
        } else {
          console.warn('YouTube Player not ready yet, queuing playback...');
          this.isPlaying = false;
          this.notify('playstate', { isPlaying: false });

          // Set up a one-time interval to wait for ready status
          const checkInterval = setInterval(() => {
            if (this.ytPlayer && this.ytPlayerReady) {
              clearInterval(checkInterval);
              // Ensure we are still on the same track before loading
              const currentTrack = this.queue[this.currentIndex];
              if (currentTrack && currentTrack.id === track.id) {
                this.ytPlayer.loadVideoById(track.videoId);
                this.isPlaying = true;
                this.notify('playstate', { isPlaying: true });
              }
            }
          }, 200);
        }
      } else {
        console.log(`Playing local/offline track: ${track.title}`);
        this.activePlayer = 'native';

        // Pause YouTube player if playing
        if (this.ytPlayer && this.ytPlayerReady) {
          try {
            this.ytPlayer.pauseVideo();
          } catch (e) {}
        }
        this._stopYTProgressTimer();

        let playUrl = offlinePlayUrl || track.audioUrl;
        this.audio.src = playUrl;
        this.audio.load();
        this.audio.play()
          .then(() => {
            this.isPlaying = true;
            this.notify('playstate', { isPlaying: true });
          })
          .catch(error => {
            console.error('Audio play failed:', error);
            this.isPlaying = false;
            this.notify('playstate', { isPlaying: false });
            this.notify('error', error);
          });
      }
    } catch (error) {
      console.error('Error loading or playing track:', error);
      this.isPlaying = false;
      this.notify('playstate', { isPlaying: false });
      this.notify('error', error);
    }
  }

  play() {
    if (this.queue.length === 0) return;
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
    } else {
      if (this.activePlayer === 'youtube' && this.ytPlayerReady) {
        this.ytPlayer.playVideo();
      } else {
        this.audio.play().catch(err => {
          console.error('Audio play failed:', err);
          this.notify('error', err);
        });
      }
    }
  }

  pause() {
    if (this.activePlayer === 'youtube' && this.ytPlayerReady) {
      this.ytPlayer.pauseVideo();
    } else {
      this.audio.pause();
    }
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
      return;
    }

    if (this.shuffleMode) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
      if (this.currentIndex === 0 && this.repeatMode === 'none') {
        this.pause();
        this.seek(0);
        return;
      }
    }
    this.loadAndPlayCurrent();
  }

  previous() {
    if (this.queue.length === 0) return;

    const curTime = this.activePlayer === 'youtube' && this.ytPlayerReady
      ? this.ytPlayer.getCurrentTime()
      : this.audio.currentTime;

    if (curTime > 5) {
      this.seek(0);
      return;
    }

    if (this.shuffleMode) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    }
    this.loadAndPlayCurrent();
  }

  seek(seconds) {
    if (this.activePlayer === 'youtube' && this.ytPlayerReady) {
      try {
        this.ytPlayer.seekTo(seconds, true);
        const duration = this.ytPlayer.getDuration() || 0;
        this.notify('timeupdate', {
          currentTime: seconds,
          duration: duration,
          percentage: duration > 0 ? (seconds / duration) * 100 : 0
        });
      } catch (e) {}
    } else if (this.audio.duration) {
      this.audio.currentTime = seconds;
    }
  }

  setVolume(volume) {
    const vol = Math.max(0, Math.min(1, volume));
    this.audio.volume = vol;
    if (this.ytPlayer && this.ytPlayerReady) {
      try {
        this.ytPlayer.setVolume(vol * 100);
      } catch (e) {}
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    this.notify('shuffletoggle', this.shuffleMode);
    return this.shuffleMode;
  }

  toggleRepeat() {
    if (this.repeatMode === 'none') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'none';
    }
    this.notify('repeattoggle', this.repeatMode);
    return this.repeatMode;
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  getQueue() {
    return this.queue;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }
}

// Export a singleton instance of the AudioPlayer
const playerInstance = new AudioPlayer();
export default playerInstance;
