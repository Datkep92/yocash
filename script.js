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
    githubToken: localStorage.getItem('githubToken') || 'chưa có', // Token GitHub
    debounceDelay: 500, // Độ trễ debounce (ms)
    fanpageGistUrl: 'https://api.github.com/gists/eaa7aafb85a6fe7546f6c6434b93810c', // Gist cho Jsonfanpage, Jsonalllink, Jsonlink
    backupUrl: 'http://127.0.0.1:10000', // URL WebDAV backup
    dataFile: '/var/mobile/new/data-fb.json', // File lưu trữ dữ liệu
    fanpagesPerPage: 20, // Số fanpage hiển thị mỗi trang
    maxRetries: 3, // Số lần thử lại
    retryDelay: 1000 // Delay giữa các lần thử lại (ms)
};

// Trạng thái ứng dụng
const state = {
    links: [], // Danh sách link
    disableRender: false, // Cho phép tắt render toàn bộ khi không cần
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
    try {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        // Xóa dữ liệu cũ trước khi lưu mới
        store.clear();

        // Lưu dữ liệu mới vào store
        store.put({ id: 1, data: data });

        // Đợi hoàn tất giao dịch
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = reject;
        });

        saveToLocalStorage();
    } catch (error) {
        addLog('Không thể lưu dữ liệu vào IndexedDB', 'error');
        saveToLocalStorage();
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
function clearIframeCache(url) {
    localStorage.removeItem(`iframe_${url}`);
}
function cacheIframeContent(url, content) {
    const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('iframe_'));
    if (cacheKeys.length >= 100) {
        localStorage.removeItem(cacheKeys[0]);
    }
    localStorage.setItem(`iframe_${url}`, content);
}

function getCachedIframeContent(url) {
    return localStorage.getItem(`iframe_${url}`);
}


function switchTab(tab) {
    Object.values(elements.linkLists).forEach(el => {
        if (el) el.style.display = 'none';
    });

    if (elements.linkLists[tab]) {
        elements.linkLists[tab].style.display = 'block';
        state.lastActiveTab = state.currentTab;
        state.currentTab = tab;
        const links = getLinksForCurrentTab();
        links.forEach(link => {
            if (link.status === 'iframe') {
                const cachedIframe = getCachedIframeContent(link.url);
                if (cachedIframe) {
                    const item = document.querySelector(`.link-item[data-id="${link.id}"] .link-thumbnail`);
                    if (item) item.innerHTML = cachedIframe;
                }
            }
        });
        renderTabContent(tab);
    }
}

function getLinksForCurrentTab() {
    switch (state.currentTab) {
        case 'all-link':
            return state.links; // Không lọc blacklist, hiển thị tất cả link
        case 'checked-link':
            return state.links.filter(link => link.checked && !link.blacklistStatus);
        case 'unchecked-link':
            return state.links.filter(link => !link.checked && !link.blacklistStatus);
        case 'blacklist':
            return state.links.filter(link => link.blacklistStatus);
        default:
            return state.links;
    }
}

