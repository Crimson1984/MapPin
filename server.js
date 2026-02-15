const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors()); // 允许前端跨域
app.use(express.json()); // 解析前端发来的 JSON 数据



//--- 配置数据库连接 ---
const db = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'485623',
    database:'map_app'
});

//--- 测试链接 ---
db.connect(err => {
    if(err) {
        console.error('❌连接失败,原因:',err.message);
        return;
    }
    console.log('✅成功连接到MySQL数据库!');
});


// --- 注册接口(API) ---
app.post('/register',(req,res) => {
    // 1.获取前端发来的数据
    const{username,password} = req.body;

    console.log('收到注册请求:',username,password); //在终端打印

    // 2.准备SQL语句(使用?占位符防止SQL注入)
    const sql = 'INSERT INTO users (username,password) VALUES (?, ?)';

    // 3.执行SQL
    db.query(sql, [username,password], (err,result) => {
        if(err){
            console.error(err);
            //如果报错,告诉前端
            return res.status(500).json({ success: false, message:'注册失败(可能是用户名已存在)'});
        }
        //成功则返回信息
        res.status(200).json({ success: true, message: '注册成功!'});
    });
});


// --- 登录接口 ---
app.post('/login',(req,res) => {
    const {username, password} = req.body;

    //查询数据库有没有这个人
    const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';

    db.query(sql, [username, password],(err, results) => {
        if(err){
            return res.status(500).json({ success: false, message: '服务器错误'});
        }
        if(results.length > 0){
            //登陆成功,返回用户信息
            res.json({ success: true, message: '登陆成功!', username: username});
        } else{
            //查不到说明账号或者密码错误
            res.json({success: false, message:'账号或者密码错误!'});
        }
    });
});



// --- 获取所有笔记(加载地图使用) ---
app.get('/notes', (req,res) => {

    // ⚠️ 我们需要知道是谁在查，才能决定给他看什么
    // 这里简单起见，让前端把当前用户名通过 query 参数传过来
    // 例如: /notes?username=Garvofadge
    const currentUser = req.query.username;
    const targetUser = req.query.targetUser; // 查谁 (可选)

    let sql = '';
    let params = [];

    if (targetUser) {
        // A. 访问特定模式: 只查 targetUser 的笔记
        // 规则: 如果 targetUser 是我自己，看全部; 否则只能看 public
        if (currentUser === targetUser) {
            sql = 'SELECT * FROM notes WHERE username = ?';
            params = [currentUser];
        } else {
            sql = 'SELECT * FROM notes WHERE username = ? AND visibility = "public"';
            params = [targetUser];
        }
    } else {
        // B. 默认模式 (全图): 看所有公开 + 我的私密 (这就是你上一步写的逻辑)
        sql = `
            SELECT * FROM notes 
            WHERE visibility = 'public' 
            OR (visibility = 'private' AND username = ?)
        `;
        params = [currentUser];
    }

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});



// --- 发布新笔记(点击地图保存时用)---
app.post('/notes',(req,res) => {
    const { username, title, content, lat, lng, visibility } = req.body;

    // 默认为 public，防止前端没传
    const safeVisibility = visibility || 'private';

    console.log('收到新笔记:',title, lat, lng);

    const sql = 'INSERT INTO notes (username, title, content, lat, lng, visibility) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [username, title, content, lat, lng, safeVisibility], (err,result) => {
        if(err){
            console.error(err);
            return res.status(500).json({ success: false,message:'发布失败'});
        }
        res.json({ 
            success: true, 
            id: result.insertId, 
            message: '发布成功',
            note: { id: result.insertId, username, title, content, lat, lng, visibility: safeVisibility, created_at: new Date() }
        });
    });
});


// --- 删除笔记 ---
// 路径中的id是一个占位符
app.delete('/notes/:id', (req,res) => {
    //强制把 id 转为数字 (防止字符串匹配失败)
    const noteId = parseInt(req.params.id);
    const { username } = req.body; //获取是谁在请求删除


    // [调试] 在终端打印接收到的数据
    console.log(`-----------------------------------`);
    console.log(`[1] 收到删除请求 - 目标ID: ${noteId}`);
    console.log(`[2] 操作者: ${username}`);

    //安全检查:查看这条笔记是否是此人写的
    const checkSql = ' SELECT username FROM notes WHERE id = ?';
    db.query(checkSql, [noteId], (err, results) => {
        if (err) {
            console.error('[错误] 数据库查询出错:', err);
            return res.status(500).json({ success: false, message: '数据库错误' });
        }

        // [调试] 打印数据库查到的结果
        console.log(`[3] 数据库查询结果:`, results);

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

        //通过验证
        const deleteSql = 'DELETE FROM notes WHERE id = ?';
        db.query(deleteSql, [noteId], (err, result) => {
            if(err){
                console.error('[错误] 删除执行失败:', err);
                return res.status(500).json({ success: false, message: '删除失败'});
            }
            console.log('[成功] 笔记已物理删除');
            res.json({ success: true, message:'删除成功'});
        });
    });
});


// --- 修改笔记 ---
app.put('/notes/:id', (req,res) =>{
    const noteId = parseInt(req.params.id);
    const { username, title, content, visibility } = req.body; // 获取新的波标题和内容

    console.log(`[修改请求] ID: ${noteId}, 操作者: ${username}`);

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
        db.query(updateSql, [title, content, visibility, noteId], (err,result) => {
            if(err) {
                console.error('更新失败', err);
                return res.status(500).json({ success: false, message: '更新失败'});
            }
            console.log('[成功]笔记内容已更新');
            res.json({ success: true, message: '更新成功'});
        });
    });
});


// --- 搜索用户接口 ---
// 例如: /users/search?q=adm
app.get('/users/search', (req, res) => {
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


// // --- 根目录测试(用来验证服务器是否活着) ---
// app.get('/',(req,res) => {
//     res.send('服务器正在运行中...')
// });


// --- 启动服务器 ---
app.listen(3000, ()=>{
    console.log('🚀服务器正在运行:http://localhost:3000');
});