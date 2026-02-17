// public/js/app.js
import { initMap, 
    addMarker, 
    getMap, 
    clearMarkers, 
    closeMapPopup,
    fitToMarkers
} from './mapManager.js';

import { renderReadMode, 
    renderEditMode,
    showFloatingCard, 
    hideFloatingCard, 
    renderSearchResults, 
    toggleVisitBanner,
    renderInboxList,
    toggleInboxDisplay,
    updateUserProfileUI,
    showCropModal,
    hideCropModal,
    getCroppedCanvas
} from './uiManager.js';

import { insertAtCursor, debounce } from './utils.js'; // 引入工具函数

import { API } from './api.js';

// --- 全局变量与初始化 ---
let map = null;
let currentUser = null;
// let searchTimeout = null; // 用于防抖


// 启动应用
async function initApp() {
    console.log('正在初始化应用...');

    // 检查登录状态
    const token = localStorage.getItem('userToken');
    if (!token) {
        alert("未登录，即将跳转...");
        window.location.href = 'login.html';
        return;
    }

    // 获取用户信息 (更新右上角头像/名字)
    await loadUserProfile();

    //初始化地图
    map = initMap();

    // ⚡️ 1. 补全：单击地图空白处，关闭悬浮窗
    map.on('click', () => {
        const card = document.getElementById('floating-card');
        // 只有卡片是 active 状态时才处理，防止误触
        if (card && card.classList.contains('active')) {
            window.closeCard(); // 调用挂载在 window 上的关闭函数
        }
    });

    //绑定地图点击事件
    map.on('dblclick', onMapDoubleClick);

    //加载所有笔记
    loadNotes();

    // 绑定搜索框事件 (替代 HTML 中的 onkeyup)
    const searchInput = document.getElementById('user-search');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedSearchHandler);
    }

    loadInboxData();
}

// 执行初始化
initApp();

// --- 核心逻辑函数 ---

// --- 加载并显示用户信息 ---
async function loadUserProfile() {
    try {
        const user = await API.getCurrentUser();
        // 更新全局变量 (方便其他地方用)
        currentUser = user; 

        localStorage.setItem('username', user.username);
        
        // 更新 UI
        updateUserProfileUI(user);
    } catch (err) {
        console.error("加载用户信息失败:", err);
    }
}

// debounce防抖函数
const debouncedSearchHandler = debounce((e) => {
    handleSearchLogic(e.target.value.trim());
}, 300);

// --- 搜索用户逻辑 ---
async function handleSearchLogic(query) {
    const resultsDiv = document.getElementById('search-results');
    
    // 如果框空了，清空列表
    if (!query) {
        resultsDiv.innerHTML = '';
        return;
    }

    try {
        console.log("发起搜索:", query); // 调试用
        const users = await API.searchUsers(query);
        
        // 获取当前用户名 (假设 currentUser 已存在)
        const myName = currentUser ? currentUser.username : ''; 
        const html = renderSearchResults(users, myName);
        resultsDiv.innerHTML = html;
    } catch (err) {
        console.error("搜索失败", err);
    }
}

//加载并渲染笔记
async function loadNotes(targetUser = null) {
    try {
        const notes = await API.getNotes(targetUser);

        // ⚡️ 安全检查：确保 notes 是一个数组
        if (!Array.isArray(notes)) {
            console.error("API 返回的不是数组:", notes);
            return;
        }

        console.log(`获取到 ${notes.length} 条笔记`);
   
        //先清除所有标记
        clearMarkers();

        notes.forEach(note => {
           // 调用 mapManager 的新 addMarker，直接传 note 对象
            addMarker(note, (clickedNote) => {
                // --- 点击回调逻辑 ---
                console.log('点击了笔记:', clickedNote.title);
                
                // 渲染 UI
                showFloatingCard(clickedNote, map);
                
                // 记录当前状态
                window.currentNote = clickedNote;
            });
        });

        // 如果是查看特定用户，自动调整视野
        if (targetUser && notes.length > 0) {
            fitToMarkers();
        }

    } catch (err) {
        console.error('加载笔记失败:', err);
    }
}

