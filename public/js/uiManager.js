import { API } from './api.js';
import { removeDraft } from './draftManager.js';
import { closeMapPopup } from './mapManager.js';


// 定义模块私有变量 (替代原来的全局变量)
let cropperInstance = null;

// 辅助函数：生成底部按钮 (这个函数不需要导出，只给内部使用)
function getFooterButtons(note) {
    // 获取当前登录用户名 (假设登录时存在了 localStorage 里，或者你可以解析 Token)
    // 如果你还没存 username，可以在 login 成功后 localStorage.setItem('username', user.username)
    const currentUsername = localStorage.getItem('username'); 

    // 如果是作者本人，显示编辑和删除按钮
    if (currentUsername && note.username === currentUsername) {
        return `
            <div class="flex-row-end">
                <button onclick="window.enableEditMode(${note.id})" class="btn btn-secondary">
                    <span class="material-icons">edit</span> 编辑
                </button>
                <button onclick="window.deleteNote(${note.id})" class="btn btn-danger">
                    <span class="material-icons">delete</span> 删除
                </button>
            </div>
        `;
    }
    
    // 如果是好友且有权限，可能显示其他按钮...
    return '';
}

/**
 * ⚡️ 创建快速记录弹窗 DOM
 * @param {Object} draft - 当前草稿对象 (可能包含 title, content)
 * @param {Function} onOpenFullEditor - 回调函数 (draft) => void
 */


export function createQuickPopupContent(draft, onOpenFullEditor) {
    const container = document.createElement('div');
    container.className = 'quick-popup-container';

    // 1. 标题头
    const header = document.createElement('h3');
    header.className = 'quick-popup-header';
    header.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:text-bottom; color:var(--primary-color);">edit_location</span> 新建笔记';
    container.appendChild(header);

    // 2. 标题输入
    const titleInput = document.createElement('input');
    titleInput.className = 'form-control';
    titleInput.placeholder = '标题...';
    titleInput.style.marginBottom = '8px';
    titleInput.value = draft.title || ''; 
    container.appendChild(titleInput);

    // 3. 内容输入
    const contentInput = document.createElement('textarea');
    contentInput.className = 'form-control';
    contentInput.placeholder = '写点什么...';
    contentInput.style.height = '60px';
    contentInput.style.resize = 'none';
    contentInput.style.marginBottom = '8px';
    contentInput.value = draft.content || ''; 
    container.appendChild(contentInput);

    // 4. ⚡️ 新增：可见性选择
    const visibilitySelect = document.createElement('select');
    visibilitySelect.className = 'form-control';
    visibilitySelect.style.marginBottom = '12px';
    visibilitySelect.style.fontSize = '13px'; //稍微小一点
    visibilitySelect.innerHTML = `
        <option value="public">🌍 公开笔记</option>
        <option value="friends">👥 仅好友可见</option>
        <option value="private">🔒 仅自己可见</option>
    `;
    // 如果草稿里有存过可见性，就回显，否则默认 public
    visibilitySelect.value = draft.visibility || 'public';
    container.appendChild(visibilitySelect);

    // 5. 按钮容器
    const btnContainer = document.createElement('div');
    btnContainer.className = 'flex-row-center';

    // --- 按钮 A: 详细编辑 (灰色/次要) ---
    const fullEditorBtn = document.createElement('button');
    fullEditorBtn.className = 'btn btn-secondary'; // 改为次要样式
    fullEditorBtn.style.flex = '1';
    fullEditorBtn.innerHTML = '<span class="material-icons" style="font-size:16px">open_in_full</span> 详细';
    
    fullEditorBtn.addEventListener('click', () => {
        // 同步当前输入的数据到 draft 对象
        draft.title = titleInput.value;
        draft.content = contentInput.value;
        draft.visibility = visibilitySelect.value; // ⚡️ 把可见性也传过去
        
        if (typeof onOpenFullEditor === 'function') {
            onOpenFullEditor(draft);
        }
        // 关闭当前弹窗 (依赖全局 map 对象，或者你可以传进来)
        closeMapPopup();
    });

    // --- 按钮 B: 直接发布 (绿色/主要) ---
    const publishBtn = document.createElement('button');
    publishBtn.className = 'btn btn-primary'; // 主要样式
    publishBtn.style.flex = '1.5'; // 让发布按钮稍微宽一点
    publishBtn.innerHTML = '<span class="material-icons" style="font-size:16px">send</span> 发布';

    // ⚡️ 绑定直接发布逻辑
    publishBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const visibility = visibilitySelect.value;

        if (!title || !content) {
            alert('标题和内容不能为空');
            return;
        }

        // UI 反馈：禁用按钮防止重复点击
        const originalText = publishBtn.innerHTML;
        publishBtn.disabled = true;
        publishBtn.innerHTML = '⏳...';

        try {
            // 调用 API 创建笔记
            const res = await API.createNote({
                title,
                content,
                visibility,
                lat: draft.lat,
                lng: draft.lng
            });

            if (res.success) {

                // 1. 删除本地草稿
                removeDraft(draft);
                
                // 2. 关闭弹窗
                closeMapPopup();

                // 3. 刷新地图上的点
                if (window.loadNotes) window.loadNotes();

                // (可选) 显示个全局提示
                // alert('发布成功'); 



            } else {
                alert('发布失败: ' + res.message);
                publishBtn.disabled = false;
                publishBtn.innerHTML = originalText;
            }
        } catch (err) {
            console.error(err);
            alert('网络错误，请稍后重试');
            publishBtn.disabled = false;
            publishBtn.innerHTML = originalText;
        }
    });

    btnContainer.appendChild(fullEditorBtn);
    btnContainer.appendChild(publishBtn);
    container.appendChild(btnContainer);

    return container;
}

