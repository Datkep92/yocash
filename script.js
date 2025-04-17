// Cấu hình ứng dụng
const config = {
    corsProxy: 'https://api.allorigins.win/get?url=', // Proxy để tránh CORS
    imageProxy: 'https://images.weserv.nl/?url=', // Proxy tối ưu hóa hình ảnh
    defaultImage: 'https://cuacuondaiphucvinh.com/wp-content/uploads/2024/12/icon-loi.jpg', // Ảnh mặc định
    requestTimeout: 15000, // Thời gian chờ request (ms)
    maxLinks: 3000, // Số link tối đa
    maxUndoSteps: 20, // Số bước hoàn tác tối đa
    maxLogs: 100, // Số log tối đa
    scrollDuration: 1000, // Thời gian cuộn (ms)
    toastDuration: 3000, // Thời gian hiển thị toast (ms)
    githubToken: 'YOUR_GITHUB_TOKEN_HERE', // Token GitHub (cần thay thế)
    debounceDelay: 500, // Độ trễ debounce (ms)
    apiGistPatchUrl: 'https://api.github.com/gists/8bb46f663b237c3e00736611aaf1c39e', // URL Gist API
    backupUrl: 'http://127.0.0.1:10000', // URL WebDAV backup
    dataFile: '/var/mobile/new/data-fb.json', // File lưu trữ dữ liệu
    fanpagesPerPage: 20 // Số fanpage hiển thị mỗi trang
};

// Trạng thái ứng dụng
const state = {
    links: [], // Danh sách link
    fanpages: [], // Danh sách fanpage
    logs: [], // Danh sách log
    currentFilter: 'all', // Bộ lọc hiện tại (cho tab filter)
    scrollPosition: 0, // Vị trí cuộn
    isLoading: false, // Trạng thái đang tải
    currentTab: 'all-link', // Tab hiện tại
    lastActiveTab: 'all-link', // Tab trước đó
    undoStack: [], // Ngăn xếp hoàn tác
    scrollState: 0, // Trạng thái cuộn
    dateFilter: { // Bộ lọc ngày
        startDate: '',
        endDate: '',
        status: 'all',
        groupTitles: false,
        searchQuery: ''
    },
    fanpageFilter: { // Bộ lọc fanpage
        currentPage: 1 // Trang hiện tại
    },
    version: '1.2.0' // Phiên bản ứng dụng
};

// Các phần tử DOM
const elements = {
    mainContent: document.querySelector('.scroll-container'), // Container chính
    tabContainer: document.querySelector('.tab-container'), // Container các tab
    linkLists: { // Danh sách container tab
        'all-link': document.getElementById('all-link-tab'),
        'blacklist': document.getElementById('blacklist-tab'),
        'date-filter': document.getElementById('date-filter-tab'),
        'error': document.getElementById('error-tab'),
        'duplicate': document.getElementById('duplicate-tab'),
        'log': document.getElementById('log-tab'),
        'filter': document.getElementById('filter-tab'),
        'fanpage': document.getElementById('fanpage-tab') // Tab Fanpage
    },
    headerBtns: {
        add: document.getElementById('add-link-btn'),
        delete: document.getElementById('delete-btn'),
        undo: document.getElementById('undo-btn'),
        scroll: document.getElementById('scroll-btn'),
        log: document.getElementById('log-btn'),
        fanpage: document.getElementById('fanpage-btn') // Thêm nút Fanpage
    },
    statusCounters: { // Bộ đếm trạng thái
        all: document.querySelector('#all-counter .count'),
        filter: document.querySelector('#filter-counter .count')
    },
    selectAllCounter: { // Bộ đếm chọn tất cả
        btn: document.getElementById('select-all-counter-btn'),
        count: document.querySelector('#select-all-counter-btn .selected-count')
    }
};

// Utility: Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}







// Smooth Scroll
function smoothScroll(element, targetPosition, duration = config.scrollDuration) {
    const startPosition = element.scrollTop;
    const distance = targetPosition - startPosition;
    let startTime = null;

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);
        const ease = easeInOutQuad(progress);
        element.scrollTop = startPosition + distance * ease;
        state.scrollPosition = element.scrollTop;
        if (progress < 1) requestAnimationFrame(animation);
        else saveData({ scrollPosition: true });
    }

    requestAnimationFrame(animation);
}
// IndexedDB Initialization
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('LinkManagerDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Create object stores
            if (!db.objectStoreNames.contains('links')) {
                db.createObjectStore('links', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('fanpages')) {
                db.createObjectStore('fanpages', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('logs')) {
                db.createObjectStore('logs', { keyPath: 'timestamp' });
            }
            if (!db.objectStoreNames.contains('state')) {
                db.createObjectStore('state', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('undoStack')) {
                db.createObjectStore('undoStack', { autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(new Error(`IndexedDB error: ${event.target.errorCode}`));
        };
    });
}

// Save to IndexedDB
async function saveToIndexedDB(storeName, data) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            // Handle array data (links, fanpages, logs, undoStack)
            if (Array.isArray(data)) {
                // Clear existing data
                store.clear();
                // Add new data
                data.forEach(item => store.put(item));
            } else {
                // Handle single object (state)
                store.put(data);
            }

            transaction.oncomplete = () => {
                db.close();
                resolve(true);
            };

            transaction.onerror = (event) => {
                db.close();
                reject(new Error(`Error saving to ${storeName}: ${event.target.error}`));
            };
        });
    } catch (error) {
        addLog(`Lỗi khi lưu vào IndexedDB (${storeName}): ${error.message}`, 'error');
        return false;
    }
}

// Load from IndexedDB
async function loadFromIndexedDB(storeName) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                db.close();
                resolve(request.result);
            };

            request.onerror = (event) => {
                db.close();
                reject(new Error(`Error loading from ${storeName}: ${event.target.error}`));
            };
        });
    } catch (error) {
        addLog(`Lỗi khi tải từ IndexedDB (${storeName}): ${error.message}`, 'error');
        return null;
    }
}

// Migrate from LocalStorage to IndexedDB (Optional, for first-time migration)
async function migrateFromLocalStorage() {
    try {
        const localData = localStorage.getItem('data-fb');
        if (!localData) return false;

        const data = JSON.parse(localData);
        if (!data) return false;

        await saveToIndexedDB('links', data.links || []);
        await saveToIndexedDB('fanpages', data.fanpages || []);
        await saveToIndexedDB('logs', data.logs || []);
        await saveToIndexedDB('state', {
            key: 'appState',
            scrollPosition: data.scrollPosition || 0,
            dateFilter: data.dateFilter || {
                startDate: '',
                endDate: '',
                status: 'all',
                groupTitles: false,
                searchQuery: ''
            },
            fanpageFilter: data.fanpageFilter || { currentPage: 1 }
        });
        // Note: LocalStorage doesn't store undoStack, so we skip it

        addLog('Đã di chuyển dữ liệu từ LocalStorage sang IndexedDB', 'info');
        localStorage.removeItem('data-fb'); // Clean up after migration
        return true;
    } catch (error) {
        addLog(`Lỗi khi di chuyển dữ liệu từ LocalStorage: ${error.message}`, 'error');
        return false;
    }
}

// Modified saveToLocalStorage (as a fallback)
function saveToLocalStorage() {
    try {
        localStorage.setItem('data-fb', JSON.stringify({
            links: state.links,
            fanpages: state.fanpages,
            logs: state.logs,
            scrollPosition: state.scrollPosition,
            dateFilter: state.dateFilter,
            fanpageFilter: state.fanpageFilter
        }));
        addLog('Đã lưu dữ liệu vào LocalStorage (backup)', 'info');
    } catch (e) {
        addLog(`Lỗi lưu LocalStorage: ${e.message}`, 'error');
    }
}

// Modified loadFromLocalStorage (as a fallback)
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('data-fb');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        addLog(`Lỗi tải LocalStorage: ${e.message}`, 'error');
        return null;
    }
}

// Modified saveData
async function saveData(changes = {}) {
    if (Object.keys(changes).length === 0) return;

    try {
        // Save to IndexedDB
        if (changes.links) await saveToIndexedDB('links', state.links);
        if (changes.fanpages) await saveToIndexedDB('fanpages', state.fanpages);
        if (changes.logs) await saveToIndexedDB('logs', state.logs);
        if (changes.undoStack) await saveToIndexedDB('undoStack', state.undoStack);
        if (changes.scrollPosition || changes.dateFilter || changes.fanpageFilter) {
            await saveToIndexedDB('state', {
                key: 'appState',
                scrollPosition: state.scrollPosition,
                dateFilter: state.dateFilter,
                fanpageFilter: state.fanpageFilter
            });
        }

        // Backup to LocalStorage as a fallback
        saveToLocalStorage();
        addLog('Dữ liệu đã được lưu vào IndexedDB', 'success');
    } catch (error) {
        addLog(`Lỗi khi lưu dữ liệu vào IndexedDB: ${error.message}`, 'error');
        saveToLocalStorage(); // Fallback to LocalStorage
    }
}

// Modified debouncedSaveData
const debouncedSaveData = debounce(async () => {
    try {
        await saveToIndexedDB('links', state.links);
        await saveToIndexedDB('logs', state.logs);
        await saveToIndexedDB('state', {
            key: 'appState',
            scrollPosition: state.scrollPosition,
            dateFilter: state.dateFilter,
            fanpageFilter: state.fanpageFilter
        });
        saveToLocalStorage(); // Backup to LocalStorage
        addLog('Dữ liệu đã được lưu vào IndexedDB (debounced)', 'success');
    } catch (error) {
        addLog('Không thể lưu dữ liệu vào IndexedDB', 'error');
        saveToLocalStorage(); // Fallback to LocalStorage
    }
}, config.debounceDelay);

