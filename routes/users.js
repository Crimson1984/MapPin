const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');



// --- 搜索用户接口 ---
router.get('/search', authenticateToken, async (req, res) => {
    const keyword = `%${req.query.q || ''}%`; // 获取搜索词
    const myName = req.user.username;        // 当前登录用户

    try {
        const sql = `
            SELECT 
                u.username, 
                u.avatar, 
                f.status as friend_status,
                f.requester
            FROM users u
            LEFT JOIN friendships f ON 
                (f.requester = ? AND f.receiver = u.username) OR 
                (f.receiver = ? AND f.requester = u.username)
            WHERE u.username LIKE ? AND u.username != ?
            LIMIT 15
        `;
        const [users] = await db.query(sql, [myName, myName, keyword, myName]);

        const results = users.map(u => {
            let relation = 'none';
            if (u.friend_status === 'accepted') {
                relation = 'friend';
            } else if (u.friend_status === 'pending') {
                relation = 'pending';
            }

            return {
                username: u.username,
                avatar: u.avatar,
                relation: relation // ⚡️ 把关系状态发给前端
            };
        });

        // 返回给前端 (注意检查你的前端 API 期望的数据格式是 res.json(results) 还是 {data: results})
        res.json(results); 

    } catch (err) {
        console.error('搜索出错:', err);
        res.status(500).json({ error: '服务器错误' });
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

router.put('/profile', authenticateToken, async (req, res) => {
    const { bio } = req.body;
    const username = req.user.username; // 从 Token 里安全获取当前用户

    try {
        const sql = 'UPDATE users SET bio = ? WHERE username = ?';
        await db.query(sql, [bio, username]);
        
        res.json({ success: true, message: '资料更新成功' });
    } catch (err) {
        console.error('更新资料失败:', err);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// --- 获取个人主页信息及好友关系接口 ---
// 注意：这个接口需要 authenticateToken，因为它要知道是“谁”在看这个主页
router.get('/profile/:username', authenticateToken, async (req, res) => {
    const targetUsername = req.params.username; // 前端想看的那个人的名字
    const currentUsername = req.user.username;  // 当前正在登录的人的名字

    try {
        // 第一步：先查目标用户的基本资料
        const userSql = 'SELECT id, username, avatar, bio FROM users WHERE username = ?';
        const [userResults] = await db.query(userSql, [targetUsername]);

        if (userResults.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        const profileData = userResults[0];

        // 第二步：判断关系
        // 场景 A：自己看自己
        if (targetUsername === currentUsername) {
            return res.json({
                success: true,
                profile: profileData,
                relation: 'self' // 告诉前端：这是你自己，显示“编辑资料”按钮
            });
        }

        // 场景 B：看别人，去 friendships 表里查关系
        const relationSql = `
            SELECT id, status, requester, receiver 
            FROM friendships 
            WHERE (requester = ? AND receiver = ?) 
               OR (requester = ? AND receiver = ?)
        `;
        const [relResults] = await db.query(relationSql, [currentUsername, targetUsername, targetUsername, currentUsername]);

        let relationStatus = 'none'; // 默认是陌生人 (显示 "加为好友")
        let requestId = null; // 新增变量保存请求 ID

        if (relResults.length > 0) {
            const rel = relResults[0];
            requestId = rel.id;

            if (rel.status === 'accepted') {
                relationStatus = 'friend'; // 已经是好友 (显示 "已是好友/发消息")
            } else if (rel.status === 'pending') {
                // 这里分得很细：是我发给他的，还是他发给我的？
                if (rel.requester === currentUsername) {
                    relationStatus = 'pending_sent'; // 我发出的请求，等他同意 (显示 "等待验证")
                } else {
                    relationStatus = 'pending_received'; // 他发给我的，等我同意 (显示 "同意/拒绝")
                }
            } else if (rel.status === 'rejected') {
                relationStatus = 'none'; // 被拒绝过，在前端眼里和陌生人一样，可以重新加
            }
        }

        // 第三步：把资料和关系一起打包发给前端
        res.json({
            success: true,
            profile: profileData,
            relation: relationStatus,
            requestId: requestId
        });

    } catch (err) {
        console.error('获取主页失败:', err);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

module.exports = router;