function undoAction() {
    if (state.undoStack.length === 0) {
        showToast('Không có hành động để hoàn tác', 'warning');
        return;
    }
    const backup = state.undoStack.pop();
    let needsSaveData = false;
    let scrollToLinkId = null;
    let switchToAllLink = false;

    switch (backup.type) {
        case 'addLinks':
            state.links = state.links.filter(link => !backup.addedLinks.some(l => l.id === link.id));
            needsSaveData = true;
            switchToAllLink = true;
            showToast(`Hoàn tác: Thêm ${backup.addedLinks.length} link`, 'success');
            break;
        case 'deleteLinks':
            state.links.unshift(...backup.deletedLinks);
            needsSaveData = true;
            scrollToLinkId = backup.deletedLinks[0]?.id;
            switchToAllLink = true;
            showToast(`Hoàn tác: Xóa ${backup.deletedLinks.length} link`, 'success');
            break;
        case 'checkbox':
            const linkCheckbox = state.links.find(l => l.id === backup.linkId);
            if (linkCheckbox) {
                linkCheckbox.checked = backup.checked;
                scrollToLinkId = linkCheckbox.id;
                showToast(`Hoàn tác: Checkbox của link ${linkCheckbox.url.slice(0, 50)}...`, 'success');
                updateLinkItem(linkCheckbox);
            }
            break;
        case 'note':
            const noteLink = state.links.find(l => l.id === backup.linkId);
            if (noteLink) {
                noteLink.note = backup.note;
                scrollToLinkId = noteLink.id;
                switchToAllLink = true;
                showToast(`Hoàn tác: Ghi chú của link ${noteLink.url.slice(0, 50)}...`, 'success');
                updateLinkItem(noteLink);
            }
            break;
        case 'blacklist':
            const blacklistLink = state.links.find(l => l.id === backup.linkId);
            if (blacklistLink) {
                blacklistLink.blacklistStatus = backup.blacklistStatus; // Khôi phục trạng thái
                scrollToLinkId = blacklistLink.id;
                needsSaveData = true;
                showToast(`Hoàn tác: Trạng thái blacklist của link ${blacklistLink.url.slice(0, 50)}...`, 'success');
                updateLinkItem(blacklistLink);
            }
            break;
        case 'selectAll':
            backup.checkedLinks.forEach(({ id, checked }) => {
                const link = state.links.find(l => l.id === id);
                if (link) {
                    link.checked = checked;
                    updateLinkItem(link);
                }
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
                updateLinkItem(retryLink);
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
        case 'editLink':
            const editedLink = state.links.find(l => l.id === backup.linkId);
            if (editedLink) {
                editedLink.url = backup.url;
                editedLink.image = backup.image;
                editedLink.post_type = determinePostType(backup.url);
                scrollToLinkId = editedLink.id;
                needsSaveData = true;
                showToast(`Hoàn tác: Chỉnh sửa link ${editedLink.url.slice(0, 50)}...`, 'success');
                updateLinkItem(editedLink);
            }
            break;
    }

    if (needsSaveData) saveData({ links: true, fanpages: true });
    updateCounters();
    addLog(`Hoàn tác hành động: ${backup.type}`, 'info');

    // Render tab hiện tại, không cần chuyển tab cho blacklist
    renderTabContent(state.currentTab);

    // Cuộn đến link nếu có
    if (elements.mainContent && scrollToLinkId) {
        setTimeout(() => {
            const linkItem = document.querySelector(`.link-item[data-id="${scrollToLinkId}"]`);
            if (linkItem) smoothScroll(elements.mainContent, linkItem.offsetTop);
            else elements.mainContent.scrollTop = backup.scrollPosition || 0;
        }, 100);
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
            const urlGroups = {};
            state.links.forEach(l => {
                if (!urlGroups[l.url]) urlGroups[l.url] = [];
                urlGroups[l.url].push(l);
            });
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
        case 'iframe':
            filteredLinks = state.links.filter(l => l.status === 'iframe' && l.blacklistStatus !== 'blacklisted');
            break;
        case 'success':
            filteredLinks = state.links.filter(l => l.status === 'success' && l.blacklistStatus !== 'blacklisted');
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



function createLinkItem(link, index) {
    const item = document.createElement('div');
    item.className = `link-item ${link.status} ${link.checked ? 'checked' : ''}`;
    item.dataset.id = link.id;

    const postTypeLabel = link.post_type ? `[${link.post_type.toUpperCase()}] ` : '';
    const displayTitle = link.title || link.url;
    const displayDescription = link.description || '';
    const indexStr = (index + 1).toString();
    const indexDigits = indexStr.split('').map(digit => `<span>${digit}</span>`).join('');

    item.innerHTML = `
        <input type="checkbox" class="link-checkbox" ${link.checked ? 'checked' : ''}>
        <div class="link-row">
            <button class="link-index" title="Xóa link này">
                ${indexDigits}
            </button>
            <div class="link-thumbnail">
                <div class="thumbnail-wrapper">
                    ${link.status === 'iframe'
            ? `<iframe src="${link.image}" width="100" height="100" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" loading="lazy"></iframe>`
            : link.image
                ? `<img src="${link.image}" alt="Thumbnail" loading="lazy">`
                : `<i class="fas fa-link fa-icon"></i>`
        }
                    <div class="thumbnail-overlay"></div>
                </div>
            </div>
            <div class="link-content">
                <div class="link-title post-type-${link.post_type}">${postTypeLabel}${displayTitle}</div>
                <div class="link-description">${displayDescription}</div>
                <div class="link-meta">
                    <span class="link-time">${link.note ? `<span class="note-text">${link.note}</span>` : formatDateTime(link.date)}</span>
                    <span class="link-status status-${link.blacklistStatus === 'blacklisted' ? 'blacklist' : link.status}">
                        ${link.blacklistStatus === 'blacklisted' ? '<span class="blacklist-text">Blacklist</span>' :
            link.status === 'success' ? 'Thành công' :
                link.status === 'iframe' ? 'Hiển thị iframe' :
                    link.status === 'login' ? 'Yêu cầu đăng nhập' :
                        link.status === 'link_hỏng' ? 'Link hỏng' :
                            link.status === 'error' ? 'Lỗi' : 'Không xác định'}
                    </span>
                </div>
            </div>
            <div class="link-actions">
                <button class="action-btn view-post" title="Xem bài viết"><i class="fas fa-eye"></i></button>
                <button class="action-btn note" title="Ghi chú"><i class="fas fa-comment-alt"></i></button>
                ${link.blacklistStatus === 'active' ? `<button class="action-btn block" title="Chặn"><i class="fas fa-ban"></i></button>` : `<button class="action-btn unblock" title="Khôi phục"><i class="fas fa-undo"></i></button>`}
            </div>
        </div>
    `;

    // Sự kiện checkbox
    item.querySelector('.link-checkbox').addEventListener('change', () => toggleCheckbox(link));

    // Sự kiện nhấp vào thumbnail
    item.querySelector('.link-thumbnail').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleCheckbox(link);
    });

    // Sự kiện nhấp vào nội dung (khôi phục hành vi mở URL)
    item.querySelector('.link-content').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!link.checked) {
            toggleCheckbox(link);
            window.open(link.url, '_blank');
        } else {
            toggleCheckbox(link);
        }
    });

    // Sự kiện nút xóa
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

    // Các sự kiện khác
    item.querySelector('.view-post').addEventListener('click', () => showLinkDetailsPopup(link));
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


function showSelectionActionsDialog(count) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Đã chọn ${count} mục</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <button id="delete-selected" class="btn btn-danger">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                    ${state.currentTab !== 'fanpage' ? `
                    <button id="export-gist" class="btn btn-primary">
                        <i class="fas fa-code-branch"></i> Xuất Gist
                    </button>
                    <button id="export-url" class="btn btn-primary">
                        <i class="fas fa-link"></i> Xuất URL
                    </button>
                    ` : ''}
                    <button id="unselect-all" class="btn btn-secondary">
                        <i class="fas fa-times"></i> Bỏ chọn
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector('#delete-selected').addEventListener('click', () => {
        if (state.currentTab === 'fanpage') {
            deleteSelectedFanpages();
        } else {
            deleteSelected();
        }
        document.body.removeChild(dialog);
    });

    if (state.currentTab !== 'fanpage') {
        dialog.querySelector('#export-gist').addEventListener('click', () => {
            const selectedLinks = state.links.filter(l => l.checked);
            exportToGist(selectedLinks);
            document.body.removeChild(dialog);
        });

        dialog.querySelector('#export-url').addEventListener('click', () => {
            const selectedLinks = state.links.filter(l => l.checked);
            if (selectedLinks.length === 0) {
                showToast('Vui lòng chọn ít nhất một link để xuất URL', 'warning');
                return;
            }
            exportUrlsToGist(selectedLinks);
            document.body.removeChild(dialog);
        });
    }

    dialog.querySelector('#unselect-all').addEventListener('click', () => {
        if (state.currentTab === 'fanpage') {
            const fanpages = getFilteredFanpages(currentFilter);
            fanpages.forEach(f => f.checked = false);
            saveData({ fanpages: true });
        } else {
            const links = getLinksForCurrentTab();
            links.forEach(l => l.checked = false);
            saveData({ links: true });
        }
        renderTabContent(state.currentTab);
        document.body.removeChild(dialog);
    });

    dialog.querySelector('.modal-close').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
}


function smartScroll() {
    if (!elements.mainContent) return;
    const maxScroll = elements.mainContent.scrollHeight - elements.mainContent.clientHeight;
    const targetPosition = state.scrollState === 0 ? maxScroll : 0;
    smoothScroll(elements.mainContent, targetPosition);
    state.scrollState = state.scrollState === 0 ? 1 : 0;
}



// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseTones(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D");
}
function showSearchResultsPopup(searchQuery) {
    // Lưu searchQuery và đặt trạng thái để lọc toàn cục
    state.dateFilter.searchQuery = searchQuery;
    state.currentTab = 'filter';
    state.currentFilter = 'all';

    const popup = document.createElement('div');
    popup.className = 'modal-overlay search-results-popup';
    popup.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Kết quả tìm kiếm: "${searchQuery}"</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div class="search-results-container"></div>
            </div>
            <div class="modal-footer">
                <button id="apply-search-filter" class="btn btn-primary">
                    Áp dụng bộ lọc này
                </button>
                <button id="close-search-popup" class="btn btn-secondary">
                    Đóng
                </button>
            </div>
        </div>
        <style>
            .search-results-popup .modal-dialog {
                width: 90%;
                max-width: 800px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            }
            .search-results-popup .modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
            }
            .search-results-container {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .search-results-container .link-item {
                border: 1px solid #eee;
                border-radius: 5px;
                padding: 10px;
            }
            
        </style>
    `;

    document.body.appendChild(popup);

    // Lấy kết quả tìm kiếm
    const results = getLinksForCurrentTab();
    console.log('Popup - Search query:', searchQuery, 'Links:', results); // Debug

    const resultsContainer = popup.querySelector('.search-results-container');

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results" style="text-align: center; padding: 40px 0;">
                <i class="fas fa-search" style="font-size: 40px; color: #ccc;"></i>
                <p>Không tìm thấy kết quả phù hợp</p>
            </div>
        `;
    } else {
        results.forEach((link, index) => {
            const linkItem = createLinkItem(link, index); // Dùng createLinkItem
            resultsContainer.appendChild(linkItem);
        });
    }

    // Xử lý sự kiện nút Áp dụng bộ lọc
    popup.querySelector('#apply-search-filter').addEventListener('click', () => {
        state.dateFilter.searchQuery = searchQuery;
        state.currentTab = 'filter';
        state.currentFilter = 'all';
        saveData({ dateFilter: true });
        renderTabContent('filter');
        document.body.removeChild(popup);
        showToast(`Đã áp dụng bộ lọc tìm kiếm: "${searchQuery}"`, 'success');
    });

    // Xử lý sự kiện nút Đóng
    popup.querySelector('#close-search-popup').addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    popup.querySelector('.modal-close').addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });
}

function showFilterPopup() {
    const popup = document.createElement('div');
    popup.className = 'modal-overlay filter-popup';
    popup.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>Chọn Bộ Lọc</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="search-box">
          <input type="text" id="filter-search-input" 
                 placeholder="Tìm kiếm theo tiêu đề/nội dung..."
                 value="${state.dateFilter.searchQuery || ''}">
          <button id="filter-search-btn"><i class="fas fa-search"></i></button>
        </div>
        <div class="filter-buttons">
          <button class="filter-btn ${state.currentFilter === 'all' ? 'active' : ''}" 
                  data-filter="all">Tất cả</button>
          <button class="filter-btn ${state.currentFilter === 'group' ? 'active' : ''}" 
                  data-filter="group">Group</button>
          <button class="filter-btn ${state.currentFilter === 'photo' ? 'active' : ''}" 
                  data-filter="photo">Photo</button>
          <button class="filter-btn ${state.currentFilter === 'story' ? 'active' : ''}" 
                  data-filter="story">Story</button>
          <button class="filter-btn ${state.currentFilter === 'video' ? 'active' : ''}" 
                  data-filter="video">Video</button>
          <button class="filter-btn ${state.currentFilter === 'reel' ? 'active' : ''}" 
                  data-filter="reel">Reel</button>
          <button class="filter-btn ${state.currentFilter === 'post' ? 'active' : ''}" 
                  data-filter="post">Post</button>
          <button class="filter-btn ${state.currentFilter === 'iframe' ? 'active' : ''}" 
                  data-filter="iframe">Iframe</button>
          <button class="filter-btn ${state.currentFilter === 'duplicate' ? 'active' : ''}" 
                  data-filter="duplicate">Trùng lặp</button>
          <button class="filter-btn ${state.currentFilter === 'blacklist' ? 'active' : ''}" 
                  data-filter="blacklist">Blacklist</button>
          <button class="filter-btn ${state.currentFilter === 'note' ? 'active' : ''}" 
                  data-filter="note">Ghi chú</button>
          <button class="filter-btn ${state.currentFilter === 'success' ? 'active' : ''}" 
                  data-filter="success">Thành công</button>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(popup);

    const closePopup = () => {
        if (document.body.contains(popup)) {
            document.body.removeChild(popup);
        }
    };
    popup.querySelector('.modal-close').addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => e.target === popup && closePopup());

    const searchInput = popup.querySelector('#filter-search-input');
    const searchBtn = popup.querySelector('#filter-search-btn');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) {
                showSearchResultsPopup(query);
                closePopup();
            } else {
                showToast('Vui lòng nhập từ khóa tìm kiếm', 'warning');
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    showSearchResultsPopup(query);
                    closePopup();
                } else {
                    showToast('Vui lòng nhập từ khóa tìm kiếm', 'warning');
                }
            }
        });
    }

    popup.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            state.currentFilter = this.dataset.filter;
            state.dateFilter.searchQuery = '';
            saveData({ currentFilter: true, dateFilter: true });
            renderTabContent(state.currentTab);
            closePopup();
        });
    });

    const exportBtn = popup.querySelector('.export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const filteredLinks = state.links.filter(l => l.status === 'success');
            exportLinksToGoogleSheets(filteredLinks);
            closePopup();
        });
    }
}

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
            case 'fanpage':
                btn.addEventListener('click', () => switchTab('fanpage'));
                break;
        }
    });

    if (elements.headerBtns.delete) {
        elements.headerBtns.delete.addEventListener('click', () => {
            if (state.currentTab === 'fanpage') {
                deleteSelectedFanpages();
            } else {
                deleteSelected();
            }
        });
    }

    if (elements.statusCounters.all?.parentElement) {
        elements.statusCounters.all.parentElement.addEventListener('click', () => switchTab('all-link'));
    }

    if (elements.statusCounters.filter?.parentElement) {
        elements.statusCounters.filter.parentElement.addEventListener('click', () => {
            console.log('Filter button clicked');
            showFilterPopup((filter) => {
                state.currentFilter = filter;
                switchTab('all-link');
                saveData({ currentFilter: true });
            });
        });
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



// Khởi tạo
function init() {
    window.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadData();
            setupEventListeners();
            renderTabContent('all-link');
        } catch (error) {
            console.error('Lỗi khởi tạo:', error);
            showToast('Lỗi khởi tạo ứng dụng', 'danger');
            addLog(`Lỗi khởi tạo: ${error.message}`, 'error');
        }
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


function updateSelectionBar(fanpages) {
    const container = elements.linkLists['fanpage'];
    if (!container) return;

    const selectedCount = fanpages.filter(f => f.checked).length;
    const totalCount = fanpages.length;

    container.querySelector('.selection-count').textContent = `${selectedCount}/${totalCount}`;
    container.querySelector('.delete-selected-btn').disabled = selectedCount === 0;

    const selectAllCheckbox = container.querySelector('#select-all-fanpages');
    if (selectedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedCount === totalCount) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}



// Cập nhật hàm getFilteredFanpages để hỗ trợ lọc trùng lặp
function getFilteredFanpages(filter) {
    let fanpages = [...state.fanpages];

    // Áp dụng bộ lọc
    switch (filter) {
        case 'fanpage':
            fanpages = fanpages.filter(f => f.type === 'fanpage');
            break;
        case 'profile':
            fanpages = fanpages.filter(f => f.type === 'profile');
            break;
        case 'profile-pro':
            fanpages = fanpages.filter(f => f.type === 'profile-pro');
            break;
        case 'duplicate':
            fanpages = findDuplicateFanpages();
            break;
    }

    // Sắp xếp
    return fanpages.sort((a, b) => {
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

// Hàm tìm fanpage trùng lặp (theo URL hoặc tiêu đề)
function findDuplicateFanpages() {
    const urlMap = {};
    const titleMap = {};
    const duplicates = new Set();

    state.fanpages.forEach(fanpage => {
        // Kiểm tra trùng URL
        const baseUrl = fanpage.url.split('?')[0];
        if (urlMap[baseUrl]) {
            duplicates.add(fanpage);
            duplicates.add(urlMap[baseUrl]);
        } else {
            urlMap[baseUrl] = fanpage;
        }

        // Kiểm tra trùng tiêu đề (không phân biệt hoa thường)
        const lowerTitle = fanpage.name.toLowerCase();
        if (titleMap[lowerTitle]) {
            duplicates.add(fanpage);
            duplicates.add(titleMap[lowerTitle]);
        } else {
            titleMap[lowerTitle] = fanpage;
        }
    });

    return Array.from(duplicates);
}

function renderFanpageList(container, fanpages) {
    container.innerHTML = ''; // Xóa toàn bộ nội dung cũ trong container

    // Chỉ render danh sách fanpage, không render fanpage-list-header
    fanpages.forEach((fanpage, index) => {
        const item = document.createElement('div');
        item.className = `link-item ${fanpage.checked ? 'checked' : ''}`;
        item.dataset.id = fanpage.id;

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

        container.appendChild(item);
        loadMiniIframe(item.querySelector('.fanpage-iframe-mini'), fanpage.url);

        // Sự kiện checkbox
        const checkbox = item.querySelector('.link-checkbox');
        checkbox.addEventListener('change', () => {
            fanpage.checked = checkbox.checked;
            updateSelectionBar(fanpages); // Cập nhật selection-bar
            saveData({ fanpages: true });
            item.classList.toggle('checked', fanpage.checked);
        });

        // Sự kiện click vào item (toggle checkbox)
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.link-checkbox') && !e.target.closest('.link-actions')) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        // Sự kiện nút chỉnh sửa
        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            showEditFanpagePopup(fanpage);
        });

        // Sự kiện nút STT (Xóa fanpage)
        item.querySelector('.link-index').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Xóa fanpage: ${fanpage.url}?`)) {
                deleteFanpage(fanpage.id);
            }
        });
    });
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


// Hàm fetch với retry
async function fetchWithRetry(url, options = {}, retries = config.maxRetries, delay = config.retryDelay) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), config.requestTimeout);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return res;
        } catch (err) {
            if (attempt === retries) {
                try {
                    const proxyRes = await fetch(`${config.corsProxy}${encodeURIComponent(url)}`, options);
                    if (!proxyRes.ok) throw new Error(`Proxy HTTP ${proxyRes.status}`);
                    return proxyRes;
                } catch (proxyErr) {
                    throw new Error(`Lỗi sau ${retries} lần thử: ${err.message}, Proxy: ${proxyErr.message}`);
                }
            }
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
}