function onMapDoubleClick(e) {

    window.closeCard();

    const { lat, lng } = e.latlng;
    
    // 弹出 Leaflet 原生 Popup (或者你也改成用侧边栏)
    // 这里演示如何解决 onclick 问题
    const popupContent = `
        <div class="note-form" style="min-width: 250px;">
            <h3 style="margin-top:0;">写笔记</h3>
            
            <input id="note-title" placeholder="标题" style="width:100%; margin-bottom:8px; padding:5px;">
            
            <select id="note-visibility" style="width:100%; margin-bottom:8px; padding:5px;">
                <option value="public">🌍 公开 (Public)</option>
                <option value="friends">👥 仅好友 (Friends)</option>
                <option value="private">🔒 仅自己 (Private)</option>
            </select>

            <div style="margin-bottom:8px;">
                <label style="font-size:12px; cursor:pointer; color:blue;">
                    🖼️ 插入图片/视频
                    <input type="file" onchange="window.handleUpload(this, 'note-content')" hidden>
                </label>
            </div>

            <textarea id="note-content" placeholder="支持 Markdown..." rows="4" style="width:100%; margin-bottom:8px;"></textarea>
            
            <button onclick="window.saveNewNote(${lat}, ${lng})" style="width:100%; background:#007bff; color:white; border:none; padding:8px; cursor:pointer;">发布</button>
        </div>
    `;
    
    L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);
}

// (内部辅助函数：加载数据并渲染)
async function loadInboxData() {
    const listDiv = document.getElementById('inbox-list');
    // 显示 Loading 提示
    listDiv.innerHTML = '<div style="padding:10px; text-align:center;">加载中...</div>';

    try {
        // 调用 API
        const requests = await API.getPendingRequests();
        
        // 调用 UI 渲染
        const html = renderInboxList(requests);
        listDiv.innerHTML = html;
        
    } catch (err) {
        console.error(err);
        listDiv.innerHTML = '<div style="padding:10px; color:red; text-align:center;">加载失败</div>';
    }
}

// --- 3. 挂载到 Window 的全局函数 (供 HTML onclick 调用) ---

// 保存新笔记
window.saveNewNote = async function(lat, lng) {
    // 1. 获取 DOM 元素值
    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    const visibilityInput = document.getElementById('note-visibility');

    if (!titleInput || !contentInput) return; // 防御性编程

    const title = titleInput.value;
    const content = contentInput.value;
    const visibility = visibilityInput ? visibilityInput.value : 'public';

    // 2. 校验
    if (!title) return alert("标题不能为空");

    try {
        // 3. 调用 API
        const res = await API.createNote({ 
            title, 
            content, 
            lat, 
            lng, 
            visibility 
        });

        if (res.success) {

            if (map) {
                map.closePopup(); 
            }

            loadNotes(); 
            
            setTimeout(() => {
                alert("发布成功！"); // 如果觉得烦，可以注释掉这一行
                console.log("笔记发布成功");
            }, 100);

        } else {
            alert("发布失败: " + (res.message || '未知错误'));
        }
    } catch (err) {
        console.error(err);
        alert("发布出错: " + err.message);
    }
};


// 挂载关闭函数
window.closeCard = function() {
    hideFloatingCard();
    // 也可以顺便清除当前选中的笔记状态
    window.currentNote = null;
};

// 挂载编辑功能
window.enableEditMode = function(noteId) {
    console.log('准备编辑笔记:', noteId);
    // 这里暂时先打个 log，后面我们再写 renderEditMode
    alert('编辑功能开发中... ID: ' + noteId);
};

// 挂载删除功能
window.deleteNote = async function(noteId) {
    if (!confirm('确定要删除这篇笔记吗？此操作不可恢复')) return;
    
    try {
        // 2. 调用 API
        const res = await API.deleteNote(noteId);

        if (res.success) {
            alert("删除成功");

            // 3. 关闭右侧悬浮窗 (调用之前挂载好的函数)
            if (window.closeCard) {
                window.closeCard();
            }

            // 4. 刷新地图
            loadNotes();
        } else {
            alert("删除失败: " + (res.message || '无法删除'));
        }
    } catch (err) {
        console.error(err);
        alert("请求出错: " + err.message);
    }
};