// Modified loadData
async function loadData() {
    const showLoading = () => {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); color: #fff; padding: 10px 20px; border-radius: 4px; z-index: 1000;';
        loading.textContent = 'Đang tải...';
        document.body.appendChild(loading);
        return () => document.body.removeChild(loading);
    };

    const hideLoading = showLoading();
    try {
        // Try loading from IndexedDB
        let links = await loadFromIndexedDB('links');
        let fanpages = await loadFromIndexedDB('fanpages');
        let logs = await loadFromIndexedDB('logs');
        let undoStack = await loadFromIndexedDB('undoStack');
        let appState = await loadFromIndexedDB('state');

        // If no data in IndexedDB, try migrating from LocalStorage
        if (!links && !fanpages && !logs && !appState) {
            const migrated = await migrateFromLocalStorage();
            if (migrated) {
                // Reload after migration
                links = await loadFromIndexedDB('links');
                fanpages = await loadFromIndexedDB('fanpages');
                logs = await loadFromIndexedDB('logs');
                appState = await loadFromIndexedDB('state');
            }
        }

        // If still no data, try LocalStorage as a fallback
        if (!links && !fanpages && !logs && !appState) {
            const localData = loadFromLocalStorage();
            if (localData) {
                links = localData.links;
                fanpages = localData.fanpages;
                logs = localData.logs;
                appState = [{
                    key: 'appState',
                    scrollPosition: localData.scrollPosition,
                    dateFilter: localData.dateFilter,
                    fanpageFilter: localData.fanpageFilter
                }];
                addLog('Đã tải dữ liệu từ LocalStorage (fallback)', 'info');
            }
        }

        // Apply loaded data
        if (links || fanpages || logs || appState) {
            state.links = links || [];
            state.fanpages = fanpages || [];
            state.logs = logs || [];
            state.undoStack = undoStack || [];
            if (appState && appState.length > 0) {
                state.scrollPosition = appState[0].scrollPosition || 0;
                state.dateFilter = appState[0].dateFilter || {
                    startDate: '',
                    endDate: '',
                    status: 'all',
                    groupTitles: false,
                    searchQuery: ''
                };
                state.fanpageFilter = appState[0].fanpageFilter || { currentPage: 1 };
            }

            // Normalize link data
            state.links = state.links.map(link => ({
                ...link,
                post_type: link.post_type || 'unknown',
                blacklistStatus: link.blacklistStatus || 'active',
                checked: link.checked || false,
                note: link.note || ''
            }));

            // Normalize fanpage data
            state.fanpages = state.fanpages.map(fanpage => ({
                ...fanpage,
                id: fanpage.id || generateId(),
                url: fanpage.url || '',
                name: fanpage.name || '',
                status: fanpage.status || 'pending',
                thumbnail: fanpage.thumbnail || config.defaultImage,
                description: fanpage.description || ''
            }));
        } else {
            addLog('Không tìm thấy dữ liệu, sử dụng mặc định', 'warning');
        }

        updateCounters();
        switchTab('all-link');
        if (elements.mainContent) {
            elements.mainContent.scrollTop = state.scrollPosition;
        }
    } catch (error) {
        console.error('Lỗi tải dữ liệu:', error);
        showToast('Không thể tải dữ liệu, sử dụng mặc định', 'danger');
        state.links = [];
        state.fanpages = [];
        state.logs = [];
        state.undoStack = [];
        updateCounters();
        switchTab('all-link');
    } finally {
        hideLoading();
    }
}
// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function isLinkExists(url) {
    const baseUrl = url.split('?')[0];
    return state.links.some(link => link.url.split('?')[0] === baseUrl);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            padding: 10px 20px; background: ${type === 'success' ? '#42b72a' : type === 'warning' ? '#faad14' : type === 'danger' ? '#ff4d4f' : '#1877f2'};
            color: #fff; border-radius: 4px; z-index: 1000;
        `;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), config.toastDuration);
}

function addLog(message, type = 'info') {
    state.logs.unshift({
        timestamp: Date.now(),
        message,
        type
    });
    if (state.logs.length > config.maxLogs) state.logs.pop();
    saveData({ logs: true });
    if (state.currentTab === 'log') renderTabContent('log');
}

function updateCounters() {
    const total = getLinksForCurrentTab().length;
    if (elements.statusCounters.all) elements.statusCounters.all.textContent = total;
    if (elements.statusCounters.filter) elements.statusCounters.filter.textContent = total;
    if (elements.selectAllCounter.count) elements.selectAllCounter.count.textContent = getLinksForCurrentTab().filter(l => l.checked).length || 0;
}

function formatDateTime(date) {
    const d = new Date(date);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('vi-VN');
}

function decodeHTMLEntities(text) {
    if (!text) return '';
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#([0-9]+);/g, (_, num) => String.fromCharCode(num));
}

function determinePostType(url) {
    if (url.includes('/groups/')) return 'group';
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/story/')) return 'story';
    if (url.includes('/videos/') || url.includes('/video/')) return 'video';
    if (url.includes('/photo/') || url.includes('/photos/')) return 'photo';
    if (url.includes('/posts/')) return 'post';
    if (url.match(/\/[0-9]+\/$/) || url.match(/\/[^\/]+\/$/)) return 'profile';
    return 'unknown';
}

// Undo Management
function saveBackup(type, data) {
    const backup = { type, scrollPosition: state.scrollPosition };
    switch (type) {
        case 'addLinks':
            backup.addedLinks = data.links.map(link => ({ ...link }));
            break;
        case 'deleteLinks':
            backup.deletedLinks = data.links.map(link => ({ ...link }));
            break;
        case 'checkbox':
            backup.linkId = data.linkId;
            backup.checked = data.checked;
            break;
        case 'note':
            backup.linkId = data.linkId;
            backup.note = data.note;
            break;
        case 'blacklist':
            backup.linkId = data.linkId;
            backup.blacklistStatus = data.blacklistStatus;
            break;
        case 'selectAll':
            backup.checkedLinks = data.links.map(link => ({
                id: link.id,
                checked: link.checked
            }));
            break;
        case 'retryLink':
            backup.linkId = data.linkId;
            backup.linkState = { ...data.link };
            break;
        case 'addFanpages':
            backup.addedFanpages = data.fanpages.map(fanpage => ({ ...fanpage }));
            break;
        case 'refreshFanpage':
            backup.fanpage = { ...data.fanpage };
            break;
    }
    state.undoStack.push(backup);
    if (state.undoStack.length > config.maxUndoSteps) {
        state.undoStack.shift();
        addLog('Undo stack đầy, xóa hành động cũ nhất', 'warning');
    }
    saveData({ undoStack: true });
}

function undoAction() {
    if (state.undoStack.length === 0) {
        showToast('Không có hành động để hoàn tác', 'warning');
        return;
    }
    const backup = state.undoStack.pop();
    let needsSaveData = false;
    let scrollToLinkId = null;

    switch (backup.type) {
        case 'addLinks':
            state.links = state.links.filter(link => !backup.addedLinks.some(l => l.id === link.id));
            needsSaveData = true;
            showToast(`Hoàn tác: Thêm ${backup.addedLinks.length} link`, 'success');
            break;
        case 'deleteLinks':
            state.links = [...state.links, ...backup.deletedLinks];
            needsSaveData = true;
            scrollToLinkId = backup.deletedLinks[0]?.id;
            showToast(`Hoàn tác: Xóa ${backup.deletedLinks.length} link`, 'success');
            break;
        case 'checkbox':
            const link = state.links.find(l => l.id === backup.linkId);
            if (link) {
                link.checked = backup.checked;
                scrollToLinkId = link.id;
                showToast(`Hoàn tác: Checkbox của link ${link.url.slice(0, 50)}...`, 'success');
            }
            break;
        case 'note':
            const noteLink = state.links.find(l => l.id === backup.linkId);
            if (noteLink) {
                noteLink.note = backup.note;
                scrollToLinkId = noteLink.id;
                showToast(`Hoàn tác: Ghi chú của link ${noteLink.url.slice(0, 50)}...`, 'success');
            }
            break;
        case 'blacklist':
            const blacklistLink = state.links.find(l => l.id === backup.linkId);
            if (blacklistLink) {
                blacklistLink.blacklistStatus = backup.blacklistStatus;
                scrollToLinkId = blacklistLink.id;
                showToast(`Hoàn tác: Trạng thái blacklist của link ${blacklistLink.url.slice(0, 50)}...`, 'success');
            }
            break;
        case 'selectAll':
            backup.checkedLinks.forEach(({ id, checked }) => {
                const link = state.links.find(l => l.id === id);
                if (link) link.checked = checked;
            });
            showToast('Hoàn tác: Chọn/bỏ chọn tất cả', 'success');
            break;
        case 'retryLink':
            const retryLink = state.links.find(l => l.id === backup.linkId);
            if (retryLink) {
                Object.assign(retryLink, backup.linkState);
                scrollToLinkId = retryLink.id;
                needsSaveData = true;
                showToast(`Hoàn tác: Thử lại link ${retryLink.url.slice(0, 50)}...`, 'success');
            }
            break;
        case 'addFanpages':
            state.fanpages = state.fanpages.filter(f => !backup.addedFanpages.some(f2 => f2.id === f.id));
            needsSaveData = true;
            showToast(`Hoàn tác: Thêm ${backup.addedFanpages.length} fanpage`, 'success');
            break;
        case 'refreshFanpage':
            const fanpage = state.fanpages.find(f => f.id === backup.fanpage.id);
            if (fanpage) {
                Object.assign(fanpage, backup.fanpage);
                needsSaveData = true;
                showToast(`Hoàn tác: Làm mới fanpage ${fanpage.name}`, 'success');
            }
            break;
    }

    if (needsSaveData) saveData({ links: true, fanpages: true });
    renderTabContent(state.currentTab);
    if (elements.mainContent && scrollToLinkId) {
        setTimeout(() => {
            const linkItem = document.querySelector(`.link-item[data-id="${scrollToLinkId}"]`);
            if (linkItem) smoothScroll(elements.mainContent, linkItem.offsetTop);
            else elements.mainContent.scrollTop = backup.scrollPosition || 0;
        }, 100);
    }
    updateCounters();
    addLog(`Hoàn tác hành động: ${backup.type}`, 'info');
}
function filterPersonalFanpages(fanpages) {
    // Lọc fanpage có type: 'profile'
    const filtered = fanpages.filter(fanpage => {
        console.log('Checking fanpage for Personal filter:', { id: fanpage.id, type: fanpage.type, name: fanpage.name });
        return fanpage.type === 'profile';
    });

    // Sắp xếp theo tiêu đề
    return filtered.sort((a, b) => {
        const titleA = a.name.toLowerCase();
        const titleB = b.name.toLowerCase();
        const numA = parseInt(titleA.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(titleB.match(/\d+/)?.[0] || '0', 10);
        if (numA && numB) return numA - numB;
        return titleA.localeCompare(titleB);
    });
}
// Tab Management
function switchTab(tab) {
    if (state.currentTab === 'filter') {
        state.dateFilter.searchQuery = '';
        const searchInput = document.querySelector('#search-filter');
        if (searchInput) searchInput.value = '';
    }

    Object.values(elements.linkLists).forEach(el => {
        if (el) {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    });

    if (elements.linkLists[tab]) {
        elements.linkLists[tab].style.display = 'block';
        state.lastActiveTab = state.currentTab;
        state.currentTab = tab;
        renderTabContent(tab);
    } else {
        console.error(`Không tìm thấy tab: ${tab}`);
        addLog(`Lỗi: Không tìm thấy tab ${tab}`, 'error');
    }
}

function getLinksForCurrentTab() {
    if (state.currentTab === 'all-link') return state.links;
    if (state.currentTab === 'blacklist') return state.links.filter(l => l.blacklistStatus === 'blacklisted');
    if (state.currentTab === 'error') return state.links.filter(l => ['error', 'login', 'link_hỏng'].includes(l.status) && l.blacklistStatus !== 'blacklisted');
    if (state.currentTab === 'duplicate') return state.links.filter((l, i) => state.links.findIndex(x => x.title === l.title) !== i);
    if (state.currentTab === 'date-filter') return state.links.filter(link => {
        const linkDate = new Date(link.date);
        const start = new Date(state.dateFilter.startDate);
        const end = new Date(state.dateFilter.endDate);
        const inDateRange = (!state.dateFilter.startDate || !state.dateFilter.endDate) || (linkDate >= start && linkDate <= end);
        const matchStatus = state.dateFilter.status === 'all' || link.status === state.dateFilter.status;
        const matchSearch = !state.dateFilter.searchQuery ||
            (link.title && link.title.toLowerCase().includes(state.dateFilter.searchQuery.toLowerCase())) ||
            (link.description && link.description.toLowerCase().includes(state.dateFilter.searchQuery.toLowerCase()));
        return inDateRange && matchStatus && matchSearch;
    });
    if (state.currentTab === 'filter') {
        switch (state.currentFilter) {
            case 'video':
                return state.links.filter(l => l.post_type === 'video' && l.blacklistStatus !== 'blacklisted');
            case 'login':
                return state.links.filter(l => l.status === 'login' && l.blacklistStatus !== 'blacklisted');
            case 'duplicate':
                return state.links.filter((l, i) => state.links.findIndex(x => x.title === l.title) !== i && l.blacklistStatus !== 'blacklisted');
            case 'blacklist':
                return state.links.filter(l => l.blacklistStatus === 'blacklisted');
            case 'note':
                return state.links.filter(l => l.note && l.note.trim() !== '');
            default:
                return state.links;
        }
    }
    return [];
}

function renderTabContent(tab) {
    const container = elements.linkLists[tab];
    if (!container) {
        console.error(`Không tìm thấy tab: ${tab}`);
        return;
    }

    container.innerHTML = '';

    if (tab === 'filter') {
        const filterButtons = document.createElement('div');
        filterButtons.className = 'filter-buttons';
        filterButtons.innerHTML = `
                <style>
                    .counter-badge {
                        padding: 6px 12px;
                        margin: 4px;
                        border: 1px solid #ccc;
                        border-radius: 6px;
                        background-color: #f5f5f5;
                        color: #333;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        min-width: 80px;
                        text-align: center;
                    }
                    .counter-badge:hover {
                        background-color: #e0e0e0;
                        border-color: #888;
                    }
                    .search-filter {
                        display: flex;
                        margin-top: 10px;
                        gap: 8px;
                    }
                    .search-filter input {
                        flex: 1;
                        padding: 6px 10px;
                        border-radius: 4px;
                        border: 1px solid #ccc;
                    }
                    .search-filter button {
                        padding: 6px 12px;
                        border: none;
                        border-radius: 4px;
                        background-color: #007bff;
                        color: white;
                        cursor: pointer;
                    }
                    .search-filter button:hover {
                        background-color: #0056b3;
                    }
                </style>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <button class="counter-badge group" data-filter="group">Group</button>
                    <button class="counter-badge photo" data-filter="photo">Photo</button>
                    <button class="counter-badge story" data-filter="story">Story</button>
                    <button class="counter-badge video" data-filter="video">Video</button>
                    <button class="counter-badge reel" data-filter="reel">Reel</button>
                    <button class="counter-badge post" data-filter="post">Post</button>
                    <button class="counter-badge profile" data-filter="profile">Profile</button>
                    <button class="counter-badge duplicate" data-filter="duplicate">Trùng lặp</button>
                    <button class="counter-badge blacklist" data-filter="blacklist">Blacklist</button>
                    <button class="counter-badge note" data-filter="note">Ghi chú</button>
                </div>
                <div class="search-filter">
                    <input type="text" id="search-filter" placeholder="Tìm tiêu đề/nội dung...">
                    <button id="apply-search" class="btn">Tìm</button>
                </div>
            `;
        container.appendChild(filterButtons);

        const filteredList = document.createElement('div');
        filteredList.className = 'filtered-list';
        container.appendChild(filteredList);

        filterButtons.querySelectorAll('.counter-badge').forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.querySelectorAll('.counter-badge').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                state.currentFilter = button.dataset.filter;
                renderFilteredLinks(filteredList, state.currentFilter);
            });
        });

        const searchInput = filterButtons.querySelector('#search-filter');
        const applySearch = filterButtons.querySelector('#apply-search');
        applySearch.addEventListener('click', () => {
            state.dateFilter.searchQuery = searchInput.value.trim();
            saveData({ dateFilter: true });
            renderFilteredLinks(filteredList, state.currentFilter);
        });

        filterButtons.querySelector(`[data-filter="${state.currentFilter}"]`)?.classList.add('active');
        renderFilteredLinks(filteredList, state.currentFilter);
    } else if (tab === 'date-filter') {
        renderDateFilterTab();
    } else if (tab === 'log') {
        renderLogs();
    } else if (tab === 'fanpage') {
        renderFanpageTab();
    } else {
        renderLinks(tab);
    }
}

function renderFilteredLinks(container, filter) {
    container.innerHTML = '';
    state.currentFilter = filter;
    let filteredLinks = [];

    switch (filter) {
        case 'group':
            filteredLinks = state.links.filter(l => l.post_type === 'group' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'photo':
            filteredLinks = state.links.filter(l => l.post_type === 'photo' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'story':
            filteredLinks = state.links.filter(l => l.post_type === 'story' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'video':
            filteredLinks = state.links.filter(l => l.post_type === 'video' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'reel':
            filteredLinks = state.links.filter(l => l.post_type === 'reel' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'post':
            filteredLinks = state.links.filter(l => l.post_type === 'post' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'profile':
            filteredLinks = state.links.filter(l => l.post_type === 'profile' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'duplicate':
            // Nhóm các link theo URL đầy đủ
            const urlGroups = {};
            state.links.forEach(l => {
                if (!urlGroups[l.url]) urlGroups[l.url] = [];
                urlGroups[l.url].push(l);
            });
            // Lọc các nhóm có nhiều hơn 1 link và không bị blacklist
            filteredLinks = Object.values(urlGroups)
                .filter(group => group.length > 1 && group.every(l => l.blacklistStatus !== 'blacklisted'))
                .flat();
            break;
        case 'blacklist':
            filteredLinks = state.links.filter(l => l.blacklistStatus === 'blacklisted');
            break;
        case 'note':
            filteredLinks = state.links.filter(l => l.note && l.note.trim() !== '');
            break;
        default:
            filteredLinks = state.links;
    }

    const searchQuery = state.dateFilter.searchQuery.toLowerCase();
    if (searchQuery) {
        filteredLinks = filteredLinks.filter(l =>
            (l.title && l.title.toLowerCase().includes(searchQuery)) ||
            (l.description && l.description.toLowerCase().includes(searchQuery))
        );
    }

    if (filteredLinks.length === 0) {
        container.innerHTML = '<p>Không có link nào phù hợp.</p>';
    } else if (filter === 'duplicate') {
        // Nhóm lại để hiển thị cạnh nhau
        const urlGroups = {};
        filteredLinks.forEach(l => {
            if (!urlGroups[l.url]) urlGroups[l.url] = [];
            urlGroups[l.url].push(l);
        });

        Object.entries(urlGroups).forEach(([url, links]) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'grouped-duplicates';
            groupDiv.innerHTML = `<h4>URL: ${url} (${links.length} link)</h4>`;
            const linksContainer = document.createElement('div');
            linksContainer.className = 'duplicates-container';
            links.forEach((link, index) => {
                const linkItem = createLinkItem(link, index);
                linksContainer.appendChild(linkItem);
            });
            groupDiv.appendChild(linksContainer);
            container.appendChild(groupDiv);
        });
    } else {
        filteredLinks.forEach((link, index) => {
            const linkItem = createLinkItem(link, index);
            container.appendChild(linkItem);
        });
    }
    updateCounters();
}

function renderLinks(tab) {
    const container = elements.linkLists[tab];
    if (!container) return;

    let linksToRender = [];
    if (tab === 'all-link') linksToRender = state.links;
    else if (tab === 'blacklist') linksToRender = state.links.filter(l => l.blacklistStatus === 'blacklisted');
    else if (tab === 'error') linksToRender = state.links.filter(l => ['error', 'login', 'link_hỏng'].includes(l.status) && l.blacklistStatus !== 'blacklisted');
    else if (tab === 'duplicate') {
        // Nhóm các link theo URL đầy đủ
        const urlGroups = {};
        state.links.forEach(l => {
            if (!urlGroups[l.url]) urlGroups[l.url] = [];
            urlGroups[l.url].push(l);
        });
        // Lọc các nhóm có nhiều hơn 1 link và không bị blacklist
        linksToRender = Object.values(urlGroups)
            .filter(group => group.length > 1 && group.every(l => l.blacklistStatus !== 'blacklisted'))
            .flat();
    }

    container.innerHTML = '';
    if (linksToRender.length === 0) {
        container.innerHTML = `<p>Không có link nào trong ${tab}</p>`;
        if (tab === 'error') {
            container.innerHTML += '<button class="retry-error-btn" style="margin: 10px;">Thử lại tất cả</button>';
            container.querySelector('.retry-error-btn')?.addEventListener('click', () => {
                linksToRender.forEach(link => retryLink(link.id));
                showToast(`Đang thử lại ${linksToRender.length} link lỗi`, 'info');
                addLog(`Đã thử lại ${linksToRender.length} link lỗi`, 'info');
            });
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    if (tab === 'duplicate') {
        // Nhóm lại để hiển thị cạnh nhau
        const urlGroups = {};
        linksToRender.forEach(l => {
            if (!urlGroups[l.url]) urlGroups[l.url] = [];
            urlGroups[l.url].push(l);
        });

        Object.entries(urlGroups).forEach(([url, links]) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'grouped-duplicates';
            groupDiv.innerHTML = `<h4>URL: ${url} (${links.length} link)</h4>`;
            const linksContainer = document.createElement('div');
            linksContainer.className = 'duplicates-container';
            links.forEach((link, index) => {
                const linkItem = createLinkItem(link, index);
                linksContainer.appendChild(linkItem);
            });
            groupDiv.appendChild(linksContainer);
            fragment.appendChild(groupDiv);
        });
    } else {
        linksToRender.forEach((link, index) => {
            const item = createLinkItem(link, index);
            fragment.appendChild(item);
        });
    }
    container.appendChild(fragment);
    updateCounters();
}

function createLinkItem(link, index) {
    const item = document.createElement('div');
    item.className = `link-item ${link.status} ${link.checked ? 'checked' : ''}`;
    item.dataset.id = link.id;

    const postTypeLabel = link.post_type ? `[${link.post_type.toUpperCase()}] ` : '';
    const displayTitle = link.status === 'login' ? 'Yêu cầu đăng nhập' : (link.title || link.url);
    const displayDescription = link.status === 'login' ? 'Bài viết hạn chế yêu cầu đăng nhập để xem nội dung' : (link.description || '');
    const indexStr = (index + 1).toString();
    const indexDigits = indexStr.split('').map(digit => `<span>${digit}</span>`).join('');

    item.innerHTML = `
            <input type="checkbox" class="link-checkbox" ${link.checked ? 'checked' : ''}>
            <div class="link-row">
                <button class="link-index" title="Xóa link này">
                    ${indexDigits}
                </button>
                <div class="link-thumbnail">
                    ${link.image ? `<img src="${link.image}" alt="Thumbnail" loading="lazy">` : `<i class="fas fa-link fa-icon"></i>`}
                </div>
                <div class="link-content">
                    <div class="link-title post-type-${link.post_type}">${postTypeLabel}${displayTitle}</div>
                    <div class="link-description">${displayDescription}</div>
                    <div class="link-meta">
                        <span class="link-time">${link.note ? `<span class="note-text">${link.note}</span>` : formatDateTime(link.date)}</span>
                        <span class="link-status status-${link.blacklistStatus === 'blacklisted' ? 'blacklist' : link.status}">
                            ${link.blacklistStatus === 'blacklisted' ? '<span class="blacklist-text">Blacklist</span>' :
            link.status === 'success' ? 'Thành công' :
                link.status === 'login' ? 'Yêu cầu đăng nhập' :
                    link.status === 'link_hỏng' ? 'Link hỏng' :
                        link.status === 'error' ? 'Lỗi' : 'Không xác định'}
                        </span>
                    </div>
                </div>
                <div class="link-actions">
                    <button class="action-btn reset" title="Reset"><i class="fas fa-redo"></i></button>
                    <button class="action-btn note" title="Ghi chú"><i class="fas fa-comment-alt"></i></button>
                    ${link.blacklistStatus === 'active' ? `<button class="action-btn block" title="Chặn"><i class="fas fa-ban"></i></button>` : `<button class="action-btn unblock" title="Khôi phục"><i class="fas fa-undo"></i></button>`}
                </div>
            </div>
        `;

    item.querySelector('.link-checkbox').addEventListener('change', () => toggleCheckbox(link));
    item.querySelector('.link-thumbnail').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCheckbox(link);
    });
    item.querySelector('.link-content').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!link.checked) {
            // Nếu checkbox chưa được chọn: Bật checkbox và mở URL
            toggleCheckbox(link);
            window.open(link.url, '_blank');
        } else {
            // Nếu checkbox đã được chọn: Tắt checkbox
            toggleCheckbox(link);
        }
    });
    item.querySelector('.link-index').addEventListener('click', () => {
        if (confirm(`Xóa link: ${link.url}?`)) {
            saveBackup('deleteLinks', { links: [{ ...link }] });
            state.links = state.links.filter(l => l.id !== link.id);
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã xóa link ${link.url}`, 'success');
            addLog(`Đã xóa link ${link.url} (ID: ${link.id})`, 'info');
        }
    });
    item.querySelector('.reset').addEventListener('click', () => retryLink(link.id));
    item.querySelector('.note').addEventListener('click', () => showNoteDialog(link));
    item.querySelector('.block')?.addEventListener('click', () => {
        saveBackup('blacklist', { linkId: link.id, blacklistStatus: link.blacklistStatus });
        link.blacklistStatus = 'blacklisted';
        saveData({ links: true });
        renderTabContent(state.currentTab);
        updateCounters();
        showToast(`Đã chặn link: ${link.url}`, 'success');
        addLog(`Đã chặn link ${link.url} (ID: ${link.id})`, 'info');
    });
    item.querySelector('.unblock')?.addEventListener('click', () => {
        saveBackup('blacklist', { linkId: link.id, blacklistStatus: link.blacklistStatus });
        link.blacklistStatus = 'active';
        saveData({ links: true });
        renderTabContent(state.currentTab);
        updateCounters();
        showToast(`Đã khôi phục: ${link.url}`, 'success');
        addLog(`Đã khôi phục link ${link.url} (ID: ${link.id})`, 'info');
    });

    return item;
}