// Kiểm tra token GitHub
async function validateGithubToken(token) {
    try {
        const res = await fetchWithRetry('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        return res.ok;
    } catch {
        return false;
    }
}



async function extractImageFromUrl(url) {
    try {
        // Sử dụng proxy để lấy nội dung HTML
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
            throw new Error(`Lỗi HTTP: ${response.status}`);
        }

        const data = await response.json();
        const htmlContent = data.contents;

        if (!htmlContent) {
            throw new Error('Không có nội dung HTML trả về');
        }

        // Phương pháp trích xuất ảnh cũ từ HTML
        const imageRegex = /"image":{"uri":"([^"]+)"/g;
        const matches = imageRegex.exec(htmlContent);

        if (!matches || !matches[1]) {
            throw new Error('Không tìm thấy ảnh trong HTML');
        }

        let imageUrl = matches[1].replace(/\\\//g, '/');

        // Xử lý URL tương đối thành URL tuyệt đối nếu cần
        if (imageUrl.startsWith('/')) {
            imageUrl = new URL(imageUrl, new URL(url).origin).href;
        }

        return imageUrl;
    } catch (error) {
        console.error('Lỗi khi trích xuất ảnh:', error);
        addLog(`Lỗi trích xuất ảnh từ ${url}: ${error.message}`, 'error');
        return null;
    }
}

async function reloadImage(linkId) {
    const link = state.links.find(l => l.id === linkId);
    if (!link) return;

    try {
        showToast('Đang tải lại ảnh...', 'info');
        const newImage = await extractImageFromUrl(link.url);

        if (newImage) {
            // Lưu trạng thái cũ để undo
            saveBackup('updateImage', {
                linkId: link.id,
                oldImage: link.image,
                newImage: newImage
            });

            // Cập nhật ảnh mới
            link.image = newImage;
            saveData({ links: true });
            renderTabContent(state.currentTab);

            showToast('Đã cập nhật ảnh mới', 'success');
            addLog(`Đã cập nhật ảnh cho link ${link.url}`, 'info');
        } else {
            showToast('Không thể tải ảnh mới', 'warning');
        }
    } catch (error) {
        showToast('Lỗi khi tải ảnh mới', 'danger');
        addLog(`Lỗi khi tải ảnh mới cho link ${link.url}: ${error.message}`, 'error');
    }
}

/**
 * Hàm chung xử lý nhập/xuất dữ liệu lên Gist
 */

async function handleGistOperation({ operation, fileName, dataType, data, processImport }) {
    const displayType = dataType === 'links' ? 'link' : 'fanpage';
    const showError = (message) => {
        showToast(`Lỗi khi ${operation === 'import' ? 'nhập' : 'xuất'} từ ${fileName}: ${message}`, 'danger');
        addLog(`Lỗi ${operation === 'import' ? 'nhập' : 'xuất'} ${displayType} từ ${fileName}: ${message}`, 'error');
    };

    try {
        state.isLoading = true;
        const { fanpageGistUrl: gistUrl, githubToken: token } = config;

        if (operation === 'export') {
            if (!data?.length) {
                showToast(`Không có ${displayType} nào để xuất!`, 'warning');
                return;
            }
            if (!token || token === 'YOUR_GITHUB_TOKEN_HERE' || !(await validateGithubToken(token))) {
                showError('Token GitHub không hợp lệ');
                return;
            }

            const content = JSON.stringify(data, null, 2);
            console.log(`Dữ liệu gửi lên ${fileName}:`, content);

            const response = await fetchWithRetry(gistUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ files: { [fileName]: { content } } })
            });

            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                showToast(`Quá nhiều yêu cầu, thử lại sau ${retryAfter}s`, 'warning');
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return handleGistOperation({ operation, fileName, dataType, data });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status}: ${errorData.message || 'Không thể cập nhật Gist'}`);
            }

            console.log(`Phản hồi từ Gist khi xuất ${fileName}:`, await response.json());
            showToast(`Đã xuất ${data.length} ${displayType} lên ${fileName}`, 'success');
            addLog(`Đã xuất ${data.length} ${displayType} lên ${fileName}`, 'success');
        } else {
            showToast(`Đang tải dữ liệu từ ${fileName}...`, 'info');
            const response = await fetchWithRetry(gistUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const gistData = await response.json();
            const fileContent = gistData.files?.[fileName]?.content;
            if (!fileContent) throw new Error(`Không tìm thấy nội dung trong '${fileName}'`);

            const items = fileName === 'Jsonlink'
                ? fileContent.split('\n').map(line => JSON.parse(line)).filter(Boolean)
                : JSON.parse(fileContent);

            if (!Array.isArray(items)) throw new Error('Dữ liệu JSON không hợp lệ');

            const validItems = items.filter(item =>
                item.url?.trim() && (dataType === 'links' ? item.image?.trim() : item.name?.trim())
            );

            if (!validItems.length) {
                showToast(`Không có ${displayType} hợp lệ trong ${fileName}`, 'warning');
                return;
            }

            if (!confirm(`Bạn có chắc muốn nhập ${validItems.length} ${displayType} từ ${fileName}?`)) {
                showToast('Đã hủy nhập dữ liệu', 'warning');
                return;
            }

            const newItems = await processImport(validItems);
            if (newItems.length) {
                saveBackup(`add${dataType.charAt(0).toUpperCase() + dataType.slice(1)}`, { [dataType]: newItems });
                await saveData({ [dataType]: true });
                renderTabContent(dataType === 'links' ? 'all-link' : 'fanpage');
                updateCounters();
                showToast(`Đã thêm ${newItems.length} ${displayType} từ ${fileName}`, 'success');
                addLog(`Đã nhập ${newItems.length} ${displayType} từ ${fileName}`, 'success');
            } else {
                showToast(`Không có ${displayType} nào được thêm`, 'warning');
            }
        }
    } catch (error) {
        console.error(`Lỗi ${operation} ${dataType} từ ${fileName}:`, error);
        showError(error.message);
    } finally {
        state.isLoading = false;
    }
}

async function importLinksFromJsonLines() {
    try {
        state.isLoading = true;
        showToast('Đang tải danh sách link từ Jsonlink...', 'info');

        const response = await fetch(config.fanpageGistUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Lỗi HTTP: ${response.status}`);
        const gistData = await response.json();
        const fileContent = gistData.files["Jsonlink"]?.content;

        if (!fileContent) throw new Error("Không tìm thấy nội dung trong 'Jsonlink'");

        const rawItems = fileContent
            .split('\n')
            .map((line, index) => {
                try {
                    if (!line.trim()) return null;
                    return JSON.parse(line);
                } catch (error) {
                    console.warn(`Lỗi parsing JSON tại dòng ${index}: ${error.message}, dòng: ${line}`);
                    return null;
                }
            })
            .filter(Boolean);

        const items = filterByKeywords(rawItems).filter(item =>
            isValidUrl(item.url) && item.image && item.image.trim() !== ''
        );

        if (items.length === 0) {
            showToast('Không có dòng JSON hợp lệ hoặc đã bị lọc', 'warning');
            return;
        }

        if (!confirm(`Bạn có chắc muốn nhập ${items.length} link từ Jsonlink?`)) {
            showToast('Đã hủy nhập dữ liệu', 'warning');
            return;
        }

        const newLinks = [];
        for (const item of items) {
            const isErrorImage = item.image === config.defaultImage || item.image.includes('facebook.com/plugins/');
            const newLink = {
                id: generateId(),
                url: item.url,
                title: item.title || 'Chưa xử lý',
                description: item.description || '',
                image: isErrorImage
                    ? `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(item.url)}&width=300&show_text=true`
                    : item.image,
                status: isErrorImage ? 'iframe' : 'success',
                post_type: item.post_type || determinePostType(item.url),
                date: new Date().toISOString(),
                checked: item.checked || false,
                blacklistStatus: item.blacklistStatus || 'active',
                note: item.note || ''
            };
            newLinks.push(newLink);
        }

        if (newLinks.length > 0) {
            state.links.unshift(...newLinks);
            saveBackup('addLinks', { links: newLinks });
            await saveData({ links: true });
            renderTabContent(state.currentTab);
            updateCounters();
            showToast(`Đã thêm ${newLinks.length} link từ Jsonlink`, 'success');
        }

        await clearGistFileContent(gistData.id, "Jsonlink");

    } catch (error) {
        showToast(`Lỗi khi nhập từ Jsonlink: ${error.message}`, 'danger');
    } finally {
        state.isLoading = false;
    }
}

async function clearGistFileContent(gistId, fileName = "Jsonlink") {
    try {
        if (!gistId || !fileName) {
            console.warn("Thiếu gistId hoặc tên file cần xoá nội dung");
            return;
        }

        // Lấy thông tin gist để xác minh tồn tại file
        const getResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${config.githubToken}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!getResponse.ok) {
            const errText = await getResponse.text();
            console.error(`Không thể tải Gist: ${gistId}`, errText);
            showToast(`Không thể tải Gist: ${gistId}`, 'danger');
            return;
        }

        const gistData = await getResponse.json();
        if (!gistData.files || !gistData.files[fileName]) {
            console.warn(`Không tìm thấy file '${fileName}' trong Gist`);
            showToast(`Không tìm thấy file '${fileName}' trong Gist`, 'warning');
            return;
        }

        const patchResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${config.githubToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    [fileName]: {
                        content: ''
                    }
                }
            })
        });

        if (patchResponse.ok) {
            showToast(`Đã xoá nội dung file '${fileName}' trong Gist`, 'success');
            addLog(`Đã xoá nội dung file '${fileName}' trong Gist ID: ${gistId}`, 'info');
        } else {
            const errText = await patchResponse.text();
            console.warn(`Không thể xoá nội dung '${fileName}':`, errText);
            showToast(`Lỗi xoá nội dung '${fileName}': ${patchResponse.statusText}`, 'danger');
            addLog(`Lỗi xoá nội dung file '${fileName}' trong Gist: ${patchResponse.statusText}`, 'error');
        }

    } catch (error) {
        console.error(`Lỗi xoá nội dung file '${fileName}':`, error);
        showToast(`Lỗi khi xoá nội dung '${fileName}': ${error.message}`, 'danger');
        addLog(`Lỗi xoá nội dung '${fileName}' trong Gist: ${error.message}`, 'error');
    }
}

