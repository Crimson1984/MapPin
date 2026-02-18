/**
 * 🏭 工厂方法：创建一个标准的草稿对象
 * @param {Object} params - 传入的参数
 * @returns {Object} 标准草稿对象
 */
export function createDraft(params = {}) {
    return {
        // 核心身份数据
        id: params.id || null,           // 有ID=编辑旧笔记，无ID=新建
        lat: params.lat || null,         // 坐标 (新建时必填)
        lng: params.lng || null,
        
        // 内容数据
        title: params.title || '',
        content: params.content || '',
        visibility: params.visibility || 'public',
        
        // 元数据
        lastModified: Date.now(),
        isDirty: false                   // 标记是否被修改过
    };
}

/**
 * 💾 保存草稿到 LocalStorage
 * 逻辑：
 * - 如果是新建笔记，Key = 'draft_new_{lat}_{lng}'
 * - 如果是编辑笔记，Key = 'draft_edit_{id}'
 */
export function saveDraft(draft) {
    if (!draft) return;
    
    // 更新时间戳
    draft.lastModified = Date.now();
    
    const key = _generateKey(draft);
    if (key) {
        localStorage.setItem(key, JSON.stringify(draft));
        console.log(`[DraftManager] 草稿已保存: ${key}`);
    }

}

/**
 * 📖 读取草稿
 */
export function loadDraft(params) {
    // 构造一个临时对象来生成 Key
    const key = _generateKey(params);
    const json = localStorage.getItem(key);
    
    if (json) {
        try {
            return JSON.parse(json);
        } catch (e) {
            console.error("草稿解析失败", e);
            return null;
        }
    }
    return null;
}

/**
 * 🗑️ 删除草稿 (发布成功后调用)
 */
export function removeDraft(params) {
    const key = _generateKey(params);
    if (key) {
        localStorage.removeItem(key);
        console.log(`[DraftManager] 草稿已清理: ${key}`);
    }
}

/**
 * 🔒 内部辅助函数：生成统一的 Key
 */
function _generateKey(params) {
    // 1. 编辑模式：优先使用 ID
    if (params.id) {
        return `draft_edit_${params.id}`;
    }
    
    // 2. 新建模式：使用坐标
    // (为了防止浮点数精度问题，建议保留4位小数，或者直接用原始值)
    if (params.lat && params.lng) {
        return `draft_new_${params.lat}_${params.lng}`;
    }
    
    return null;
}

/**
 * 🔍 获取所有“新建笔记”的草稿 (用于在地图上显示灰色标记)
 * 只获取 draft_new_ 开头的，因为 draft_edit_ 是依附于已有笔记的
 */
export function getAllNewDrafts() {
    const drafts = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        // 只关心新建的草稿 (key 格式: draft_new_lat_lng)
        if (key && key.startsWith('draft_new_')) {
            try {
                const draft = JSON.parse(localStorage.getItem(key));
                // 确保数据完整
                if (draft && draft.lat && draft.lng) {
                    drafts.push(draft);
                }
            } catch (e) {
                console.error("解析草稿失败", key, e);
            }
        }
    }
    return drafts;
}