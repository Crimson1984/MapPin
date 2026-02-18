/**
 * 统一草稿对象
 * 这个对象贯穿：快速弹窗 -> 逻辑处理 -> 全屏编辑器 -> API提交
 */
const DraftNote = {
    // 1. 身份标识
    // 如果是 null，代表这是“新建模式” (Create Mode)
    // 如果有值 (如 "note_123")，代表这是“编辑模式” (Edit Mode)，且对应后端数据库ID
    id: null, 

    // 2. 地理信息 (新建必填，编辑时从旧数据继承)
    lat: 31.2304,
    lng: 121.4737,

    // 3. 内容数据 (会随着用户输入不断更新)
    title: "",        // 默认为空字符串
    content: "",      // 支持 Markdown
    visibility: "public", // 默认公开

    // 4. 附件 (可选)
    file: null,       // File 对象，用于上传图片

    // 5. 元数据 (用于本地存储/恢复逻辑)
    lastModified: 1708234567890, // 时间戳
    isDirty: false    // 标记内容是否被修改过（用于未保存提示）
};