async function exportUrlsToGist(links) {
    try {
        state.isLoading = true;
        showToast('Đang xuất danh sách URL lên Gist...', 'info');

        const content = links.map(link => link.url).join('\n'); // mỗi dòng 1 url

        const { fanpageGistUrl: gistUrl, githubToken: token } = config;

        if (!token || token === 'YOUR_GITHUB_TOKEN_HERE' || !(await validateGithubToken(token))) {
            showToast('Token GitHub không hợp lệ', 'danger');
            addLog('Lỗi token khi export URL lên Gist', 'error');
            return;
        }

        const response = await fetchWithRetry(gistUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'linkitemmmm': { content } // 🔥 file đơn giản, thuần text
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.message || 'Không thể cập nhật Gist'}`);
        }

        showToast(`Đã xuất ${links.length} URL lên Gist (link_urls.txt)`, 'success');
        addLog(`Đã export ${links.length} URL lên Gist (link_urls.txt)`, 'success');
    } catch (error) {
        console.error('Lỗi export URL:', error);
        showToast(`Lỗi khi export URL: ${error.message}`, 'danger');
        addLog(`Lỗi khi export URL lên Gist: ${error.message}`, 'error');
    } finally {
        state.isLoading = false;
    }
}




async function exportToGist() {
    const linksToExport = state.links.filter(link => link.checked).length > 0
        ? state.links.filter(link => link.checked)
        : state.links;
    await handleGistOperation({
        operation: 'export',
        fileName: 'Jsonalllink',
        dataType: 'links',
        data: linksToExport
    });
}

async function importFanpagesFromJSON() {
    await handleGistOperation({
        operation: 'import',
        fileName: 'Jsonfanpage',
        dataType: 'fanpages',
        processImport: async (items) => {
            const newFanpages = [];
            for (const item of items) {
                const trimmedUrl = item.url.trim();
                if (!isValidUrl(trimmedUrl)) continue;
                const newFanpage = {
                    id: generateId(),
                    url: trimmedUrl,
                    name: item.name || 'Fanpage không tên',
                    description: item.description || '',
                    type: ['fanpage', 'profile', 'profile-pro'].includes(item.type) ? item.type : 'fanpage',
                    date: new Date().toISOString(),
                    checked: false,
                    status: 'pending',
                    thumbnail: item.thumbnail || config.defaultImage
                };
                state.fanpages.unshift(newFanpage);
                newFanpages.push(newFanpage);
                addLog(`Đã thêm fanpage từ Jsonfanpage: ${trimmedUrl}`, 'success');
            }
            return newFanpages;
        }
    });
}

async function exportFanpagesToJSON(fanpagesToExport = state.fanpages) {
    await handleGistOperation({
        operation: 'export',
        fileName: 'Jsonfanpage',
        dataType: 'fanpages',
        data: fanpagesToExport
    });
}

async function importFromJSON() {
    try {
        state.isLoading = true;
        showToast('Đang tải danh sách link từ Jsonalllink...', 'info');

        const response = await fetch(config.fanpageGistUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Lỗi HTTP: ${response.status}`);

        const gistData = await response.json();
        const fileContent = gistData.files["Jsonalllink"]?.content;

        if (!fileContent) throw new Error("Không tìm thấy nội dung trong 'Jsonalllink'");

        let data = JSON.parse(fileContent);
        if (!Array.isArray(data)) throw new Error('Dữ liệu JSON không hợp lệ (phải là mảng object)');

        const filteredData = filterByKeywords(data).filter(item =>
            typeof item.url === 'string' &&
            item.url.trim() !== '' &&
            item.image &&
            item.image.trim() !== ''
        );

        if (filteredData.length === 0) {
            showToast('Không có link hợp lệ hoặc đã bị lọc', 'warning');
            return;
        }

        if (!confirm(`Bạn có chắc muốn nhập ${filteredData.length} link từ Jsonalllink?`)) {
            showToast('Đã hủy nhập dữ liệu', 'warning');
            return;
        }

        const newLinks = [];
        for (const item of filteredData) {
            const url = item.url.trim();
            const isErrorImage = item.image === config.defaultImage || item.image.includes('facebook.com/plugins/');
            const newLink = {
                id: generateId(),
                url,
                title: item.title || 'Chưa xử lý',
                description: item.description || '',
                image: isErrorImage
                    ? `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=300&show_text=true`
                    : item.image,
                status: isErrorImage ? 'iframe' : 'success',
                post_type: item.post_type || determinePostType(url),
                date: new Date().toISOString(),
                checked: item.checked || false,
                blacklistStatus: item.blacklistStatus || 'active',
                note: item.note || ''
            };
            state.links.unshift(newLink);
            newLinks.push(newLink);
        }

        if (newLinks.length > 0) {
            saveBackup('addLinks', { links: newLinks });
            await saveData({ links: true });
            renderTabContent('all-link');
            updateCounters();
            showToast(`Đã thêm ${newLinks.length} link từ Jsonalllink`, 'success');
        }
    } catch (error) {
        showToast(`Lỗi khi import: ${error.message}`, 'danger');
    } finally {
        state.isLoading = false;
    }
}


function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), config.toastDuration);
}

const dbName = "myAppData"; // Tên cơ sở dữ liệu
const storeName = "dataStore"; // Tên object store

// Mở hoặc tạo cơ sở dữ liệu
const openDatabase = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        // Nếu cơ sở dữ liệu không tồn tại, tạo mới với một store
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Lỗi mở cơ sở dữ liệu");
    });
};

async function loadData() {
    const showLoading = () => {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = 'Đang tải...';
        document.body.appendChild(loading);
        return () => document.body.removeChild(loading);
    };

    const hideLoading = showLoading();
    try {
        let savedData = null;
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        // Lấy dữ liệu từ store
        const request = store.get(1); // Giả sử chỉ có 1 bản ghi
        savedData = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => reject("Lỗi tải dữ liệu từ IndexedDB");
        });

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

// Refactored showLinkDetailsPopup
function showLinkDetailsPopup(link) {
    const popup = document.createElement('div');
    popup.className = 'modal-overlay';
    popup.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>Chi tiết bài viết</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <input type="text" id="post-url-input" placeholder="Nhập URL bài viết mới..." value="${link.url}">
          <button id="copy-shortcuts-btn" class="btn btn-primary">Copy & Shortcuts</button>
        </div>
        <div class="form-row">
          <input type="text" id="image-url-input" placeholder="Nhập URL ảnh mới..." value="${link.image}">
          <button id="paste-image-btn" class="btn btn-primary">Dán & Cập nhật</button>
        </div>
        <div class="button-row">
          <button id="delete-btn" class="btn btn-danger">Xóa</button>
          <button id="close-btn" class="btn btn-secondary">Đóng</button>
        </div>
        <div class="fb-post-wrapper">
          <div class="fb-post-container">
            <div class="fb-post" data-href="${link.url}" data-width="500" data-show-text="true" data-adapt-container-width="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(popup);

    const adjustPostSize = () => {
        const wrapper = popup.querySelector('.fb-post-wrapper');
        const container = popup.querySelector('.fb-post-container');
        const iframe = popup.querySelector('.fb-post iframe');
        if (!iframe || !container || !wrapper) return;

        const wW = wrapper.clientWidth;
        const wH = wrapper.clientHeight;
        const iW = iframe.clientWidth || 600;
        const iH = iframe.clientHeight || 600;

        const scale = Math.min(wW / iW, wH / iH);
        container.style.transform = `scale(${scale})`;
        container.style.width = `${100 / scale}%`;
        container.style.height = `${100 / scale}%`;
    };

    const waitForIframe = () => {
        const iframe = popup.querySelector('.fb-post iframe');
        if (iframe) {
            iframe.onload = () => setTimeout(adjustPostSize, 300);
            adjustPostSize();
        } else {
            setTimeout(waitForIframe, 200);
        }
    };

    const resizeObserver = new ResizeObserver(adjustPostSize);
    resizeObserver.observe(popup.querySelector('.fb-post-wrapper'));

    const closePopup = () => {
        resizeObserver.disconnect();
        popup.remove();
    };

    // Nút Copy & Shortcuts
    popup.querySelector('#copy-shortcuts-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const shortcutsUrl = `shortcuts://run-shortcut?name=111&input=text&text=${encodeURIComponent(link.url)}`;
        window.open(shortcutsUrl, '_blank');
        navigator.clipboard.writeText(link.url);
    });

    // Nút Dán & Cập nhật
    popup.querySelector('#paste-image-btn').addEventListener('click', async () => {
        const imageInput = popup.querySelector('#image-url-input');
        let clipboardImageUrl = '';

        try {
            clipboardImageUrl = await navigator.clipboard.readText();
        } catch (err) {
            console.log('Clipboard error:', err.message);
        }

        imageInput.value = clipboardImageUrl;
        const newImageUrl = imageInput.value.trim();

        saveBackup('updateImage', {
            linkId: link.id,
            oldImage: link.image,
            newImage: newImageUrl
        });

        link.image = newImageUrl;
        saveData({ links: true });
        updateLinkItem(link);
        closePopup();
        showToast('Đã cập nhật ảnh', 'success');
    });

    // Nút Xóa
    popup.querySelector('#delete-btn').addEventListener('click', () => {
        if (confirm(`Xóa link: ${link.url}?`)) {
            saveBackup('deleteLinks', { links: [{ ...link }] });
            state.links = state.links.filter(l => l.id !== link.id);
            saveData({ links: true });
            updateCounters();
            showToast(`Đã xóa link ${link.url}`, 'success');
            addLog(`Đã xóa link ${link.url} (ID: ${link.id})`, 'info');
            closePopup();
        }
    });

    // Nút Đóng
    popup.querySelector('#close-btn').addEventListener('click', closePopup);
    popup.querySelector('.modal-close').addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => {
        if (e.target === popup) closePopup();
    });

    if (!window.FB) {
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/vi_VN/sdk.js#xfbml=1&version=v12.0&appId=YOUR_APP_ID';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            window.FB.XFBML.parse(popup, () => setTimeout(waitForIframe, 500));
        };
        document.body.appendChild(script);
    } else {
        window.FB.XFBML.parse(popup, () => setTimeout(waitForIframe, 500));
    }
}

