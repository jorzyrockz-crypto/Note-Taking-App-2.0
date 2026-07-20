import { getPageNotes, renderGrid, setActiveSidebarPage, openEditModal } from './app.js';

let dedSearchInput, dedSearchClear, searchBrowseSection, searchResultsSection, dedSearchResultsGrid, searchFilterPills, browseCards;

export function renderSearchPage() {
  const settingsPageEl = document.getElementById('settings-page');
  const prodPageEl = document.getElementById('productivity-page');
  const searchPageEl = document.getElementById('search-page');
  const creatorWrapper = document.querySelector('.creator-wrapper');
  const feedFilterRow = document.getElementById('feed-filter-row');
  const notesFeed = document.getElementById('notes-feed');

  if (settingsPageEl) settingsPageEl.style.display = 'none';
  if (prodPageEl) prodPageEl.style.display = 'none';
  if (creatorWrapper) creatorWrapper.style.display = 'none';
  if (feedFilterRow) feedFilterRow.style.display = 'none';
  if (notesFeed) notesFeed.style.display = 'none';
  if (searchPageEl) searchPageEl.style.display = 'flex';

  renderSearchMediaConsolidation();
  setActiveSidebarPage('search');
}

function getNoteImageSrc(note) {
  if (!note) return null;
  if (note.image) return note.image;
  if (note.sketch) return note.sketch;
  if (note.coverImage) return note.coverImage;
  if (note.bannerImage) return note.bannerImage;

  if (Array.isArray(note.files) && note.files.length > 0) {
    const imgFile = note.files.find(f => {
      const type = (f.type || '').toLowerCase();
      const name = (f.name || f.fileName || '').toLowerCase();
      const data = (f.data || f.url || f.src || '').toLowerCase();
      return type.startsWith('image/') || 
             data.startsWith('data:image/') ||
             /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/.test(name) ||
             /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/.test(data);
    });
    if (imgFile) return imgFile.data || imgFile.url || imgFile.src || null;
  }

  if (note.text) {
    const imgMatch = note.text.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) return imgMatch[1];
    const mdMatch = note.text.match(/!\[.*?\]\((https?:\/\/[^\s\)]+|\/.*?\.(?:png|jpg|jpeg|gif|webp))\)/i);
    if (mdMatch) return mdMatch[1];
  }

  return null;
}

function getNoteAudioSrc(note) {
  if (!note) return null;
  if (note.audio) return note.audio;
  if (Array.isArray(note.files) && note.files.length > 0) {
    const audioFile = note.files.find(f => {
      const type = (f.type || '').toLowerCase();
      const name = (f.name || f.fileName || '').toLowerCase();
      const data = (f.data || f.url || f.src || '').toLowerCase();
      return type.startsWith('audio/') || 
             data.startsWith('data:audio/') ||
             /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/.test(name) ||
             /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/.test(data);
    });
    if (audioFile) return audioFile.data || audioFile.url || audioFile.src || null;
  }
  return null;
}

function renderSearchMediaConsolidation() {
  const allNotes = getPageNotes('notes');
  const photoNotes = allNotes.filter(n => getNoteImageSrc(n));
  const fileNotes = allNotes.filter(n => getNoteAudioSrc(n) || (Array.isArray(n.files) && n.files.length > 0));
  const linkNotes = allNotes.filter(n => (n.text || '').includes('http'));

  const photosSection = document.getElementById('search-photos-section');
  const filesSection = document.getElementById('search-files-section');
  const linksSection = document.getElementById('search-links-section');

  if (photosSection) {
    photosSection.style.display = photoNotes.length > 0 ? 'flex' : 'none';
    if (photoNotes.length > 0) renderPhotosMediaGrid(document.getElementById('search-photos-grid'), photoNotes);
  }
  if (filesSection) {
    filesSection.style.display = fileNotes.length > 0 ? 'flex' : 'none';
    if (fileNotes.length > 0) renderFilesMediaGrid(document.getElementById('search-files-grid'), fileNotes);
  }
  if (linksSection) {
    linksSection.style.display = linkNotes.length > 0 ? 'flex' : 'none';
    if (linkNotes.length > 0) renderLinksMediaGrid(document.getElementById('search-links-grid'), linkNotes);
  }
}

