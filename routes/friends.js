const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/auth');

// --- 1. 发送好友请求 ---
router.post('/request', authenticateToken, async (req, res) => {
    const requester = req.user.username; 
    const { receiver } = req.body;

    if (requester === receiver) {
        return res.status(400).json({ success: false, message: '不能添加自己为好友' });
    }

    // ⚡️ 修改点 2: 用 try...catch 包裹所有数据库操作
    try {
        const sqlCheck = 'SELECT * FROM friendships WHERE (requester = ? AND receiver = ?) OR (requester = ? AND receiver = ?)';
        
        // ⚡️ 修改点 3: 第一次查询 (用 await 等待，解构出 results)
        const [results] = await db.query(sqlCheck, [requester, receiver, receiver, requester]);

        if (results.length > 0) {
            const rel = results[0];

            console.log(`[好友申请] ${requester} 向 ${receiver}`);

            if (rel.status === 'accepted') {
                return res.json({ success: false, message: '你们已经是好友了' });
            }
            if (rel.status === 'pending') {
                return res.json({ success: false, message: '申请已发送，请等待对方处理' });
            }

            // Case 3: 之前被拒绝过 -> 执行 UPDATE
            if (rel.status === 'rejected') {
                const sqlUpdate = 'UPDATE friendships SET status = "pending", requester = ?, receiver = ? WHERE id = ?';
                // ⚡️ 修改点 4: 消灭嵌套回调，直接 await 即可
                await db.query(sqlUpdate, [requester, receiver, rel.id]);
                return res.json({ success: true, message: '已重新发送好友申请!' });
            }
        } else {
            // Case 4: 这是一个全新的申请 -> 执行 INSERT
            const sqlInsert = 'INSERT INTO friendships (requester, receiver, status) VALUES (?, ?, "pending")';
            // ⚡️ 修改点 5: 同样消灭回调，直接 await
            await db.query(sqlInsert, [requester, receiver]);
            return res.json({ success: true, message: '好友申请已发送!' });
        }
    } catch (err) {
        // 集中捕获 SELECT, UPDATE, INSERT 任何一步可能发生的错误
        console.error('好友请求处理错误:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// --- 2. 获取“待处理”的好友请求 ---
router.get('/pending', authenticateToken, async (req, res) => {
    const myName = req.user.username;
    
    try {
        const sql = 'SELECT * FROM friendships WHERE receiver = ? AND status = "pending"';
        const [results] = await db.query(sql, [myName]);
        res.json(results);
    } catch (err) {
        console.error('获取待处理请求失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// --- 3. 同意/拒绝好友请求 ---
router.put('/response', authenticateToken, async (req, res) => {
    const { id, action } = req.body; 
    
    try {
        const sql = 'UPDATE friendships SET status = ? WHERE id = ?';
        await db.query(sql, [action, id]);
        console.log(`[申请已处理] ID:${id} Action:${action}`);
        res.json({ success: true, message: '操作成功' });
    } catch (err) {
        console.error('处理好友请求失败:', err);
        res.status(500).json({ success: false, message: '操作失败' });
    }
});

module.exports = router;