// 渲染“只读模式”的卡片 HTML
export function renderReadMode(note) {
    // 处理 Token (用于图片权限)
    const token = localStorage.getItem('userToken');
    let processedContent = note.content || '';

    // 给图片加 Token
    if (token) {
        const regex = /(\/uploads\/resources\/[^\s\)\"\']+)/g;
        processedContent = processedContent.replace(regex, (match) => {
            const separator = match.includes('?') ? '&' : '?';
            return `${match}${separator}token=${token}`;
        });
    }

    // Markdown 解析
    // 注意: marked 和 DOMPurify 是通过 CDN 引入的全局变量，直接用 window.marked 也可以
    const rawHtml = marked.parse(processedContent);
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ['video', 'audio', 'source'],
        ADD_ATTR: ['src', 'controls', 'width', 'height', 'preload', 'type']
    });

    return `
        <h2 id="card-title">${note.title}</h2>
        <div class="meta-info">
            <span><a onclick="window.openProfileDrawer('${note.username}')" style="color: #007bff; text-decoration: none; font-weight: bold;">${note.username}</a></span> | 
            <span>${new Date(note.created_at).toLocaleDateString()}</span>
        </div>
        <div id="card-body" class="markdown-body" style="margin-top:15px; line-height:1.6;">
            ${cleanHtml}
        </div>
        <div id="card-footer" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
            ${getFooterButtons(note)}
        </div>
    `;
}