// Refactored renderFanpageTab
function renderFanpageTab() {
    const container = elements.linkLists['fanpage'];
    if (!container) {
        addLog('Không tìm thấy container fanpage-tab', 'error');
        return;
    }

    container.innerHTML = `
    <div class="fanpage-controls">
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="fanpage">Fanpage</button>
        <button class="filter-btn" data-filter="profile">Cá nhân</button>
        <button class="filter-btn" data-filter="profile-pro">Pro</button>
        <button class="filter-btn" data-filter="duplicate">Trùng</button>
      </div>
      <div class="action-buttons">
        <button class="export-btn" id="export-fanpage-json">Xuất</button>
      </div>
    </div>
    <div class="selection-bar">
      <input type="checkbox" id="select-all-fanpages">
      <span class="selection-info">All</span>
      <span class="selection-count">0/${state.fanpages.length}</span>
      <button class="delete-selected-btn" disabled>Xóa</button>
    </div>
    <div class="fanpage-list"></div>
  `;

    const listContainer = container.querySelector('.fanpage-list');
    let currentFilter = 'all';

    const updateFanpageList = () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        listContainer.innerHTML = '';

        filteredFanpages.forEach((fanpage, index) => {
            const item = document.createElement('div');
            item.className = `link-item ${fanpage.checked ? 'checked' : ''}`;
            item.dataset.id = fanpage.id;

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

            listContainer.appendChild(item);
            loadMiniIframe(item.querySelector('.fanpage-iframe-mini'), fanpage.url);

            // Sự kiện checkbox
            const checkbox = item.querySelector('.link-checkbox');
            checkbox.addEventListener('change', () => {
                fanpage.checked = checkbox.checked;
                updateSelectionBar(filteredFanpages);
                saveData({ fanpages: true });
                item.classList.toggle('checked', fanpage.checked);
            });

            // Sự kiện click vào item (toggle checkbox)
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.link-checkbox') && !e.target.closest('.link-actions')) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            // Sự kiện nút chỉnh sửa
            item.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                showEditFanpagePopup(fanpage);
            });

            // Sự kiện nút STT (Xóa fanpage)
            item.querySelector('.link-index').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Xóa fanpage: ${fanpage.url}?`)) {
                    deleteFanpage(fanpage.id);
                }
            });
        });
    };

    const updateSelectionBar = (fanpages) => {
        const selectedCount = fanpages.filter(f => f.checked).length;
        const totalCount = fanpages.length;

        container.querySelector('.selection-count').textContent = `${selectedCount}/${totalCount}`;
        container.querySelector('.delete-selected-btn').disabled = selectedCount === 0;

        const selectAllCheckbox = container.querySelector('#select-all-fanpages');
        if (selectedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedCount === totalCount) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    };

    // Initial render
    updateFanpageList();

    // Filter buttons
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            updateFanpageList();
        });
    });

    // Export button
    container.querySelector('#export-fanpage-json').addEventListener('click', () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        exportFanpagesToJSON(filteredFanpages);
    });

    // Select all checkbox
    container.querySelector('#select-all-fanpages').addEventListener('change', function () {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        const isChecked = this.checked;

        filteredFanpages.forEach(fanpage => {
            fanpage.checked = isChecked;
        });

        saveData({ fanpages: true });
        updateFanpageList();
    });

    // Delete selected button
    container.querySelector('.delete-selected-btn').addEventListener('click', () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        const selectedFanpages = filteredFanpages.filter(f => f.checked);

        if (selectedFanpages.length === 0) return;

        if (confirm(`Bạn có chắc muốn xóa ${selectedFanpages.length} fanpage đã chọn?`)) {
            saveBackup('deleteFanpages', { fanpages: [...selectedFanpages] });
            state.fanpages = state.fanpages.filter(f => !selectedFanpages.includes(f));

            saveData({ fanpages: true });
            updateFanpageList();
            showToast(`Đã xóa ${selectedFanpages.length} fanpage`, 'success');
            addLog(`Đã xóa ${selectedFanpages.length} fanpage`, 'info');
        }
    });
}

function loadMiniIframe(container, url) {
    const cachedIframe = getCachedIframeContent(url);
    if (cachedIframe) {
        container.innerHTML = cachedIframe;
        return;
    }
    const iframeHtml = `<iframe src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=60&height=60&show_text=false" width="60" height="60" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" loading="lazy"></iframe>`;
    container.innerHTML = iframeHtml;
    cacheIframeContent(url, iframeHtml);

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            container.innerHTML = iframeHtml;
            observer.disconnect();
        }
    }, { rootMargin: '100px' });
    observer.observe(container);
}

// Refactored getTypeLabel
function getTypeLabel(type) {
    return {
        'profile-pro': '⭐ Profile Pro',
        'profile': '👤 Trang cá nhân',
        'fanpage': '📌 Fanpage'
    }[type] || 'Không xác định';
}

// Refactored deleteFanpage
function deleteFanpage(fanpageId) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    saveBackup('deleteFanpage', { fanpage: { ...fanpage } });
    state.fanpages = state.fanpages.filter(f => f.id !== fanpageId);
    saveData({ fanpages: true });
    updateCounters();
    showToast(`Đã xóa fanpage ${fanpage.name}`, 'success');
    addLog(`Đã xóa fanpage ${fanpage.name} (ID: ${fanpage.id})`, 'info');
}

// Refactored renderLinks to use update functions
function renderLinks(tab) {
    const container = elements.linkLists[tab];
    if (!container) {
        console.error(`Không tìm thấy tab: ${tab}`);
        return;
    }

    container.innerHTML = '';

    let linksToRender = getLinksForCurrentTab();
    let searchQuery = '';
    if (state.dateFilter.searchQuery) {
        searchQuery = removeVietnameseTones(state.dateFilter.searchQuery.toLowerCase());
        linksToRender = linksToRender.filter(link => {
            const title = removeVietnameseTones((link.title || '').toLowerCase());
            const description = removeVietnameseTones((link.description || '').toLowerCase());
            return title.includes(searchQuery) || description.includes(searchQuery);
        });
    }

    const header = document.createElement('div');
    header.className = 'list-header';

    if (searchQuery) {
        header.innerHTML = `
      <div class="search-info">
        <i class="fas fa-search"></i>
        <span>Kết quả tìm kiếm cho: "${state.dateFilter.searchQuery}"</span>
        <span class="result-count">${linksToRender.length} kết quả</span>
        <button class="clear-search-btn">Xóa tìm kiếm</button>
      </div>
    `;

        header.querySelector('.clear-search-btn').addEventListener('click', () => {
            state.dateFilter.searchQuery = '';
            saveData({ dateFilter: true });
            renderTabContent(state.currentTab);
        });
    } else {
        const filterName = {
            'all': 'Tất cả',
            'group': 'Group',
            'photo': 'Photo',
            'story': 'Story',
            'video': 'Video',
            'reel': 'Reel',
            'post': 'Post',
            'duplicate': 'Trùng lặp',
            'blacklist': 'Blacklist',
            'note': 'Có ghi chú',
            'iframe': 'Iframe',
            'success': 'Thành công'
        }[state.currentFilter] || '';

        header.innerHTML = `
      <div class="filter-info">
        <i class="fas fa-filter"></i>
        <span>${filterName}</span>
        <span class="result-count">${linksToRender.length} kết quả</span>
      </div>
    `;
    }

    container.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.className = 'link-list-container';
    container.appendChild(listContainer);

    if (linksToRender.length === 0) {
        listContainer.innerHTML = `
      <div class="empty-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Không tìm thấy link nào phù hợp</p>
        ${searchQuery ?
                `<p>Với từ khóa: "${state.dateFilter.searchQuery}"</p>` :
                `<p>Với bộ lọc hiện tại</p>`}
      </div>
    `;
    } else if (tab === 'duplicate' || state.currentFilter === 'duplicate') {
        const urlGroups = {};
        linksToRender.forEach(l => {
            const baseUrl = l.url.split('?')[0];
            if (!urlGroups[baseUrl]) urlGroups[baseUrl] = [];
            urlGroups[baseUrl].push(l);
        });

        Object.entries(urlGroups).forEach(([url, links]) => {
            if (links.length > 1) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'grouped-duplicates';
                groupDiv.innerHTML = `<h4>${links.length} link trùng: ${url}</h4>`;

                const linksContainer = document.createElement('div');
                linksContainer.className = 'duplicates-container';

                links.forEach((link, index) => {
                    const linkItem = createLinkItem(link, index);
                    linksContainer.appendChild(linkItem);
                });

                groupDiv.appendChild(linksContainer);
                listContainer.appendChild(groupDiv);
            }
        });
    } else {
        linksToRender.forEach((link, index) => {
            const linkItem = createLinkItem(link, index);
            listContainer.appendChild(linkItem);
        });
    }

    updateCounters();
}



// === BỔ SUNG MÃ ĐÃ CHỈNH SỬA ===
function normalize(str) {
    return str
        .toLowerCase()
        .normalize('NFD')                // Tách dấu ra khỏi ký tự
        .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
        .replace(/[\s\-_.]/g, '');       // Bỏ khoảng trắng, gạch nối, gạch dưới, chấm
}

function showFilterKeywordsPopup() {
    const popup = document.createElement('div');
    popup.className = 'modal-overlay';
    popup.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3>Danh sách từ khóa lọc</h3>
                <button class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <input type="text" id="filter-keyword-input" placeholder="Nhập từ khóa mới..." style="width: 100%; margin-bottom: 10px;">
                <button id="save-filter-keyword" class="btn btn-primary">Lưu từ khóa</button>
                <div id="filter-keywords-list" style="margin-top: 15px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    const input = popup.querySelector('#filter-keyword-input');
    const saveBtn = popup.querySelector('#save-filter-keyword');
    const listEl = popup.querySelector('#filter-keywords-list');

    function renderKeywordList() {
        listEl.innerHTML = '';
        (state.filterKeywords || []).forEach((word, i) => {
            const el = document.createElement('div');
            el.innerHTML = `${word} <button data-index="${i}" class="btn btn-sm">X</button>`;
            el.querySelector('button').onclick = () => {
                state.filterKeywords.splice(i, 1);
                localStorage.setItem('filterKeywords', JSON.stringify(state.filterKeywords));
                renderKeywordList();
            };
            listEl.appendChild(el);
        });
    }

    saveBtn.onclick = () => {
        const newWord = input.value.trim();
        if (newWord && !state.filterKeywords.includes(newWord)) {
            state.filterKeywords.push(newWord);
            localStorage.setItem('filterKeywords', JSON.stringify(state.filterKeywords));
            input.value = '';
            renderKeywordList();
        }
    };

    popup.querySelector('.modal-close').onclick = () => document.body.removeChild(popup);
    popup.onclick = e => e.target === popup && document.body.removeChild(popup);

    state.filterKeywords = JSON.parse(localStorage.getItem('filterKeywords') || '[]');
    renderKeywordList();
}

function filterByKeywords(urlsOrItems) {
    const keywords = (state.filterKeywords || []).map(normalize);
    return urlsOrItems.filter(item => {
        const str = typeof item === 'string' ? item : JSON.stringify(item);
        const normStr = normalize(str);
        return !keywords.some(kw => normStr.includes(kw));
    });
}

init();

// Refactored showLinkDetailsPopup
function showLinkDetailsPopup(link) {
    const popup = document.createElement('div');
    popup.className = 'modal-overlay';
    popup.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>Chi tiết bài viết</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <input type="text" id="post-url-input" placeholder="Nhập URL bài viết mới..." value="${link.url}">
          <button id="copy-shortcuts-btn" class="btn btn-primary">Copy & Shortcuts</button>
        </div>
        <div class="form-row">
          <input type="text" id="image-url-input" placeholder="Nhập URL ảnh mới..." value="${link.image}">
          <button id="paste-image-btn" class="btn btn-primary">Dán & Cập nhật</button>
        </div>
        <div class="button-row">
          <button id="delete-btn" class="btn btn-danger">Xóa</button>
          <button id="close-btn" class="btn btn-secondary">Đóng</button>
        </div>
        <div class="fb-post-wrapper">
          <div class="fb-post-container">
            <div class="fb-post" data-href="${link.url}" data-width="500" data-show-text="true" data-adapt-container-width="true"></div>
          </div>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(popup);

    const adjustPostSize = () => {
        const wrapper = popup.querySelector('.fb-post-wrapper');
        const container = popup.querySelector('.fb-post-container');
        const iframe = popup.querySelector('.fb-post iframe');
        if (!iframe || !container || !wrapper) return;

        const wW = wrapper.clientWidth;
        const wH = wrapper.clientHeight;
        const iW = iframe.clientWidth || 600;
        const iH = iframe.clientHeight || 600;

        const scale = Math.min(wW / iW, wH / iH);
        container.style.transform = `scale(${scale})`;
        container.style.width = `${100 / scale}%`;
        container.style.height = `${100 / scale}%`;
    };

    const waitForIframe = () => {
        const iframe = popup.querySelector('.fb-post iframe');
        if (iframe) {
            iframe.onload = () => setTimeout(adjustPostSize, 300);
            adjustPostSize();
        } else {
            setTimeout(waitForIframe, 200);
        }
    };

    const resizeObserver = new ResizeObserver(adjustPostSize);
    resizeObserver.observe(popup.querySelector('.fb-post-wrapper'));

    const closePopup = () => {
        resizeObserver.disconnect();
        popup.remove();
    };

    // Nút Copy & Shortcuts
    popup.querySelector('#copy-shortcuts-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const shortcutsUrl = `shortcuts://run-shortcut?name=111&input=text&text=${encodeURIComponent(link.url)}`;
        window.open(shortcutsUrl, '_blank');
        navigator.clipboard.writeText(link.url);
    });

    // Nút Dán & Cập nhật
    popup.querySelector('#paste-image-btn').addEventListener('click', async () => {
        const imageInput = popup.querySelector('#image-url-input');
        let clipboardImageUrl = '';

        try {
            clipboardImageUrl = await navigator.clipboard.readText();
        } catch (err) {
            console.log('Clipboard error:', err.message);
        }

        imageInput.value = clipboardImageUrl;
        const newImageUrl = imageInput.value.trim();

        saveBackup('updateImage', {
            linkId: link.id,
            oldImage: link.image,
            newImage: newImageUrl
        });

        link.image = newImageUrl;
        saveData({ links: true });
        updateLinkItem(link);
        closePopup();
        showToast('Đã cập nhật ảnh', 'success');
    });

    // Nút Xóa
    popup.querySelector('#delete-btn').addEventListener('click', () => {
        if (confirm(`Xóa link: ${link.url}?`)) {
            saveBackup('deleteLinks', { links: [{ ...link }] });
            state.links = state.links.filter(l => l.id !== link.id);
            saveData({ links: true });
            updateCounters();
            showToast(`Đã xóa link ${link.url}`, 'success');
            addLog(`Đã xóa link ${link.url} (ID: ${link.id})`, 'info');
            closePopup();
        }
    });

    // Nút Đóng
    popup.querySelector('#close-btn').addEventListener('click', closePopup);
    popup.querySelector('.modal-close').addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => {
        if (e.target === popup) closePopup();
    });

    if (!window.FB) {
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/vi_VN/sdk.js#xfbml=1&version=v12.0&appId=YOUR_APP_ID';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            window.FB.XFBML.parse(popup, () => setTimeout(waitForIframe, 500));
        };
        document.body.appendChild(script);
    } else {
        window.FB.XFBML.parse(popup, () => setTimeout(waitForIframe, 500));
    }
}

