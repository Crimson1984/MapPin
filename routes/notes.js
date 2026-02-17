const express = require('express');
const router = express.Router();
const db = require('../config/db');

const authenticateToken = require('../middleware/auth');

const path = require('path');
const fs = require('fs');
const xss = require('xss'); // 如果你有用到

// --- 获取笔记接口 (终极版: 支持好友可见性) ---
router.get('/', authenticateToken, (req, res) => {
    const currentUser = req.user.username; 

    const targetUser = req.query.targetUser; // 如果指定了看某人

    console.log(`[读取] 用户 ${currentUser} 正在请求${targetUser}地图数据...`);

    let sql = '';
    let params = [];

    // --- 场景 A: 访问特定某人的主页 (targetUser) ---
    if (targetUser) {
        if (currentUser === targetUser) {
            // 1. 如果是看自己: 看全部
            sql = 'SELECT * FROM notes WHERE username = ?';
            params = [currentUser];
        } else {
            // 2. 如果是看别人:
            // 先判断我们是不是好友?
            // (这里为了简化，我们直接查询: 公开的 OR (是好友可见 AND 我们是好友))
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
            // 参数顺序: targetUser (笔记作者), me, target, target, me
            params = [targetUser, currentUser, targetUser, targetUser, currentUser];
        }
    } 
    // --- 场景 B: 浏览全图 (默认模式) ---
    else {
        // 逻辑:
        // 1. 所有人的公开笔记
        // 2. 我自己的所有笔记
        // 3. 我好友的“好友可见”笔记
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
        // 参数: 我(匹配username), 我(查好友做requester), 我(查好友做receiver)
        params = [currentUser, currentUser, currentUser];
    }

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});



// --- 发布新笔记 ---
// 1. 在路径后面加上 authenticateToken，表示先过安检，再执行后面的函数
router.post('/', authenticateToken, (req, res) => {
    
    // 2. 从 Token 里获取真实的用户名 (不再使用 req.body.username)
    const username = req.user.username; 
    const { title, content, lat, lng, visibility } = req.body;

    // 🛡️ 核心步骤: 清洗数据
    // 如果 content 里有 <script>alert(1)</script>
    // xss() 会把它变成 &lt;script&gt;alert(1)&lt;/script&gt; (纯文本显示，不执行)
    const cleanTitle = xss(title);
    //const cleanContent = xss(content);
    const cleanContent = content; //暂时将清洗交给前端DOMPurify


    const safeVisibility = visibility || 'public';

    console.log(`[发布笔记] 用户 ${username} 正在发布笔记...`);

    const sql = 'INSERT INTO notes (username, title, content, lat, lng, visibility) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(sql, [username, cleanTitle, cleanContent, lat, lng, safeVisibility], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: '发布失败' });
        }
        res.json({ 
            success: true, 
            id: result.insertId, 
            message: '发布成功',
            // 返回给前端更新界面用
            note: { id: result.insertId, username, title, content, lat, lng, visibility: safeVisibility, created_at: new Date() }
        });
    });
});


// --- 删除笔记 (带文件清理版)---
// 路径中的id是一个占位符
router.delete('/:id', authenticateToken, (req,res) => { //加安检
    //强制把 id 转为数字 (防止字符串匹配失败)
    const noteId = parseInt(req.params.id);
    const username = req.user.username;; //获取是谁在请求删除,从 Token 获取真实身份


    // [调试] 在终端打印接收到的数据
    console.log(`[删除] 用户 ${username} 尝试删除笔记 ${noteId}`);

    //安全检查:查看这条笔记是否是此人写的
    const checkSql = 'SELECT * FROM notes WHERE id = ?';
    db.query(checkSql, [noteId], (err, results) => {
        if (err) {
            console.error('[错误] 数据库查询出错:', err);
            return res.status(500).json({ success: false, message: '数据库错误' });
        }

        // [调试] 打印数据库查到的结果
        console.log(`数据库查询结果:`, results);

        // 如果结果是空数组 []，说明数据库里根本没有这个 ID
        if (results.length === 0) {
            console.log('[失败] 数据库里找不到这条笔记！');
            return res.status(404).json({ success: false, message: '笔记不存在' });
        }

        const note = results[0];
        if (note.username !== username) {
            console.log(`[拒绝] 权限不足。笔记归属: ${note.username}, 请求者: ${username}`);
            return res.status(403).json({ success: false, message: '你无权删除这条笔记！' });
        }

        // --- 🧹 开始清理文件 ---
        // 正则表达式: 匹配 Markdown 图片/链接 中的路径
        // 目标格式: /uploads/resources/xxxx/xx/xxx.jpg
        const regex = /\/uploads\/resources\/[\w\-\.\/]+/g;
        const filePaths = note.content.match(regex); // 找出一共有几个附件

        if (filePaths) {
            filePaths.forEach(webPath => {
                
                const diskPath = path.join(__dirname, '..', webPath.substring(1));
                
                // 物理删除 (如果不报错就删，报错(比如文件早没了)就忽略)
                fs.unlink(diskPath, (err) => {
                    if (err) console.error(`[清理失败] ${diskPath}:`, err.message);
                    else console.log(`[清理成功] ${diskPath}`);
                });
            });
        }
        // --- 清理结束 ---

        //通过验证
        const deleteSql = 'DELETE FROM notes WHERE id = ?';
        db.query(deleteSql, [noteId], (err, result) => {
            if(err){
                console.error('[错误] 删除执行失败:', err);
                return res.status(500).json({ success: false, message: '删除失败'});
            }
            console.log('[成功] 笔记已删除');
            res.json({ success: true, message:'删除成功'});
        });
    });
});


// --- 修改笔记 ---
router.put('/:id', authenticateToken, (req,res) =>{
    const noteId = parseInt(req.params.id);
    const username = req.user.username; // 从 Token 获取真实身份
    const { title, content, visibility } = req.body; // 注意: body 里不需要 username 了

    console.log(`[修改请求]用户 ${username} 尝试修改笔记 ${noteId}`);

    // 🛡️ 清洗
    const cleanTitle = xss(title);
    //const cleanContent = xss(content);
    const cleanContent = content; //暂时将清洗交给前端DOMPurify

    //验证权限
    const checkSql = 'SELECT username FROM notes WHERE id = ?';
    db.query(checkSql, [noteId], (err, results) =>{
        if(err || results.length === 0) {
            return res.status(404).json({ success: false, message: '笔记不存在'});
        }

        if(results[0].username !== username) {
            return res.status(403).json({ success: false, message: '无权限修改笔记'});
        }

        //鉴权成功
        const updateSql = 'UPDATE notes SET title = ?,content = ?,visibility = ? WHERE id = ?';
        db.query(updateSql, [cleanTitle, cleanContent, visibility, noteId], (err,result) => {
            if(err) {
                console.error('更新失败', err);
                return res.status(500).json({ success: false, message: '更新失败'});
            }
            console.log('[成功]笔记内容已更新');
            res.json({ success: true, message: '更新成功'});
        });
    });
});

module.exports = router;