// 显示悬浮卡片
export function showFloatingCard(note, map) {
    const card = document.getElementById('floating-card');
    const contentDiv = document.getElementById('card-content');
    
    // 1. 防御性检查：必须传入地图实例
    if (!map) {
        console.error("❌ showFloatingCard 错误: 未传入 map 实例");
        // 兜底方案：默认显示在右侧，防止程序卡死
        card.classList.add('card-right');
    } else {
        // 2. 计算坐标
        try {
            const screenPoint = map.latLngToContainerPoint([note.lat, note.lng]);
            const screenWidth = window.innerWidth;

            card.classList.remove('card-left', 'card-right');
            
            // 如果标记在屏幕右侧，卡片显示在左侧
            if (screenPoint.x > screenWidth / 2) {
                card.classList.add('card-left');
            } else {
                card.classList.add('card-right');
            }
        } catch (e) {
            console.error("坐标计算失败", e);
            card.classList.add('card-right');
        }
    }

    // 3. 渲染内容
    const htmlContent = renderReadMode(note); 
    contentDiv.innerHTML = htmlContent;

    // 4. 显示卡片
    card.setAttribute('data-current-note-id', note.id);
    card.classList.remove('hidden');
    
    // 强制重绘 (保证动画生效)
    void card.offsetWidth; 
    
    card.classList.add('active');
}

export function hideFloatingCard() {
    const card = document.getElementById('floating-card');
    card.classList.remove('active');
    setTimeout(() => card.classList.add('hidden'), 300); // 等动画播完再隐藏
}

// ⚡️ 新增：生成“编辑模式”的 HTML


// 生成用户搜索结果列表 HTML
export function renderSearchResults(users, currentUsername) {
    // 1. 使用分离出的 CSS 类渲染空状态
    if (!users || users.length === 0) {
        return '<div class="search-empty-state">未找到相关用户</div>';
    }

    // 2. 渲染列表
    return users.map(user => {
        // 不显示自己
        if (user.username === currentUsername) return '';

        let actionHtml = '';
        if (user.relation === 'friend') {
            // 已是好友 -> 显示纯文本状态，不可点击
            actionHtml = `
                <span style="font-size:12px; color:var(--text-secondary); display:flex; align-items:center;">
                    <span class="material-icons" style="font-size:16px; margin-right:4px;">people</span>已是好友
                </span>`;
        } else if (user.relation === 'pending') {
            // 等待验证 -> 显示警告色文本
            actionHtml = `
                <span style="font-size:12px; color:var(--warning-color); display:flex; align-items:center;">
                    <span class="material-icons" style="font-size:16px; margin-right:4px;">hourglass_empty</span>等待验证
                </span>`;
        } else {
            // 陌生人 -> 显示“加好友”按钮
            actionHtml = `
                <button onclick="event.stopPropagation(); window.sendFriendRequest('${user.username}')" class="btn btn-primary btn-sm">
                    <span class="material-icons">person_add</span>加好友
                </button>`;
        }

        // 返回拼装好的列表项
        return `
        <div class="user-list-item">
            <div class="user-list-info" onclick="window.visitUser('${user.username}')">
                
                <div class="user-list-avatar-placeholder">
                    <span class="material-icons">person</span>
                </div>
                
                <div class="user-list-text">
                    <div class="name">${user.username}</div>
                </div>
            </div>
            
            <div class="user-list-actions">
                ${actionHtml} </div>
        </div>`;
    }).join('');
}


// --- 控制“正在访问”横幅的显示/隐藏 ---
export function toggleVisitBanner(visible, targetName = '') {
    const banner = document.getElementById('visiting-banner');
    const nameSpan = document.getElementById('visit-name');
    
    // 告别 banner.style.display，使用更优雅的 classList 切换
    if (visible) {
        if (nameSpan) nameSpan.innerText = targetName;
        banner.classList.add('active'); // CSS 会通过 display: flex 和 keyframes 动画接管显示
    } else {
        banner.classList.remove('active'); // CSS 会恢复 display: none
    }
}

