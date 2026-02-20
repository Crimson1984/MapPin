import { API } from './api.js';
import { removeDraft } from './draftManager.js';
import { closeMapPopup, saveUserViewState } from './mapManager.js';


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
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
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
// export function createQuickPopupContent(draft, onOpenFullEditor) {
//     const container = document.createElement('div');
//     container.className = 'quick-popup-container';
//     container.style.padding = '10px';
//     container.style.minWidth = '240px';
//     container.style.textAlign = 'center';

//     // 标题
//     const header = document.createElement('h3');
//     header.style.margin = '0 0 10px 0';
//     header.style.fontSize = '16px';
//     header.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:text-bottom; color:var(--primary-color);">edit_location</span> 新建笔记';
//     container.appendChild(header);

//     // 标题输入
//     const titleInput = document.createElement('input');
//     titleInput.className = 'form-control';
//     titleInput.placeholder = '标题...';
//     titleInput.style.marginBottom = '8px';
//     titleInput.value = draft.title || ''; // 回填草稿数据
//     container.appendChild(titleInput);

//     // 内容输入
//     const contentInput = document.createElement('textarea');
//     contentInput.className = 'form-control';
//     contentInput.placeholder = '写点什么...';
//     contentInput.style.height = '60px';
//     contentInput.style.resize = 'none';
//     contentInput.style.marginBottom = '10px';
//     contentInput.value = draft.content || ''; // 回填草稿数据
//     container.appendChild(contentInput);

//     // 按钮容器
//     const btnContainer = document.createElement('div');
//     btnContainer.style.display = 'flex';
//     btnContainer.style.gap = '10px';

//     // "详细编辑" 按钮
//     const fullEditorBtn = document.createElement('button');
//     fullEditorBtn.className = 'btn btn-primary';
//     fullEditorBtn.style.flex = '1';
//     fullEditorBtn.innerHTML = '<span class="material-icons">edit_note</span> 详细编辑';
    
//     // ⚡️ 绑定点击事件：收集数据并通过回调传出去
//     fullEditorBtn.addEventListener('click', () => {
//         // 更新草稿数据
//         draft.title = titleInput.value;
//         draft.content = contentInput.value;
        
//         // 触发回调
//         if (typeof onOpenFullEditor === 'function') {
//             onOpenFullEditor(draft);
//         }
//     });

//     btnContainer.appendChild(fullEditorBtn);
//     container.appendChild(btnContainer);

//     return container;
// }

export function createQuickPopupContent(draft, onOpenFullEditor) {
    const container = document.createElement('div');
    container.className = 'quick-popup-container';
    container.style.padding = '10px';
    container.style.minWidth = '260px'; // 稍微宽一点以容纳两个按钮
    container.style.textAlign = 'center';

    // 1. 标题头
    const header = document.createElement('h3');
    header.style.margin = '0 0 10px 0';
    header.style.fontSize = '16px';
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
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';

    // --- 按钮 A: 详细编辑 (灰色/次要) ---
    const fullEditorBtn = document.createElement('button');
    fullEditorBtn.className = 'btn btn-secondary'; // 改为次要样式
    fullEditorBtn.style.flex = '1';
    fullEditorBtn.style.padding = '6px 10px';
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
    publishBtn.style.padding = '6px 10px';
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
                saveUserViewState(draft.lat, draft.lng);

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
            <span>${note.username}</span> | 
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
    if (!users || users.length === 0) return '<div style="padding:5px; color:#999;">无结果</div>';

    return users.map(user => {
        // 不显示自己
        if (user.username === currentUsername) return '';
        
        // 返回列表项 HTML
        return `
        <div class="search-item" style="display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid var(--border-color);">
            <span onclick="window.visitUser('${user.username}')" style="cursor:pointer; flex-grow:1; display:flex; align-items:center;">
                <span class="material-icons" style="color:#666;">person</span> ${user.username}
            </span>
            
            <button onclick="event.stopPropagation(); window.sendFriendRequest('${user.username}')" 
                    class="btn btn-primary" style="padding: 2px 8px; font-size: 12px;">
                <span class="material-icons" style="font-size:14px;">person_add</span> 加好友
            </button>
        </div>
        `;
    }).join('');
}

// 控制“正在访问”横幅的显示/隐藏
export function toggleVisitBanner(visible, targetName = '') {
    const banner = document.getElementById('visiting-banner');
    const nameSpan = document.getElementById('visit-name');
    
    if (visible) {
        banner.style.display = 'flex';
        if (nameSpan) nameSpan.innerText = targetName;
    } else {
        banner.style.display = 'none';
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
        <div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center;">
                <span class="material-icons" style="color:#007bff; margin-right:4px;">account_circle</span>
                <b>${req.requester}</b>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="window.respondToRequest(${req.id}, 'accepted')" class="btn btn-icon" style="color:var(--success-color);" title="同意">
                    <span class="material-icons">check_circle</span>
                </button>
                <button onclick="window.respondToRequest(${req.id}, 'rejected')" class="btn btn-icon" style="color:var(--danger-color);" title="拒绝">
                    <span class="material-icons">cancel</span>
                </button>
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
    if (nameEl) nameEl.innerText = user.username;

    // 更新头像
    if (avatarEl) {
        if (user.avatar) {
            // 如果 avatar 字段里已经是完整链接就不用拼，否则拼一下
            avatarEl.src = user.avatar.startsWith('http') ? user.avatar : (SERVER_URL + user.avatar);
        } else {
            avatarEl.src = `${SERVER_URL}/uploads/avatars/default-avatar.png`;
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