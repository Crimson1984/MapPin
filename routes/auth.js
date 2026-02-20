const express = require('express');
const router = express.Router(); // 创建路由对象
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { SECRET_KEY } = require('../config/config');

// --- 注册接口(API) ---
// ⚡️ 注意: 函数前面加了 async，因为加密需要时间
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    console.log('收到注册请求:', username);

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        // ⚡️删掉回调函数，直接用 await 执行查询
        await db.query(sql, [username, hashedPassword]);

        // 走到这里说明上一步的 SQL 执行成功了
        res.status(200).json({ success: true, message: '注册成功!' });
    } catch (err) {
        console.error('注册错误:', err);
        // ⚡️ 修改点 2: 利用 try...catch 集中处理错误
        // 如果是用户名重复，MySQL 会抛出 ER_DUP_ENTRY 错误
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// --- 登录接口 ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try { 
        const sql = 'SELECT * FROM users WHERE username = ?';
        
        const [results] = await db.query(sql, [username]);

        if (results.length === 0) {
            return res.json({ success: false, message: '用户不存在' });
        }

        const user = results[0];

        // 比对密码 签发 Token
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = jwt.sign(
                { id: user.id, username: user.username }, 
                SECRET_KEY, 
                { expiresIn: '1h' }
            );

            res.json({ 
                success: true, 
                message: '登录成功!', 
                username: user.username,
                token: token
            });
        } else {
            res.json({ success: false, message: '密码错误!' });
        }
    } catch (err) {
        // 集中捕获数据库连接断开、SQL 语法错等异常
        console.error('登录查询错误:', err);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