// --- 进入编辑模式 ---
window.enableEditMode = function() {
    // 获取当前笔记 (在点击标记 showFloatingCard 时存的)
    const note = window.currentNote;
    if (!note) return;

    console.log("进入编辑模式:", note.title);

    // 1. 生成编辑表单 HTML
    const html = renderEditMode(note);

    // 2. 替换悬浮窗内容
    const contentDiv = document.getElementById('card-content');
    if (contentDiv) {
        contentDiv.innerHTML = html;
    }
};

// --- 取消编辑 ---
window.cancelEdit = function() {
    const note = window.currentNote;
    if (!note) return;

    // 1. 重新生成只读 HTML (回退)
    const html = renderReadMode(note);

    // 2. 替换回去
    const contentDiv = document.getElementById('card-content');
    if (contentDiv) {
        contentDiv.innerHTML = html;
    }
};

// --- 保存编辑 ---
window.saveEdit = async function() {
    const note = window.currentNote;
    if (!note) return;

    // 1. 获取输入框的值
    const newTitle = document.getElementById('edit-title').value;
    const newContent = document.getElementById('edit-content').value;
    const newVisibility = document.getElementById('edit-visibility').value;

    if (!newTitle || !newContent) return alert("标题和内容不能为空");

    try {
        // 2. 调用 API 更新
        // 假设 api.js 里有 updateNote 方法: (id, data) => request(...)
        const res = await API.updateNote(note.id, {
            title: newTitle,
            content: newContent,
            visibility: newVisibility
        });

        if (res.success) {
            alert("保存成功！");
            
            // 3. 更新本地缓存的 note 数据，防止 UI 闪烁旧数据
            window.currentNote.title = newTitle;
            window.currentNote.content = newContent;
            window.currentNote.visibility = newVisibility;

            // 4. 退出编辑模式 (渲染回只读)
            window.cancelEdit(); 
            
            // 5. 刷新地图上的标记 (比如颜色可能变了，或者只是为了保险)
            loadNotes(); 
        } else {
            alert("保存失败: " + res.message);
        }
    } catch (err) {
        console.error(err);
        alert("保存出错");
    }
};

// --- 处理文件上传 (插入 Markdown) ---
window.handleUpload = async function(input, textareaId) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const textarea = document.getElementById(textareaId);
    const originalText = textarea.placeholder;
    textarea.placeholder = "⏳ 正在上传中...";
    textarea.disabled = true; // 防止上传时乱输入

    try {
        const res = await API.uploadFile(formData);
        if (res.success) {
            let insertText = '';
            // 根据类型生成 Markdown
            if (res.type === 'image') {
                insertText = `\n![img](${res.url})\n`;
            } else if (res.type === 'video') {
                insertText = `\n<video src="${res.url}" controls width="100%"></video>\n`;
            } else if (res.type === 'audio') {
                insertText = `\n<audio src="${res.url}" controls></audio>\n`;
            } else {
                insertText = `\n[文件下载](${res.url})\n`;
            }

            textarea.value += insertText; // 简单追加到末尾
        } else {
            alert('上传失败: ' + res.message);
        }
    } catch (err) {
        console.error(err);
        alert('上传出错，请检查网络');
    } finally {
        // 恢复状态
        textarea.disabled = false;
        textarea.placeholder = originalPlaceholder;
        textarea.focus();
        input.value = ''; // 清空 input，允许重复上传同一个文件
    }
};

// --- 用户选择头像文件 ---
window.handleAvatarSelected = function(input) {
    const file = input.files[0];
    if (!file) return;

    // 检查大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert("图片太大了！请上传 5MB 以内的图片");
        input.value = ''; // 清空
        return;
    }

    // 调用 UI 模块显示裁剪框
    showCropModal(file);

    // 清空 input，允许下次选择同一张图
    input.value = '';
};

// --- 头像裁剪并上传 ---
window.saveAvatar = async function() {
    // 获取裁剪后的 canvas
    const canvas = getCroppedCanvas();
    if (!canvas) return;

    // 转成 Blob 并上传
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.png');

        try {
            // 假设你在 API.js 里加了 uploadAvatar
            const res = await API.uploadAvatar(formData); 
            
            // // 如果还没加 API，暂时直接 fetch
            // const token = localStorage.getItem('userToken');
            // const res = await fetch('http://localhost:3000/users/avatar', {
            //     method: 'POST',
            //     headers: { 'Authorization': 'Bearer ' + token },
            //     body: formData
            // });
            const data = await res.json();

            if (data.success) {
                alert('头像上传成功');
                hideCropModal(); // 关闭窗口
                loadUserProfile(); // 刷新头像显示
            } else {
                alert('上传失败: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('上传出错');
        }
    }, 'image/png');
};