// 渲染信箱列表 HTML
export function renderInboxList(requests) {
    // 更新右上角数字 (如果有这个元素的话)
    const countEl = document.getElementById('request-count');
    if (countEl) countEl.innerText = `(${requests.length})`;

    // 空状态
    if (!requests || requests.length === 0) {
        return '<div style="padding:10px; color:#999; text-align:center;">暂无新请求</div>';
    }

    // 生成列表
    return requests.map(req => `
        <div class="user-list-item">
            <div class="user-list-info">
                <span class="material-icons" style="color:#007bff; margin-right:8px;">account_circle</span>
                <div class="user-list-text"><div class="name">${req.requester}</div></div>
            </div>
            <div class="user-list-actions">
                <button class="btn btn-primary btn-sm" onclick="window.respondToRequest(${req.id}, 'accepted')"><span class="material-icons">check</span>同意</button>
                <button class="btn btn-danger btn-sm" onclick="window.respondToRequest(${req.id}, 'rejected')"><span class="material-icons">close</span>拒绝</button>
            </div>
        </div>
    `).join('');
}

// 切换信箱显示/隐藏
// 返回值：true 表示打开了，false 表示关闭了 (方便调用者决定是否要加载数据)
export function toggleInboxDisplay() {
    const listDiv = document.getElementById('inbox-list');
    if (!listDiv) return false;

    if (listDiv.style.display === 'none' || listDiv.style.display === '') {
        listDiv.style.display = 'block';
        return true; // 打开
    } else {
        listDiv.style.display = 'none';
        return false; // 关闭
    }
}

// ==========================================
// ⚡️ 用户信息相关 UI
// ==========================================

// --- 更新左上角/侧边栏的用户信息 ---
export function updateUserProfileUI(user) {
    const nameEl = document.getElementById('my-username');
    const avatarEl = document.getElementById('my-avatar');
    const SERVER_URL = ''; // 或者从配置里读

    // 更新名字
    if (nameEl) {
        nameEl.innerText = user.username;
        // 点击后打开该用户的个人主页抽屉
        nameEl.onclick = () => {
            if (window.openProfileDrawer) {
                window.openProfileDrawer(user.username);
            }
        }
    }
    // 更新头像
    if (avatarEl) {
        if (user.avatar) {
            // 如果 avatar 字段里已经是完整链接就不用拼，否则拼一下
            avatarEl.src = user.avatar.startsWith('http') ? user.avatar : (SERVER_URL + user.avatar);
        } else {
            avatarEl.src = `${SERVER_URL}/uploads/avatars/default-avatar.png`;
        }

        avatarEl.onclick = () => {
            if (window.openProfileDrawer) {
                window.openProfileDrawer(user.username);
            }
        }
    }
}
// ==========================================
// ⚡️ 裁剪器相关 UI (Cropper Logic)
// ==========================================

// --- 打开裁剪模态框 ---
export function showCropModal(file) {
    const cropImage = document.getElementById('crop-image');
    const cropModal = document.getElementById('crop-modal');

    // 1. 读取文件
    const reader = new FileReader();
    reader.onload = function(e) {
        // A. 设置图片源
        cropImage.src = e.target.result;
        
        // B. 显示窗口
        cropModal.style.display = 'flex';

        // C. 销毁旧实例 (防止重复绑定)
        if (cropperInstance) {
            cropperInstance.destroy();
        }

        // D. 初始化 Cropper (假设 Cropper 已通过 CDN 全局引入)
        cropperInstance = new Cropper(cropImage, {
            aspectRatio: 1 / 1, // 头像锁定 1:1
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.8,
        });
    };
    reader.readAsDataURL(file);
}

// --- 关闭裁剪模态框 ---
export function hideCropModal() {
    const cropModal = document.getElementById('crop-modal');
    if (cropModal) {
        cropModal.style.display = 'none';
    }
    
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
}

// --- 获取裁剪后的 Canvas (供 app.js 上传使用) ---
export function getCroppedCanvas() {
    if (!cropperInstance) return null;
    return cropperInstance.getCroppedCanvas({
        width: 1000,  // 压缩一下尺寸，不用传原图
        height: 1000
    });
}


// ==========================================
// 👤 个人主页抽屉核心逻辑
// ==========================================

