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
                <button onclick="window.enableEditMode(${note.id})" class="btn-edit">✏️ 编辑</button>
                <button onclick="window.deleteNote(${note.id})" class="btn-delete">🗑️ 删除</button>
            </div>
        `;
    }
    
    // 如果是好友且有权限，可能显示其他按钮...
    return '';
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
// export function showFloatingCard(note) {
//     const card = document.getElementById('floating-card');
//     // 假设卡片里有一个专门放内容的容器，如果没有，请在 HTML 里加一个 <div id="card-content"></div>
//     // 或者直接修改 card.innerHTML (但这会覆盖关闭按钮，建议用子容器)
//     const contentDiv = document.getElementById('card-content') || card; 

//     // 获取地图实例
//     const map = getMap();
//     if (!map) return;

//     // --- A. 位置计算逻辑 ---
//     // 计算标记在屏幕上的像素位置
//     const screenPoint = map.latLngToContainerPoint([note.lat, note.lng]);
//     const screenWidth = window.innerWidth;

//     // 清除旧位置类
//     card.classList.remove('card-left', 'card-right');

//     // 判断左右: 标记在右半屏 -> 悬浮窗显示在左边
//    try {
//         const screenPoint = map.latLngToContainerPoint([note.lat, note.lng]);
//         const screenWidth = window.innerWidth;

//         card.classList.remove('card-left', 'card-right');
//         if (screenPoint.x > screenWidth / 2) {
//             card.classList.add('card-left'); // 标记在右，窗在左
//         } else {
//             card.classList.add('card-right'); // 标记在左，窗在右
//         }
//     } catch (e) {
//         console.error("坐标计算失败，默认显示在右侧", e);
//         card.classList.add('card-right');
//     }

//     // --- B. 数据绑定 ---
//     // 存储当前笔记 ID，方便后续编辑/删除操作找到它
//     card.setAttribute('data-current-note-id', note.id);

//     // --- C. 内容渲染 ---
//     // 获取 HTML 字符串并插入 DOM
//     const htmlContent = renderReadMode(note);
//     contentDiv.innerHTML = htmlContent;

//     // --- D. 显示动画 ---
//     card.classList.remove('hidden');
//     // 稍微延迟一下加 active，确保过渡动画能触发（可选）
//     setTimeout(() => card.classList.add('active'), 10);
// }

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
export function renderEditMode(note) {
    // 1. 判断可见性选中状态
    const isPublic = (note.visibility === 'public') ? 'selected' : '';
    const isFriends = (note.visibility === 'friends') ? 'selected' : '';
    const isPrivate = (note.visibility === 'private') ? 'selected' : '';

    // 2. 返回 HTML 字符串
    return `
        <div class="edit-mode-container">
            <input type="text" id="edit-title" value="${note.title}" style="width:100%; font-size:1.5em; font-weight:bold; margin-bottom:5px; padding:5px; box-sizing:border-box;">
            
            <select id="edit-visibility" style="width:100%; margin-bottom:10px; padding:5px; border:1px solid #ddd; border-radius:4px;">
                <option value="public" ${isPublic}>🌍 公开 (所有人可见)</option>
                <option value="friends" ${isFriends}>🤝 好友</option>
                <option value="private" ${isPrivate}>🔒 私密 (仅自己可见)</option>
            </select>

            <div style="margin-bottom: 5px; background: #f8f9fa; padding: 5px; border-radius: 4px;">
                <button onclick="document.getElementById('edit-file-input').click()" style="cursor:pointer; border:1px solid #ddd; background:white; padding:2px 8px; border-radius:4px;">
                    🖼️ 插入图片/视频
                </button>
                <input type="file" id="edit-file-input" hidden onchange="window.handleFileUpload(this, 'edit-content')">
            </div>

            <div class="meta-info" style="color:#e6a23c;">✎ 正在编辑...</div>
            
            <textarea id="edit-content" rows="8" style="width:100%; padding:5px; box-sizing:border-box; margin-bottom:10px;">${note.content}</textarea>
            
            <div style="text-align: right; display: flex; justify-content: flex-end; gap: 10px;">
                <button onclick="window.cancelEdit()" style="padding:5px 15px; cursor:pointer;">取消</button>
                
                <button onclick="window.saveEdit()" style="background:#28a745; color:white; padding:5px 15px; border:none; border-radius:4px; cursor:pointer;">💾 保存</button>
            </div>
        </div>
    `;
}

// 生成用户搜索结果列表 HTML
export function renderSearchResults(users, currentUsername) {
    if (!users || users.length === 0) return '<div style="padding:5px; color:#999;">无结果</div>';

    return users.map(user => {
        // 不显示自己
        if (user.username === currentUsername) return '';
        
        // 返回列表项 HTML
        return `
        <div class="search-item" style="display:flex; justify-content:space-between; align-items:center; padding: 5px; border-bottom: 1px solid #eee;">
            <span onclick="window.visitUser('${user.username}')" style="cursor:pointer; flex-grow:1;">
                👤 ${user.username}
            </span>
            
            <button onclick="event.stopPropagation(); window.sendFriendRequest('${user.username}')" 
                    style="background:#28a745; color:white; border:none; border-radius:3px; padding:2px 8px; cursor:pointer; font-size:12px;">
                ➕ 加好友
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
            <div>
                <b style="color:#007bff;">${req.requester}</b> 想添加你为好友
            </div>
            <div>
                <button onclick="window.respondToRequest(${req.id}, 'accepted')" 
                        style="background:#28a745; color:white; border:none; padding:4px 8px; cursor:pointer; margin-right:5px; border-radius:3px;">
                    同意
                </button>
                <button onclick="window.respondToRequest(${req.id}, 'rejected')" 
                        style="background:#dc3545; color:white; border:none; padding:4px 8px; cursor:pointer; border-radius:3px;">
                    拒绝
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
    const SERVER_URL = 'http://localhost:3000'; // 或者从配置里读

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