function renderDateFilterTab() {
    const container = elements.linkLists['date-filter'];
    if (!container) return;

    container.innerHTML = `
            <div class="date-filter-header">
                <div class="filter-controls">
                    <label>Từ ngày:</label>
                    <input type="date" id="start-date-input" value="${state.dateFilter.startDate}">
                    <label>Đến ngày:</label>
                    <input type="date" id="end-date-input" value="${state.dateFilter.endDate}">
                    <label>Trạng thái:</label>
                    <select id="status-filter">
                        <option value="all" ${state.dateFilter.status === 'all' ? 'selected' : ''}>Tất cả</option>
                        <option value="pending" ${state.dateFilter.status === 'pending' ? 'selected' : ''}>Đang chờ</option>
                        <option value="login" ${state.dateFilter.status === 'login' ? 'selected' : ''}>Yêu cầu đăng nhập</option>
                        <option value="link_hỏng" ${state.dateFilter.status === 'link_hỏng' ? 'selected' : ''}>Link hỏng</option>
                        <option value="error" ${state.dateFilter.status === 'error' ? 'selected' : ''}>Lỗi</option>
                    </select>
                    <label>Nhóm tiêu đề:</label>
                    <input type="checkbox" id="group-titles" ${state.dateFilter.groupTitles ? 'checked' : ''}>
                    <label>Tìm kiếm:</label>
                    <input type="text" id="search-filter" placeholder="Tìm tiêu đề/nội dung..." value="${state.dateFilter.searchQuery}">
                    <button class="btn filter-btn" id="apply-date-filter"><i class="fas fa-filter"></i> Lọc</button>
                    <button class="btn reset-filter-btn" id="reset-date-filter"><i class="fas fa-times"></i> Xóa bộ lọc</button>
                </div>
                <div class="filter-result" id="filter-result">Đã lọc: 0 link</div>
            </div>
            <div class="filtered-links"></div>
        `;

    const startDateInput = container.querySelector('#start-date-input');
    const endDateInput = container.querySelector('#end-date-input');
    const statusFilter = container.querySelector('#status-filter');
    const groupTitlesCheckbox = container.querySelector('#group-titles');
    const searchInput = container.querySelector('#search-filter');
    const applyButton = container.querySelector('#apply-date-filter');
    const resetButton = container.querySelector('#reset-date-filter');
    const filteredContainer = container.querySelector('.filtered-links');
    const resultLabel = container.querySelector('#filter-result');

    function applyFilter() {
        saveBackup('dateFilter', { dateFilter: { ...state.dateFilter } });
        state.dateFilter.startDate = startDateInput.value;
        state.dateFilter.endDate = endDateInput.value;
        state.dateFilter.status = statusFilter.value;
        state.dateFilter.groupTitles = groupTitlesCheckbox.checked;
        state.dateFilter.searchQuery = searchInput.value.trim();

        if (state.dateFilter.startDate && state.dateFilter.endDate) {
            const start = new Date(state.dateFilter.startDate);
            const end = new Date(state.dateFilter.endDate);
            if (start > end) {
                showToast('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc', 'warning');
                return;
            }
        }

        let filteredLinks = getLinksForCurrentTab();
        if (state.dateFilter.groupTitles) {
            const grouped = {};
            filteredLinks.forEach(link => {
                const key = link.title || link.url;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(link);
            });
            filteredLinks = Object.values(grouped).map(group => group[0]);
        }

        filteredContainer.innerHTML = '';
        if (filteredLinks.length === 0) {
            filteredContainer.innerHTML = '<p>Không có link nào trong khoảng ngày này</p>';
        } else {
            const fragment = document.createDocumentFragment();
            filteredLinks.forEach((link, index) => {
                const item = createLinkItem(link, index);
                fragment.appendChild(item);
            });
            filteredContainer.appendChild(fragment);
        }
        resultLabel.textContent = `Đã lọc: ${filteredLinks.length} link`;
        updateCounters();
        saveData({ dateFilter: true });
        showToast(`Đã lọc ${filteredLinks.length} link`, 'info');
    }

    applyButton.addEventListener('click', applyFilter);
    resetButton.addEventListener('click', () => {
        saveBackup('dateFilter', { dateFilter: { ...state.dateFilter } });
        state.dateFilter.startDate = '';
        state.dateFilter.endDate = '';
        state.dateFilter.status = 'all';
        state.dateFilter.groupTitles = false;
        state.dateFilter.searchQuery = '';
        startDateInput.value = '';
        endDateInput.value = '';
        statusFilter.value = 'all';
        groupTitlesCheckbox.checked = false;
        searchInput.value = '';
        filteredContainer.innerHTML = '';
        resultLabel.textContent = 'Đã lọc: 0 link';
        updateCounters();
        saveData({ dateFilter: true });
        showToast('Đã xóa bộ lọc', 'info');
        addLog('Đã xóa bộ lọc', 'info');
    });

    if (state.dateFilter.startDate && state.dateFilter.endDate) applyFilter();
}