export async function openProfileDrawer(username) {
    const drawer = document.getElementById('profile-drawer');
    const backdrop = document.getElementById('profile-backdrop');

    // 1. 立即弹出抽屉，展示 "加载中" 状态 (提升用户体验)
    drawer.classList.add('open');
    backdrop.classList.add('active');
    document.getElementById('profile-username').innerText = '加载中...';
    document.getElementById('profile-bio').innerText = '';
    document.getElementById('profile-action-container').innerHTML = ''; // 清空按钮

    try {
        // 2. ⚡️ 向后端请求资料
        // 注意：如果你在顶部是 import * as API from './api.js'，这里就用 API.getUserProfile
        const data = await API.getUserProfile(username); 
        
        if (!data.success) throw new Error(data.message);

        const { profile, relation } = data;

        const notes = await API.getNotes(username);   //获取笔记

        // 3. 渲染头像、名字、简介
        document.getElementById('profile-username').innerText = profile.username;
        document.getElementById('profile-bio').innerText = profile.bio || '这个人很懒，什么都没写~';
        
        // 如果没有头像，使用默认头像
        const avatarUrl = profile.avatar ? `${profile.avatar}` : '/uploads/avatars/default-avatar.png';
        document.getElementById('profile-avatar').src = avatarUrl;

        // 4. ⚡️ 核心：根据关系渲染不同的按钮
        renderProfileActions(username, relation, data.requestId);

        // 渲染笔记
        renderProfileNotesList(notes);

        if (relation === 'self') {
            // 顺便把关系网加载好塞进 Tab 里
            loadAndRenderFriendsNetwork();
        }

    } catch (err) {
        console.error('加载主页失败:', err);
        document.getElementById('profile-username').innerText = '加载失败';
        document.getElementById('profile-bio').innerText = err.message;
    }
}

// 关闭抽屉
export function closeProfileDrawer() {
    document.getElementById('profile-drawer').classList.remove('open');
    document.getElementById('profile-backdrop').classList.remove('active');
}

// 渲染互动按钮
function renderProfileActions(targetUsername, relation, requestId) {
    const container = document.getElementById('profile-action-container');
    const tabFriendsBtn = document.getElementById('tab-friends-btn');
    let html = '';

    switch (relation) {
        case 'self':
            html = `<button class="btn btn-secondary" onclick="window.toggleEditMode(true)"><span class="material-icons">settings</span>编辑资料</button>`;
            tabFriendsBtn.style.display = 'flex';
            break;
        case 'friend':
            html = `<button class="btn btn-success" style="cursor: default;"><span class="material-icons">people</span>已是好友</button>`;
            tabFriendsBtn.style.display = 'none';
            break;
        case 'pending_sent':
            html = `<button class="btn btn-secondary" style="cursor: default;"><span class="material-icons">hourglass_empty</span>等待验证</button>`;
            tabFriendsBtn.style.display = 'none';
            break;
        case 'pending_received':
            html = `
                <button class="btn btn-primary" onclick="window.respondToRequest(${requestId}, 'accepted')"><span class="material-icons">check_circle</span>同意</button>
                <button class="btn btn-danger" onclick="window.respondToRequest(${requestId}, 'rejected')"><span class="material-icons">cancel</span>拒绝</button>
            `;
            tabFriendsBtn.style.display = 'none';
            break;
        case 'none':
        default:
            html = `<button class="btn btn-primary" onclick="window.sendFriendRequest('${targetUsername}')"><span class="material-icons">person_add</span>加为好友</button>`;
            tabFriendsBtn.style.display = 'none';
            break;
    }
    container.innerHTML = html;
}

