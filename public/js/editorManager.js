import { API } from './api.js';
// 1. 引入档案管理员
import { saveDraft as saveToStorage, removeDraft } from './draftManager.js';

import {saveUserViewState} from './mapManager.js'

import {debounce} from './utils.js'

// 状态管理
let editorState = {
    currentDraft: null, // ⚡️ 核心：只存这个统一对象
    file: null,         // 暂存上传文件
    isDirty: false
};

// 定义一个全局计时器变量
let statusTimeout = null;

// ==========================================
// ⚡️ 初始化：绑定编辑器内部的静态按钮事件
// ==========================================
function initEditorEvents() {
    // 1. 关闭按钮
    const closeBtn = document.querySelector('#editor-modal .btn-icon');
    if(closeBtn) closeBtn.addEventListener('click', closeEditor);

    const cancelBtn = document.querySelector('#editor-modal .btn-secondary');
    if(cancelBtn) cancelBtn.addEventListener('click', closeEditor);

    // 2. 发布按钮
    const saveBtn = document.querySelector('#editor-modal .btn-primary');
    if(saveBtn) saveBtn.addEventListener('click', saveEditorContent);

    // 3. 预览切换
    const previewBtn = document.getElementById('btn-preview-toggle');
    if(previewBtn) previewBtn.addEventListener('click', togglePreview);

    // 4. 保存草稿
    // (如果你在HTML里加了保存草稿按钮，这里也要绑定，比如 id="btn-save-draft")
    document.getElementById('btn-save-draft').addEventListener('click', saveDraft);

    // 5. 绑定文件上传事件 
    const fileInput = document.getElementById('editor-file');
    if (fileInput) {
        // 当用户选择了文件 (change) 时，调用 handleEditorUpload
        fileInput.addEventListener('change', function() {
            // this 指向 input 元素本身
            handleEditorUpload(this); 
        });
    }

    // 绑定删除按钮
    const deleteBtn = document.getElementById('btn-editor-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteCurrentItem);
    }
}


// ==========================================
// 1. 核心操作：打开与关闭
// ==========================================


/**
 * 打开编辑器 (接收统一的草稿对象)
 * @param {Object} options - 必须包含 { note: draftObject }
 */
export function openEditor(options) {
    const { note } = options;
    if (!note) return console.error("openEditor 需要传入 note 对象");

    // 1. 存入状态
    editorState.currentDraft = note;
    editorState.isDirty = false;
    editorState.file = null;

    // 2. 获取 DOM
    const modal = document.getElementById('editor-modal');
    const titleInput = document.getElementById('editor-title');
    const contentInput = document.getElementById('editor-content');
    const visibilitySelect = document.getElementById('editor-visibility');
    const modalTitle = document.getElementById('modal-title-text');

    // 3. UI 重置
    document.getElementById('editor-preview').classList.add('hidden');
    contentInput.classList.remove('hidden');

    // 4. ⚡️ 直接填充数据 (Draft 对象里有什么填什么)
    titleInput.value = note.title || '';
    contentInput.value = note.content || '';
    visibilitySelect.value = note.visibility || 'public';

    // ============================================================
    // ➕ 新增：检查是否有未保存的“编辑中”草稿
    // ============================================================
    if (note.id) {
        // 只有已发布的笔记才需要检查这个 key
        const draftKey = `draft_edit_${note.id}`;
        const savedDraft = localStorage.getItem(draftKey);

        if (savedDraft) {
            try {
                const draftData = JSON.parse(savedDraft);
                
                // 简单的提示 (实际项目中可以对比一下时间，如果草稿比服务器旧就别提示了)
                if (confirm(`检测到您上次编辑 "${note.title}" 时有保存的草稿，是否恢复？`)) {
                    // 覆盖输入框
                    titleInput.value = draftData.title;
                    contentInput.value = draftData.content;
                    
                    // 标记为“已修改”，这样用户即使不改也能直接点保存
                    editorState.isDirty = true; 
                    
                    // 同时更新一下当前状态里的 draft 对象，防止逻辑脱节
                    editorState.currentDraft.title = draftData.title;
                    editorState.currentDraft.content = draftData.content;
                }
            } catch (e) {
                console.error("草稿解析失败", e);
            }
        }
    }
    // ============================================================

    // 5. 设置顶部标题 (根据有无 ID 判断)
    modalTitle.innerText = note.id ? '编辑笔记' : '新建笔记';

    // 6. 显示模态框
    modal.classList.remove('hidden');
    void modal.offsetWidth; 
    modal.classList.add('active');
}