function renderLogs() {
    const container = elements.linkLists['log'];
    if (!container) return;

    container.innerHTML = '';
    if (state.logs.length === 0) {
        container.innerHTML = `
                <div class="empty-message" style="text-align: center; padding: 20px;">
                    <i class="fas fa-clipboard-list" style="font-size: 24px; color: #666;"></i>
                    <p>Không có log nào</p>
                </div>`;
    } else {
        container.innerHTML = '<button class="clear-log-btn btn btn-danger" style="margin: 10px;"><i class="fas fa-trash"></i> Xóa Log</button>';
        const fragment = document.createDocumentFragment();
        state.logs.forEach(log => {
            const logItem = document.createElement('div');
            logItem.className = 'log-item';
            logItem.innerHTML = `
                    <div class="log-message">${log.message}</div>
                    <div class="log-meta">
                        <span class="log-type ${log.type}">${log.type}</span>
                        <span>${formatDate(log.timestamp)}</span>
                    </div>
                `;
            fragment.appendChild(logItem);
        });
        container.appendChild(fragment);

        container.querySelector('.clear-log-btn').addEventListener('click', () => {
            if (confirm('Xóa toàn bộ log?')) {
                saveBackup('clearLogs', { logs: [...state.logs] });
                state.logs = [];
                saveData({ logs: true });
                renderLogs();
                showToast('Đã xóa log', 'success');
                addLog('Đã xóa toàn bộ log', 'info');
            }
        });
    }
}

// Link Actions
function toggleCheckbox(link) {
    saveBackup('checkbox', { linkId: link.id, checked: link.checked });
    link.checked = !link.checked;
    saveData({ links: true });
    renderTabContent(state.currentTab);
    updateCounters();
}