// Refactored renderFanpageTab
function renderFanpageTab() {
    const container = elements.linkLists['fanpage'];
    if (!container) {
        addLog('Không tìm thấy container fanpage-tab', 'error');
        return;
    }

    container.innerHTML = `
    <div class="fanpage-controls">
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="fanpage">Fanpage</button>
        <button class="filter-btn" data-filter="profile">Cá nhân</button>
        <button class="filter-btn" data-filter="profile-pro">Pro</button>
        <button class="filter-btn" data-filter="duplicate">Trùng</button>
      </div>
      <div class="action-buttons">
        <button class="export-btn" id="export-fanpage-json">Xuất</button>
      </div>
    </div>
    <div class="selection-bar">
      <input type="checkbox" id="select-all-fanpages">
      <span class="selection-info">All</span>
      <span class="selection-count">0/${state.fanpages.length}</span>
      <button class="delete-selected-btn" disabled>Xóa</button>
    </div>
    <div class="fanpage-list"></div>
  `;

    const listContainer = container.querySelector('.fanpage-list');
    let currentFilter = 'all';

    const updateFanpageList = () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        listContainer.innerHTML = '';

        filteredFanpages.forEach((fanpage, index) => {
            const item = document.createElement('div');
            item.className = `link-item ${fanpage.checked ? 'checked' : ''}`;
            item.dataset.id = fanpage.id;

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

            listContainer.appendChild(item);
            loadMiniIframe(item.querySelector('.fanpage-iframe-mini'), fanpage.url);

            // Sự kiện checkbox
            const checkbox = item.querySelector('.link-checkbox');
            checkbox.addEventListener('change', () => {
                fanpage.checked = checkbox.checked;
                updateSelectionBar(filteredFanpages);
                saveData({ fanpages: true });
                item.classList.toggle('checked', fanpage.checked);
            });

            // Sự kiện click vào item (toggle checkbox)
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.link-checkbox') && !e.target.closest('.link-actions')) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            // Sự kiện nút chỉnh sửa
            item.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                showEditFanpagePopup(fanpage);
            });

            // Sự kiện nút STT (Xóa fanpage)
            item.querySelector('.link-index').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Xóa fanpage: ${fanpage.url}?`)) {
                    deleteFanpage(fanpage.id);
                }
            });
        });
    };

    const updateSelectionBar = (fanpages) => {
        const selectedCount = fanpages.filter(f => f.checked).length;
        const totalCount = fanpages.length;

        container.querySelector('.selection-count').textContent = `${selectedCount}/${totalCount}`;
        container.querySelector('.delete-selected-btn').disabled = selectedCount === 0;

        const selectAllCheckbox = container.querySelector('#select-all-fanpages');
        if (selectedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedCount === totalCount) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    };

    // Initial render
    updateFanpageList();

    // Filter buttons
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            updateFanpageList();
        });
    });

    // Export button
    container.querySelector('#export-fanpage-json').addEventListener('click', () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        exportFanpagesToJSON(filteredFanpages);
    });

    // Select all checkbox
    container.querySelector('#select-all-fanpages').addEventListener('change', function () {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        const isChecked = this.checked;

        filteredFanpages.forEach(fanpage => {
            fanpage.checked = isChecked;
        });

        saveData({ fanpages: true });
        updateFanpageList();
    });

    // Delete selected button
    container.querySelector('.delete-selected-btn').addEventListener('click', () => {
        const filteredFanpages = getFilteredFanpages(currentFilter);
        const selectedFanpages = filteredFanpages.filter(f => f.checked);

        if (selectedFanpages.length === 0) return;

        if (confirm(`Bạn có chắc muốn xóa ${selectedFanpages.length} fanpage đã chọn?`)) {
            saveBackup('deleteFanpages', { fanpages: [...selectedFanpages] });
            state.fanpages = state.fanpages.filter(f => !selectedFanpages.includes(f));

            saveData({ fanpages: true });
            updateFanpageList();
            showToast(`Đã xóa ${selectedFanpages.length} fanpage`, 'success');
            addLog(`Đã xóa ${selectedFanpages.length} fanpage`, 'info');
        }
    });
}

// Refactored loadMiniIframe
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

// Refactored getTypeLabel
function getTypeLabel(type) {
    return {
        'profile-pro': '⭐ Profile Pro',
        'profile': '👤 Trang cá nhân',
        'fanpage': '📌 Fanpage'
    }[type] || 'Không xác định';
}

// Refactored deleteFanpage
function deleteFanpage(fanpageId) {
    const fanpage = state.fanpages.find(f => f.id === fanpageId);
    if (!fanpage) return;

    saveBackup('deleteFanpage', { fanpage: { ...fanpage } });
    state.fanpages = state.fanpages.filter(f => f.id !== fanpageId);
    saveData({ fanpages: true });
    updateCounters();
    showToast(`Đã xóa fanpage ${fanpage.name}`, 'success');
    addLog(`Đã xóa fanpage ${fanpage.name} (ID: ${fanpage.id})`, 'info');
}

function addLog(message, type) {
    const log = {
        id: Date.now(),
        message,
        type,
        timestamp: new Date().toLocaleString()
    };
    state.logs.unshift(log); // Thêm log mới vào đầu
    if (state.logs.length > 20) {
        state.logs = state.logs.slice(0, 20); // Giới hạn 20 log
    }
    saveData({ logs: true });
}

// Refactored renderTabContent to use update functions
function renderTabContent(tab) {
    if (state.disableRender) {
        console.log(`[renderTabContent] Đã bỏ qua render vì disableRender = true (tab: ${tab})`);
        return;
    }

    switch (tab) {
        case 'fanpage':
            renderFanpageTab();
            break;
        case 'date-filter':
            renderDateFilterTab();
            break;
        case 'log':
            renderLogs();
            break;
        default:
            renderLinks(tab);
            break;
    }
}

// Refactored renderLinks to use update functions
function renderLinks(tab) {
    const container = elements.linkLists[tab];
    if (!container) {
        console.error(`Không tìm thấy tab: ${tab}`);
        return;
    }

    container.innerHTML = '';

    let linksToRender = getLinksForCurrentTab();
    let searchQuery = '';
    if (state.dateFilter.searchQuery) {
        searchQuery = removeVietnameseTones(state.dateFilter.searchQuery.toLowerCase());
        linksToRender = linksToRender.filter(link => {
            const title = removeVietnameseTones((link.title || '').toLowerCase());
            const description = removeVietnameseTones((link.description || '').toLowerCase());
            return title.includes(searchQuery) || description.includes(searchQuery);
        });
    }

    const header = document.createElement('div');
    header.className = 'list-header';

    if (searchQuery) {
        header.innerHTML = `
      <div class="search-info">
        <i class="fas fa-search"></i>
        <span>Kết quả tìm kiếm cho: "${state.dateFilter.searchQuery}"</span>
        <span class="result-count">${linksToRender.length} kết quả</span>
        <button class="clear-search-btn">Xóa tìm kiếm</button>
      </div>
    `;

        header.querySelector('.clear-search-btn').addEventListener('click', () => {
            state.dateFilter.searchQuery = '';
            saveData({ dateFilter: true });
            renderTabContent(state.currentTab);
        });
    } else {
        const filterName = {
            'all': 'Tất cả',
            'group': 'Group',
            'photo': 'Photo',
            'story': 'Story',
            'video': 'Video',
            'reel': 'Reel',
            'post': 'Post',
            'duplicate': 'Trùng lặp',
            'blacklist': 'Blacklist',
            'note': 'Có ghi chú',
            'iframe': 'Iframe',
            'success': 'Thành công'
        }[state.currentFilter] || '';

        header.innerHTML = `
      <div class="filter-info">
        <i class="fas fa-filter"></i>
        <span>${filterName}</span>
        <span class="result-count">${linksToRender.length} kết quả</span>
      </div>
    `;
    }

    container.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.className = 'link-list-container';
    container.appendChild(listContainer);

    if (linksToRender.length === 0) {
        listContainer.innerHTML = `
      <div class="empty-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Không tìm thấy link nào phù hợp</p>
        ${searchQuery ?
                `<p>Với từ khóa: "${state.dateFilter.searchQuery}"</p>` :
                `<p>Với bộ lọc hiện tại</p>`}
      </div>
    `;
    } else if (tab === 'duplicate' || state.currentFilter === 'duplicate') {
        const urlGroups = {};
        linksToRender.forEach(l => {
            const baseUrl = l.url.split('?')[0];
            if (!urlGroups[baseUrl]) urlGroups[baseUrl] = [];
            urlGroups[baseUrl].push(l);
        });

        Object.entries(urlGroups).forEach(([url, links]) => {
            if (links.length > 1) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'grouped-duplicates';
                groupDiv.innerHTML = `<h4>${links.length} link trùng: ${url}</h4>`;

                const linksContainer = document.createElement('div');
                linksContainer.className = 'duplicates-container';

                links.forEach((link, index) => {
                    const linkItem = createLinkItem(link, index);
                    linksContainer.appendChild(linkItem);
                });

                groupDiv.appendChild(linksContainer);
                listContainer.appendChild(groupDiv);
            }
        });
    } else {
        linksToRender.forEach((link, index) => {
            const linkItem = createLinkItem(link, index);
            listContainer.appendChild(linkItem);
        });
    }

    updateCounters();
}

// Utility function to update the DOM for a single link
function updateLinkItem(link) {
    const item = document.querySelector(`.link-item[data-id="${link.id}"]`);
    if (!item) return;

    // Update checkbox
    const checkbox = item.querySelector('.link-checkbox');
    if (checkbox) checkbox.checked = link.checked;
    item.classList.toggle('checked', link.checked);

    // Update status if needed
    const statusElement = item.querySelector('.link-status');
    if (statusElement) {
        statusElement.className = `link-status status-${link.blacklistStatus === 'blacklisted' ? 'blacklist' : link.status}`;
        statusElement.innerHTML = link.blacklistStatus === 'blacklisted'
            ? '<span class="blacklist-text">Blacklist</span>'
            : link.status === 'success' ? 'Thành công'
                : link.status === 'iframe' ? 'Hiển thị iframe'
                    : link.status === 'login' ? 'Yêu cầu đăng nhập'
                        : link.status === 'link_hỏng' ? 'Link hỏng'
                            : link.status === 'error' ? 'Lỗi' : 'Không xác định';
    }

    // Update note if needed
    if (link.note) {
        const noteElement = item.querySelector('.note-text');
        if (noteElement) {
            noteElement.textContent = link.note;
        }
    }
}

// Refactored toggleCheckbox (keep as reference)
function toggleCheckbox(link) {
    saveBackup('checkbox', { linkId: link.id, checked: link.checked });
    link.checked = !link.checked;
    saveData({ links: true });
    updateLinkItem(link);
    updateCounters();
}

// Refactored showNoteDialog
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
        <input type="text" id="note-input" placeholder="Nhập ghi chú..." value="${link.note || ''}">
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
        updateLinkItem(link);
        showToast('Đã lưu ghi chú', 'success');
        addLog(`Đã thêm ghi chú cho link: ${link.url} (ID: ${link.id})`, 'info');
        document.body.removeChild(dialog);
    });

    cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
    closeBtn.addEventListener('click', () => document.body.removeChild(dialog));
}

function deleteSelected() {
    const selectedLinks = getLinksForCurrentTab().filter(link => link.checked);
    if (selectedLinks.length > 0) {
        if (confirm(`Bạn có chắc muốn xóa ${selectedLinks.length} link đã chọn?`)) {
            saveBackup('deleteLinks', { links: selectedLinks });
            state.links = state.links.filter(link => !selectedLinks.includes(link));
            saveData({ links: true });
            renderTabContent(state.currentTab); // Thêm để cập nhật giao diện
            updateCounters();
            showToast(`Đã xóa ${selectedLinks.length} link`, 'success');
            addLog(`Đã xóa ${selectedLinks.length} link`, 'info');
        }
        return;
    }

    // Handle duplicate deletion
    const urlGroups = {};
    state.links.forEach(l => {
        if (!urlGroups[l.url]) urlGroups[l.url] = [];
        urlGroups[l.url].push(l);
    });

    const duplicateLinks = Object.values(urlGroups)
        .filter(group => group.length > 1)
        .flatMap(group => group.slice(1));

    if (duplicateLinks.length === 0) {
        showToast('Không tìm thấy link trùng lặp để xóa', 'warning');
        return;
    }

    if (confirm(`Tìm thấy ${duplicateLinks.length} link trùng lặp. Bạn có muốn xóa chúng không?`)) {
        saveBackup('deleteLinks', { links: duplicateLinks });
        state.links = state.links.filter(link => !duplicateLinks.includes(link));
        saveData({ links: true });
        renderTabContent(state.currentTab); // Thêm để cập nhật giao diện
        updateCounters();
        showToast(`Đã xóa ${duplicateLinks.length} link trùng lặp`, 'success');
        addLog(`Đã xóa ${duplicateLinks.length} link trùng lặp`, 'info');
    }
}


// Refactored retryLink
function retryLink(id) {
    const link = state.links.find(l => l.id === id);
    if (!link) return;

    saveBackup('retryLink', { linkId: id, link: { ...link } });
    link.status = 'pending';
    link.title = 'Đang trích xuất lại...';
    saveData({ links: true });
    updateLinkItem(link);
    setTimeout(() => extractContent(link.url), 0);
    addLog(`Đang thử lại link: ${link.url} (ID: ${link.id})`, 'info');
}

// Refactored extractContent
async function extractContent(url) {
    const link = state.links.find(l => l.url === url);
    if (!link) return;

    const tryExtract = async () => {
        try {
            const startTime = Date.now();
            const fetchUrl = `${config.corsProxy}${encodeURIComponent(url)}`;

            const response = await fetch(fetchUrl, {
                signal: AbortSignal.timeout(config.requestTimeout)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const proxyData = await response.json();
            const htmlContent = proxyData.contents;
            if (!htmlContent) throw new Error('Không có nội dung trả về');

            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
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
        } catch (err) {
            throw err;
        }
    };

    try {
        const result = await tryExtract();

        link.title = result.title;
        link.description = result.description;
        link.image = result.image;
        link.post_type = link.post_type && link.post_type !== 'unknown' ? link.post_type : determinePostType(url);
        link.processingTime = result.processingTime;

        const html = result.htmlContent.toLowerCase();

        if (link.image === config.defaultImage || link.image.includes('facebook.com/plugins/')) {
            link.status = 'iframe';
            link.image = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=300&show_text=true`;
        }
        else if (link.description || link.image !== config.defaultImage) {
            link.status = 'success';
        } else if (html.includes('login')) {
            link.status = 'login';
            link.title = 'Yêu cầu đăng nhập';
            link.description = 'Bài viết hạn chế yêu cầu đăng nhập để xem nội dung';
        } else if (html.includes('content not found') || html.includes('unavailable') || html.includes('removed')) {
            link.status = 'link_hỏng';
            link.title = 'Bài viết lỗi';
            link.description = 'Không có nội dung';
        } else {
            link.status = 'error';
            link.title = 'Bài viết lỗi';
            link.description = 'Không có nội dung';
        }

        addLog(`Đã trích xuất thành công: ${url} (ID: ${link.id})`, 'success');
    } catch (error) {
        link.title = 'Bài viết lỗi';
        link.description = 'Không có nội dung';
        link.image = config.defaultImage;
        link.status = 'iframe';
        link.post_type = link.post_type && link.post_type !== 'unknown' ? link.post_type : determinePostType(url);

        addLog(`Lỗi khi trích xuất qua proxy ${url} (ID: ${link.id}): ${error.message}`, 'error');
    } finally {
        saveData({ links: true });
        updateLinkItem(link);
    }
}


