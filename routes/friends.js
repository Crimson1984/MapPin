const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/auth');

// --- 1. 发送好友请求 ---
router.post('/request', authenticateToken, (req, res) => {
    const requester = req.user.username; 
    const { receiver } = req.body;

    // 自己不能加自己
    if (requester === receiver) {
        return res.status(400).json({ success: false, message: '不能添加加自己为好友' });
    }

    // 1. 检查是否已经存在记录 (无论 pending, accepted, 还是 rejected)
    const sqlCheck = 'SELECT * FROM friendships WHERE (requester = ? AND receiver = ?) OR (requester = ? AND receiver = ?)';
    
    db.query(sqlCheck, [requester, receiver, receiver, requester], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: '服务器错误' });

        if (results.length > 0) {
            const rel = results[0];

            // Case 1: 已经是好友
            if (rel.status === 'accepted') {
                return res.json({ success: false, message: '你们已经是好友了' });
            }

            // Case 2: 申请中
            if (rel.status === 'pending') {
                return res.json({ success: false, message: '申请已发送，请等待对方处理' });
            }

            // Case 3: 之前被拒绝过 (核心修复点!)
            // 逻辑: 找到那条死掉的记录，把它的状态改回 'pending'，并更新发起人和接收人
            // (为什么要更新发起人? 因为可能是 B 拒绝了 A，现在 A 又想加 B，或者 B 后悔了想反向加 A)
            if (rel.status === 'rejected') {
                const sqlUpdate = 'UPDATE friendships SET status = "pending", requester = ?, receiver = ? WHERE id = ?';
                db.query(sqlUpdate, [requester, receiver, rel.id], (err, updateResult) => {
                    if (err) return res.status(500).json({ success: false, message: '重试失败' });
                    return res.json({ success: true, message: '已重新发送好友申请!' });
                });
                return; // 结束函数，不再执行下面的 INSERT
            }
        }

        // Case 4: 这是一个全新的申请 (数据库里没记录) -> 执行插入
        const sqlInsert = 'INSERT INTO friendships (requester, receiver, status) VALUES (?, ?, "pending")';
        db.query(sqlInsert, [requester, receiver], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '申请失败' });
            res.json({ success: true, message: '好友申请已发送!' });
        });
    });
});

// --- 2. 获取“待处理”的好友请求 (别人发给我的) ---
router.get('/pending', authenticateToken, (req, res) => {
    const myName = req.user.username;
    // 查 requester 是别人，receiver 是我，且状态是 pending 的记录
    const sql = 'SELECT * FROM friendships WHERE receiver = ? AND status = "pending"';
    
    db.query(sql, [myName], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- 3. 同意/拒绝好友请求 ---
router.put('/response', authenticateToken, (req, res) => {
    const { id, action } = req.body; // id 是 friendship 表的主键, action 是 'accepted' 或 'rejected'
    
    const sql = 'UPDATE friendships SET status = ? WHERE id = ?';
    db.query(sql, [action, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: '操作失败' });
        res.json({ success: true, message: '操作成功' });
    });
});

module.exports = router;