function toggleSelectAll() {
    const linksToToggle = getLinksForCurrentTab();
    const allChecked = linksToToggle.every(l => l.checked);

    saveBackup('selectAll', { links: linksToToggle });
    linksToToggle.forEach(l => l.checked = !allChecked);
    saveData({ links: true });
    renderTabContent(state.currentTab);
    updateCounters();
    addLog(`Đã ${allChecked ? 'bỏ chọn' : 'chọn'} tất cả ${linksToToggle.length} link trong tab ${state.currentTab}`, 'info');

    if (!allChecked && linksToToggle.length > 0) {
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Đã chọn ${linksToToggle.length} link</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; justify-content: space-between; gap: 10px;">
                    <button id="delete-selected" class="btn btn-danger" style="flex: 1;">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                    <button id="export-gist" class="btn btn-primary" style="flex: 1;">
                        <i class="fas fa-code-branch"></i> Xuất Gist
                    </button>
                    <button id="unselect-all" class="btn btn-secondary" style="flex: 1;">
                        <i class="fas fa-times"></i> Bỏ chọn tất cả
                    </button>
                </div>
            </div>
        </div>
    `;

        document.body.appendChild(dialog);

        dialog.querySelector('#delete-selected').addEventListener('click', () => {
            deleteSelected();
            document.body.removeChild(dialog);
        });
        dialog.querySelector('#export-gist').addEventListener('click', () => {
            exportToGist();
            document.body.removeChild(dialog);
        });
        dialog.querySelector('#unselect-all').addEventListener('click', () => {
            saveBackup('selectAll', { links: linksToToggle });
            linksToToggle.forEach(l => l.checked = false);
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            addLog(`Đã bỏ chọn tất cả ${linksToToggle.length} link`, 'info');
            document.body.removeChild(dialog);
        });
        dialog.querySelector('.modal-close').addEventListener('click', () => document.body.removeChild(dialog));
    }
}

function showNoteDialog(link) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>Thêm ghi chú</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="note-input" placeholder="Nhập ghi chú..." value="${link.note || ''}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                </div>
                <div class="modal-footer">
                    <button id="note-confirm" class="btn btn-primary">Lưu</button>
                    <button id="note-cancel" class="btn btn-secondary">Hủy</button>
                </div>
            </div>
        `;
    document.body.appendChild(dialog);

    const input = dialog.querySelector('#note-input');
    const confirmBtn = dialog.querySelector('#note-confirm');
    const cancelBtn = dialog.querySelector('#note-cancel');
    const closeBtn = dialog.querySelector('.modal-close');

    confirmBtn.addEventListener('click', () => {
        saveBackup('note', { linkId: link.id, note: link.note });
        link.note = input.value.trim();
        saveData({ links: true });
        renderTabContent(state.currentTab);
        showToast('Đã lưu ghi chú', 'success');
        addLog(`Đã thêm ghi chú cho link: ${link.url} (ID: ${link.id})`, 'info');
        document.body.removeChild(dialog);
    });

    cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
    closeBtn.addEventListener('click', () => document.body.removeChild(dialog));
}

function showAddLinkDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Thêm danh sách link</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <textarea id="new-links-input" placeholder="Nhập danh sách URL (mỗi URL trên một dòng)..." style="width: 100%; height: 150px; padding: 8px; border-radius: 4px; border: 1px solid #ddd;"></textarea>
                <div style="display: flex; justify-content: space-between; margin-top: 10px; gap: 10px;">
                    <button id="import-json-in-dialog" class="btn btn-secondary" style="flex: 1;"><i class="fas fa-file-import"></i> Nhập JSON</button>
                    <button id="add-links-confirm" class="btn btn-primary" style="flex: 1;">Thêm</button>
                    <button id="add-links-cancel" class="btn btn-secondary" style="flex: 1;">Hủy</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const textarea = dialog.querySelector('#new-links-input');
    const confirmBtn = dialog.querySelector('#add-links-confirm');
    const cancelBtn = dialog.querySelector('#add-links-cancel');
    const closeBtn = dialog.querySelector('.modal-close');
    const importJsonBtn = dialog.querySelector('#import-json-in-dialog');

    confirmBtn.addEventListener('click', () => {
        const urls = textarea.value.trim().split('\n').map(url => url.trim()).filter(url => url);
        if (urls.length === 0) {
            showToast('Vui lòng nhập ít nhất một URL', 'warning');
            return;
        }

        let addedCount = 0;
        const newLinks = [];
        urls.forEach(url => {
            if (!isValidUrl(url)) {
                showToast(`URL không hợp lệ: ${url}`, 'warning');
                return;
            }
            if (isLinkExists(url)) {
                showToast(`Link đã tồn tại: ${url}`, 'warning');
                return;
            }

            const newLink = {
                id: generateId(),
                url,
                title: 'Đang trích xuất...',
                description: '',
                image: '',
                status: 'pending',
                post_type: determinePostType(url),
                date: new Date().toISOString(),
                checked: false,
                blacklistStatus: 'active',
                note: ''
            };
            state.links.unshift(newLink);
            newLinks.push(newLink);
            addedCount++;
            setTimeout(() => extractContent(url), 0);
            addLog(`Đã thêm link: ${url} (ID: ${newLink.id})`, 'info');
        });

        if (addedCount > 0) {
            saveBackup('addLinks', { links: newLinks });
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã thêm ${addedCount} link mới`, 'success');
        }
        document.body.removeChild(dialog);
    });

    importJsonBtn.addEventListener('click', () => {
        importFromJSON();
        document.body.removeChild(dialog);
    });

    cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
    closeBtn.addEventListener('click', () => document.body.removeChild(dialog));
}
async function importFromJSON() {
    try {
        state.isLoading = true;
        showToast('Đang tải danh sách link từ Gist JSON...', 'info');

        const gistApiUrl = 'https://api.github.com/gists/2cc79f453b3be62607c5ee8cb34e6cab';
        const response = await fetch(gistApiUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Lỗi HTTP: ${response.status}`);

        const gistData = await response.json();
        const fileContent = gistData.files["gistfile1.txt"]?.content;

        if (!fileContent) throw new Error("Không tìm thấy nội dung trong 'gistfile1.txt'");

        let data;
        try {
            data = JSON.parse(fileContent);
        } catch (e) {
            throw new Error("Nội dung JSON không hợp lệ");
        }

        if (!Array.isArray(data)) throw new Error('Dữ liệu JSON không hợp lệ (phải là mảng object)');

        const validLinks = data.filter(item =>
            typeof item.url === 'string' &&
            item.url.trim() !== ''
        );

        if (validLinks.length === 0) {
            showToast('Không có link hợp lệ nào trong JSON', 'warning');
            return;
        }

        if (!confirm(`Bạn có chắc muốn nhập ${validLinks.length} link từ Gist JSON?`)) {
            showToast('Đã hủy nhập dữ liệu', 'warning');
            return;
        }

        let addedCount = 0;
        const newLinks = [];

        validLinks.forEach(item => {
            const trimmedUrl = item.url.trim();
            const newLink = {
                id: generateId(),
                url: trimmedUrl,
                title: item.title || 'Chưa xử lý',
                description: item.description || 'Chưa có mô tả',
                image: item.image || config.defaultImage,
                status: item.status || 'pending',
                post_type: item.post_type || determinePostType(trimmedUrl),
                date: new Date().toISOString(),
                checked: false,
                blacklistStatus: 'active',
                note: ''
            };
            state.links.unshift(newLink);
            newLinks.push(newLink);
            addedCount++;
            addLog(`Đã thêm link mới từ Gist: ${trimmedUrl} (ID: ${newLink.id})`, 'success');
        });

        if (addedCount > 0) {
            saveBackup('addLinks', { links: newLinks });
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã thêm ${addedCount} link từ Gist`, 'success');
            addLog(`Đã nhập ${addedCount} link từ Gist JSON`, 'success');
        } else {
            showToast('Không có link nào được thêm', 'warning');
        }
    } catch (error) {
        console.error('Lỗi khi nhập từ Gist:', error);
        showToast(`Lỗi khi nhập từ Gist: ${error.message}`, 'danger');
        addLog(`Lỗi nhập từ Gist: ${error.message}`, 'error');
    } finally {
        state.isLoading = false;
    }
}


/*

async function importFromJSON() {
    try {
        state.isLoading = true;
        showToast('Đang tải dữ liệu từ JSON...', 'info');

        const jsonFileUrl = 'http://127.0.0.1:10000/var/mobile/new/ketqua_fb.json';
        const response = await fetch(jsonFileUrl);
        if (!response.ok) throw new Error(`Lỗi HTTP: ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Dữ liệu JSON không hợp lệ (phải là mảng)');

        if (!confirm(`Bạn có chắc muốn nhập ${data.length} link từ file JSON?`)) {
            showToast('Đã hủy nhập dữ liệu', 'warning');
            return;
        }

        let addedCount = 0;
        const newLinks = [];
        data.forEach(item => {
            if (!item.url) {
                addLog(`Bỏ qua mục không có URL: ${JSON.stringify(item)}`, 'warning');
                return;
            }

            // Gán giá trị mặc định
            let title = decodeHTMLEntities(item.title) || 'Bài viết lỗi';
            let description = decodeHTMLEntities(item.description) || 'Không có nội dung';
            let image = item.image || config.defaultImage;

            // Xác định trạng thái dựa trên nội dung
            let status;
            // Kiểm tra xem dữ liệu có thiếu hoặc là giá trị mặc định không
            const isMissingData =
                !item.title || title === 'Bài viết lỗi' || title.trim() === '' ||
                !item.description || description === 'Không có nội dung' || description.trim() === '' ||
                !item.image || image === config.defaultImage;

            const hasBrokenLinkContent =
                (title && title.toLowerCase().includes('not found')) ||
                (description && description.toLowerCase().includes('not found')) ||
                (description && description.toLowerCase().includes('unavailable')) ||
                (description && description.toLowerCase().includes('removed'));

            if (isMissingData) {
                // Nếu thiếu bất kỳ trường nào, đặt trạng thái là 'login'
                status = 'login';
                title = 'Yêu cầu đăng nhập';
                description = 'Bài viết hạn chế yêu cầu đăng nhập để xem nội dung';
                image = config.defaultImage;
                addLog(`Link ${item.url} thiếu dữ liệu (title, description, hoặc image), đặt trạng thái 'login'`, 'info');
            } else if (hasBrokenLinkContent || item.status === 'link_hỏng') {
                // Nếu có dấu hiệu link hỏng, đặt trạng thái là 'link_hỏng'
                status = 'link_hỏng';
            } else {
                // Nếu có dữ liệu hợp lệ, đặt trạng thái là 'success'
                status = 'success';
            }

            // Ghi log nếu trạng thái JSON khác với trạng thái tính toán
            if (item.status && item.status !== status) {
                addLog(`Trạng thái JSON '${item.status}' không khớp với dữ liệu cho link ${item.url}, sử dụng '${status}'`, 'warning');
            }

            const newLink = {
                id: generateId(),
                url: item.url,
                title,
                description,
                image,
                status,
                post_type: item.post_type && item.post_type !== 'unknown' ? item.post_type : determinePostType(item.url),
                date: new Date().toISOString(),
                checked: false,
                blacklistStatus: 'active',
                note: ''
            };
            state.links.unshift(newLink);
            newLinks.push(newLink);
            addedCount++;

            if (['login', 'link_hỏng'].includes(status)) {
                addLog(`Link nhập từ JSON có trạng thái ${status}: ${item.url} (ID: ${newLink.id})`, 'warning');
            } else {
                addLog(`Link nhập từ JSON thành công: ${item.url} (ID: ${newLink.id})`, 'success');
            }
        });

        if (addedCount > 0) {
            saveBackup('addLinks', { links: newLinks });
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã thêm ${addedCount} link từ JSON`, 'success');
            addLog(`Đã nhập ${addedCount} link từ file JSON`, 'success');
        } else {
            showToast('Không có link mới nào được thêm từ file JSON', 'warning');
        }
    } catch (error) {
        console.error('Lỗi khi nhập từ JSON:', error);
        showToast(`Lỗi khi nhập từ JSON: ${error.message}`, 'danger');
        addLog(`Lỗi nhập từ JSON: ${error.message}`, 'error');
    } finally {
        state.isLoading = false;
    }
}
*/
async function exportToGist() {
    try {
        const selectedLinks = state.links.filter(link => link.checked);
        if (selectedLinks.length === 0) {
            showToast('Không có link nào được chọn để xuất!', 'warning');
            return;
        }

        const content = selectedLinks.map(link => link.url).join('\n');
        const response = await fetch(config.apiGistPatchUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${config.githubToken}`,
                'Accept': 'application/vnd.github+json'
            },
            body: JSON.stringify({
                files: { 'Textlink': { content } }
            })
        });

        if (!response.ok) throw new Error('Lỗi từ GitHub API');
        showToast(`Đã xuất ${selectedLinks.length} link lên Gist`, 'success');
        addLog(`Đã xuất ${selectedLinks.length} link lên Gist`, 'success');
    } catch (error) {
        showToast('Lỗi khi xuất lên Gist!', 'danger');
        addLog(`Lỗi khi xuất lên Gist: ${error.message}`, 'error');
    }
}

