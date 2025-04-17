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

// WebDAV Functions
async function saveToFile(filename, content, retries = 3) {
    try {
        const data = typeof content === 'string' ? content : JSON.stringify(content);
        JSON.parse(data); // Validate JSON
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(`${config.backupUrl}${filename}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'text/plain' },
                    body: data,
                    signal: controller.signal
                });
                clearTimeout(id);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return true;
            } catch (err) {
                if (attempt === retries) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    } catch (err) {
        addLog(`Lỗi khi lưu ${filename}: ${err.message}`, 'error');
        return false;
    }
}

async function loadFromFile(filename) {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${config.backupUrl}${filename}`, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        addLog(`Lỗi khi đọc ${filename}: ${err.message}`, 'error');
        return null;
    }
}

// LocalStorage Backup
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
    } catch (e) {
        addLog(`Lỗi lưu localStorage: ${e.message}`, 'error');
    }
}

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('data-fb');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        addLog(`Lỗi tải localStorage: ${e.message}`, 'error');
        return null;
    }
}

// Data Management
const debouncedSaveData = debounce(async () => {
    const data = {
        links: state.links,
        logs: state.logs,
        scrollPosition: state.scrollPosition,
        dateFilter: state.dateFilter
    };
    const success = await saveToFile(config.dataFile, data);
    if (success) {
        saveToLocalStorage(); // Backup to localStorage
    } else {
        addLog('Không thể lưu dữ liệu vào WebDAV', 'error');
        saveToLocalStorage(); // Fallback to localStorage
    }
}, config.debounceDelay);

async function saveData(changes = {}) {
    if (Object.keys(changes).length === 0) return;
    const data = {
        links: state.links,
        fanpages: state.fanpages,
        logs: state.logs,
        scrollPosition: state.scrollPosition,
        dateFilter: state.dateFilter,
        fanpageFilter: state.fanpageFilter
    };
    const success = await saveToFile(config.dataFile, data);
    if (success) {
        saveToLocalStorage();
    } else {
        addLog('Không thể lưu dữ liệu vào WebDAV', 'error');
        saveToLocalStorage();
    }
}

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
        let savedData = null;
        const savedContent = await loadFromFile(config.dataFile);
        if (savedContent) {
            try {
                savedData = JSON.parse(savedContent);
            } catch (e) {
                addLog('Dữ liệu JSON không hợp lệ, thử localStorage', 'error');
            }
        }

        if (!savedData) {
            const localData = loadFromLocalStorage();
            if (localData) {
                savedData = localData;
                addLog('Đã tải dữ liệu từ localStorage', 'info');
            }
        }

        if (savedData) {
            state.links = savedData.links || [];
            state.fanpages = savedData.fanpages || [];
            state.logs = savedData.logs || [];
            state.scrollPosition = savedData.scrollPosition || 0;
            state.dateFilter = savedData.dateFilter || {
                startDate: '',
                endDate: '',
                status: 'all',
                groupTitles: false,
                searchQuery: ''
            };
            state.fanpageFilter = savedData.fanpageFilter || { currentPage: 1 };
            state.links = state.links.map(link => ({
                ...link,
                post_type: link.post_type || 'unknown',
                blacklistStatus: link.blacklistStatus || 'active',
                checked: link.checked || false,
                note: link.note || ''
            }));
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
        updateCounters();
        switchTab('all-link');
    } finally {
        hideLoading();
    }
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
// Thêm vào hàm init()
function init() {
    window.addEventListener('DOMContentLoaded', async () => {
        // Thêm SDK Facebook
        const fbScript = document.createElement('script');
        fbScript.src = "https://connect.facebook.net/vi_VN/sdk.js#xfbml=1&version=v12.0";
        fbScript.async = true;
        fbScript.defer = true;
        fbScript.crossOrigin = "anonymous";
        document.body.appendChild(fbScript);

        await loadData();
        setupEventListeners();
        renderTabContent('all-link');
    });
}




