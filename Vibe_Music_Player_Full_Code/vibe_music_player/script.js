const $ = (selector) => document.querySelector(selector);
const audio = $('#audio');
const musicUpload = $('#musicUpload');
const playlist = $('#playlist');
const apiForm = $('#apiSearchForm');
const apiInput = $('#apiSearchInput');
const apiResults = $('#apiResults');
const apiStatus = $('#apiStatus');

let localTracks = [];
let onlineTracks = [];
let currentTrack = null;
let currentIndex = -1;
let queueType = 'local';
let favoritesOnly = false;
let shuffleEnabled = false;
let repeatEnabled = false;
let searchNumber = 0;

// Store full online track details so favorites survive new searches and refreshes.
const savedFavorites = new Map();
try {
  const stored = JSON.parse(localStorage.getItem('vibeFavorites') || '[]');
  stored.forEach(track => {
    if (track && track.id) savedFavorites.set(String(track.id), track);
  });
} catch (error) {
  console.warn('Could not read saved favorites:', error);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function saveFavorites() {
  // Only serializable metadata is saved, never local blob URLs.
  const serializable = [...savedFavorites.values()].map(track => ({
    id: String(track.id), type: track.type, title: track.title, artist: track.artist,
    album: track.album, duration: track.duration || 0, src: track.type === 'online' ? track.src : '',
    artwork: track.artwork || '', storeUrl: track.storeUrl || ''
  }));
  localStorage.setItem('vibeFavorites', JSON.stringify(serializable));
}
function isFavorite(track) { return Boolean(track && savedFavorites.has(String(track.id))); }
function getCurrentQueue() { return queueType === 'online' ? onlineTracks : localTracks; }
function getVisibleTracks() {
  if (!favoritesOnly) return localTracks;
  const merged = [...savedFavorites.values(), ...localTracks.filter(isFavorite), ...onlineTracks.filter(isFavorite)];
  return merged.filter((track, index, array) => array.findIndex(item => String(item.id) === String(track.id)) === index);
}
function setStatus(message) { apiStatus.textContent = message; }
function setArtwork(container, artwork, altText = 'Album artwork') {
  container.replaceChildren();
  if (!artwork) { container.textContent = '♫'; return; }
  const image = document.createElement('img');
  image.src = artwork; image.alt = altText; image.loading = 'lazy';
  image.onerror = () => { container.replaceChildren(); container.textContent = '♫'; };
  container.appendChild(image);
}

musicUpload.addEventListener('change', event => {
  const files = Array.from(event.target.files || []);
  let added = 0;
  files.forEach(file => {
    if (!file.type.startsWith('audio/')) return;
    const track = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'local', title: file.name.replace(/\.[^/.]+$/, ''), artist: 'Local Audio',
      album: 'Your Device', duration: 0, src: URL.createObjectURL(file), artwork: '', file
    };
    localTracks.push(track); added++;
    const metaAudio = document.createElement('audio');
    metaAudio.preload = 'metadata'; metaAudio.src = track.src;
    metaAudio.addEventListener('loadedmetadata', () => {
      track.duration = Number.isFinite(metaAudio.duration) ? metaAudio.duration : 0;
      renderPlaylist();
      if (currentTrack?.id === track.id) $('#duration').textContent = formatTime(track.duration);
      metaAudio.removeAttribute('src'); metaAudio.load();
    }, { once: true });
  });
  renderPlaylist();
  if (added) setStatus(`${added} local track${added === 1 ? '' : 's'} added to your library.`);
  musicUpload.value = '';
});