// 初始化抽屉的静态事件 (点击遮罩关闭、Tab切换)
export function initProfileEvents() {
    // 绑定关闭按钮和背景遮罩
    document.getElementById('close-profile-btn').addEventListener('click', closeProfileDrawer);
    document.getElementById('profile-backdrop').addEventListener('click', closeProfileDrawer);

    // 绑定 Tab 切换逻辑
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // 移除所有的 active 状态
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            // 激活当前点击的 Tab 和对应的内容区
            const targetId = e.currentTarget.getAttribute('data-target');
            e.currentTarget.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// 渲染抽屉里的笔记列表卡片
export function renderProfileNotesList(notes) {
    const container = document.getElementById('profile-notes-list');
    if (!notes || notes.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无公开足迹</p>';
        return;
    }

    // 简单拼接一段 HTML 列表
    const html = notes.map(note => `
        <div class="profile-note-card" style="border-bottom:1px solid #eee; padding: 10px 0; cursor:pointer;" 
             onclick="window.flyToNote(${note.lat}, ${note.lng})">
            <h4 style="margin:0 0 5px; color:#333;">${note.title}</h4>
            <p style="margin:0; font-size:12px; color:#888;">${new Date(note.created_at).toLocaleDateString()}</p>
        </div>
    `).join('');

    container.innerHTML = html;
}

// --- 渲染关系网面板 ---
export async function loadAndRenderFriendsNetwork() {
    const container = document.getElementById('profile-friends-list');
    container.innerHTML = '<div style="text-align:center; padding: 20px;">加载中...</div>';

    try {
        const data = await API.getMyNetwork(); // 假设你在文件顶部引入了 API
        if (!data.success) throw new Error(data.message);

        const { pendingRequests, friends } = data;
        let html = '';

        // --- 上半区：新朋友请求 ---
        if (pendingRequests && pendingRequests.length > 0) {
            html += `<h4 style="margin: 0 0 10px; color: #555; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">新朋友请求</h4>`;
            html += pendingRequests.map(req => {
                const avatar = req.avatar ? (req.avatar.startsWith('http') ? req.avatar : `${req.avatar}`) : '/uploads/avatars/default-avatar.png';
                return `
                <div class="user-list-item">
                    <div class="user-list-info" onclick="window.openProfileDrawer('${req.requester}')">
                        <img src="${avatar}" class="user-list-avatar">
                        <div class="user-list-text">
                            <div class="name">${req.requester}</div>
                            <div class="sub">申请添加你为好友</div>
                        </div>
                    </div>
                    <div class="user-list-actions">
                        <button class="btn btn-primary btn-sm" onclick="window.respondToRequest(${req.id}, 'accepted')"><span class="material-icons">check</span>同意</button>
                        <button class="btn btn-danger btn-sm" onclick="window.respondToRequest(${req.id}, 'rejected')"><span class="material-icons">close</span>拒绝</button>
                    </div>
                </div>`;
            }).join('');
        }

        // --- 下半区：我的好友 ---
        html += `<h4 style="margin: 20px 0 10px; color: #555; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">我的好友 (${friends.length})</h4>`;
        if (friends.length === 0) {
            html += '<p style="color:#999; font-size:13px;">还没有好友，去地图上逛逛吧~</p>';
        } else {
            html += friends.map(friend => {
                const avatar = friend.avatar ? (friend.avatar.startsWith('http') ? friend.avatar : `${friend.avatar}`) : '/uploads/avatars/default-avatar.png';
                return `
                <div class="user-list-item" onclick="window.openProfileDrawer('${friend.username}')" style="cursor:pointer;">
                    <div class="user-list-info">
                        <img src="${avatar}" class="user-list-avatar">
                        <div class="user-list-text">
                            <div class="name">${friend.username}</div>
                            <div class="sub">${friend.bio || '这个人很懒，什么都没写~'}</div>
                        </div>
                    </div>
                    <div class="user-list-actions">
                        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); window.handleRemoveFriend('${friend.username}')">删除</button>
                    </div>
                </div>`;
            }).join('');
        }

        container.innerHTML = html;

    } catch (err) {
        console.error(err);
        container.innerHTML = '<div style="color:red; text-align:center;">加载关系网失败</div>';
    }
}