// Hàm kiểm tra tồn tại bài viết (ví dụ)
function verifyFanpageExistence(url) {
    return new Promise((resolve) => {
        // Thực tế sẽ gọi API hoặc kiểm tra iframe
        // Đây là ví dụ giả lập
        setTimeout(() => {
            const random = Math.random();
            resolve(random > 0.3); // 70% tồn tại
        }, 1500);
    });
}

function updateFanpageStatus(fanpage, status, itemElement) {
    fanpage.status = status;
    fanpage.lastChecked = new Date().toISOString();
    saveData({ fanpages: true });

    const overlay = itemElement.querySelector('.fanpage-status-overlay');
    overlay.className = `fanpage-status-overlay ${status}`;
    overlay.textContent = getStatusText(status);

    // Thay đổi ảnh đại diện nếu bài viết không tồn tại
    if (status === 'not-exists') {
        itemElement.querySelector('.fanpage-preview-image img').src = config.defaultImage;
    }
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

// Hàm xác minh trạng thái thực tế
function verifyFanpageStatus(fanpage, iframeContainer) {
    const iframe = iframeContainer.querySelector('iframe');
    let newStatus = 'not-exists';
    let errorType = '';

    if (iframe) {
        try {
            // Phát hiện nội dung bị chặn/xóa
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc.body.innerText.includes('content not found')) {
                errorType = 'not_found';
            } else if (iframeDoc.body.innerText.includes('restricted') ||
                iframeDoc.body.innerText.includes('log in')) {
                errorType = 'restricted';
                newStatus = 'restricted';
            } else {
                newStatus = 'exists';
            }
        } catch (e) {
            errorType = 'blocked';
        }
    }

    // Cập nhật trạng thái
    updateFanpageStatus(fanpage, newStatus, errorType);
    iframeContainer.style.display = 'none';
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

function showFanpageNoteDialog(fanpage) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>Ghi chú cho ${fanpage.name}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <textarea id="fanpage-note-input" placeholder="Nhập ghi chú..." 
                            style="width: 100%; height: 120px; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">${fanpage.note || ''}</textarea>
                </div>
                <div class="modal-footer">
                    <button id="save-note-btn" class="btn btn-primary">Lưu</button>
                    <button id="cancel-note-btn" class="btn btn-secondary">Hủy</button>
                </div>
            </div>
        `;
    document.body.appendChild(dialog);

    dialog.querySelector('#save-note-btn').addEventListener('click', () => {
        const note = dialog.querySelector('#fanpage-note-input').value.trim();
        saveBackup('fanpageNote', { fanpageId: fanpage.id, previousNote: fanpage.note });
        fanpage.note = note;
        saveData({ fanpages: true });
        renderFanpageTab();
        document.body.removeChild(dialog);
    });

    dialog.querySelector('#cancel-note-btn').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });

    dialog.querySelector('.modal-close').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
}
function isFanpageExists(url) {
    const baseUrl = url.split('?')[0];
    return state.fanpages.some(fanpage => fanpage.url.split('?')[0] === baseUrl);
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



function checkFanpageStatus(fanpage, container) {
    const iframe = container.querySelector('iframe');
    let newStatus = 'error';

    if (iframe) {
        try {
            // Kiểm tra nội dung iframe để xác định trạng thái
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc.body.innerText.includes('content not found') ||
                iframeDoc.body.innerText.includes('không có sẵn')) {
                newStatus = 'not-exists';
            } else if (iframeDoc.body.innerText.includes('log in') ||
                iframeDoc.body.innerText.includes('đăng nhập')) {
                newStatus = 'restricted';
            } else {
                newStatus = 'exists';
            }
        } catch (e) {
            // Cross-origin error, nhưng iframe tồn tại nghĩa là fanpage tồn tại
            newStatus = 'exists';
        }
    }

    // Cập nhật trạng thái
    fanpage.status = newStatus;
    fanpage.lastChecked = new Date().toISOString();
    saveData({ fanpages: true });
    renderFanpageTab();
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



function loadAllFanpageIframes() {
    const iframeContainers = document.querySelectorAll('.fanpage-iframe-mini');
    iframeContainers.forEach(container => {
        const url = container.dataset.url;
        loadMiniIframe(container, url);
    });
}





function getContentOptions(content) {
    if (!content) return 'Chưa chọn';
    return content.split(',').map(item => item.trim()).join(' - ');
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

function showAddFanpageDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-dialog" style="max-width: 500px;">
            <div class="modal-header">
                <h3>Thêm danh sách Fanpage</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <textarea id="fanpage-list" placeholder="Nhập danh sách URL Facebook (mỗi URL một dòng)"
                    style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
                <div id="duplicate-check" style="margin-top: 10px; padding: 10px; border-radius: 4px; display: none;"></div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: space-between;">
                <button id="check-duplicates" class="btn btn-secondary">
                    <i class="fas fa-search"></i> Kiểm tra trùng
                </button>
                <button id="confirm-add-fanpages" class="btn btn-primary">
                    <i class="fas fa-plus"></i> Thêm
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Kiểm tra URL trùng
    dialog.querySelector('#check-duplicates').addEventListener('click', () => {
        const textarea = dialog.querySelector('#fanpage-list');
        const urls = textarea.value.trim().split('\n').filter(url => url.trim());
        const duplicateCheck = dialog.querySelector('#duplicate-check');

        if (urls.length === 0) {
            duplicateCheck.textContent = 'Vui lòng nhập ít nhất một URL';
            duplicateCheck.style.display = 'block';
            duplicateCheck.style.backgroundColor = '#fff3cd';
            return;
        }

        const duplicates = urls.filter(url => {
            const baseUrl = url.split('?')[0];
            return state.fanpages.some(f => f.url.split('?')[0] === baseUrl);
        });

        if (duplicates.length > 0) {
            duplicateCheck.innerHTML = `
                <div style="color: #856404; background-color: #fff3cd; padding: 10px; border-radius: 4px;">
                    <strong>Tìm thấy ${duplicates.length} URL trùng:</strong>
                    <div style="max-height: 100px; overflow-y: auto; margin-top: 5px;">
                        ${duplicates.map(url => `<div>${url}</div>`).join('')}
                    </div>
                </div>
            `;
            duplicateCheck.style.display = 'block';
        } else {
            duplicateCheck.innerHTML = `
                <div style="color: #155724; background-color: #d4edda; padding: 10px; border-radius: 4px;">
                    Không có URL trùng
                </div>
            `;
            duplicateCheck.style.display = 'block';
        }
    });

    // Thêm fanpage mới
    dialog.querySelector('#confirm-add-fanpages').addEventListener('click', () => {
        const textarea = dialog.querySelector('#fanpage-list');
        const urls = textarea.value.trim().split('\n').map(url => url.trim()).filter(url => url);

        if (urls.length === 0) {
            showToast('Vui lòng nhập ít nhất một URL', 'warning');
            return;
        }

        const newFanpages = [];
        const addedUrls = [];

        urls.forEach(url => {
            if (!isValidUrl(url)) {
                showToast(`URL không hợp lệ: ${url}`, 'warning');
                return;
            }

            const baseUrl = url.split('?')[0];
            if (state.fanpages.some(f => f.url.split('?')[0] === baseUrl)) {
                showToast(`URL đã tồn tại: ${url}`, 'warning');
                return;
            }

            if (addedUrls.includes(baseUrl)) {
                showToast(`URL trùng trong danh sách nhập: ${url}`, 'warning');
                return;
            }

            const username = extractUsernameFromUrl(url);
            const newFanpage = {
                id: generateId(),
                url,
                name: username || 'Không có tên',
                description: '',
                type: 'profile',
                status: 'pending',
                date: new Date().toISOString(),
                checked: false
            };

            newFanpages.push(newFanpage);
            addedUrls.push(baseUrl);
        });

        if (newFanpages.length > 0) {
            saveBackup('addFanpages', { fanpages: [...newFanpages] });
            state.fanpages = [...newFanpages, ...state.fanpages];
            saveData({ fanpages: true });
            renderFanpageTab();
            showToast(`Đã thêm ${newFanpages.length} fanpage`, 'success');
            addLog(`Đã thêm ${newFanpages.length} fanpage mới`, 'info');
        }

        document.body.removeChild(dialog);
    });

    // Đóng dialog
    dialog.querySelector('.modal-close').addEventListener('click', () => document.body.removeChild(dialog));
}

function extractUsernameFromUrl(url) {
    try {
        const parsed = new URL(url);
        const pathParts = parsed.pathname.split('/').filter(p => p);
        return pathParts[0] || null;
    } catch {
        return null;
    }
}

// Hàm render tab Fanpage
function renderFanpageTab() {
    const container = document.querySelector('#fanpage-tab');
    if (!container) {
        console.warn('Không tìm thấy #fanpage-tab');
        return;
    }

    console.log('Render fanpages:', state.fanpages);

    container.innerHTML = `
        <div style="display: flex; gap: 4px; margin: 8px 0; flex-wrap: wrap;">
            <button data-filter="all" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #1877f2; color: white; cursor: pointer;">
                All
            </button>
            <button data-filter="title" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; color: #333; cursor: pointer;">
                Tiêu đề
            </button>
            <button data-filter="profile" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; color: #333; cursor: pointer;">
                Cá nhân
            </button>
            <button data-filter="profile-pro" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; color: #333; cursor: pointer;">
                Pro
            </button>
            <button data-filter="fanpage" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; color: #333; cursor: pointer;">
                Fanpage
            </button>
        </div>
        <div id="fanpage-items"></div>
    `;

    const itemsContainer = container.querySelector('#fanpage-items');
    let filteredFanpages = state.fanpages || [];

    // Sắp xếp theo type (profile > fanpage > profile-pro) rồi theo name
    const sortFanpages = (fanpages) => {
        const typeOrder = { 'profile': 1, 'fanpage': 2, 'profile-pro': 3 };
        return [...fanpages].sort((a, b) => {
            const typeDiff = typeOrder[a.type] - typeOrder[b.type];
            if (typeDiff !== 0) return typeDiff;
            return a.name.localeCompare(b.name);
        });
    };

    const renderItems = (fanpages) => {
        itemsContainer.innerHTML = sortFanpages(fanpages).map((fanpage, index) => {
            const indexStr = (index + 1).toString();
            const indexDigits = indexStr.split('').map(digit => `<span>${digit}</span>`).join('');
            const url = fanpage.url.startsWith('http') ? fanpage.url : `https://${fanpage.url}`;
            console.log(`Iframe URL for ${fanpage.id}:`, url);

            const iframe = `<iframe src="https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(url)}&tabs=timeline&width=60&height=60&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false" 
                                   style="border:none;width:100%;height:100%;min-width:60px;min-height:60px;" scrolling="no" frameborder="0" allowfullscreen="true"></iframe>`;

            return `
                <div class="link-item" data-id="${fanpage.id}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #e0e0e0;">
                    <button class="link-index" style="width: 30px; text-align: center; margin-right: 8px; padding: 4px; font-size: 12px; border: none; background: none; cursor: pointer;">${indexDigits}</button>
                    <div class="fanpage-thumbnail" style="width: 60px; height: 60px; margin-right: 8px; flex-shrink: 0; overflow: visible;">
                        ${iframe}
                    </div>
                    <div class="link-content" style="flex: 1; min-width: 0; font-size: 13px;">
                        <div class="link-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333;">${fanpage.name}</div>
                        <div class="link-url" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #666; font-size: 12px;">${fanpage.url}</div>
                        <div class="link-meta" style="color: #666; font-size: 12px;">Nội dung: ${getContentOptions(fanpage.content || '')}</div>
                        <div class="link-meta" style="color: #666; font-size: 12px;">Loại: ${getTypeLabel(fanpage.type)}</div>
                    </div>
                    <div class="link-actions" style="flex-shrink: 0;">
                        <button class="edit-btn" data-id="${fanpage.id}" style="padding: 4px 8px; font-size: 12px; border: none; background: #f5f5f5; cursor: pointer;">
                            <i class="fas fa-pencil-alt" style="color: #333;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (!fanpages.length) {
            itemsContainer.innerHTML = '<div style="padding: 10px; color: #666; font-size: 14px;">Không có fanpage nào</div>';
        }
    };

    renderItems(filteredFanpages);

    container.querySelectorAll('button[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('button[data-filter]').forEach(b => {
                b.style.backgroundColor = '#f5f5f5';
                b.style.color = '#333';
            });
            btn.style.backgroundColor = '#1877f2';
            btn.style.color = 'white';

            const filter = btn.dataset.filter;
            if (filter === 'all') {
                filteredFanpages = state.fanpages || [];
            } else if (filter === 'title') {
                filteredFanpages = [...state.fanpages].sort((a, b) => a.name.localeCompare(b.name));
            } else {
                filteredFanpages = state.fanpages.filter(f => f.type === filter);
            }
            renderItems(filteredFanpages);
        });
    });

    setupFanpageItemEvents();
}

// Hàm setup sự kiện cho item Fanpage
function setupFanpageItemEvents() {
    const container = document.querySelector('#fanpage-items');
    if (!container) {
        console.warn('Không tìm thấy #fanpage-items');
        return;
    }

    container.addEventListener('click', e => {
        const item = e.target.closest('.link-item');
        if (!item) return;
        const id = item.dataset.id;
        const fanpage = state.fanpages.find(f => f.id === id);
        if (!fanpage) {
            console.warn('Không tìm thấy fanpage với id:', id);
            return;
        }

        if (e.target.closest('.edit-btn')) {
            console.log('Click edit-btn:', id);
            showEditPopup(fanpage);
        } else if (e.target.closest('.fanpage-thumbnail')) {
            console.log('Click thumbnail:', id);
            fanpage.checked = !fanpage.checked;
            saveData({ fanpages: true });
            updateSelectedCount();
            renderFanpageTab();
        } else if (e.target.closest('.link-index')) {
            console.log('Click link-index:', id);
            if (confirm(`Xóa fanpage: ${fanpage.name}?`)) {
                deleteFanpage(id);
            }
        }
    });
}

// Hàm hiển thị popup chỉnh sửa Fanpage
function showEditPopup(fanpage = null) {
    const isNew = !fanpage;
    fanpage = fanpage || { id: Date.now().toString(), url: '', name: '', type: 'fanpage', content: '' };
    const contentOptions = ['X256', '6s', 'SE14', 'SE15', 'custom'];
    const selectedContents = fanpage.content ? fanpage.content.split(',').map(c => c.trim()) : [];

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    dialog.innerHTML = `
        <div style="max-width: 600px; width: 95%; background: #fff; border-radius: 8px; min-height: 500px; display: flex; flex-direction: column;">
            <div style="padding: 12px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px;">${isNew ? 'Thêm Fanpage' : 'Chỉnh sửa Fanpage'}</h3>
                <button class="modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
            </div>
            <div style="padding: 16px; flex: 1;">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: bold;">URL <span style="color: #ff4d4f;">*</span></label>
                    <input type="url" id="edit-url" value="${fanpage.url}" 
                           style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" required>
                    <div id="url-error" style="color: #ff4d4f; font-size: 12px; margin-top: 4px; display: none;"></div>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: bold;">Tiêu đề <span style="color: #ff4d4f;">*</span></label>
                    <input type="text" id="edit-title" value="${fanpage.name}" 
                           style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" required>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: bold;">Nội dung</label>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${contentOptions.map(option => `
                            <button data-content="${option}" style="padding: 6px 10px; font-size: 13px; border: 1px solid #ddd; border-radius: 4px; background: ${selectedContents.includes(option) ? '#1877f2' : '#f5f5f5'}; color: ${selectedContents.includes(option) ? 'white' : '#333'}; cursor: pointer;">
                                ${option === 'custom' ? 'Khác' : option}
                            </button>
                        `).join('')}
                    </div>
                    <input type="text" id="custom-content" placeholder="Nội dung tùy chỉnh" 
                           value="${selectedContents.includes('custom') ? selectedContents.filter(c => !['X256', '6s', 'SE14', 'SE15'].includes(c)).join(', ') : ''}"
                           style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; margin-top: 6px; box-sizing: border-box; display: ${selectedContents.includes('custom') ? 'block' : 'none'};">
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: bold;">Loại</label>
                    <div style="display: flex; gap: 6px;">
                        <button data-type="profile-pro" style="flex: 1; padding: 8px; font-size: 13px; border: 1px solid #ddd; border-radius: 4px; background: ${fanpage.type === 'profile-pro' ? '#ff9500' : '#f5f5f5'}; color: ${fanpage.type === 'profile-pro' ? 'white' : '#333'}; cursor: pointer;">
                            Pro
                        </button>
                        <button data-type="profile" style="flex: 1; padding: 8px; font-size: 13px; border: 1px solid #ddd; border-radius: 4px; background: ${fanpage.type === 'profile' ? '#42b72a' : '#f5f5f5'}; color: ${fanpage.type === 'profile' ? 'white' : '#333'}; cursor: pointer;">
                            Cá nhân
                        </button>
                        <button data-type="fanpage" style="flex: 1; padding: 8px; font-size: 13px; border: 1px solid #ddd; border-radius: 4px; background: ${fanpage.type === 'fanpage' ? '#1877f2' : '#f5f5f5'}; color: ${fanpage.type === 'fanpage' ? 'white' : '#333'}; cursor: pointer;">
                            Fanpage
                        </button>
                    </div>
                </div>
            </div>
            <div style="padding: 12px; border-top: 1px solid #ddd; display: flex; gap: 8px; justify-content: flex-end;">
                ${!isNew ? `
                <button id="delete-btn" style="padding: 8px 12px; font-size: 13px; background: #ff4d4f; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-trash"></i> Xóa
                </button>` : ''}
                <button id="cancel-btn" style="padding: 8px 12px; font-size: 13px; background: #f0f2f5; color: #333; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-times"></i> Hủy
                </button>
                <button id="save-btn" style="padding: 8px 12px; font-size: 13px; background: #1877f2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-save"></i> Lưu
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const urlInput = dialog.querySelector('#edit-url');
    const titleInput = dialog.querySelector('#edit-title');
    const urlError = dialog.querySelector('#url-error');
    const typeButtons = dialog.querySelectorAll('button[data-type]');
    const contentButtons = dialog.querySelectorAll('button[data-content]');
    const customContentInput = dialog.querySelector('#custom-content');
    const saveBtn = dialog.querySelector('#save-btn');
    const cancelBtn = dialog.querySelector('#cancel-btn');
    const deleteBtn = dialog.querySelector('#delete-btn');

    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => {
                b.style.backgroundColor = '#f5f5f5';
                b.style.color = '#333';
            });
            const type = btn.dataset.type;
            btn.style.backgroundColor = { 'profile-pro': '#ff9500', 'profile': '#42b72a', 'fanpage': '#1877f2' }[type];
            btn.style.color = 'white';
        });
    });

    contentButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const isActive = btn.style.backgroundColor === 'rgb(24, 119, 242)';
            if (btn.dataset.content === 'custom') {
                customContentInput.style.display = isActive ? 'none' : 'block';
            }
            btn.style.backgroundColor = isActive ? '#f5f5f5' : '#1877f2';
            btn.style.color = isActive ? '#333' : 'white';
        });
    });

    saveBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        const title = titleInput.value.trim();
        const type = Array.from(typeButtons).find(b => b.style.backgroundColor !== 'rgb(245, 245, 245)')?.dataset.type;
        const selectedContents = Array.from(contentButtons)
            .filter(b => b.style.backgroundColor === 'rgb(24, 119, 242)')
            .map(b => b.dataset.content === 'custom' ? customContentInput.value.trim() : b.dataset.content)
            .filter(c => c);

        if (!url) {
            urlError.textContent = 'URL là bắt buộc';
            urlError.style.display = 'block';
            urlInput.focus();
            return;
        }
        if (!url.match(/^https?:\/\//)) {
            urlError.textContent = 'URL phải bắt đầu bằng http:// hoặc https://';
            urlError.style.display = 'block';
            urlInput.focus();
            return;
        }
        if (isFanpageExists(url) && url !== fanpage.url) {
            urlError.textContent = 'URL đã tồn tại';
            urlError.style.display = 'block';
            urlInput.focus();
            return;
        }
        if (!title) {
            showToast('Tiêu đề là bắt buộc', 'warning');
            titleInput.focus();
            return;
        }
        if (!type) {
            showToast('Vui lòng chọn loại', 'warning');
            return;
        }

        fanpage.url = url;
        fanpage.name = title;
        fanpage.type = type;
        fanpage.content = selectedContents.join(', ');

        if (isNew) {
            state.fanpages.push(fanpage);
            console.log('Đã thêm fanpage mới:', fanpage);
        } else {
            console.log('Đã cập nhật fanpage:', fanpage);
        }

        saveData({ fanpages: true });
        renderFanpageTab();
        showToast('Đã lưu fanpage', 'success');
        document.body.removeChild(dialog);
    });

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn xóa fanpage này?')) {
                deleteFanpage(fanpage.id);
                document.body.removeChild(dialog);
            }
        });
    }

    cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
    dialog.querySelector('.modal-close').addEventListener('click', () => document.body.removeChild(dialog));
    dialog.addEventListener('click', e => {
        if (e.target === dialog) document.body.removeChild(dialog);
    });

    document.addEventListener('keydown', function handleKeydown(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(dialog);
            document.removeEventListener('keydown', handleKeydown);
        }
    });

    urlInput.focus();
}