/**
 * 关闭编辑器
 */
export function closeEditor() {
    const modal = document.getElementById('editor-modal');


    // 简单的防误触检查
    if (editorState.isDirty && !confirm('内容未保存，确定要关闭吗？')) {
        return;
    }

    modal.classList.remove('active');

    if (window.loadNotes) {
        window.loadNotes(); 
    }

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300); // 等待 CSS transition 结束


}

// ==========================================
// 2. 编辑器功能：Markdown & 预览
// ==========================================

/**
 * 插入 Markdown 语法 (加粗、斜体等)
 * @param {String} prefix 前缀 (如 "**")
 * @param {String} suffix 后缀 (如 "**")
 */
export function insertMarkdown(prefix, suffix) {
    const textarea = document.getElementById('editor-content');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    // 替换文本
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    textarea.value = newText;

    // 恢复焦点并选中新插入的内容
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    
    // 标记为已修改
    editorState.isDirty = true;
}

/**
 * 切换 预览/编辑 模式
 */
// public/js/editorManager.js

export function togglePreview() {
    const textarea = document.getElementById('editor-content');
    const previewDiv = document.getElementById('editor-preview');
    const btn = document.getElementById('btn-preview-toggle');

    if (!textarea || !previewDiv || !btn) return console.error('预览元素缺失');

    // 判断当前是否是隐藏状态 (即准备进入预览)
    if (previewDiv.classList.contains('hidden')) {
        // ==============================
        // 🟢 进入预览模式
        // ==============================
        const md = textarea.value;

        // 1. 解析 & 净化
        // 注意：先 parse 再 sanitize 是正确的顺序
        let html = DOMPurify.sanitize(marked.parse(md));

        // 2. 获取 Token
        // ⚠️ 请检查你的 localStorage Key 是 'token' 还是 'userToken'，这里要对应上
        const token = localStorage.getItem('userToken'); 
        
        // 3. ⚡️⚡️ 注入 Token ⚡️⚡️
        if (token) {
            // 定义替换函数
            // 参数顺序修正：match, prefix(前缀), src(链接), suffix(后缀)
            const addTokenToUrl = (match, prefix, src, suffix) => {
                // 此时:
                // prefix = <img src="
                // src    = /uploads/foo.png
                // suffix = "
                
                // 只处理指向本站 uploads 目录的链接
                if (src.includes('/uploads/')) {
                    // 判断 URL 本身是否已经带了参数 (?key=val)
                    const separator = src.includes('?') ? '&' : '?';
                    return `${prefix}${src}${separator}token=${token}${suffix}`;
                }
                return match;
            };

            // A. 处理 <img> 标签
            // 正则说明：
            // group1: <img...src=" (非贪婪匹配直到 src=")
            // group2: ... (非引号的内容，即 URL)
            // group3: " (闭合引号)
            html = html.replace(/(<img[^>]+src=")([^"]+)(")/g, addTokenToUrl);

            // B. 处理 <video> 和 <audio>
            html = html.replace(/(<video[^>]+src=")([^"]+)(")/g, addTokenToUrl);
            html = html.replace(/(<audio[^>]+src=")([^"]+)(")/g, addTokenToUrl);

            // C. 处理 <source> (用于 video/audio 标签内部)
            html = html.replace(/(<source[^>]+src=")([^"]+)(")/g, addTokenToUrl);
        }

        // 4. 渲染与切换
        previewDiv.innerHTML = html;
        
        textarea.classList.add('hidden');
        previewDiv.classList.remove('hidden');
        
        // 按钮状态更新
        btn.innerHTML = '<span class="material-icons">edit</span> 编辑';
        btn.classList.add('active');

    } else {
        // ==============================
        // 🔄 返回编辑模式
        // ==============================
        previewDiv.classList.add('hidden');
        textarea.classList.remove('hidden');
        
        btn.innerHTML = '<span class="material-icons">visibility</span> 预览';
        btn.classList.remove('active');
        
        textarea.focus();
    }
}

// ==========================================
// 3. 数据交互：保存与发布
// ==========================================

/**
 * 保存草稿 (委托给 draftManager)
 */
export function saveDraft() {
    if (!editorState.currentDraft) return;

    // 1. 同步界面数据到对象
    editorState.currentDraft.title = document.getElementById('editor-title').value;
    editorState.currentDraft.content = document.getElementById('editor-content').value;
    
    // 2. ⚡️ 调用管理员保存
    saveToStorage(editorState.currentDraft);

    saveUserViewState(editorState.currentDraft.lat,editorState.currentDraft.lat);

    showStatus("草稿已保存");

    editorState.isDirty = false;
}

function showStatus(message) {
    const statusSpan = document.getElementById('draft-status');
    if (!statusSpan) return;

    // 1. 清除上一次的计时器 (防止文字闪烁)
    if (statusTimeout) clearTimeout(statusTimeout);

    // 2. 设置内容 (加个小勾勾图标 ✅)
    // 相比于显示时间，显示 "已自动保存" 更让人安心，不需要知道具体几分几秒
    statusSpan.innerHTML = `<span class="material-icons" style="font-size:14px; color:#28a745;">check_circle</span> ${message}`;
    
    // 3. 强制重绘 (让浏览器意识到内容变了，准备开始动画)
    // 这一步在某些浏览器是必须的，防止动画被合并
    void statusSpan.offsetWidth; 

    // 4. 显示 (添加 class 触发 CSS transition)
    statusSpan.classList.add('show');

    // 5. 3秒后淡出
    statusTimeout = setTimeout(() => {
        statusSpan.classList.remove('show');
    }, 3000);
}

/**
 * 发布/保存笔记
 */
export async function saveEditorContent() {
    const draft = editorState.currentDraft;
    if (!draft) return;

    const saveBtn = document.querySelector('#editor-modal .btn-primary');

    // 1. 获取最新值
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    const visibility = document.getElementById('editor-visibility').value;

    if (!title || !content) return alert('标题和内容不能为空');

    const originalText = saveBtn.innerHTML;
    const originalColor = saveBtn.style.backgroundColor;

    try {
        // 2. ⚡️ 根据 draft.id 判断是新建还是更新
        if (draft.id) {
            // --- 更新 ---
            await API.updateNote(draft.id, { title, content, visibility });
        } else {
            // --- 新建 ---
            // 坐标在 draft 对象里
            await API.createNote({
                title, content, visibility,
                lat: draft.lat,
                lng: draft.lng,
                file: editorState.file
            });
        }

        // window.insertMarkdown();

        saveUserViewState(draft.lat,draft.lng);

        saveBtn.style.backgroundColor = 'var(--success-color)';
        saveBtn.innerHTML = '<span class="material-icons">check</span> 发布成功！';

        // 延迟 2 秒后执行清理和关闭
        setTimeout(() => {
            removeDraft(draft);
            editorState.isDirty = false;
            closeEditor();
            if (window.loadNotes) window.loadNotes(); 
            setTimeout(() => {
                saveBtn.style.backgroundColor = originalColor; // 恢复原色 (或空字符串)
                saveBtn.innerHTML = originalText;
            }, 500);
        }, 1500);
        
    } catch (err) {
        console.error(err);
        alert('操作失败: ' + err.message);
    }
}

/**
 * 🗑️ 删除当前正在编辑的项目 (草稿或笔记)
 */
export async function deleteCurrentItem() {
    const draft = editorState.currentDraft;
    if (!draft) return;

    // A. 情况一：删除已发布的笔记 (有 ID)
    if (draft.id) {
        if (!confirm('⚠️ 确定要永久删除这篇笔记吗？此操作不可恢复！')) return;

        try {
            const res = await API.deleteNote(draft.id);
            if (res.success) {
                alert('删除成功');
                // 也要清理掉可能存在的编辑草稿
                removeDraft(draft);
                finishDelete();
            } else {
                alert('删除失败: ' + res.message);
            }
        } catch (e) {
            console.error(e);
            alert('删除出错');
        }
    } 
    // B. 情况二：删除未发布的草稿 (无 ID)
    else {
        if (!confirm('确定要丢弃这个草稿吗？')) return;
        
        // 直接从本地存储移除
        removeDraft(draft);
        alert('草稿已丢弃');
        finishDelete();
    }
}

// 内部辅助函数：删除成功后的收尾工作
function finishDelete() {
    editorState.isDirty = false; // 重置脏状态，防止关闭时弹窗
    closeEditor();               // 关闭编辑器
    if (window.loadNotes) window.loadNotes(); // 刷新地图，移除图标
}

/**
 * 处理编辑器内的文件上传 
 */
export async function handleEditorUpload(input) {
    // 1. 获取文件
    const file = input.files[0];
    if (!file) return;

    // 2. 获取编辑器 DOM 元素
    const textarea = document.getElementById('editor-content');
    if (!textarea) return;

    // 3. 锁定 UI：防止上传过程中用户乱输入
    const originalPlaceholder = textarea.placeholder;
    textarea.disabled = true;
    textarea.placeholder = `⏳ 正在上传 ${file.name}，请稍候...`;

    // 4. 准备表单数据
    const formData = new FormData();
    formData.append('file', file);

    try {
        // 5. 调用 API (复用 api.js 的逻辑)
        const res = await API.uploadFile(formData);

        if (res.success) {
            let insertText = '';

            // 6. 根据文件类型生成 Markdown
            if (res.type === 'image') {
                // 图片语法: ![alt](url)
                insertText = `\n![image](${res.url})\n`;
            } else if (res.type === 'video') {
                // 视频 (使用 HTML 标签以支持播放控件)
                insertText = `\n<video src="${res.url}" controls width="100%"></video>\n`;
            } else if (res.type === 'audio') {
                // 音频
                insertText = `\n<audio src="${res.url}" controls></audio>\n`;
            } else {
                // 其他文件: 显示下载链接
                insertText = `\n[📎 附件: ${file.name}](${res.url})\n`;
            }

            // 7. ⚡️ 关键点：使用 insertMarkdown 插入到光标位置
            // (这是 editorManager 特有的功能，比 app.js 的追加更好用)
            insertMarkdown(insertText, ''); 

            // 8. 触发自动保存逻辑
            // insertMarkdown 内部已经设置了 isDirty = true，这里不用重复设

        } else {
            alert(`上传失败: ${res.message}`);
        }

    } catch (err) {
        console.error(err);
        alert('上传出错，请检查网络连接');
    } finally {
        // 9. 无论成功失败，都要恢复 UI 状态
        textarea.disabled = false;
        textarea.placeholder = originalPlaceholder;
        textarea.focus(); // 焦点还给输入框
        
        // 10. 清空 input，允许用户立刻再次上传同一个文件
        input.value = '';
    }
}


const autoSaveHandler = debounce(() => {
    console.log("自动保存...");
    saveDraft();
    showStatus("草稿已自动保存");
}, 5000);

const textarea = document.getElementById('editor-content');
if (textarea) {
    textarea.addEventListener('input', () => {
        // 1. 立即标记为“脏” (让 UI 可以立刻响应，比如启用保存按钮)
        editorState.isDirty = true;
        
        // 2. 告诉自动保存助手：“用户停下来 2 秒后，帮我存一下”
        // 如果用户一直在打字，这个函数会被一直推迟，直到用户停手
        autoSaveHandler(); 
    });
}

initEditorEvents();
window.insertMarkdown = insertMarkdown; 
window.togglePreview = togglePreview;