function renderPhotosMediaGrid(container, photoNotes) {
  if (!container) return;
  container.className = 'photo-media-grid';
  container.innerHTML = '';
  photoNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'photo-media-card';
    const imgSrc = getNoteImageSrc(note) || '';
    const title = note.title || 'Untitled Photo';
    card.innerHTML = `
      <img src="${imgSrc}" class="photo-media-img" alt="${escapeHtml(title)}" loading="lazy">
      <div class="photo-media-overlay">
        <span class="photo-media-title">${escapeHtml(title)}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function renderFilesMediaGrid(container, fileNotes) {
  if (!container) return;
  container.className = 'voice-media-grid';
  container.innerHTML = '';
  fileNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'voice-media-card';
    const title = note.title || 'Voice Memo / File';
    card.innerHTML = `
      <div class="voice-play-btn">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div class="voice-info">
        <span class="voice-title">${escapeHtml(title)}</span>
        <div class="voice-wave-visualizer">
          <div class="voice-wave-bar" style="height: 60%;"></div>
          <div class="voice-wave-bar" style="height: 100%;"></div>
          <div class="voice-wave-bar" style="height: 40%;"></div>
          <div class="voice-wave-bar" style="height: 80%;"></div>
          <div class="voice-wave-bar" style="height: 50%;"></div>
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function renderLinksMediaGrid(container, linkNotes) {
  if (!container) return;
  container.className = 'link-media-grid';
  container.innerHTML = '';
  linkNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'link-media-card';
    const title = note.title || note.text || 'Web Link';
    const match = (note.text || '').match(/https?:\/\/([^\s\/]+)/i);
    const domain = match ? match[1] : 'link';
    const fullUrlMatch = (note.text || '').match(/https?:\/\/[^\s]+/i);
    const fullUrl = fullUrlMatch ? fullUrlMatch[0] : '';
    
    card.innerHTML = `
      <div class="link-header">
        <span class="link-domain-badge">
          <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          ${escapeHtml(domain)}
        </span>
      </div>
      <div class="link-title">${escapeHtml(title)}</div>
      ${fullUrl ? `<div class="link-url-text">${escapeHtml(fullUrl)}</div>` : ''}
    `;
    card.addEventListener('click', () => {
      if (typeof openEditModal === 'function') openEditModal(note);
    });
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function initSearch() {
  dedSearchInput = document.getElementById('dedicated-search-input');
  dedSearchClear = document.getElementById('dedicated-search-clear');
  searchBrowseSection = document.getElementById('search-browse-section');
  searchResultsSection = document.getElementById('search-results-section');
  dedSearchResultsGrid = document.getElementById('dedicated-search-results-grid');
  searchFilterPills = document.querySelectorAll('.search-filter-pill');
  const genreCards = document.querySelectorAll('.fluid-genre-card, .genre-chip, .browse-card');

  if (dedSearchInput) {
    const inputWrapper = dedSearchInput.closest('.search-page-input-wrapper');
    const updateInputState = () => {
      const hasVal = dedSearchInput.value.trim() !== '';
      if (dedSearchClear) dedSearchClear.style.display = hasVal ? 'flex' : 'none';
      if (inputWrapper) inputWrapper.classList.toggle('has-value', hasVal);
    };

    dedSearchInput.addEventListener('input', () => {
      updateInputState();
      renderDedicatedSearchResults();
    });

    if (dedSearchClear) {
      dedSearchClear.addEventListener('click', () => {
        dedSearchInput.value = '';
        updateInputState();
        renderDedicatedSearchResults();
        dedSearchInput.focus();
      });
    }
  }

  // App-wide Ctrl + K / Cmd + K Shortcut to trigger Search Page & Focus Input
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      renderSearchPage();
      if (dedSearchInput) {
        dedSearchInput.focus();
        dedSearchInput.select();
      }
    }
  });

  genreCards.forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.searchFilter;
      if (filter && dedSearchInput) {
        dedSearchInput.value = filter;
        const inputWrapper = dedSearchInput.closest('.search-page-input-wrapper');
        if (inputWrapper) inputWrapper.classList.add('has-value');
        if (dedSearchClear) dedSearchClear.style.display = 'flex';
        renderDedicatedSearchResults();
      }
    });
  });

  searchFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      searchFilterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderDedicatedSearchResults();
    });
  });
}

function renderDedicatedSearchResults() {
  if (!dedSearchInput) return;
  const query = dedSearchInput.value.toLowerCase().trim();
  
  if (query === '') {
    if(searchBrowseSection) searchBrowseSection.style.display = 'block';
    if(searchResultsSection) searchResultsSection.style.display = 'none';
    return;
  }
  
  if(searchBrowseSection) searchBrowseSection.style.display = 'none';
  if(searchResultsSection) searchResultsSection.style.display = 'block';

  const activePill = document.querySelector('.search-filter-pill.active')?.dataset.filter || 'all';
  const allNotes = getPageNotes('notes');
  const filteredNotes = allNotes.filter(note => {
    const title = (note.title || '').toLowerCase();
    const text = (note.text || '').toLowerCase();
    let matchesQuery = false;
    
    if (query.startsWith('kind:')) {
      const kind = query.substring(5);
      if (kind === 'checklist' && (note.text || '').includes('- [ ]')) matchesQuery = true;
      if (kind === 'image' && getNoteImageSrc(note)) matchesQuery = true;
      if (kind === 'voice' && (getNoteAudioSrc(note) || (Array.isArray(note.files) && note.files.length > 0))) matchesQuery = true;
      if (kind === 'link' && (note.text || '').includes('http')) matchesQuery = true;
    } else if (query.startsWith('folder:')) {
      matchesQuery = true; 
    } else if (query.startsWith('tag:')) {
      matchesQuery = true;
    } else {
      matchesQuery = title.includes(query) || text.includes(query) || (note.folder && note.folder.toLowerCase().includes(query)) || (note.tags && note.tags.some(t => t.toLowerCase().includes(query)));
    }

    if (!matchesQuery) return false;

    if (activePill === 'folders' && !note.folder) return false;
    if (activePill === 'tags' && (!note.tags || note.tags.length === 0)) return false;

    return true;
  });

  if (dedSearchResultsGrid) {
    if (filteredNotes.length === 0) {
      dedSearchResultsGrid.innerHTML = `<div class="empty-state-message">No results found for "${query}"</div>`;
    } else {
      renderGrid(dedSearchResultsGrid, filteredNotes);
    }
  }
}