// 3. Sửa lại hàm renderFanpageList để cải thiện giao diện và thêm tính năng chọn nhiều
function renderFanpageList(container, fanpages) {
    container.innerHTML = '';

    if (fanpages.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #6c757d;">Không có fanpage nào</div>';
        return;
    }

    // Nhóm theo loại nếu có nhiều loại khác nhau
    const hasMultipleTypes = new Set(fanpages.map(f => f.type)).size > 1;
    let groupedFanpages = fanpages;

    if (hasMultipleTypes) {
        groupedFanpages = groupByType(fanpages);
    }

    groupedFanpages.forEach(group => {
        if (group.title) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.style.cssText = 'grid-column: 1 / -1; font-weight: bold; padding: 8px; background: #f8f9fa; border-radius: 4px;';
            groupHeader.textContent = group.title;
            container.appendChild(groupHeader);
        }

        (group.items || [group]).forEach(fanpage => {
            const item = document.createElement('div');
            item.className = 'fanpage-item';
            item.style.cssText = `
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                border-left: 4px solid ${getTypeColor(fanpage.type)};
                display: flex;
                flex-direction: column;
            `;
            item.dataset.id = fanpage.id;

            item.innerHTML = `
                <div style="display: flex; padding: 12px; gap: 10px; align-items: center;">
                    <input type="checkbox" class="fanpage-checkbox" ${fanpage.checked ? 'checked' : ''}
                        style="flex-shrink: 0;">
                    
                    <div style="width: 60px; height: 60px; flex-shrink: 0; 
                        background: #f0f2f5; border-radius: 4px; overflow: hidden;
                        display: flex; align-items: center; justify-content: center;
                        cursor: pointer;" class="fanpage-thumbnail">
                        <div class="fanpage-iframe-mini" data-url="${fanpage.url}" 
                            style="width:100%; height:100%;"></div>
                    </div>
                    
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${fanpage.name}
                        </div>
                        <div style="font-size: 13px; color: #606770; margin-bottom: 4px;
                            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                            overflow: hidden;">
                            ${fanpage.description || ''}
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px;">
                            <span style="color: ${getTypeColor(fanpage.type)}; font-weight: 500;">
                                ${getTypeLabel(fanpage.type)}
                            </span>
                            <span style="color: #65676b;">
                                ${formatDateTime(fanpage.date)}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="fanpage-actions" style="display: flex; border-top: 1px solid #f0f2f5;">
                    <button class="action-btn edit-btn" style="flex: 1; padding: 8px; border: none; background: none;
                        border-right: 1px solid #f0f2f5; cursor: pointer;" title="Sửa">
                        <i class="fas fa-pencil-alt" style="color: #17a2b8;"></i>
                    </button>
                    <button class="action-btn note-btn" style="flex: 1; padding: 8px; border: none; background: none;
                        border-right: 1px solid #f0f2f5; cursor: pointer;" title="Ghi chú">
                        <i class="fas fa-comment-alt" style="color: #6c757d;"></i>
                    </button>
                    <button class="action-btn delete-btn" style="flex: 1; padding: 8px; border: none; background: none;
                        cursor: pointer;" title="Xóa">
                        <i class="fas fa-trash-alt" style="color: #dc3545;"></i>
                    </button>
                </div>
            `;

            container.appendChild(item);
            loadMiniIframe(item.querySelector('.fanpage-iframe-mini'), fanpage.url);
        });
    });

    setupFanpageItemEvents();
}