// Refactored toggleSelectAll
function toggleSelectAll() {
    if (state.currentTab === 'fanpage') {
        const fanpagesToToggle = getFilteredFanpages(currentFilter);
        const allChecked = fanpagesToToggle.every(f => f.checked);

        saveBackup('selectAllFanpages', { fanpages: fanpagesToToggle });
        fanpagesToToggle.forEach(f => f.checked = !allChecked);

        saveData({ fanpages: true });
        updateCounters();

        showToast(`Đã ${allChecked ? 'bỏ chọn' : 'chọn'} tất cả ${fanpagesToToggle.length} fanpage`, 'info');
        addLog(`Đã ${allChecked ? 'bỏ chọn' : 'chọn'} tất cả ${fanpagesToToggle.length} fanpage`, 'info');
    } else {
        const linksToToggle = getLinksForCurrentTab();
        const allChecked = linksToToggle.every(l => l.checked);

        saveBackup('selectAll', { links: linksToToggle });
        linksToToggle.forEach(link => {
            link.checked = !allChecked;
            updateLinkItem(link);
        });

        saveData({ links: true });
        updateCounters();
        addLog(`Đã ${allChecked ? 'bỏ chọn' : 'chọn'} tất cả ${linksToToggle.length} link trong tab ${state.currentTab}`, 'info');

        if (!allChecked && linksToToggle.length > 0) {
            showSelectionActionsDialog(linksToToggle.length);
        }
    }
}

// Refactored showSettingsDialog
function showSettingsDialog(link) {
    const dialog = document.createElement('div');
    dialog.className = 'settings-modal-overlay';
    dialog.innerHTML = `
    <div class="settings-modal-dialog">
      <div class="settings-modal-header">
        <h3>Cài đặt Link</h3>
        <button class="settings-modal-close">×</button>
      </div>
      <div class="settings-modal-body">
        <div class="form-group">
          <label>URL bài viết:</label>
          <input type="text" id="link-url-input" value="${link.url}" class="form-control">
        </div>
        <div class="form-group">
          <label>URL ảnh:</label>
          <input type="text" id="link-image-input" value="${link.image}" class="form-control">
        </div>
        <div class="form-group">
          <label>Ghi chú hiện tại:</label>
          <p>${link.note || 'Không có ghi chú'}</p>
        </div>
        <div class="form-group">
          <label>Trạng thái:</label>
          <p>${link.blacklistStatus === 'blacklisted' ? 'Đang trong blacklist' : 'Bình thường'}</p>
        </div>
      </div>
      <div class="settings-modal-footer">
        <button id="settings-save" class="settings-btn btn-primary">Lưu</button>
        <button id="settings-cancel" class="settings-btn btn-secondary">Hủy</button>
        <button id="settings-note" class="settings-btn btn-secondary">Ghi chú</button>
        ${link.blacklistStatus === 'active' ?
            '<button id="settings-blacklist" class="settings-btn btn-danger">Blacklist</button>' :
            '<button id="settings-unblacklist" class="settings-btn btn-success">Gỡ Blacklist</button>'}
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    const urlInput = dialog.querySelector('#link-url-input');
    const imageInput = dialog.querySelector('#link-image-input');
    const saveBtn = dialog.querySelector('#settings-save');
    const cancelBtn = dialog.querySelector('#settings-cancel');
    const noteBtn = dialog.querySelector('#settings-note');
    const blacklistBtn = dialog.querySelector('#settings-blacklist');
    const unblacklistBtn = dialog.querySelector('#settings-unblacklist');
    const closeBtn = dialog.querySelector('.settings-modal-close');

    saveBtn.addEventListener('click', () => {
        const newUrl = urlInput.value.trim();
        const newImage = imageInput.value.trim();

        if (!isValidUrl(newUrl)) {
            showToast('URL bài viết không hợp lệ', 'warning');
            return;
        }
        if (newImage && !isValidUrl(newImage)) {
            showToast('URL ảnh không hợp lệ', 'warning');
            return;
        }

        saveBackup('editLink', { linkId: link.id, url: link.url, image: link.image });

        link.url = newUrl;
        link.image = newImage || config.defaultImage;
        link.post_type = determinePostType(newUrl);

        saveData({ links: true });
        updateLinkItem(link);
        updateCounters();

        showToast('Đã cập nhật link', 'success');
        addLog(`Đã cập nhật link: ${link.url} (ID: ${link.id})`, 'info');
        document.body.removeChild(dialog);
    });

    cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));
    closeBtn.addEventListener('click', () => document.body.removeChild(dialog));

    noteBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
        showNoteDialog(link);
    });

    if (blacklistBtn) {
        blacklistBtn.addEventListener('click', () => {
            saveBackup('blacklist', { linkId: link.id, blacklistStatus: link.blacklistStatus });
            link.blacklistStatus = 'blacklisted';
            saveData({ links: true });
            updateLinkItem(link);
            updateCounters();
            showToast(`Đã chặn link: ${link.url}`, 'success');
            addLog(`Đã chặn link ${link.url} (ID: ${link.id})`, 'info');
            document.body.removeChild(dialog);
        });
    }

    if (unblacklistBtn) {
        unblacklistBtn.addEventListener('click', () => {
            saveBackup('blacklist', { linkId: link.id, blacklistStatus: link.blacklistStatus });
            link.blacklistStatus = 'active';
            saveData({ links: true });
            updateLinkItem(link);
            updateCounters();
            showToast(`Đã gỡ chặn link: ${link.url}`, 'success');
            addLog(`Đã gỡ chặn link ${link.url} (ID: ${link.id})`, 'info');
            document.body.removeChild(dialog);
        });
    }
}

// Refactored showAddLinkDialog
function showAddLinkDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
    <div class="modal-dialog" style="width: 420px; padding-top: 20px;">
      <div class="modal-header">
        <h3>Nhập danh sách link</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="input-row" style="margin-bottom: 12px;">
          <textarea id="new-links-input"
                    class="modal-textarea"
                    placeholder="URL mỗi dòng..."
                    style="width: 100%; height: 60px; resize: none; padding: 6px; font-size: 13px;"></textarea>
        </div>

        <div class="config-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <label style="width: 100px; font-size: 14px;">GitHub Token:</label>
          <input type="text" id="github-token-input" value="${config.githubToken}" style="flex: 1; padding: 6px; font-size: 13px;">
          <button id="confirm-token-btn" class="btn" style="width: 60px; padding: 6px 0; font-size: 13px;">Lưu</button>
        </div>

        <div class="config-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <label style="width: 100px; font-size: 14px;">Gist ID:</label>
          <input type="text" id="github-id-input" value="${config.fanpageGistUrl?.split('/').pop() || ''}" style="flex: 1; padding: 6px; font-size: 13px;">
          <button id="confirm-id-btn" class="btn" style="width: 60px; padding: 6px 0; font-size: 13px;">Lưu</button>
        </div>

        <div class="action-buttons" style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
          <button id="add-links-confirm" class="btn btn-add">Thêm</button>
          <button id="import-json-lines" class="btn btn-item">Item</button>
          <button id="import-json-array" class="btn btn-all">All</button>
          <button id="filter-keyword-btn" class="btn btn-block">Block</button>
          <button id="add-links-cancel" class="btn btn-cancel">Huỷ</button>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    // Các sự kiện nút
    dialog.querySelector('#confirm-token-btn').onclick = () => {
        const token = dialog.querySelector('#github-token-input').value.trim();
        if (token) {
            config.githubToken = token;
            localStorage.setItem('githubToken', token);
            showToast('Đã lưu token', 'success');
        }
    };

    dialog.querySelector('#confirm-id-btn').onclick = () => {
        const id = dialog.querySelector('#github-id-input').value.trim();
        if (id) {
            config.fanpageGistUrl = `https://api.github.com/gists/${id}`;
            localStorage.setItem('fanpageGistUrl', config.fanpageGistUrl);
            showToast('Đã lưu Gist ID', 'success');
        }
    };

    dialog.querySelector('#add-links-cancel').onclick = () => document.body.removeChild(dialog);
    dialog.querySelector('.modal-close').onclick = () => document.body.removeChild(dialog);
    dialog.querySelector('#filter-keyword-btn').onclick = () => showFilterKeywordsPopup();

    dialog.querySelector('#import-json-lines').onclick = () => {
        importLinksFromJsonLines();
        document.body.removeChild(dialog);
    };
    dialog.querySelector('#import-json-array').onclick = () => {
        importFromJSON();
        document.body.removeChild(dialog);
    };

    dialog.querySelector('#add-links-confirm').onclick = () => {
        const urls = dialog.querySelector('#new-links-input').value.trim().split('\n').map(l => l.trim()).filter(Boolean);
        const filteredUrls = filterByKeywords(urls);
        if (filteredUrls.length === 0) {
            showToast('Không có link nào sau lọc', 'warning');
            return;
        }

        const newLinks = [];
        filteredUrls.forEach(url => {
            if (!isLinkExists(url)) {
                const newLink = {
                    id: generateId(),
                    url,
                    title: 'Đang xử lý...',
                    description: '',
                    image: '',
                    status: 'pending',
                    post_type: determinePostType(url),
                    date: new Date().toISOString(),
                    checked: false,
                    blacklistStatus: 'active',
                    note: ''
                };
                newLinks.push(newLink);
                setTimeout(() => extractContent(url), 0);
                addLog(`Đã thêm link: ${url}`, 'info');
            }
        });

        if (newLinks.length > 0) {
            state.links.unshift(...newLinks);
            saveBackup('addLinks', { links: newLinks });
            saveData({ links: true });
            updateCounters();
            showToast(`Đã thêm ${newLinks.length} link`, 'success');
        }
        document.body.removeChild(dialog);
    };
}