function deleteSelected() {
    const selectedLinks = getLinksForCurrentTab().filter(link => link.checked);
    if (selectedLinks.length > 0) {
        if (confirm(`Bạn có chắc muốn xóa ${selectedLinks.length} link đã chọn?`)) {
            saveBackup('deleteLinks', { links: selectedLinks });
            state.links = state.links.filter(link => !selectedLinks.includes(link));
            saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã xóa ${selectedLinks.length} link`, 'success');
            addLog(`Đã xóa ${selectedLinks.length} link`, 'info');
        }
        return;
    }

    // Xóa trùng lặp khi không có link được chọn
    const urlGroups = {};
    state.links.forEach(l => {
        if (!urlGroups[l.url]) urlGroups[l.url] = [];
        urlGroups[l.url].push(l);
    });

    const duplicateLinks = Object.values(urlGroups)
        .filter(group => group.length > 1)
        .flatMap(group => group.slice(1)); // Giữ link đầu tiên, xóa các link trùng sau

    if (duplicateLinks.length === 0) {
        showToast('Không tìm thấy link trùng lặp để xóa', 'warning');
        return;
    }

    if (confirm(`Tìm thấy ${duplicateLinks.length} link trùng lặp. Bạn có muốn xóa chúng không?`)) {
        saveBackup('deleteLinks', { links: duplicateLinks });
        state.links = state.links.filter(link => !duplicateLinks.includes(link));
        saveData({ links: true });
        renderTabContent(state.currentTab);
        updateCounters();
        showToast(`Đã xóa ${duplicateLinks.length} link trùng lặp`, 'success');
        addLog(`Đã xóa ${duplicateLinks.length} link trùng lặp`, 'info');
    }
}

function smartScroll() {
    if (!elements.mainContent) return;
    const maxScroll = elements.mainContent.scrollHeight - elements.mainContent.clientHeight;
    const targetPosition = state.scrollState === 0 ? maxScroll : 0;
    smoothScroll(elements.mainContent, targetPosition);
    state.scrollState = state.scrollState === 0 ? 1 : 0;
}

function retryLink(id) {
    const link = state.links.find(l => l.id === id);
    if (!link) return;

    saveBackup('retryLink', { linkId: id, link: { ...link } });
    link.status = 'pending';
    link.title = 'Đang trích xuất lại...';
    saveData({ links: true });
    renderTabContent(state.currentTab);
    setTimeout(() => extractContent(link.url), 0);
    addLog(`Đang thử lại link: ${link.url} (ID: ${link.id})`, 'info');
}

async function extractContent(url) {
    const link = state.links.find(l => l.url === url);
    if (!link) return;

    const tryExtract = async (useProxy = false) => {
        try {
            const startTime = Date.now();
            const fetchUrl = useProxy ? `${config.corsProxy}${encodeURIComponent(url)}` : url;
            const headers = useProxy ? {} : {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            };

            const response = await fetch(fetchUrl, {
                headers,
                signal: AbortSignal.timeout(config.requestTimeout)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            let htmlContent;
            if (useProxy) {
                const proxyData = await response.json();
                htmlContent = proxyData.contents;
            } else {
                htmlContent = await response.text();
            }

            if (!htmlContent) throw new Error('Không có nội dung trả về');

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');

            const title = doc.querySelector('title')?.textContent || '';
            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
            const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
            const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

            return {
                title: decodeHTMLEntities(ogTitle || title || 'Bài viết lỗi'),
                description: decodeHTMLEntities(ogDesc || ''),
                image: ogImage || config.defaultImage,
                htmlContent,
                processingTime: Date.now() - startTime
            };
        } catch (error) {
            throw error;
        }
    };

    try {
        const result = await tryExtract(false);

        link.title = result.title;
        link.description = result.description;
        link.image = result.image;
        link.post_type = link.post_type && link.post_type !== 'unknown' ? link.post_type : determinePostType(url);

        if (link.description || link.image !== config.defaultImage) {
            link.status = 'success';
        } else {
            if (result.htmlContent.toLowerCase().includes('login')) {
                link.status = 'login';
                link.title = 'Yêu cầu đăng nhập';
                link.description = 'Bài viết hạn chế yêu cầu đăng nhập để xem nội dung';
            } else if (result.htmlContent.toLowerCase().includes('content not found') ||
                result.htmlContent.toLowerCase().includes('unavailable') ||
                result.htmlContent.toLowerCase().includes('removed')) {
                link.status = 'link_hỏng';
                link.title = 'Bài viết lỗi';
                link.description = 'Không có nội dung';
            } else {
                link.status = 'error';
                link.title = 'Bài viết lỗi';
                link.description = 'Không có nội dung';
            }
        }

        link.processingTime = result.processingTime;
        addLog(`Đã trích xuất thành công: ${url} (ID: ${link.id})`, 'success');
    } catch (error) {
        addLog(`Lỗi khi trích xuất trực tiếp ${url} (ID: ${link.id}): ${error.message}, thử lại với proxy...`, 'warning');
        try {
            const result = await tryExtract(true);

            link.title = result.title;
            link.description = result.description;
            link.image = result.image;
            link.post_type = link.post_type && link.post_type !== 'unknown' ? link.post_type : determinePostType(url);

            if (link.description || link.image !== config.defaultImage) {
                link.status = 'success';
            } else {
                if (result.htmlContent.toLowerCase().includes('login')) {
                    link.status = 'login';
                    link.title = 'Yêu cầu đăng nhập';
                    link.description = 'Bài viết hạn chế yêu cầu đăng nhập để xem nội dung';
                } else if (result.htmlContent.toLowerCase().includes('content not found') ||
                    result.htmlContent.toLowerCase().includes('unavailable') ||
                    result.htmlContent.toLowerCase().includes('removed')) {
                    link.status = 'link_hỏng';
                    link.title = 'Bài viết lỗi';
                    link.description = 'Không có nội dung';
                } else {
                    link.status = 'error';
                    link.title = 'Bài viết lỗi';
                    link.description = 'Không có nội dung';
                }
            }

            link.processingTime = result.processingTime;
            addLog(`Đã trích xuất thành công qua proxy: ${url} (ID: ${link.id})`, 'success');
        } catch (proxyError) {
            link.title = 'Bài viết lỗi';
            link.description = 'Không có nội dung';
            link.image = config.defaultImage;
            link.status = 'error';
            link.post_type = link.post_type && link.post_type !== 'unknown' ? link.post_type : determinePostType(url);
            addLog(`Lỗi khi xử lý ${url} (ID: ${link.id}) qua proxy: ${proxyError.message}`, 'error');
        }
    } finally {
        saveData({ links: true });
        renderTabContent(state.currentTab);
    }
}

// Event Listeners
function setupEventListeners() {
    console.log('Setting up event listeners');
    Object.entries(elements.headerBtns).forEach(([key, btn]) => {
        if (!btn) {
            console.warn(`Button ${key} not found`);
            addLog(`Không tìm thấy nút ${key}`, 'warning');
            return;
        }
        switch (key) {
            case 'add':
                btn.addEventListener('click', () => {
                    if (state.currentTab === 'fanpage') {
                        showAddFanpageDialog();
                    } else {
                        showAddLinkDialog();
                    }
                });
                break;
            case 'delete':
                btn.addEventListener('click', deleteSelected);
                break;
            case 'undo':
                btn.addEventListener('click', undoAction);
                break;
            case 'scroll':
                btn.addEventListener('click', smartScroll);
                break;
            case 'log':
                btn.addEventListener('click', () => switchTab('log'));
                break;
            case 'fanpage': // Thêm sự kiện cho nút Fanpage
                btn.addEventListener('click', () => switchTab('fanpage'));
                break;
        }
    });

    if (elements.statusCounters.all?.parentElement) {
        elements.statusCounters.all.parentElement.addEventListener('click', () => switchTab('all-link'));
    }
    if (elements.statusCounters.filter?.parentElement) {
        elements.statusCounters.filter.parentElement.addEventListener('click', () => switchTab('filter'));
    }
    if (elements.selectAllCounter.btn) {
        elements.selectAllCounter.btn.addEventListener('click', toggleSelectAll);
    }

    if (elements.mainContent) {
        elements.mainContent.addEventListener('scroll', debounce(() => {
            state.scrollPosition = elements.mainContent.scrollTop;
            saveData({ scrollPosition: true });
        }, config.debounceDelay));
    } else {
        addLog('Không tìm thấy scroll-container', 'warning');
    }

    window.addEventListener('error', (event) => {
        addLog(`Lỗi hệ thống: ${event.message}`, 'error');
        showToast('Đã xảy ra lỗi hệ thống', 'danger');
    });
}

// Initialize
function init() {
    window.addEventListener('DOMContentLoaded', async () => {
        await loadData();



        setupEventListeners();
        renderTabContent('all-link');
    });
}






// Hàm kiểm tra trực tiếp
function checkFanpageImmediately(fanpage, iframeContainer) {
    iframeContainer.innerHTML = `
        <div class="fb-post" 
             data-href="${fanpage.url}" 
             data-width="100%"
             data-show-text="true"
             data-lazy="false"></div>
    `;

    // Xử lý khi SDK đã sẵn sàng
    if (window.FB) {
        window.FB.XFBML.parse(iframeContainer, () => {
            setTimeout(() => {
                verifyFanpageStatus(fanpage, iframeContainer);
            }, 2000); // Chờ 2 giây để iframe tải
        });
    } else {
        // Fallback nếu SDK chưa sẵn sàng
        setTimeout(() => {
            verifyFanpageStatus(fanpage, iframeContainer);
        }, 3000);
    }
}



// Helper functions
function getStatusIcon(status) {
    return {
        'exists': 'check-circle',
        'not-exists': 'times-circle',
        'restricted': 'ban',
        'pending': 'spinner fa-pulse'
    }[status] || 'question-circle';
}



// Hàm hỗ trợ
function getActualStatus(fanpage) {
    if (fanpage.errorCount >= 3) return 'not-exists';
    if (fanpage.lastError === 'content_restricted') return 'restricted';
    return fanpage.status;
}



function resetFanpageStatus(fanpageId) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    // Reset trạng thái
    fanpage.status = 'pending';
    fanpage.errorCount = 0;
    delete fanpage.lastError;

    saveData({ fanpages: true });
    renderFanpageTab();
    showToast(`Đã reset trạng thái fanpage ${fanpage.name}`, 'info');
}



// Helper functions
function getStatusIcon(status) {
    return {
        'exists': 'check-circle',
        'not-exists': 'times-circle',
        'restricted': 'ban',
        'pending': 'spinner fa-pulse'
    }[status] || 'question-circle';
}



// Hàm kiểm tra trạng thái thực tế
function checkActualFanpageStatus(fanpage) {
    // Nếu bài viết đã bị xóa hoặc hạn chế
    if (fanpage.errorCount > 2) { // Ngưỡng lỗi
        return {
            status: 'not-exists',
            icon: 'times-circle',
            text: 'Bài viết không khả dụng'
        };
    }

    // Trạng thái bình thường
    return {
        status: fanpage.status,
        icon: fanpage.status === 'exists' ? 'check-circle'
            : fanpage.status === 'not-exists' ? 'times-circle'
                : 'spinner fa-pulse',
        text: fanpage.status === 'exists' ? 'Tồn tại'
            : fanpage.status === 'not-exists' ? 'Không tồn tại'
                : 'Đang kiểm tra'
    };
}
function deleteFanpage(fanpageId) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    saveBackup('deleteFanpage', { fanpage: { ...fanpage } });
    state.fanpages = state.fanpages.filter(f => f.id !== fanpageId);
    saveData({ fanpages: true });
    renderFanpageTab();
    showToast(`Đã xóa fanpage ${fanpage.name}`, 'success');
    addLog(`Đã xóa fanpage ${fanpage.name} (ID: ${fanpage.id})`, 'info');
}


function isFanpageExists(url) {
    const baseUrl = url.split('?')[0];
    return state.fanpages.some(fanpage => fanpage.url.split('?')[0] === baseUrl);
}

function showAddFanpageDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-dialog" style="max-width: 500px;">
            <div class="modal-header">
                <h3>Thêm Fanpage/Profile</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>URL Fanpage/Profile</label>
                    <input type="text" id="fanpage-url" placeholder="Nhập URL" class="form-control" style="font-size: 16px; padding: 12px; height: 48px;">
                </div>
                
                <div class="form-group">
                    <label>Tiêu đề</label>
                    <div class="title-input-group">
                        <input type="text" id="fanpage-title" placeholder="Nhập tiêu đề" class="form-control" style="font-size: 16px; padding: 12px; height: 48px;">
                        <button id="edit-title-btn" class="btn btn-edit" title="Sửa tiêu đề" style="height: 48px; width: 48px;">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Loại Profile</label>
                    <div class="profile-selector">
                        <button class="profile-btn active" data-type="fanpage">
                            <i class="fas fa-flag"></i> Fanpage
                        </button>
                        <button class="profile-btn" data-type="profile">
                            <i class="fas fa-user"></i> Cá nhân
                        </button>
                        <button class="profile-btn" data-type="profile-pro">
                            <i class="fas fa-star"></i> Pro
                        </button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button id="cancel-add-fanpage" class="btn btn-secondary">Hủy</button>
                <button id="confirm-add-fanpage" class="btn btn-primary">Thêm</button>
            </div>
        </div>
        <style>
            .title-input-group {
                display: flex;
                gap: 5px;
            }
            .title-input-group input {
                flex: 1;
            }
            .btn-edit {
                padding: 0;
                background: #f0f2f5;
                border: 1px solid #ddd;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .btn-edit:hover {
                background: #e0e0e0;
            }
            .profile-selector {
                display: flex;
                gap: 5px;
                margin-top: 5px;
            }
            .profile-btn {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                background: #f5f5f5;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                font-size: 14px;
            }
            .profile-btn.active {
                background: #1877f2;
                color: white;
                border-color: #1877f2;
            }
            .profile-btn i {
                font-size: 14px;
            }
            .form-control {
                font-size: 16px;
                padding: 12px;
                height: 48px;
                border-radius: 4px;
                border: 1px solid #ddd;
            }
            .form-group {
                margin-bottom: 15px;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
            }
        </style>
    `;

    document.body.appendChild(dialog);

    // Xử lý chọn loại profile
    let selectedType = 'fanpage';
    dialog.querySelectorAll('.profile-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            dialog.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedType = this.dataset.type;
        });
    });

    // Xử lý nút sửa tiêu đề
    dialog.querySelector('#edit-title-btn').addEventListener('click', function () {
        const titleInput = dialog.querySelector('#fanpage-title');
        titleInput.focus();
    });

    // Xử lý thêm fanpage
    dialog.querySelector('#confirm-add-fanpage').addEventListener('click', function () {
        const url = dialog.querySelector('#fanpage-url').value.trim();
        const title = dialog.querySelector('#fanpage-title').value.trim();

        if (!isValidUrl(url)) {
            showToast('URL không hợp lệ', 'warning');
            return;
        }

        if (!title) {
            showToast('Vui lòng nhập tiêu đề', 'warning');
            return;
        }

        const newFanpage = {
            id: generateId(),
            url,
            name: title,
            description: '',
            type: selectedType,
            date: new Date().toISOString(),
            checked: false,
            status: 'pending'
        };

        state.fanpages.unshift(newFanpage);
        saveData({ fanpages: true });
        renderFanpageTab();
        document.body.removeChild(dialog);
        showToast(`Đã thêm ${selectedType === 'fanpage' ? 'Fanpage' : 'Profile'} mới`, 'success');
    });

    // Xử lý hủy
    dialog.querySelector('#cancel-add-fanpage').addEventListener('click', function () {
        document.body.removeChild(dialog);
    });

    dialog.querySelector('.modal-close').addEventListener('click', function () {
        document.body.removeChild(dialog);
    });
}