function renderPlaylist() {
  const tracks = getVisibleTracks();
  $('#trackCount').textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
  $('#libraryTitle').textContent = favoritesOnly ? 'Your Favorites' : 'Your Library';
  playlist.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const icon = document.createElement('span'); icon.textContent = favoritesOnly ? '♡' : '♫';
    const heading = document.createElement('h3'); heading.textContent = favoritesOnly ? 'No favorites yet' : 'Your library is waiting';
    const description = document.createElement('p'); description.textContent = favoritesOnly ? 'Use the heart button on any song to save it here.' : 'Add audio files from your device or discover online previews above.';
    empty.append(icon, heading, description);
    if (!favoritesOnly) { const label = document.createElement('label'); label.className = 'primary-btn upload-inline'; label.htmlFor = 'musicUpload'; label.textContent = '＋ Add Music'; empty.appendChild(label); }
    playlist.appendChild(empty); return;
  }
  tracks.forEach((track, index) => {
    const row = document.createElement('div'); row.className = 'track-row';
    if (currentTrack?.id === track.id && queueType === track.type) row.classList.add('current-track');
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = String(index + 1);
    const main = document.createElement('div'); main.className = 'track-main'; main.tabIndex = 0; main.setAttribute('role', 'button'); main.setAttribute('aria-label', `Play ${track.title}`);
    const thumb = document.createElement('div'); thumb.className = 'track-thumb'; setArtwork(thumb, track.artwork, `${track.title} artwork`);
    const textBox = document.createElement('div'); textBox.className = 'track-main-text';
    const title = document.createElement('strong'); title.textContent = track.title;
    const artist = document.createElement('small'); artist.textContent = track.artist || 'Unknown artist';
    textBox.append(title, artist); main.append(thumb, textBox);
    const playThis = () => playTrack(track, track.type === 'online' ? 'online' : 'local');
    main.addEventListener('click', playThis); main.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playThis(); } });
    const album = document.createElement('span'); album.className = 'track-album'; album.textContent = track.album || '—';
    const duration = document.createElement('span'); duration.className = 'track-duration'; duration.textContent = formatTime(track.duration);
    const actions = document.createElement('div'); actions.className = 'track-actions';
    const fav = document.createElement('button'); fav.className = 'small-icon'; fav.textContent = isFavorite(track) ? '♥' : '♡'; fav.classList.toggle('favorited', isFavorite(track)); fav.setAttribute('aria-label', 'Toggle favorite');
    fav.addEventListener('click', () => toggleFavorite(track)); actions.appendChild(fav);
    row.append(number, main, album, duration, actions); playlist.appendChild(row);
  });
}

function updatePlayer(track) {
  $('#currentTitle').textContent = track.title;
  $('#currentArtist').textContent = track.artist || 'Unknown artist';
  setArtwork($('#albumArt'), track.artwork, `${track.title} artwork`);
  $('#currentTime').textContent = '0:00'; $('#duration').textContent = formatTime(track.duration); $('#progressBar').value = 0;
  updateFavoriteButton(); renderPlaylist(); renderApiResults();
}
async function playTrack(track, type) {
  currentTrack = track; queueType = type;
  const queue = getCurrentQueue(); currentIndex = queue.findIndex(item => String(item.id) === String(track.id));
  audio.pause(); audio.src = track.src; audio.load(); updatePlayer(track); updatePlayButton();
  try { await audio.play(); }
  catch (error) { console.error('Playback error:', error); setStatus('Playback could not start. Try another track or check your browser audio permissions.'); }
}
function updatePlayButton() {
  const playing = !audio.paused && Boolean(audio.src);
  $('#playBtn').textContent = playing ? 'Ⅱ' : '▶'; $('#playBtn').title = playing ? 'Pause' : 'Play';
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}
$('#playBtn').addEventListener('click', async () => {
  if (!currentTrack) {
    if (localTracks[0]) await playTrack(localTracks[0], 'local');
    else if (onlineTracks[0]) await playTrack(onlineTracks[0], 'online');
    else setStatus('Search for a song or add music from your device first.');
    return;
  }
  if (audio.paused) {
    try { await audio.play(); } catch (error) { console.error(error); setStatus('This audio could not play. Try another track.'); }
  } else audio.pause();
  updatePlayButton();
});
function playNext() {
  const queue = getCurrentQueue(); if (!queue.length) return;
  let nextIndex;
  if (shuffleEnabled && queue.length > 1) { do { nextIndex = Math.floor(Math.random() * queue.length); } while (nextIndex === currentIndex); }
  else nextIndex = currentIndex + 1;
  if (nextIndex >= queue.length) {
    if (repeatEnabled) nextIndex = 0;
    else { audio.pause(); audio.currentTime = 0; updatePlayButton(); return; }
  }
  playTrack(queue[nextIndex], queueType);
}
function playPrevious() {
  const queue = getCurrentQueue(); if (!queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let previousIndex = currentIndex - 1;
  if (previousIndex < 0) previousIndex = repeatEnabled ? queue.length - 1 : 0;
  playTrack(queue[previousIndex], queueType);
}
$('#nextBtn').addEventListener('click', playNext); $('#prevBtn').addEventListener('click', playPrevious);
audio.addEventListener('play', updatePlayButton); audio.addEventListener('pause', updatePlayButton);
audio.addEventListener('loadedmetadata', () => {
  if (currentTrack) { currentTrack.duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack.duration; $('#duration').textContent = formatTime(audio.duration); renderPlaylist(); }
});
audio.addEventListener('timeupdate', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) $('#progressBar').value = (audio.currentTime / audio.duration) * 100;
  else $('#progressBar').value = 0;
  $('#currentTime').textContent = formatTime(audio.currentTime);
});
$('#progressBar').addEventListener('input', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = (Number($('#progressBar').value) / 100) * audio.duration; });
audio.addEventListener('ended', () => {
  if (repeatEnabled && currentTrack) { audio.currentTime = 0; audio.play().catch(console.error); return; }
  if ($('#autoplayCheck').checked) playNext(); else updatePlayButton();
});
audio.addEventListener('error', () => { if (currentTrack) setStatus('The audio could not be loaded. Try another track.'); updatePlayButton(); });

