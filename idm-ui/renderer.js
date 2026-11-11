(() => {
  'use strict';

  // ── Constants & Extension Maps ─────────────────────────────────────────────
  const EXT_GROUPS = {
    music: new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'alac']),
    compressed: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab']),
    videos: new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', '3gp']),
    programs: new Set(['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'bat', 'cmd', 'ps1']),
    documents: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'epub', 'rtf']),
    apks: new Set(['apk', 'xapk', 'apks']),
    images: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'psd', 'raw', 'tiff']),
  };

  const CATEGORY_NAMES = {
    0: 'General',
    1: 'Programs',
    2: 'Music',
    3: 'Video',
    4: 'Compressed',
    5: 'Documents',
    6: 'APKs',
    7: 'Compressed',
    8: 'Images',
  };

  const PREFS_KEY = 'idm_uiux_prefs_v1';

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    downloads: [],
    filtered: [],
    selectedIds: new Set(),
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'date',
    sortDir: 'desc',
    contextItemId: null,
    pendingConfirmFn: null,
    refreshTimer: null,
    isFirstRender: true,
    prefs: loadPrefs(),
  };

  // ── DOM Cache ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const dom = {
    appWindow: $('app-window'),
    downloadsList: $('downloads-list'),
    emptyState: $('empty-state'),
    emptyTitle: $('empty-title'),
    emptySubtitle: $('empty-subtitle'),
    searchInput: $('search-input'),
    btnClearSearch: $('btn-clear-search'),
    chkSelectAllHead: $('chk-select-all-head'),
    chkSelectAllFoot: $('chk-select-all-foot'),
    selectionCount: $('selection-count'),
    syncDot: $('sync-dot'),
    syncLabel: $('sync-label'),
    diskCanvas: $('disk-donut'),
    diskPercent: $('disk-percent'),
    diskPath: $('disk-path'),
    diskDetail: $('disk-detail'),
    btnSpeedTest: $('btn-speed-test'),
    speedDown: $('speed-down'),
    speedUp: $('speed-up'),
    contextMenu: $('context-menu'),
    toastContainer: $('toast-container'),
    inputUrl: $('input-url'),
    confirmMessage: $('confirm-message'),
    propertiesGrid: $('properties-grid'),
    optRefresh: $('opt-refresh-interval'),
    optDrive: $('opt-drive'),
    optCompact: $('opt-compact'),
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getAPI() {
    return window.electronAPI || null;
  }

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return {
        autoRefreshMs: Number(saved.autoRefreshMs) || 15000,
        drive: saved.drive || 'C:',
        compact: Boolean(saved.compact),
      };
    } catch {
      return { autoRefreshMs: 15000, drive: 'C:', compact: false };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch {
      // ignore storage errors
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getExt(name) {
    if (!name) return '';
    const clean = name.split(/[?#]/)[0];
    const dot = clean.lastIndexOf('.');
    if (dot <= 0 || dot === clean.length - 1) return '';
    return clean.slice(dot + 1).toLowerCase();
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const val = n / Math.pow(1024, idx);
    return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(2)} ${units[idx]}`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 Sec';
    if (seconds < 60) return `${Math.ceil(seconds)} Sec`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  function formatDate(raw) {
    if (!raw) return '—';
    const str = String(raw).trim();
    if (!str) return '—';
    const parsed = Date.parse(str);
    if (Number.isNaN(parsed)) return str;
    const d = new Date(parsed);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month} ${day}, ${year} ${hh}:${mm}`;
  }

  function normalizeStatusCode(rawStatus) {
    if (typeof rawStatus === 'number' && !Number.isNaN(rawStatus)) return rawStatus;
    const s = String(rawStatus || '').toLowerCase();
    if (s === 'complete' || s === 'completed' || s === 'finished') return 3;
    if (s === 'paused' || s === 'stopped') return 5;
    if (s === 'downloading' || s === 'active') return 0;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? 5 : n;
  }

  function normalizeDownload(raw) {
    const id = String(raw.id ?? '');
    const fileName = String(raw.fileName || raw.rawFileName || `download_${id}`);
    const localFileName = String(raw.localFileName || raw.localPath || '');
    const fileSize = Number(raw.fileSize) || 0;
    const downloaded = Number(raw.downloaded) || 0;
    let status = normalizeStatusCode(raw.statusCode ?? raw.status);
    if (fileSize > 0 && downloaded >= fileSize) status = 3;

    const progress = status === 3
      ? 100
      : fileSize > 0
        ? Math.min(100, Math.max(0, (downloaded / fileSize) * 100))
        : 0;

    return {
      id,
      fileName,
      rawFileName: String(raw.rawFileName || fileName),
      localFileName,
      localPath: String(raw.localPath || localFileName),
      url: String(raw.url || ''),
      fileSize,
      downloaded,
      progress,
      status,
      categoryID: Number(raw.categoryID ?? raw.categoryId ?? 0),
      dateAdded: String(raw.dateAdded || ''),
      lastTryDate: String(raw.lastTryDate || raw.dateAdded || ''),
      speed: Number(raw.speed) || 0,
      queueID: Number(raw.queueID ?? raw.queueId ?? 0),
      description: String(raw.description || ''),
      ext: getExt(fileName) || getExt(localFileName),
    };
  }

  function isComplete(item) {
    return item.status === 3 || (item.fileSize > 0 && item.downloaded >= item.fileSize);
  }

  function isActiveDownload(item) {
    return !isComplete(item) && (item.status === 0 || item.status === 1 || item.status === 2);
  }

  function getTimeLeftSeconds(item) {
    if (isComplete(item)) return 0;
    if (isActiveDownload(item) && item.speed > 0 && item.fileSize > item.downloaded) {
      return (item.fileSize - item.downloaded) / item.speed;
    }
    return Infinity;
  }

  function getBadgeInfo(ext, categoryID) {
    if (EXT_GROUPS.videos.has(ext) || categoryID === 3) return { cls: 'badge-video', label: (ext || 'VID').slice(0, 4).toUpperCase() };
    if (EXT_GROUPS.music.has(ext) || categoryID === 2) return { cls: 'badge-music', label: (ext || 'AUD').slice(0, 4).toUpperCase() };
    if (EXT_GROUPS.compressed.has(ext) || categoryID === 7 || categoryID === 4) return { cls: 'badge-archive', label: (ext || 'ZIP').slice(0, 4).toUpperCase() };
    if (EXT_GROUPS.programs.has(ext) || categoryID === 1) return { cls: 'badge-program', label: (ext || 'APP').slice(0, 4).toUpperCase() };
    if (EXT_GROUPS.documents.has(ext) || categoryID === 5) return { cls: 'badge-doc', label: (ext || 'DOC').slice(0, 4).toUpperCase() };
    if (EXT_GROUPS.apks.has(ext) || categoryID === 6) return { cls: 'badge-apk', label: 'APK' };
    if (EXT_GROUPS.images.has(ext) || categoryID === 8) return { cls: 'badge-image', label: (ext || 'IMG').slice(0, 4).toUpperCase() };
    return { cls: 'badge-general', label: (ext || 'FILE').slice(0, 4).toUpperCase() };
  }

  function matchesCategory(item, cat) {
    if (cat === 'all') return true;
    if (cat === 'unfinished') return !isComplete(item);
    if (cat === 'finished') return isComplete(item);

    const ext = item.ext;
    if (cat === 'music') return item.categoryID === 2 || EXT_GROUPS.music.has(ext);
    if (cat === 'compressed') return item.categoryID === 7 || item.categoryID === 4 || EXT_GROUPS.compressed.has(ext);
    if (cat === 'videos') return item.categoryID === 3 || EXT_GROUPS.videos.has(ext);
    if (cat === 'programs') return item.categoryID === 1 || EXT_GROUPS.programs.has(ext);
    if (cat === 'documents') return item.categoryID === 5 || EXT_GROUPS.documents.has(ext);
    if (cat === 'apks') return item.categoryID === 6 || EXT_GROUPS.apks.has(ext);
    if (cat === 'images') return item.categoryID === 8 || EXT_GROUPS.images.has(ext);
    return true;
  }

  // ── Toast & Modals ─────────────────────────────────────────────────────────
  function showToast(message, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      setTimeout(() => el.remove(), 220);
    }, 3000);
  }

  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('hidden');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
  }

  function openConfirm(message, onYes) {
    dom.confirmMessage.textContent = message;
    state.pendingConfirmFn = onYes;
    openModal('modal-confirm');
  }

  // ── Filtering, Sorting & Rendering ─────────────────────────────────────────
  function updateCategoryCounts() {
    const keys = ['all', 'music', 'compressed', 'videos', 'programs', 'documents', 'apks', 'images', 'unfinished', 'finished'];
    for (const key of keys) {
      const count = state.downloads.filter((item) => matchesCategory(item, key)).length;
      const badge = document.querySelector(`[data-count="${key}"]`);
      if (badge) badge.textContent = String(count);
    }
  }

  function getSortValue(item, col) {
    switch (col) {
      case 'name': return item.fileName.toLowerCase();
      case 'size': return item.fileSize;
      case 'status': return isComplete(item) ? 100 : item.progress;
      case 'time': return getTimeLeftSeconds(item);
      case 'date': {
        const ts = Date.parse(item.lastTryDate || item.dateAdded || '');
        return Number.isNaN(ts) ? 0 : ts;
      }
      default: return item.fileName.toLowerCase();
    }
  }

  function applyFilterAndSort() {
    const query = state.searchQuery.trim().toLowerCase();
    const list = state.downloads.filter((item) => {
      if (!matchesCategory(item, state.activeCategory)) return false;
      if (!query) return true;
      return (
        item.fileName.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.localFileName.toLowerCase().includes(query)
      );
    });

    const dir = state.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = getSortValue(a, state.sortBy);
      const vb = getSortValue(b, state.sortBy);
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb) * dir;
        if (cmp !== 0) return cmp;
      } else if (va !== vb) {
        return (va > vb ? 1 : -1) * dir;
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    state.filtered = list;
  }

  function syncSelectionControls() {
    const visibleIds = state.filtered.map((d) => d.id);
    const selectedVisible = visibleIds.filter((id) => state.selectedIds.has(id)).length;
    const allChecked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    const indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;

    [dom.chkSelectAllHead, dom.chkSelectAllFoot].forEach((chk) => {
      if (!chk) return;
      chk.checked = allChecked;
      chk.indeterminate = indeterminate;
    });

    dom.selectionCount.textContent = `${state.selectedIds.size} / ${state.filtered.length}`;
  }

  function renderSortIndicators() {
    document.querySelectorAll('.col-header.sortable').forEach((btn) => {
      const col = btn.dataset.sort;
      const isActive = col === state.sortBy;
      btn.classList.toggle('active-sort', isActive);
      const arrow = btn.querySelector('.sort-arrow');
      if (arrow) {
        arrow.textContent = isActive && state.sortDir === 'asc' ? '△' : '▽';
      }
    });
  }

  function renderRows() {
    applyFilterAndSort();
    updateCategoryCounts();
    renderSortIndicators();

    if (state.filtered.length === 0) {
      dom.downloadsList.innerHTML = '';
      dom.emptyState.classList.remove('hidden');
      dom.emptyTitle.textContent = state.searchQuery
        ? 'No matching downloads'
        : 'No downloads in this category';
      dom.emptySubtitle.textContent = state.searchQuery
        ? `No files matched "${state.searchQuery}". Try clearing your search filter.`
        : 'Add a URL or switch categories to view downloads from IDM.';
      syncSelectionControls();
      return;
    }

    dom.emptyState.classList.add('hidden');

    const html = state.filtered.map((item) => {
      const selected = state.selectedIds.has(item.id);
      const complete = isComplete(item);
      const active = isActiveDownload(item);
      const pctText = `${Math.round(item.progress)}%`;
      const badge = getBadgeInfo(item.ext, item.categoryID);

      let statusLabel = 'Paused';
      let statusCls = 'is-paused';
      if (complete) {
        statusLabel = 'Complete';
        statusCls = 'is-complete';
      } else if (active) {
        statusLabel = item.speed > 0 ? `${formatBytes(item.speed)}/s` : 'Downloading';
        statusCls = 'is-downloading';
      }

      const sizeText = item.fileSize > 0
        ? (complete ? formatBytes(item.fileSize) : `${formatBytes(item.downloaded)} / ${formatBytes(item.fileSize)}`)
        : (item.downloaded > 0 ? formatBytes(item.downloaded) : 'Unknown');

      const timeLeftText = complete
        ? '0 Sec'
        : active && item.speed > 0
          ? formatDuration(getTimeLeftSeconds(item))
          : 'Paused';

      const dateText = formatDate(item.lastTryDate || item.dateAdded);
      const subText = item.description || item.url || item.localFileName || CATEGORY_NAMES[item.categoryID] || 'General';
      const initialWidth = state.isFirstRender ? 0 : item.progress;
      const fillStateCls = complete ? 'complete' : active ? 'downloading' : 'paused';

      return `
        <div class="download-row${selected ? ' selected' : ''}" data-id="${escapeHtml(item.id)}" role="row">
          <div class="col-check">
            <label class="custom-checkbox">
              <input type="checkbox" class="row-checkbox" data-id="${escapeHtml(item.id)}" ${selected ? 'checked' : ''} />
              <span class="checkmark"></span>
            </label>
          </div>
          <div class="cell-name">
            <span class="file-badge ${badge.cls}">${escapeHtml(badge.label)}</span>
            <div class="file-name-meta">
              <span class="file-title" dir="auto" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</span>
              <span class="file-sub" dir="auto" title="${escapeHtml(subText)}">${escapeHtml(subText)}</span>
            </div>
          </div>
          <div class="cell-size" title="${escapeHtml(sizeText)}">${escapeHtml(sizeText)}</div>
          <div class="cell-status">
            <div class="status-top">
              <span class="status-pct">${pctText}</span>
              <span class="status-state ${statusCls}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${fillStateCls}" data-target-width="${item.progress.toFixed(2)}" style="width: ${initialWidth.toFixed(2)}%;"></div>
            </div>
          </div>
          <div class="cell-time">${escapeHtml(timeLeftText)}</div>
          <div class="cell-date" title="${escapeHtml(item.lastTryDate || item.dateAdded)}">${escapeHtml(dateText)}</div>
        </div>
      `;
    }).join('');

    dom.downloadsList.innerHTML = html;

    if (state.isFirstRender) {
      state.isFirstRender = false;
      requestAnimationFrame(() => {
        dom.downloadsList.querySelectorAll('.progress-fill').forEach((bar) => {
          bar.style.width = `${bar.dataset.targetWidth || '0'}%`;
        });
      });
    }

    syncSelectionControls();
  }

  // ── Disk Space Donut (Canvas) ──────────────────────────────────────────────
  function drawDiskDonut(usedPercent) {
    const canvas = dom.diskCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 42;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 16;
    const lineWidth = 4.5;
    const pct = Math.min(100, Math.max(0, Number(usedPercent) || 0));

    ctx.clearRect(0, 0, size, size);

    // Track ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#2A2A3A';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Gradient arc
    if (pct > 0) {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#2DD4BF');
      grad.addColorStop(0.55, '#38BDF8');
      grad.addColorStop(1, '#8B5CF6');

      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + (Math.PI * 2 * pct) / 100;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // ── IPC Data Loaders ───────────────────────────────────────────────────────
  async function refreshDownloads(quiet = true) {
    const api = getAPI();
    if (!api || typeof api.getDownloads !== 'function') {
      dom.syncDot.classList.add('offline');
      dom.syncLabel.textContent = 'Preview Mode';
      renderRows();
      return;
    }

    dom.syncDot.classList.remove('offline');
    dom.syncDot.classList.add('syncing');

    try {
      const res = await api.getDownloads();
      const rawList = Array.isArray(res) ? res : (res?.ok && Array.isArray(res.data) ? res.data : []);
      state.downloads = rawList.map(normalizeDownload);

      // Remove stale IDs from selection
      const validIds = new Set(state.downloads.map((d) => d.id));
      for (const id of [...state.selectedIds]) {
        if (!validIds.has(id)) state.selectedIds.delete(id);
      }

      dom.syncLabel.textContent = `Registry Live (${state.downloads.length})`;
      renderRows();
      if (!quiet) showToast(`Synced ${state.downloads.length} downloads from IDM`);
    } catch (err) {
      dom.syncDot.classList.add('offline');
      dom.syncLabel.textContent = 'Sync Error';
      if (!quiet) showToast(`Failed to read downloads: ${err.message || err}`, true);
    } finally {
      dom.syncDot.classList.remove('syncing');
    }
  }

  async function refreshDiskSpace() {
    const api = getAPI();
    const drive = state.prefs.drive || 'C:';
    dom.diskPath.textContent = `${drive}\\Downloads`;

    if (!api || typeof api.getDiskSpace !== 'function') {
      drawDiskDonut(0);
      dom.diskPercent.textContent = '--%';
      dom.diskDetail.textContent = 'Electron IPC unavailable';
      return;
    }

    try {
      const res = await api.getDiskSpace(drive);
      const data = res?.data || res || {};
      let freeGB = Number(data.freeGB);
      let totalGB = Number(data.totalGB);
      let usedPercent = Number(data.usedPercent);

      // Fallback if returned in bytes { used, free, total }
      if (Number.isNaN(freeGB) && typeof data.free === 'number') {
        freeGB = data.free / (1024 ** 3);
      }
      if (Number.isNaN(totalGB) && typeof data.total === 'number') {
        totalGB = data.total / (1024 ** 3);
      }
      if (Number.isNaN(usedPercent) && totalGB > 0 && !Number.isNaN(freeGB)) {
        usedPercent = ((totalGB - freeGB) / totalGB) * 100;
      }

      const safePct = Number.isFinite(usedPercent) ? Math.round(usedPercent) : 0;
      drawDiskDonut(safePct);
      dom.diskPercent.textContent = `${safePct}%`;

      if (Number.isFinite(freeGB) && Number.isFinite(totalGB) && totalGB > 0) {
        dom.diskDetail.textContent = `${freeGB.toFixed(1)} GB free / ${totalGB.toFixed(0)} GB`;
      } else {
        dom.diskDetail.textContent = 'Disk info unavailable';
      }
    } catch {
      drawDiskDonut(0);
      dom.diskPercent.textContent = '--%';
      dom.diskDetail.textContent = 'Unable to read drive';
    }
  }

  async function runSpeedTest(silent = false) {
    const api = getAPI();
    if (!api || typeof api.runSpeedTest !== 'function') {
      if (!silent) showToast('Speed test requires Electron IPC', true);
      return;
    }

    dom.btnSpeedTest.classList.add('testing');
    try {
      const res = await api.runSpeedTest();
      const data = res?.data || res || {};
      const down = Number(data.downloadMbps ?? data.estimatedMbps);
      const up = Number(data.uploadMbps);

      dom.speedDown.textContent = Number.isFinite(down) ? `↓ ${down.toFixed(2)} Mbps` : '↓ -- Mbps';
      dom.speedUp.textContent = Number.isFinite(up)
        ? `↑ ${up.toFixed(2)} Mbps`
        : (data.avgLatencyMs ? `${data.avgLatencyMs} ms` : '↑ -- Mbps');

      if (!silent) showToast('Speed test updated');
    } catch (err) {
      if (!silent) showToast(`Speed test failed: ${err.message || err}`, true);
    } finally {
      dom.btnSpeedTest.classList.remove('testing');
    }
  }

  // ── Item & Action Handlers ─────────────────────────────────────────────────
  function getSelectedItems() {
    if (state.selectedIds.size > 0) {
      return state.downloads.filter((d) => state.selectedIds.has(d.id));
    }
    return [];
  }

  function getContextOrFirstSelected() {
    if (state.contextItemId) {
      const found = state.downloads.find((d) => d.id === state.contextItemId);
      if (found) return found;
    }
    return getSelectedItems()[0] || null;
  }

  async function handleOpenFile(item) {
    if (!item) return showToast('Select a download first', true);
    const api = getAPI();
    if (!api?.openFile) return;
    if (!item.localFileName) {
      showProperties(item);
      return showToast('Local file path is not available yet', true);
    }
    const res = await api.openFile(item.localFileName);
    if (res && res.ok === false) {
      showToast(res.error || 'Could not open file', true);
    }
  }

  async function handleOpenFolder(item) {
    if (!item) return showToast('Select a download first', true);
    const api = getAPI();
    if (!api?.showInFolder) return;
    if (!item.localFileName) return showToast('No local path recorded for this item', true);
    const res = await api.showInFolder(item.localFileName);
    if (res && res.ok === false) {
      showToast('Folder or file not found on disk', true);
    }
  }

  async function handleCopyText(text, label) {
    if (!text) return showToast(`No ${label} available to copy`, true);
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${label} to clipboard`);
    } catch {
      showToast(`Failed to copy ${label}`, true);
    }
  }

  async function handleResumeSelected() {
    const items = getSelectedItems();
    const api = getAPI();
    if (!api) return;

    if (items.length === 0) {
      await api.idmCommand?.('start-queue');
      return showToast('Starting IDM main download queue...');
    }

    const unfinished = items.filter((i) => !isComplete(i) && i.url);
    if (unfinished.length > 0) {
      await api.idmCommand?.('start-queue');
      showToast(`Resuming queue for ${unfinished.length} item(s)`);
    } else if (items[0]?.url) {
      await api.idmCommand?.('redownload', { url: items[0].url });
      showToast('Sent download request to IDM');
    } else {
      await api.idmCommand?.('open-idm');
    }
  }

  async function handleRedownload(item) {
    if (!item?.url) return showToast('No source URL available for this item', true);
    const api = getAPI();
    const res = await api?.idmCommand?.('redownload', { url: item.url });
    if (res?.ok) {
      showToast(`Sent "${item.fileName}" to IDM`);
      setTimeout(() => refreshDownloads(true), 1200);
    } else {
      showToast(res?.message || 'Could not trigger redownload', true);
    }
  }

  async function handleStopSelected(all = false) {
    const api = getAPI();
    const res = await api?.idmCommand?.('open-idm');
    if (res?.ok) {
      showToast(all ? 'Opened IDM to stop all active transfers' : 'Opened IDM to manage active transfer');
    } else {
      showToast('IDM window could not be opened', true);
    }
  }

  function requestDeleteItems(items) {
    if (!items || items.length === 0) {
      return showToast('Select at least one download to remove', true);
    }
    const label = items.length === 1 ? `"${items[0].fileName}"` : `${items.length} selected downloads`;
    openConfirm(`Remove ${label} from the IDM download list? (Files on disk will not be deleted.)`, async () => {
      const api = getAPI();
      if (!api?.idmCommand) return;
      let removed = 0;
      for (const item of items) {
        const res = await api.idmCommand('delete-download', { id: item.id, confirmed: true });
        if (res?.ok) {
          removed++;
          state.selectedIds.delete(item.id);
        }
      }
      if (removed > 0) {
        showToast(`Removed ${removed} entry(s) from IDM list`);
        await refreshDownloads(true);
      } else {
        showToast('Could not remove registry entry', true);
      }
    });
  }

  function showProperties(item) {
    if (!item) return;
    const rows = [
      ['File Name', item.fileName],
      ['Status', isComplete(item) ? 'Complete (100%)' : `${Math.round(item.progress)}% (${isActiveDownload(item) ? 'Active' : 'Paused'})`],
      ['File Size', `${formatBytes(item.fileSize)} (${item.fileSize.toLocaleString()} bytes)`],
      ['Downloaded', `${formatBytes(item.downloaded)} (${item.downloaded.toLocaleString()} bytes)`],
      ['Category', CATEGORY_NAMES[item.categoryID] || 'General'],
      ['Queue ID', String(item.queueID)],
      ['URL', item.url || '—'],
      ['Local Path', item.localFileName || '—'],
      ['Date Added', formatDate(item.dateAdded)],
      ['Last Tried', formatDate(item.lastTryDate)],
      ['Description', item.description || '—'],
    ];

    dom.propertiesGrid.innerHTML = rows
      .map(([k, v]) => `
        <div class="prop-row">
          <span class="prop-key">${escapeHtml(k)}</span>
          <span class="prop-val" dir="auto">${escapeHtml(v)}</span>
        </div>
      `)
      .join('');

    state.contextItemId = item.id;
    openModal('modal-properties');
  }

  // ── Context Menu & Dropdown Menus ──────────────────────────────────────────
  function hideContextMenu() {
    dom.contextMenu.classList.add('hidden');
  }

  function openContextMenu(x, y, item) {
    state.contextItemId = item.id;
    const menu = dom.contextMenu;
    menu.classList.remove('hidden');

    // Update disabled states
    const openBtn = menu.querySelector('[data-ctx="open"]');
    const folderBtn = menu.querySelector('[data-ctx="open-folder"]');
    const urlBtn = menu.querySelector('[data-ctx="copy-url"]');
    const pathBtn = menu.querySelector('[data-ctx="copy-path"]');
    const redlBtn = menu.querySelector('[data-ctx="redownload"]');

    if (openBtn) openBtn.disabled = !item.localFileName;
    if (folderBtn) folderBtn.disabled = !item.localFileName;
    if (pathBtn) pathBtn.disabled = !item.localFileName;
    if (urlBtn) urlBtn.disabled = !item.url;
    if (redlBtn) redlBtn.disabled = !item.url;

    const rect = menu.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 10);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 10);
    menu.style.left = `${Math.max(8, clampedX)}px`;
    menu.style.top = `${Math.max(8, clampedY)}px`;
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.menu-item-wrap.open').forEach((el) => el.classList.remove('open'));
  }

  // ── Preferences & Auto-Refresh ─────────────────────────────────────────────
  function applyPrefs() {
    dom.appWindow.classList.toggle('compact-rows', state.prefs.compact);
    if (dom.optRefresh) dom.optRefresh.value = String(state.prefs.autoRefreshMs);
    if (dom.optDrive) dom.optDrive.value = state.prefs.drive;
    if (dom.optCompact) dom.optCompact.checked = state.prefs.compact;

    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.prefs.autoRefreshMs > 0) {
      state.refreshTimer = setInterval(() => refreshDownloads(true), state.prefs.autoRefreshMs);
    }
  }

  function openAddUrlModal() {
    dom.inputUrl.value = '';
    openModal('modal-add-url');
    setTimeout(() => dom.inputUrl.focus(), 40);
  }

  // ── Dispatch Named Menu/Shortcut Actions ───────────────────────────────────
  async function dispatchAction(action) {
    const api = getAPI();
    const firstSelected = getSelectedItems()[0] || null;

    switch (action) {
      case 'add-url': openAddUrlModal(); break;
      case 'start-queue':
        await api?.idmCommand?.('start-queue');
        showToast('Starting IDM queue...');
        break;
      case 'stop-all': await handleStopSelected(true); break;
      case 'open-idm':
        await api?.idmCommand?.('open-idm');
        showToast('Launching Internet Download Manager...');
        break;
      case 'exit-app': api?.windowControl?.('close'); break;
      case 'open-selected': await handleOpenFile(firstSelected); break;
      case 'open-folder': await handleOpenFolder(firstSelected); break;
      case 'redownload-selected': await handleRedownload(firstSelected); break;
      case 'copy-url': await handleCopyText(firstSelected?.url, 'URL'); break;
      case 'delete-selected': requestDeleteItems(getSelectedItems()); break;
      case 'resume-selected': await handleResumeSelected(); break;
      case 'stop-selected': await handleStopSelected(false); break;
      case 'refresh':
        await refreshDownloads(false);
        await refreshDiskSpace();
        break;
      case 'filter-all': selectSidebarCategory('all'); break;
      case 'filter-unfinished': selectSidebarCategory('unfinished'); break;
      case 'filter-finished': selectSidebarCategory('finished'); break;
      case 'toggle-compact':
        state.prefs.compact = !state.prefs.compact;
        savePrefs();
        applyPrefs();
        break;
      case 'toggle-sidebar':
        dom.appWindow.classList.toggle('sidebar-collapsed');
        break;
      case 'sort-name': toggleSort('name'); break;
      case 'sort-size': toggleSort('size'); break;
      case 'sort-date': toggleSort('date'); break;
      case 'open-options': openModal('modal-options'); break;
      case 'run-speed-test': await runSpeedTest(false); break;
      case 'open-about': openModal('modal-about'); break;
    }
  }

  function selectSidebarCategory(cat) {
    state.activeCategory = cat;
    document.querySelectorAll('.sidebar .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.category === cat);
    });
    renderRows();
  }

  function toggleSort(col) {
    if (state.sortBy === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortBy = col;
      state.sortDir = col === 'name' ? 'asc' : 'desc';
    }
    renderRows();
  }

  // ── Event Binding ──────────────────────────────────────────────────────────
  function bindEvents() {
    const api = getAPI();

    // Window controls
    $('btn-close').addEventListener('click', () => api?.windowControl?.('close'));
    $('btn-minimize').addEventListener('click', () => api?.windowControl?.('minimize'));
    $('btn-maximize').addEventListener('click', () => api?.windowControl?.('maximize'));

    api?.onWindowStateChange?.(({ maximized }) => {
      dom.appWindow.classList.toggle('maximized', Boolean(maximized));
      const maxBtn = $('btn-maximize');
      if (maxBtn) maxBtn.title = maximized ? 'Restore' : 'Maximize';
    });

    // Menu bar dropdowns
    document.querySelectorAll('.menu-trigger').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = trigger.closest('.menu-item-wrap');
        const wasOpen = wrap.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) wrap.classList.add('open');
      });
    });

    document.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        closeAllDropdowns();
        dispatchAction(item.dataset.action);
      });
    });

    // Sidebar navigation
    document.querySelectorAll('.sidebar .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => selectSidebarCategory(btn.dataset.category));
    });

    $('btn-sync-status').addEventListener('click', () => {
      refreshDownloads(false);
      refreshDiskSpace();
    });

    // Toolbar buttons
    $('btn-add-url').addEventListener('click', openAddUrlModal);
    $('btn-empty-add').addEventListener('click', openAddUrlModal);
    $('btn-resume').addEventListener('click', handleResumeSelected);
    $('btn-stop').addEventListener('click', () => handleStopSelected(false));
    $('btn-stop-all').addEventListener('click', () => handleStopSelected(true));
    $('btn-delete').addEventListener('click', () => requestDeleteItems(getSelectedItems()));
    $('btn-options').addEventListener('click', () => openModal('modal-options'));
    $('btn-queues').addEventListener('click', () => dispatchAction('start-queue'));
    $('btn-schedule').addEventListener('click', async () => {
      await api?.idmCommand?.('schedule');
      showToast('Launching IDM Scheduler...');
    });
    $('btn-share').addEventListener('click', () => {
      const items = getSelectedItems();
      if (items.length === 0) return showToast('Select a download to copy its link', true);
      const urls = items.map((i) => i.url).filter(Boolean).join('\n');
      handleCopyText(urls, items.length > 1 ? 'URLs' : 'URL');
    });

    // Search input
    dom.searchInput.addEventListener('input', () => {
      state.searchQuery = dom.searchInput.value;
      dom.btnClearSearch.classList.toggle('hidden', state.searchQuery.length === 0);
      renderRows();
    });

    dom.btnClearSearch.addEventListener('click', () => {
      dom.searchInput.value = '';
      state.searchQuery = '';
      dom.btnClearSearch.classList.add('hidden');
      renderRows();
      dom.searchInput.focus();
    });

    // Sortable table headers
    document.querySelectorAll('.col-header.sortable').forEach((btn) => {
      btn.addEventListener('click', () => toggleSort(btn.dataset.sort));
    });

    // Select All checkboxes (header & footer)
    const handleSelectAll = (checked) => {
      if (checked) {
        state.filtered.forEach((d) => state.selectedIds.add(d.id));
      } else {
        state.filtered.forEach((d) => state.selectedIds.delete(d.id));
      }
      renderRows();
    };

    dom.chkSelectAllHead.addEventListener('change', (e) => handleSelectAll(e.target.checked));
    dom.chkSelectAllFoot.addEventListener('change', (e) => handleSelectAll(e.target.checked));

    // Delegated table row interactions
    dom.downloadsList.addEventListener('change', (e) => {
      const chk = e.target.closest('.row-checkbox');
      if (!chk) return;
      const id = chk.dataset.id;
      if (chk.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const row = chk.closest('.download-row');
      if (row) row.classList.toggle('selected', chk.checked);
      syncSelectionControls();
    });

    dom.downloadsList.addEventListener('click', (e) => {
      if (e.target.closest('.custom-checkbox')) return;
      const row = e.target.closest('.download-row');
      if (!row) return;
      const id = row.dataset.id;

      if (e.ctrlKey || e.metaKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else {
        const wasOnlySelected = state.selectedIds.size === 1 && state.selectedIds.has(id);
        state.selectedIds.clear();
        if (!wasOnlySelected) state.selectedIds.add(id);
      }
      renderRows();
    });

    dom.downloadsList.addEventListener('dblclick', (e) => {
      if (e.target.closest('.custom-checkbox')) return;
      const row = e.target.closest('.download-row');
      if (!row) return;
      const item = state.downloads.find((d) => d.id === row.dataset.id);
      if (item) handleOpenFile(item);
    });

    dom.downloadsList.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.download-row');
      if (!row) return;
      e.preventDefault();
      const id = row.dataset.id;
      if (!state.selectedIds.has(id)) {
        state.selectedIds.clear();
        state.selectedIds.add(id);
        renderRows();
      }
      const item = state.downloads.find((d) => d.id === id);
      if (item) openContextMenu(e.clientX, e.clientY, item);
    });

    // Context menu actions
    dom.contextMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('.ctx-item');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.ctx;
      const item = getContextOrFirstSelected();
      hideContextMenu();

      switch (action) {
        case 'open': await handleOpenFile(item); break;
        case 'open-folder': await handleOpenFolder(item); break;
        case 'resume': await handleResumeSelected(); break;
        case 'stop': await handleStopSelected(false); break;
        case 'redownload': await handleRedownload(item); break;
        case 'copy-url': await handleCopyText(item?.url, 'URL'); break;
        case 'copy-path': await handleCopyText(item?.localFileName, 'local path'); break;
        case 'properties': showProperties(item); break;
        case 'delete': requestDeleteItems(getSelectedItems().length ? getSelectedItems() : (item ? [item] : [])); break;
      }
    });

    // Footer widgets
    dom.diskPath.title = 'Open Downloads Folder';
    dom.diskPath.addEventListener('click', async () => {
      const res = await api?.idmCommand?.('open-downloads-folder');
      if (res && res.ok === false) showToast(res.message || 'Could not open downloads folder', true);
    });

    $('btn-disk-cleaner').addEventListener('click', async () => {
      const res = await api?.idmCommand?.('disk-cleaner');
      if (res?.ok) showToast('Launched Windows Disk Cleanup');
      else showToast('Could not start Disk Cleanup', true);
    });

    dom.btnSpeedTest.addEventListener('click', () => runSpeedTest(false));

    // Add URL form & modal actions
    $('form-add-url').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = dom.inputUrl.value.trim();
      if (!url) return showToast('Please enter a download URL', true);
      const res = await api?.addUrl?.(url);
      if (res?.ok) {
        closeModal('modal-add-url');
        showToast('Download URL sent to IDM');
        setTimeout(() => refreshDownloads(true), 1200);
      } else {
        showToast(res?.message || 'Failed to send URL to IDM', true);
      }
    });

    $('btn-paste-url').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) dom.inputUrl.value = text.trim();
        dom.inputUrl.focus();
      } catch {
        showToast('Clipboard access unavailable', true);
      }
    });

    $('btn-open-classic-add').addEventListener('click', async () => {
      closeModal('modal-add-url');
      await api?.addUrl?.('');
    });

    // Confirm delete button
    $('btn-confirm-yes').addEventListener('click', async () => {
      const fn = state.pendingConfirmFn;
      state.pendingConfirmFn = null;
      closeModal('modal-confirm');
      if (typeof fn === 'function') await fn();
    });

    // Properties modal actions
    $('btn-prop-folder').addEventListener('click', () => handleOpenFolder(getContextOrFirstSelected()));
    $('btn-prop-copy-url').addEventListener('click', () => handleCopyText(getContextOrFirstSelected()?.url, 'URL'));

    // Options controls
    dom.optRefresh.addEventListener('change', () => {
      state.prefs.autoRefreshMs = Number(dom.optRefresh.value) || 0;
      savePrefs();
      applyPrefs();
    });

    dom.optDrive.addEventListener('change', () => {
      state.prefs.drive = dom.optDrive.value;
      savePrefs();
      refreshDiskSpace();
    });

    dom.optCompact.addEventListener('change', () => {
      state.prefs.compact = dom.optCompact.checked;
      savePrefs();
      applyPrefs();
    });

    $('btn-opt-classic-idm').addEventListener('click', () => dispatchAction('open-idm'));

    // Modal close buttons & backdrop clicks
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.add('hidden');
      });
    });

    // Global click-away & keyboard shortcuts
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#context-menu')) hideContextMenu();
      if (!e.target.closest('.menu-item-wrap')) closeAllDropdowns();
    });

    document.addEventListener('keydown', (e) => {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (e.key === 'Escape') {
        hideContextMenu();
        closeAllDropdowns();
        closeAllModals();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        dom.searchInput.focus();
        dom.searchInput.select();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openAddUrlModal();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        dispatchAction('toggle-sidebar');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !inInput) {
        e.preventDefault();
        state.filtered.forEach((d) => state.selectedIds.add(d.id));
        renderRows();
      } else if (e.key === 'F5') {
        e.preventDefault();
        dispatchAction('refresh');
      } else if (e.key === 'Delete' && !inInput) {
        const selected = getSelectedItems();
        if (selected.length > 0) requestDeleteItems(selected);
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    applyPrefs();
    bindEvents();
    drawDiskDonut(0);

    await Promise.allSettled([
      refreshDownloads(true),
      refreshDiskSpace(),
    ]);

    // Trigger background speed check after initial render settles
    setTimeout(() => runSpeedTest(true), 450);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