function refreshFanpage(fanpageId) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    saveBackup('refreshFanpage', { fanpage: { ...fanpage } });
    fanpage.status = 'pending';
    fanpage.lastChecked = null;
    saveData({ fanpages: true });
    renderTabContent('fanpage');
    addLog(`Làm mới fanpage: ${fanpage.name}`, 'info');
}

function getStatusText(status) {
    const statusMap = {
        'exists': '✓ Tồn tại',
        'not-exists': '✗ Không tồn tại',
        'restricted': '⛔ Bị chặn',
        'pending': '⌛ Đang kiểm tra',
        'error': '⚠ Lỗi'
    };
    return statusMap[status] || '? Không xác định';
}

// Thay thế verifyFanpageExistence, updateFanpageStatus, checkFanpageStatus bằng hàm mới
async function verifyFanpage(fanpage, container) {
    const iframe = container.querySelector('iframe');
    let status = 'error';

    if (iframe) {
        try {
            // Phát hiện nội dung bị chặn/xóa
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc.body.innerText.includes('content not found')) {
                status = 'not-exists';
            } else if (iframeDoc.body.innerText.includes('restricted') ||
                iframeDoc.body.innerText.includes('log in')) {
                status = 'restricted';
            } else {
                status = 'exists';
            }
        } catch (e) {
            status = 'exists'; // Giả định tồn tại nếu có iframe
        }
    }

    // Cập nhật trạng thái
    fanpage.status = status;
    fanpage.lastChecked = new Date().toISOString();
    saveData({ fanpages: true });

    // Cập nhật giao diện
    const statusElement = container.querySelector('.fanpage-status');
    if (statusElement) {
        statusElement.className = `fanpage-status ${status}`;
        statusElement.textContent = getStatusText(status);
    }
}



function forceCheckFanpage(fanpageId, itemElement) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    // Reset trạng thái
    fanpage.status = 'pending';
    fanpage.lastChecked = null;
    saveData({ fanpages: true });

    // Hiển thị loading
    const statusElement = itemElement.querySelector('.fanpage-status-overlay');
    statusElement.className = 'fanpage-status-overlay pending';
    statusElement.textContent = '⌛ Đang kiểm tra...';

    // Tải lại iframe
    const iframeContainer = itemElement.querySelector('.fanpage-iframe-container');
    iframeContainer.innerHTML = '';
    iframeContainer.dataset.loaded = 'false';
    loadFanpageIframe(fanpage, iframeContainer);
}

function loadFanpageIframe(fanpage, container) {
    if (fanpage.status !== 'pending' && fanpage.lastChecked) return;

    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    // Sử dụng Facebook SDK nếu có
    if (window.FB) {
        container.innerHTML = `
            <div class="fb-post" 
                 data-href="${fanpage.url}" 
                 data-width="300"
                 data-show-text="true"
                 data-lazy="true"></div>
        `;
        window.FB.XFBML.parse(container);
    } else {
        // Fallback sử dụng iframe thông thường
        container.innerHTML = `
            <iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(fanpage.url)}&width=300&show_text=true" 
                    width="300" height="200" 
                    style="border:none;overflow:hidden" 
                    scrolling="no" 
                    frameborder="0" 
                    allowfullscreen="true"></iframe>
        `;
    }

    // Cập nhật trạng thái sau khi tải
    setTimeout(() => {
        fanpage.status = 'exists'; // Giả định tải thành công
        fanpage.lastChecked = new Date().toISOString();
        saveData({ fanpages: true });
    }, 2000);
}

function renderFanpageTab() {
    const container = elements.linkLists['fanpage'];
    if (!container) return;

    container.innerHTML = `
        <div class="fanpage-controls" id="fanpage-filter-controls">
            <button class="fanpage-filter-btn active" data-filter="all">ALL</button>
            <button class="fanpage-filter-btn" data-filter="fanpage">Fanpage</button>
            <button class="fanpage-filter-btn" data-filter="profile">Cá nhân</button>
            <button class="fanpage-filter-btn" data-filter="profile-pro">Pro</button>
        </div>
        <div class="fanpage-list"></div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        /* Thêm phần CSS cho số thứ tự giống tab All Link */
        #fanpage-tab .link-index {
            width: 30px;
            height: 30px;
            border: none;
            background: #f0f2f5;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            color: #65676b;
            line-height: 1;
            padding: 0;
        }
        #fanpage-tab .link-index span {
            display: inline-block;
            margin: 0 1px;
            font-size: 14px;
            line-height: 1;
        }
        #fanpage-tab .link-index:hover {
            background: #e0e0e0;
        }
        
        /* Phần CSS còn lại giữ nguyên */
        #fanpage-tab .fanpage-controls {
            display: flex;
            gap: 8px;
            padding: 10px;
            background: #f0f2f5;
            border-bottom: 1px solid #ddd;
        }
        /* ... (phần CSS khác giữ nguyên) */
    `;
    container.appendChild(style);

    const listContainer = container.querySelector('.fanpage-list');
    let currentFilter = 'all';

    // Render danh sách ban đầu
    renderFanpageList(listContainer, getFilteredFanpages(currentFilter));

    // Sự kiện cho các nút lọc
    container.querySelectorAll('.fanpage-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.fanpage-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;

            // Sử dụng logic lọc riêng cho Cá nhân
            if (currentFilter === 'profile') {
                const filteredPersonal = filterPersonalFanpages(state.fanpages);
                renderFanpageList(listContainer, filteredPersonal);
            } else {
                renderFanpageList(listContainer, getFilteredFanpages(currentFilter));
            }
        });
    });
}