// Refactored deleteSelectedFanpages
function deleteSelectedFanpages() {
    const selectedFanpages = state.fanpages.filter(f => f.checked);
    if (selectedFanpages.length === 0) {
        showToast('Không có fanpage nào được chọn', 'warning');
        return;
    }

    if (confirm(`Bạn có chắc muốn xóa ${selectedFanpages.length} fanpage đã chọn?`)) {
        saveBackup('deleteFanpages', { fanpages: [...selectedFanpages] });
        state.fanpages = state.fanpages.filter(f => !f.checked);

        // Reset tất cả checkbox
        state.fanpages.forEach(f => f.checked = false);

        saveData({ fanpages: true });
        updateCounters();
        showToast(`Đã xóa ${selectedFanpages.length} fanpage`, 'success');
        addLog(`Đã xóa ${selectedFanpages.length} fanpage`, 'info');
    }
}

// Refactored showAddFanpageDialog
function showAddFanpageDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'add-fanpage-modal-overlay';
    dialog.innerHTML = `
    <div class="add-fanpage-modal-dialog">
      <div class="add-fanpage-modal-header">
        <h3>Thêm Fanpage/Profile</h3>
        <button class="add-fanpage-modal-close">×</button>
      </div>
      <div class="add-fanpage-modal-body">
        <div class="add-fanpage-form-group">
          <label>URL Fanpage/Profile</label>
          <input type="text" id="fanpage-url" placeholder="Nhập URL" class="add-fanpage-form-control">
        </div>
        <div class="add-fanpage-form-group">
          <label>Tiêu đề</label>
          <div class="title-input-group">
            <input type="text" id="fanpage-title" placeholder="Nhập tiêu đề" class="add-fanpage-form-control">
            <button id="edit-title-btn" class="btn-edit" title="Sửa tiêu đề">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>
        <div class="add-fanpage-form-group">
          <label>Loại Profile</label>
          <div class="profile-selector">
            <button class="profile-btn active" data-type="fanpage"><i class="fas fa-flag"></i> Fanpage</button>
            <button class="profile-btn" data-type="profile"><i class="fas fa-user"></i> Cá nhân</button>
            <button class="profile-btn" data-type="profile-pro"><i class="fas fa-star"></i> Pro</button>
          </div>
        </div>
      </div>
      <div class="add-fanpage-modal-footer">
        <button id="import-fanpage-json" class="add-fanpage-btn btn-secondary">Nhập JSON</button>
        <button id="cancel-add-fanpage" class="add-fanpage-btn btn-secondary">Hủy</button>
        <button id="confirm-add-fanpage" class="add-fanpage-btn btn-primary">Thêm</button>
      </div>
    </div>
  `;
    document.body.appendChild(dialog);

    let selectedType = 'fanpage';

    dialog.querySelectorAll('.profile-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            dialog.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedType = this.dataset.type;
        });
    });

    dialog.querySelector('#edit-title-btn').addEventListener('click', () => {
        dialog.querySelector('#fanpage-title').focus();
    });

    dialog.querySelector('#confirm-add-fanpage').addEventListener('click', () => {
        const url = dialog.querySelector('#fanpage-url').value.trim();
        const title = dialog.querySelector('#fanpage-title').value.trim();

        if (!isValidUrl(url)) return showToast('URL không hợp lệ', 'warning');
        if (!title) return showToast('Vui lòng nhập tiêu đề', 'warning');
        if (isFanpageExists(url)) {
            if (!confirm(`Fanpage ${url} đã tồn tại. Ghi đè?`)) return showToast('Đã hủy thêm fanpage', 'warning');
            state.fanpages = state.fanpages.filter(f => f.url.split('?')[0] !== url.split('?')[0]);
        }

        const newFanpage = {
            id: generateId(),
            url,
            name: title,
            description: '',
            type: selectedType,
            date: new Date().toISOString(),
            checked: false,
            status: 'pending',
            thumbnail: config.defaultImage
        };

        state.fanpages.unshift(newFanpage);
        saveBackup('addFanpages', { fanpages: [newFanpage] });
        saveData({ fanpages: true });
        updateCounters();
        showToast(`Đã thêm ${selectedType === 'fanpage' ? 'Fanpage' : 'Profile'} mới`, 'success');
        addLog(`Đã thêm fanpage: ${title} (ID: ${newFanpage.id})`, 'success');
        document.body.removeChild(dialog);
    });

    dialog.querySelector('#import-fanpage-json').addEventListener('click', () => {
        importFanpagesFromJSON();
        document.body.removeChild(dialog);
    });

    dialog.querySelector('#cancel-add-fanpage').addEventListener('click', () => document.body.removeChild(dialog));
    dialog.querySelector('.add-fanpage-modal-close').addEventListener('click', () => document.body.removeChild(dialog));
}

function showEditFanpagePopup(fanpage) {
    // Tạo popup overlay
    const popup = document.createElement('div');
    popup.className = 'edit-fanpage-modal-overlay';

    // HTML nội dung popup
    popup.innerHTML = `
    <div class="edit-fanpage-modal-dialog">
      <div class="edit-fanpage-modal-header">
        <span>🛠️ Sửa Fanpage</span>
        <button class="edit-fanpage-modal-close">×</button>
      </div>
      <div class="edit-fanpage-modal-body">
        <div class="edit-fanpage-form-row">
          <span>🔗</span>
          <input type="text" id="edit-fanpage-url" value="${fanpage.url}" 
                 class="edit-fanpage-form-control" placeholder="URL Fanpage">
        </div>
        <div class="edit-fanpage-form-row">
          <span>📝</span>
          <input type="text" id="edit-fanpage-title" value="${fanpage.name}" 
                 class="edit-fanpage-form-control" placeholder="Tên Fanpage">
        </div>
        <div class="edit-fanpage-form-row">
          <span>💬</span>
          <textarea id="edit-fanpage-description" class="edit-fanpage-form-control"
                    placeholder="Mô tả">${fanpage.description || ''}</textarea>
        </div>
        <div class="edit-fanpage-btn-group">
          <button class="edit-fanpage-type-btn ${fanpage.type === 'fanpage' ? 'active' : ''}" 
                  data-type="fanpage" title="Fanpage thông thường">
            <i class="fas fa-flag"></i> Fanpage
          </button>
          <button class="edit-fanpage-type-btn ${fanpage.type === 'profile' ? 'active' : ''}" 
                  data-type="profile" title="Trang cá nhân">
            <i class="fas fa-user"></i> Cá nhân
          </button>
          <button class="edit-fanpage-type-btn ${fanpage.type === 'profile-pro' ? 'active' : ''}" 
                  data-type="profile-pro" title="Trang cá nhân Pro">
            <i class="fas fa-star"></i> Pro
          </button>
        </div>
      </div>
      <div class="edit-fanpage-modal-footer">
        <button id="delete-fanpage" class="edit-fanpage-btn btn-danger" title="Xóa fanpage">
          <i class="fas fa-trash"></i> Xóa
        </button>
        <div class="edit-fanpage-action-buttons">
          <button id="cancel-edit" class="edit-fanpage-btn btn-secondary">
            <i class="fas fa-times"></i> Hủy
          </button>
          <button id="save-fanpage" class="edit-fanpage-btn btn-primary">
            <i class="fas fa-save"></i> Lưu
          </button>
        </div>
      </div>
    </div>
  `;

    // Thêm popup vào DOM
    document.body.appendChild(popup);

    // Xử lý sự kiện chọn loại fanpage
    popup.querySelectorAll('.edit-fanpage-type-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            // Bỏ active tất cả các nút
            popup.querySelectorAll('.edit-fanpage-type-btn').forEach(b => b.classList.remove('active'));
            // Active nút được chọn
            this.classList.add('active');
        });
    });

    // Xử lý sự kiện lưu thay đổi
    popup.querySelector('#save-fanpage').addEventListener('click', () => {
        const url = popup.querySelector('#edit-fanpage-url').value.trim();
        const name = popup.querySelector('#edit-fanpage-title').value.trim();
        const description = popup.querySelector('#edit-fanpage-description').value.trim();
        const type = popup.querySelector('.edit-fanpage-type-btn.active').dataset.type;

        // Validate dữ liệu
        if (!isValidUrl(url)) {
            showToast('URL không hợp lệ', 'warning');
            return;
        }

        if (!name) {
            showToast('Tiêu đề không được để trống', 'warning');
            return;
        }

        // Lưu trạng thái cũ để undo
        saveBackup('editFanpage', {
            fanpage: {
                ...fanpage,
                status: fanpage.status,
                lastChecked: fanpage.lastChecked
            }
        });

        // Cập nhật thông tin fanpage
        Object.assign(fanpage, {
            url,
            name,
            description,
            type,
            status: 'pending', // Đánh dấu cần kiểm tra lại
            lastChecked: null  // Reset thời gian kiểm tra
        });

        // Lưu dữ liệu
        saveData({ fanpages: true });

        // Cập nhật giao diện
        updateCounters();

        // Thông báo
        showToast(`Đã cập nhật fanpage ${name}`, 'success');
        addLog(`Cập nhật fanpage ${name} (ID: ${fanpage.id})`, 'info');

        // Đóng popup
        document.body.removeChild(popup);
    });

    // Xử lý sự kiện xóa fanpage
    popup.querySelector('#delete-fanpage').addEventListener('click', () => {
        if (confirm(`Bạn có chắc muốn xóa fanpage "${fanpage.name}"?`)) {
            // Gọi hàm xóa fanpage
            deleteFanpage(fanpage.id);
            // Đóng popup
            document.body.removeChild(popup);
        }
    });

    // Xử lý sự kiện hủy
    popup.querySelector('#cancel-edit').addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    // Xử lý sự kiện đóng popup
    popup.querySelector('.edit-fanpage-modal-close').addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    // Đóng popup khi click bên ngoài
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            document.body.removeChild(popup);
        }
    });

    // Focus vào ô nhập URL khi hiển thị popup
    setTimeout(() => {
        const urlInput = popup.querySelector('#edit-fanpage-url');
        if (urlInput) {
            urlInput.focus();
            urlInput.select();
        }
    }, 100);
}

