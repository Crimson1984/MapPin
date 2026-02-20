const express = require('express');
const router = express.Router();
const db = require('../config/db');

const authenticateToken = require('../middleware/auth');

const path = require('path');
const fs = require('fs');
const xss = require('xss'); // 如果你有用到

// --- 获取笔记接口 (支持好友可见性) ---
router.get('/', authenticateToken, async (req, res) => {
    const currentUser = req.user.username; 
    const targetUser = req.query.targetUser; 

    console.log(`[读取] 用户 ${currentUser} 正在请求 ${targetUser || '全图'} 地图数据...`);

    let sql = '';
    let params = [];

    // SQL 拼接逻辑保持完全不变
    if (targetUser) {
        //孤芳自赏
        if (currentUser === targetUser) {
            sql = 'SELECT * FROM notes WHERE username = ?';
            params = [currentUser];
        } else {    //看他人笔记
            sql = `
                SELECT * FROM notes 
                WHERE username = ? 
                AND (
                    visibility = 'public'
                    OR (
                        visibility = 'friends' 
                        AND EXISTS (
                            SELECT 1 FROM friendships 
                            WHERE status = 'accepted'
                            AND (
                                (requester = ? AND receiver = ?) OR 
                                (requester = ? AND receiver = ?)
                            )
                        )
                    )
                )
            `;
            params = [targetUser, currentUser, targetUser, targetUser, currentUser];
        }
    } else {    //看全图笔记
        sql = `
            SELECT * FROM notes 
            WHERE 
                visibility = 'public' 
                OR 
                username = ? 
                OR 
                (
                    visibility = 'friends' 
                    AND username IN (
                        SELECT receiver FROM friendships WHERE requester = ? AND status = 'accepted'
                        UNION
                        SELECT requester FROM friendships WHERE receiver = ? AND status = 'accepted'
                    )
                )
        `;
        params = [currentUser, currentUser, currentUser];
    }

    try {
        const [results] = await db.query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('获取笔记列表错误:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});



// --- 发布新笔记 ---
router.post('/', authenticateToken, async (req, res) => {
    const username = req.user.username; 
    const { title, content, lat, lng, visibility } = req.body;

    const cleanTitle = xss(title);      //数据清洗
    const cleanContent = content;       //暂时将清洗交给前端DOMPurify
    const safeVisibility = visibility || 'public';

    console.log(`[发布笔记] 用户 ${username} 正在发布笔记...`);

    const sql = 'INSERT INTO notes (username, title, content, lat, lng, visibility) VALUES (?, ?, ?, ?, ?, ?)';
    
    try {
        const [result] = await db.query(sql, [username, cleanTitle, cleanContent, lat, lng, safeVisibility]);
        
        console.log(`[发布成功] 用户 ${username} 发布笔记${result.insertId}`);

        res.json({ 
            success: true, 
            id: result.insertId, // ⚡️ 这里的 result.insertId 依然可用
            message: '发布成功',
            note: { id: result.insertId, username, title, content, lat, lng, visibility: safeVisibility, created_at: new Date() }
        });
    } catch (err) {
        console.error('发布笔记错误:', err);
        res.status(500).json({ success: false, message: '发布失败' });
    }
});


// --- 删除笔记 (与文件清理)---
router.delete('/:id', authenticateToken, async (req,res) => { 
    const noteId = parseInt(req.params.id);
    const username = req.user.username; 

    console.log(`[删除] 用户 ${username} 尝试删除笔记 ${noteId}`);

    try {
        const checkSql = 'SELECT * FROM notes WHERE id = ?';
        const [results] = await db.query(checkSql, [noteId]);

        if (results.length === 0) {
            console.log('[失败] 数据库里找不到这条笔记！');
            return res.status(404).json({ success: false, message: '笔记不存在' });
        }

        const note = results[0];
        if (note.username !== username) {
            console.log(`[拒绝] 权限不足。笔记归属: ${note.username}, 请求者: ${username}`);
            return res.status(403).json({ success: false, message: '你无权删除这条笔记！' });
        }

        // --- 🧹 清理文件逻辑  ---
        const regex = /\/uploads\/resources\/[\w\-\.\/]+/g;
        const filePaths = note.content.match(regex); 

        if (filePaths) {
            filePaths.forEach(webPath => {
                const diskPath = path.join(__dirname, '..', webPath.substring(1));
                fs.unlink(diskPath, (err) => {
                    if (err) console.error(`[清理失败] ${diskPath}:`, err.message);
                    else console.log(`[清理成功] ${diskPath}`);
                });
            });
        }

        const deleteSql = 'DELETE FROM notes WHERE id = ?';
        await db.query(deleteSql, [noteId]);
        
        console.log('[成功] 笔记已删除');
        res.json({ success: true, message:'删除成功'});

    } catch (err) {
        console.error('[错误] 删除流程报错:', err);
        res.status(500).json({ success: false, message: '服务器错误'});
    }
});


// --- 修改笔记 ---
router.put('/:id', authenticateToken, async (req,res) => {
    const noteId = parseInt(req.params.id);
    const username = req.user.username; 
    const { title, content, visibility } = req.body; 

    console.log(`[修改请求]用户 ${username} 尝试修改笔记 ${noteId}`);

    const cleanTitle = xss(title);
    const cleanContent = content;       //暂时将清洗交给前端DOMPurify

    try {
        const checkSql = 'SELECT username FROM notes WHERE id = ?';
        // ⚡️ 修改点 3: await 查询鉴权
        const [results] = await db.query(checkSql, [noteId]);
        
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: '笔记不存在'});
        }

        if (results[0].username !== username) {
            return res.status(403).json({ success: false, message: '无权限修改笔记'});
        }

        const updateSql = 'UPDATE notes SET title = ?, content = ?, visibility = ? WHERE id = ?';
        await db.query(updateSql, [cleanTitle, cleanContent, visibility, noteId]);
        
        console.log('[成功]笔记内容已更新');
        res.json({ success: true, message: '更新成功'});

    } catch (err) {
        console.error('更新流程报错:', err);
        res.status(500).json({ success: false, message: '服务器内部错误'});
    }
});

module.exports = router;