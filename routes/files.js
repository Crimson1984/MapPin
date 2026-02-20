const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/auth'); // 记得引入中间件
const upload = require('../middleware/upload');
const { SECRET_KEY } = require('../config/config');
const jwt = require('jsonwebtoken');
const db = require('../config/db');


// --- 通用文件上传接口 (笔记附件) ---
// upload.single('file') 表示接收字段名为 'file' 的文件
router.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {

    const currentUser = req.user.username; 
    console.log(`[上传文件] 用户 ${currentUser} 正在上传文件...`);

    if (!req.file) {
        console.log(`[上传文件] 用户 ${currentUser} 未选择文件❓`);
        return res.status(400).json({ success: false, message: '未选择文件' });
    }

    const fileUrl = '/' + req.file.path.replace(/\\/g, '/');

    // 识别文件类型 (image, video, audio)
    const mimeType = req.file.mimetype;
    let type = 'file';
    if (mimeType.startsWith('image/')) type = 'image';
    else if (mimeType.startsWith('video/')) type = 'video';
    else if (mimeType.startsWith('audio/')) type = 'audio';

    console.log(`[上传文件] 用户 ${currentUser} 上传${type} 🟢路径:${fileUrl}`);

    res.json({ 
        success: true, 
        url: fileUrl, 
        type: type, 
        originalName: req.file.originalname 
    });
});

// --- 安全资源访问接口 ---
router.get('/uploads/resources/*filepath', authenticateToken ,(req, res) => {
    let relativePath = req.params.filepath;
    if (Array.isArray(relativePath)) {
        relativePath = relativePath.join('/');
    }

    const dbStoredPath = `/uploads/resources/${relativePath}`;
    const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) return res.status(401).send('无权访问: 请登录');

    // ⚡️ 修改点 1: 在 jwt.verify 的回调函数前面加上 async
    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.status(403).send('无权访问: Token 无效');
        
        const currentUsername = user.username;

        const sql = `
            SELECT n.*, f.status as friend_status
            FROM notes n
            LEFT JOIN friendships f ON 
                (f.requester = ? AND f.receiver = n.username) OR 
                (f.requester = n.username AND f.receiver = ?)
            WHERE n.content LIKE ? 
            LIMIT 1
        `;
        
        // ⚡️ 修改点 2: 增加 try...catch 包裹数据库操作
        try {
            // ⚡️ 修改点 3: 移除嵌套回调，使用 await 和解构提取结果
            const [results] = await db.query(sql, [currentUsername, currentUsername, `%${dbStoredPath}%`]);

            if (results.length === 0) {
                return res.status(404).send('资源未找到或无权访问'); 
            }

            const note = results[0];
            let isAllowed = false;

            if (note.username === currentUsername) isAllowed = true;
            else if (note.visibility === 'public') isAllowed = true;
            else if (note.visibility === 'friends' && note.friend_status === 'accepted') isAllowed = true;

            if (isAllowed) {
                const absolutePath = path.join(__dirname, '../uploads', 'resources', relativePath);
                if (fs.existsSync(absolutePath)) {
                    res.sendFile(absolutePath);
                } else {
                    res.status(404).send('文件实体丢失');
                }
            } else {
                res.status(403).send('无权访问此资源');
            }

        } catch (dbErr) {
            // ⚡️ 修改点 4: 集中处理数据库查询报错
            console.error('资源权限验证查询失败:', dbErr);
            res.status(500).send('服务器内部错误');
        }
    });
});


module.exports = router;