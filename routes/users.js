const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');



// --- 搜索用户接口 ---
router.get('/search', (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    // 使用 SQL 的 LIKE 语句进行模糊匹配
    // % 表示任意字符，所以 %adm% 能匹配 "admin", "superadmin"
    const sql = 'SELECT id, username FROM users WHERE username LIKE ? LIMIT 10';
    
    db.query(sql, [`%${query}%`], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// --- 上传头像接口 ---
// upload.single('avatar') 表示接收一个字段名为 'avatar' 的文件
router.post('/avatar', authenticateToken, upload.single('avatar'), (req, res) => {

    const currentUser = req.user.username; 
    console.log(`[上传头像] 用户 ${currentUser} 正在上传头像...`);
    
    // 1. 如果没有文件被上传
    if (!req.file) {
        console.log(`[上传头像] 用户 ${currentUser} 未选择文件❓`);
        return res.status(400).json({ success: false, message: '请选择一张图片' });
    }

    const userId = req.user.id;

    // ⚡️ 修正: 同样使用 path.relative 自动计算正确路径
    // 这样无论它被存到 uploads/ 还是 uploads/avatars/ 都能生成正确的 URL
    const relativePath = path.relative(path.join(__dirname, '../'), req.file.path);
    const fileUrl = '/' + relativePath.replace(/\\/g, '/');

    // 更新数据库
    const sql = 'UPDATE users SET avatar = ? WHERE id = ?';
    db.query(sql, [fileUrl, userId], (err, result) => {
        if (err) {
            console.error(err);
            console.log(`[上传头像] 用户 ${currentUser} 上传失败❌`);
            return res.status(500).json({ success: false, message: '数据库更新失败' });
        }
        console.log(`[上传头像] 用户 ${currentUser} 上传头像成功✅${fileUrl}`);
        res.json({ success: true, message: '头像上传成功', avatarUrl: fileUrl });
    });
});

// --- 获取当前用户信息 (包含头像) ---
// 为了让前端知道显示什么头像，我们需要一个获取"我自己"信息的接口
router.get('/me', authenticateToken, (req, res) => {
    const sql = 'SELECT id, username, avatar FROM users WHERE id = ?';
    db.query(sql, [req.user.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: '用户不存在' });
        res.json(results[0]);
    });
});

module.exports = router;