function getFilteredFanpages(filter) {
    let fanpages = [...state.fanpages];

    // Debug: Log dữ liệu fanpages trước khi lọc
    console.log('Fanpages trước khi lọc:', fanpages.map(f => ({ id: f.id, type: f.type, name: f.name })));

    // Áp dụng bộ lọc (loại bỏ logic cho 'profile')
    let filteredFanpages = fanpages;
    if (filter === 'fanpage') {
        filteredFanpages = fanpages.filter(f => f.type === 'fanpage');
    } else if (filter === 'profile-pro') {
        filteredFanpages = fanpages.filter(f => f.type === 'profile-pro');
    }

    // Debug: Log dữ liệu sau khi lọc
    console.log(`Fanpages sau khi lọc (${filter}):`, filteredFanpages.map(f => ({ id: f.id, type: f.type, name: f.name })));

    // Sắp xếp theo loại và tiêu đề
    return filteredFanpages.sort((a, b) => {
        const typeOrder = {
            'profile-pro': 1,
            'profile': 2,
            'fanpage': 3
        };
        const typeA = typeOrder[a.type] || 3;
        const typeB = typeOrder[b.type] || 3;
        if (typeA !== typeB) return typeA - typeB;

        const titleA = a.name.toLowerCase();
        const titleB = b.name.toLowerCase();
        const numA = parseInt(titleA.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(titleB.match(/\d+/)?.[0] || '0', 10);
        if (numA && numB) return numA - numB;
        return titleA.localeCompare(titleB);
    });
}

function renderFanpageList(container, fanpages) {
    container.innerHTML = ''; // Xóa nội dung cũ

    fanpages.forEach((fanpage, index) => {
        const item = document.createElement('div');
        item.className = 'link-item'; // Chỉ dùng class link-item
        item.dataset.id = fanpage.id;

        // Tạo STT giống tab All Link
        const indexStr = (index + 1).toString();
        const indexDigits = indexStr.split('').map(digit => `<span>${digit}</span>`).join('');

        item.innerHTML = `
            <input type="checkbox" class="link-checkbox" ${fanpage.checked ? 'checked' : ''}>
            <div class="link-row">
                <button class="link-index" title="Xóa fanpage này">
                    ${indexDigits}
                </button>
                <div class="link-thumbnail">
                    <div class="fanpage-iframe-mini" data-url="${fanpage.url}"></div>
                </div>
                <div class="link-content">
                    <div class="link-title">${fanpage.name}</div>
                    <div class="link-description">${fanpage.description || ''}</div>
                    <div class="link-meta">
                        <span class="link-time">${formatDateTime(fanpage.date)}</span>
                        <span class="link-status ${fanpage.type}">${getTypeLabel(fanpage.type)}</span>
                    </div>
                </div>
                <div class="link-actions">
                    <button class="action-btn edit" title="Sửa"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        `;

        // Thêm CSS cho số thứ tự
        const style = document.createElement('style');
        style.textContent = `
            #fanpage-tab .link-index {
                width: 30px;
                height: 30px;
                border: none;
                background: #f0f2f5;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 14px;
                color: #65676b;
                line-height: 1;
                padding: 0;
            }
            #fanpage-tab .link-index span {
                display: inline-block;
                margin: 0 1px;
                font-size: 14px;
                line-height: 1;
            }
            #fanpage-tab .link-index:hover {
                background: #e0e0e0;
            }
        `;
        container.appendChild(style);

        container.appendChild(item);
        loadMiniIframe(item.querySelector('.fanpage-iframe-mini'), fanpage.url);

        // Sự kiện checkbox
        item.querySelector('.link-checkbox').addEventListener('change', () => {
            fanpage.checked = !fanpage.checked;
            saveData({ fanpages: true });
            item.querySelector('.link-checkbox').checked = fanpage.checked;
        });

        // Sự kiện nút chỉnh sửa
        item.querySelector('.edit').addEventListener('click', () => {
            showEditFanpagePopup(fanpage);
        });

        // Sự kiện nút STT (Xóa fanpage)
        item.querySelector('.link-index').addEventListener('click', () => {
            if (confirm(`Xóa fanpage: ${fanpage.url}?`)) {
                saveBackup('deleteFanpage', { fanpage: { ...fanpage } });
                state.fanpages = state.fanpages.filter(f => f.id !== fanpage.id);
                saveData({ fanpages: true });
                renderFanpageTab();
                updateCounters();
                showToast(`Đã xóa fanpage ${fanpage.name}`, 'success');
                addLog(`Đã xóa fanpage ${fanpage.name} (ID: ${fanpage.id})`, 'info');
            }
        });
    });
}

function showEditFanpagePopup(fanpage) {
    const popup = document.createElement('div');
    popup.className = 'modal-overlay';
    popup.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Chỉnh sửa Fanpage</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>URL</label>
                    <input type="text" id="edit-fanpage-url" value="${fanpage.url}" class="form-control">
                </div>
                <div class="form-group">
                    <label>Tiêu đề</label>
                    <input type="text" id="edit-fanpage-title" value="${fanpage.name}" class="form-control">
                </div>
                <div class="form-group">
                    <label>Mô tả</label>
                    <textarea id="edit-fanpage-description" class="form-control">${fanpage.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Loại</label>
                    <div class="btn-group">
                        <button class="type-btn ${fanpage.type === 'fanpage' ? 'active' : ''}" data-type="fanpage">Fanpage</button>
                        <button class="type-btn ${fanpage.type === 'profile' ? 'active' : ''}" data-type="profile">Cá nhân</button>
                        <button class="type-btn ${fanpage.type === 'profile-pro' ? 'active' : ''}" data-type="profile-pro">Pro</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button id="delete-fanpage" class="btn btn-danger">Xóa</button>
                <div class="action-buttons">
                    <button id="cancel-edit" class="btn btn-secondary">Hủy</button>
                    <button id="save-fanpage" class="btn btn-primary">Lưu</button>
                </div>
            </div>
        </div>
    `;

    // CSS for popup
    const style = document.createElement('style');
    style.textContent = `
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .modal-dialog {
            background: white;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        .modal-header {
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-header h3 {
            margin: 0;
            font-size: 18px;
        }
        .modal-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
        }
        .modal-body {
            padding: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-control {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .form-control[type="text"], .form-control[type="url"] {
            height: 36px;
        }
        .form-control[type="textarea"] {
            height: 80px;
            resize: vertical;
        }
        .btn-group {
            display: flex;
            gap: 5px;
            margin-top: 5px;
        }
        .type-btn {
            flex: 1;
            padding: 8px;
            border: 1px solid #ddd;
            background: #f5f5f5;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
        }
        .type-btn.active, .type-btn:hover {
            background: #1877f2;
            color: white;
            border-color: #1877f2;
        }
        .modal-footer {
            padding: 15px 20px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .action-buttons {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-primary {
            background: #1877f2;
            color: white;
        }
        .btn-primary:hover {
            background: #0056b3;
        }
        .btn-secondary {
            background: #f0f2f5;
            color: #333;
        }
        .btn-secondary:hover {
            background: #e0e0e0;
        }
        .btn-danger {
            background: #ff4d4f;
            color: white;
        }
        .btn-danger:hover {
            background: #d9363e;
        }
    `;
    popup.appendChild(style);

    document.body.appendChild(popup);

    // Handle type button selection
    popup.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            popup.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Handle save
    popup.querySelector('#save-fanpage').addEventListener('click', () => {
        const url = popup.querySelector('#edit-fanpage-url').value.trim();
        const name = popup.querySelector('#edit-fanpage-title').value.trim();
        const description = popup.querySelector('#edit-fanpage-description').value.trim();
        const type = popup.querySelector('.type-btn.active').dataset.type;

        if (!isValidUrl(url)) {
            showToast('URL không hợp lệ', 'warning');
            return;
        }
        if (!name) {
            showToast('Tiêu đề không được để trống', 'warning');
            return;
        }

        // Backup current state
        saveBackup('editFanpage', { fanpage: { ...fanpage } });

        // Update fanpage
        fanpage.url = url;
        fanpage.name = name;
        fanpage.description = description;
        fanpage.type = type;
        fanpage.status = 'pending'; // Reset status to re-verify
        fanpage.lastChecked = null;

        saveData({ fanpages: true });
        renderFanpageTab();
        showToast(`Đã cập nhật fanpage ${name}`, 'success');
        addLog(`Cập nhật fanpage ${name} (ID: ${fanpage.id})`, 'info');
        document.body.removeChild(popup);
    });

    // Handle delete
    popup.querySelector('#delete-fanpage').addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn xóa fanpage này?')) {
            deleteFanpage(fanpage.id);
            document.body.removeChild(popup);
        }
    });

    // Handle cancel/close
    popup.querySelector('#cancel-edit').addEventListener('click', () => {
        document.body.removeChild(popup);
    });
    popup.querySelector('.modal-close').addEventListener('click', () => {
        document.body.removeChild(popup);
    });
}

function loadMiniIframe(container, url) {
    container.innerHTML = `
        <iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=60&height=60&show_text=false" 
                width="60" 
                height="60" 
                style="border:none;overflow:hidden" 
                scrolling="no" 
                frameborder="0" 
                allowfullscreen="true"
                loading="lazy"></iframe>
    `;
}


function groupFanpagesByType(fanpages) {
    const groups = {
        'profile-pro': { title: '⭐ Profile Pro', items: [] },
        'profile': { title: '👤 Trang cá nhân', items: [] },
        'fanpage': { title: '📌 Fanpage', items: [] }
    };

    fanpages.forEach(f => {
        if (groups[f.type]) {
            groups[f.type].items.push(f);
        } else {
            groups.profile.items.push(f);
        }
    });

    return Object.values(groups).filter(g => g.items.length > 0);
}

function findDuplicateFanpages() {
    const urlMap = {};
    const duplicates = [];

    state.fanpages.forEach(f => {
        const baseUrl = f.url.split('?')[0];
        if (!urlMap[baseUrl]) urlMap[baseUrl] = [];
        urlMap[baseUrl].push(f);
    });

    for (const url in urlMap) {
        if (urlMap[url].length > 1) {
            duplicates.push(...urlMap[url]);
        }
    }

    return duplicates;
}

function loadFanpageIframe(container, fanpage) {
    if (fanpage.status === 'exists' && fanpage.lastChecked) {
        // Đã kiểm tra rồi thì không cần tải lại
        return;
    }

    container.innerHTML = `
        <iframe src="https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(fanpage.url)}&tabs&width=280&height=130&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false" 
                width="280" height="130" style="border:none;overflow:hidden" 
                scrolling="no" frameborder="0" allowfullscreen="true" 
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
        </iframe>
    `;

    // Kiểm tra sau khi tải
    setTimeout(() => verifyFanpage(fanpage, container), 2000);
}



function getTypeColor(type) {
    return {
        'profile-pro': '#ff9500',
        'profile': '#42b72a',
        'fanpage': '#1877f2'
    }[type] || '#65676b';
}

function getTypeLabel(type) {
    return {
        'profile-pro': '⭐ Profile Pro',
        'profile': '👤 Trang cá nhân',
        'fanpage': '📌 Fanpage'
    }[type] || 'Không xác định';
}



function groupBySimilarTitles(fanpages) {
    // Triển khai thuật toán nhóm tiêu đề tương tự
    const groups = [];
    const processed = new Set();

    fanpages.forEach(fanpage => {
        if (processed.has(fanpage.id)) return;

        const similar = fanpages.filter(f =>
            !processed.has(f.id) &&
            f.name.toLowerCase().includes(fanpage.name.toLowerCase().substring(0, 5))
        );

        if (similar.length > 0) {
            groups.push({
                title: `Nhóm "${fanpage.name.substring(0, 10)}..." (${similar.length})`,
                items: similar
            });
            similar.forEach(f => processed.add(f.id));
        }
    });

    return groups;
}

function findDuplicateTitles() {
    const titleMap = {};
    const duplicates = [];

    state.fanpages.forEach(fanpage => {
        if (!titleMap[fanpage.name]) {
            titleMap[fanpage.name] = [];
        }
        titleMap[fanpage.name].push(fanpage);
    });

    for (const name in titleMap) {
        if (titleMap[name].length > 1) {
            duplicates.push(...titleMap[name]);
        }
    }

    return duplicates;
}


function setupFanpageEvents() {
    // Sự kiện chỉnh sửa
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.addEventListener('blur', function () {
            const item = this.closest('.link-item');
            const fanpage = state.fanpages.find(f => f.id === item.dataset.id);
            const field = this.classList.contains('link-title') ? 'name' : 'description';

            if (fanpage) {
                fanpage[field] = this.textContent.trim();
                saveData({ fanpages: true });
            }
        });
    });

    // Sự kiện xóa
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', function () {
            const item = this.closest('.link-item');
            const fanpageId = item.dataset.id;

            if (confirm('Xóa fanpage này?')) {
                state.fanpages = state.fanpages.filter(f => f.id !== fanpageId);
                saveData({ fanpages: true });
                renderFanpageTab();
            }
        });
    });

    // Sự kiện sửa
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', function () {
            const item = this.closest('.link-item');
            const title = item.querySelector('.link-title');
            title.focus();

            // Di chuyển con trỏ đến cuối văn bản
            const range = document.createRange();
            range.selectNodeContents(title);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
    });
}



function getStatusText(status) {
    const statusMap = {
        'exists': 'Tồn tại',
        'not-exists': 'Không tồn tại',
        'restricted': 'Bị chặn',
        'pending': 'Đang kiểm tra',
        'error': 'Lỗi'
    };
    return statusMap[status] || 'Không xác định';
}

init();