function groupByType(fanpages) {
    const groups = {
        'profile-pro': { title: '⭐ Profile Pro', items: [] },
        'profile': { title: '👤 Trang cá nhân', items: [] },
        'fanpage': { title: '📌 Fanpage', items: [] }
    };

    fanpages.forEach(fanpage => {
        if (groups[fanpage.type]) {
            groups[fanpage.type].items.push(fanpage);
        } else {
            groups.profile.items.push(fanpage);
        }
    });

    return Object.values(groups).filter(group => group.items.length > 0);
}




// 4. Cải thiện hàm tìm link trùng
function findDuplicateTitles() {
    const titleMap = {};
    const duplicates = [];

    state.fanpages.forEach(fanpage => {
        const normalizedTitle = fanpage.name.toLowerCase().trim();
        if (!titleMap[normalizedTitle]) {
            titleMap[normalizedTitle] = [];
        }
        titleMap[normalizedTitle].push(fanpage);
    });

    for (const title in titleMap) {
        if (titleMap[title].length > 1) {
            duplicates.push(...titleMap[title]);
        }
    }

    // Nhóm các fanpage trùng theo tên
    const groupedDuplicates = [];
    for (const title in titleMap) {
        if (titleMap[title].length > 1) {
            groupedDuplicates.push({
                title: `Nhóm "${title.substring(0, 20)}${title.length > 20 ? '...' : ''}" (${titleMap[title].length})`,
                items: titleMap[title],
                type: 'duplicate-group'
            });
        }
    }

    return groupedDuplicates;
}