audio.volume = Number($('#volumeBar').value);
$('#volumeBar').addEventListener('input', () => { audio.volume = Number($('#volumeBar').value); audio.muted = false; updateMuteButton(); });
function updateMuteButton() { $('#muteBtn').textContent = audio.muted || audio.volume === 0 ? '🔇' : '🔊'; $('#muteBtn').title = audio.muted || audio.volume === 0 ? 'Unmute' : 'Mute'; }
$('#muteBtn').addEventListener('click', () => { audio.muted = !audio.muted; updateMuteButton(); });
$('#shuffleBtn').addEventListener('click', () => { shuffleEnabled = !shuffleEnabled; $('#shuffleBtn').classList.toggle('active-control', shuffleEnabled); $('#shuffleBtn').setAttribute('aria-pressed', String(shuffleEnabled)); });
$('#repeatBtn').addEventListener('click', () => { repeatEnabled = !repeatEnabled; $('#repeatBtn').classList.toggle('active-control', repeatEnabled); $('#repeatBtn').setAttribute('aria-pressed', String(repeatEnabled)); });

function toggleFavorite(track) {
  const id = String(track.id);
  if (savedFavorites.has(id)) savedFavorites.delete(id);
  else {
    // Save all display metadata so the favorite remains after later searches/reload.
    savedFavorites.set(id, { id, type: track.type, title: track.title, artist: track.artist, album: track.album,
      duration: track.duration || 0, src: track.type === 'online' ? track.src : '', artwork: track.artwork || '', storeUrl: track.storeUrl || '' });
  }
  saveFavorites(); updateFavoriteButton(); renderPlaylist(); renderApiResults();
}
function updateFavoriteButton() {
  const button = $('#currentFavoriteBtn'); const favorite = currentTrack && isFavorite(currentTrack);
  button.textContent = favorite ? '♥' : '♡'; button.classList.toggle('favorited', Boolean(favorite)); button.setAttribute('aria-pressed', String(Boolean(favorite)));
}
$('#currentFavoriteBtn').addEventListener('click', () => { if (currentTrack) toggleFavorite(currentTrack); });