// --- 3. 取消裁剪 ---
window.cancelCrop = function() {
    hideCropModal();
};

// --- 访问用户 ---
window.visitUser = function(targetName) {
    console.log("正在访问用户:", targetName);

    // 1. 清空搜索状态
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('user-search').value = '';

    // 2. 显示横幅 (UI 模块)
    toggleVisitBanner(true, targetName);

    // 3. 重新加载地图数据 (传入目标用户名)
    // 注意：loadNotes 必须在 app.js 作用域内可见
    loadNotes(targetName);
    
    // 4. 关闭悬浮窗 (如果有)
    if (window.closeCard) window.closeCard();
};

// --- 退出访问模式 ---
window.exitVisitMode = function() {
    // 1. 隐藏横幅 (UI 模块)
    toggleVisitBanner(false);

    // 2. 重新加载所有笔记 (不传参)
    loadNotes();
};

// --- 发送好友请求 ---
window.sendFriendRequest = async function(receiverName) {
    if (!confirm(`确定要添加 ${receiverName} 为好友吗？`)) return;

    try {
        const res = await API.sendFriendRequest(receiverName);
        if (res.success) {
            alert(res.message);
        } else {
            alert('请求失败: ' + res.message);
        }
    } catch (err) {
        alert('请求出错');
    }
};

// --- 切换信箱显示 ---
window.toggleInbox = async function() {
    // 1. 切换 UI 显示状态
    const isOpen = toggleInboxDisplay();

    // 2. 如果打开了，才去加载数据
    if (isOpen) {
        await loadInboxData();
    }
};

// --- 处理好友请求 (同意/拒绝) ---
window.respondToRequest = async function(id, action) {
    try {
        const res = await API.respondToRequest(id, action);
        
        if (res.success) {
            // 操作成功后，重新加载信箱列表
            await loadInboxData();
            
            // 可选：如果是同意了，可能需要刷新一下地图或者用户搜索列表
            // loadNotes(); 
        } else {
            alert(res.message);
        }
    } catch (err) {
        console.error(err);
        alert("操作失败");
    }
};

// --- 文件选择与上传 ---
window.handleFileUpload = async function(inputElement, textAreaId) {
    const file = inputElement.files[0];
    if (!file) return;

    // 1. 获取文本框
    const textArea = document.getElementById(textAreaId);
    if (!textArea) return;

    // 2. 显示 Loading 提示
    const originalPlaceholder = textArea.placeholder;
    textArea.placeholder = "⏳ 正在上传中...请稍候";
    textArea.disabled = true; // 防止上传时用户乱输入

    // 3. 准备数据
    const formData = new FormData();
    formData.append('file', file);

    try {
        // 4. 调用 API
        const data = await API.uploadFile(formData);

        if (data.success) {
            let insertText = '';
            
            // 5. 根据类型生成 Markdown/HTML
            if (data.type === 'image') {
                insertText = `\n![img](${data.url})\n`;
            } else if (data.type === 'video') {
                insertText = `\n<video src="${data.url}" controls width="100%"></video>\n`;
            } else if (data.type === 'audio') {
                insertText = `\n<audio src="${data.url}" controls></audio>\n`;
            } else {
                insertText = `\n[📎 下载: ${data.originalName}](${data.url})\n`;
            }

            // 6. 插入内容 (使用工具函数)
            insertAtCursor(textArea, insertText);
            
        } else {
            alert("上传失败: " + (data.message || '未知错误'));
        }
    } catch (err) {
        console.error(err);
        alert("上传出错，请检查网络");
    } finally {
        // 7. 恢复状态
        inputElement.value = ''; // 清空，允许重复传同一张
        textArea.placeholder = originalPlaceholder;
        textArea.disabled = false;
        textArea.focus(); // 聚焦回去
    }
};

// 页面加载完成
console.log('App 初始化完成');