// Các hàm helper giữ nguyên
function getTypeColor(type) {
    return {
        'profile-pro': '#fd7e14',
        'profile': '#28a745',
        'fanpage': '#17a2b8'
    }[type] || '#6c757d';
}

function getTypeLabel(type) {
    return {
        'profile-pro': '⭐ Pro',
        'profile': '👤 Cá nhân',
        'fanpage': '📌 Fanpage'
    }[type] || 'Khác';
}

function updateSelectedCount() {
    const selectedCount = state.fanpages.filter(f => f.checked).length;
    if (selectedCount > 0) {
        showToast(`Đã chọn ${selectedCount} fanpage`, 'info');
    }
}


function setupFanpageEvents() {
    // Sự kiện nút chỉnh sửa
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', function () {
            const item = this.closest('.link-item');
            const fanpage = state.fanpages.find(f => f.id === item.dataset.id);
            if (fanpage) showEditPopup(fanpage);
        });
    });
}

function loadMiniIframe(container, url) {
    // Xóa các tham số không cần thiết từ URL
    const cleanUrl = url.split('?')[0];

    container.innerHTML = `
        <div class="fb-page" 
             data-href="${cleanUrl}" 
             data-width="60" 
             data-height="60"
             data-small-header="true" 
             data-adapt-container-width="true"
             data-hide-cover="true" 
             data-show-facepile="false"
             data-lazy="true">
        </div>
    `;

    // Parse lại XFBML sau khi thêm
    if (window.FB) {
        window.FB.XFBML.parse(container);
    }
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