apiForm.addEventListener('submit', async event => {
  event.preventDefault(); const query = apiInput.value.trim(); if (!query) return;
  const thisSearch = ++searchNumber; setStatus('Searching for songs...'); apiResults.replaceChildren();
  try {
    const url = new URL('https://itunes.apple.com/search'); url.searchParams.set('term', query); url.searchParams.set('media', 'music');
    url.searchParams.set('entity', 'song'); url.searchParams.set('limit', '20'); url.searchParams.set('country', 'IN');
    const response = await fetch(url); if (!response.ok) throw new Error(`Music API error: ${response.status}`);
    const data = await response.json(); if (thisSearch !== searchNumber) return;
    onlineTracks = (data.results || []).filter(t => t.trackName && t.previewUrl).map(t => ({
      id: `itunes-${t.trackId}`, type: 'online', title: t.trackName, artist: t.artistName || 'Unknown artist',
      album: t.collectionName || 'Single', duration: Number.isFinite(t.trackTimeMillis) ? t.trackTimeMillis / 1000 : 30,
      src: t.previewUrl, artwork: t.artworkUrl100 || '', storeUrl: t.trackViewUrl || ''
    }));
    // Refresh currently returned results with saved metadata; favorite cards remain in Favorites even if not in this search.
    if (!onlineTracks.length) { setStatus('No playable previews found. Try a different song or artist.'); renderPlaylist(); return; }
    setStatus(`${onlineTracks.length} results found. Available previews are short clips.`);
    renderApiResults(); renderPlaylist();
  } catch (error) {
    console.error('Music search failed:', error);
    if (thisSearch === searchNumber) setStatus('Could not fetch songs. Check your internet connection and try again using Live Server.');
  }
});
function renderApiResults() {
  apiResults.replaceChildren();
  onlineTracks.forEach(track => {
    const card = document.createElement('article'); card.className = 'api-card';
    const artwork = document.createElement('img'); artwork.src = track.artwork || ''; artwork.alt = `${track.title} album artwork`; artwork.loading = 'lazy';
    const title = document.createElement('h3'); title.textContent = track.title;
    const artist = document.createElement('p'); artist.textContent = `${track.artist} • ${track.album}`;
    const playButton = document.createElement('button'); playButton.type = 'button';
    playButton.textContent = currentTrack?.id === track.id && !audio.paused ? '▶ Playing Preview' : '▶ Play Preview';
    playButton.addEventListener('click', () => playTrack(track, 'online'));
    const favoriteButton = document.createElement('button'); favoriteButton.type = 'button';
    favoriteButton.textContent = isFavorite(track) ? '♥ Remove Favorite' : '♡ Add Favorite';
    favoriteButton.addEventListener('click', () => toggleFavorite(track));
    const storeLink = document.createElement('a');
    if (track.storeUrl) { storeLink.href = track.storeUrl; storeLink.target = '_blank'; storeLink.rel = 'noopener noreferrer'; storeLink.textContent = 'View on Apple Music / iTunes'; }
    else storeLink.textContent = 'Store link unavailable';
    card.append(artwork, title, artist, playButton, favoriteButton, storeLink); apiResults.appendChild(card);
  });
}

$('#themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light-theme');
  localStorage.setItem('vibeTheme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
});
if (localStorage.getItem('vibeTheme') === 'light') document.body.classList.add('light-theme');
$('#homeBtn').addEventListener('click', () => {
  favoritesOnly = false; $('#homeBtn').classList.add('active'); $('#favoritesNavBtn').classList.remove('active'); renderPlaylist(); $('#librarySection').scrollIntoView({ behavior: 'smooth' });
});
$('#favoritesNavBtn').addEventListener('click', () => {
  favoritesOnly = true; $('#favoritesNavBtn').classList.add('active'); $('#homeBtn').classList.remove('active'); renderPlaylist(); $('#librarySection').scrollIntoView({ behavior: 'smooth' });
});
$('#exploreBtn').addEventListener('click', () => { $('#discoverSection').scrollIntoView({ behavior: 'smooth' }); apiInput.focus(); });

updateMuteButton(); updatePlayButton(); renderPlaylist();
