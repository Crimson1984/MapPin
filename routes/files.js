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

// --- 🔐 安全资源访问接口 (最终修复版) ---
router.get('/uploads/resources/*filepath', (req, res) => {
    
    // ⚡️ 修复核心: 处理数组类型的路径参数
    let relativePath = req.params.filepath;
    if (Array.isArray(relativePath)) {
        relativePath = relativePath.join('/'); // 把 ['2026', '02', 'x.png'] 变成 "2026/02/x.png"
    }

    // 构造数据库查询路径
    const dbStoredPath = `/uploads/resources/${relativePath}`;

    // 获取 Token
    const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) return res.status(401).send('无权访问: 请登录');

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).send('无权访问: Token 无效');
        
        const currentUsername = user.username;

        // SQL 查询
        const sql = `
            SELECT n.*, f.status as friend_status
            FROM notes n
            LEFT JOIN friendships f ON 
                (f.requester = ? AND f.receiver = n.username) OR 
                (f.requester = n.username AND f.receiver = ?)
            WHERE n.content LIKE ? 
            LIMIT 1
        `;
        
        db.query(sql, [currentUsername, currentUsername, `%${dbStoredPath}%`], (dbErr, results) => {
            if (dbErr || results.length === 0) {
                return res.status(404).send('资源未找到或无权访问'); 
            }

            const note = results[0];
            let isAllowed = false;

            if (note.username === currentUsername) isAllowed = true;
            else if (note.visibility === 'public') isAllowed = true;
            else if (note.visibility === 'friends' && note.friend_status === 'accepted') isAllowed = true;

            if (isAllowed) {
                // 发送文件
                const absolutePath = path.join(__dirname, '../uploads', 'resources', relativePath);
                if (fs.existsSync(absolutePath)) {
                    res.sendFile(absolutePath);
                } else {
                    res.status(404).send('文件实体丢失');
                }
            } else {
                res.status(403).send('无权访问此资源');
            }
        });
    });
});


module.exports = router;