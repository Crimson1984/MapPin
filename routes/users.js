const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');



// --- 搜索用户接口 ---
router.get('/search', authenticateToken, async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    const sql = 'SELECT id, username FROM users WHERE username LIKE ? LIMIT 10';
    
    try {
        const [results] = await db.query(sql, [`%${query}%`]);
        res.json(results);
    } catch (err) {
        console.error('搜索用户失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// --- 上传头像接口 ---
// upload.single('avatar') 表示接收一个字段名为 'avatar' 的文件
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    const currentUser = req.user.username; 
    console.log(`[上传头像] 用户 ${currentUser} 正在上传头像...`);
    
    if (!req.file) {
        console.log(`[上传头像] 用户 ${currentUser} 未选择文件❓`);
        return res.status(400).json({ success: false, message: '请选择一张图片' });
    }

    const userId = req.user.id;
    const relativePath = path.relative(path.join(__dirname, '../'), req.file.path);
    const fileUrl = '/' + relativePath.replace(/\\/g, '/');

    const sql = 'UPDATE users SET avatar = ? WHERE id = ?';
    
    try {
        await db.query(sql, [fileUrl, userId]);
        console.log(`[上传头像] 用户 ${currentUser} 上传头像成功✅${fileUrl}`);
        res.json({ success: true, message: '头像上传成功', avatarUrl: fileUrl });
    } catch (err) {
        console.error(`[上传头像] 用户 ${currentUser} 数据库更新失败❌`, err);
        res.status(500).json({ success: false, message: '数据库更新失败' });
    }
});

// --- 获取当前用户信息 (包含头像) ---
// 为了让前端知道显示什么头像，我们需要一个获取"我自己"信息的接口
router.get('/me', authenticateToken, async (req, res) => {
    const sql = 'SELECT id, username, avatar FROM users WHERE id = ?';
    
    try {
        const [results] = await db.query(sql, [req.user.id]);
        
        if (results.length === 0) {
            return res.status(404).json({ message: '用户不存在' });
        }
        
        res.json(results[0]);
    } catch (err) {
        console.error('获取当前用户信息失败:', err);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

module.exports = router;
