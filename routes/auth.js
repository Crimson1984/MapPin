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
    console.log('收到注册请求:', username); // 密码不打印，安全第一

    try {
        // 1. 生成盐 (Salt): 就像炒菜加佐料，让密码更难被破解
        const salt = await bcrypt.genSalt(10);
        
        // 2. 加密密码: 把明文变成乱码
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. 存入数据库: 注意这里存的是 hashedPassword
        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.query(sql, [username, hashedPassword], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: '注册失败 (可能用户名已存在)' });
            }
            res.status(200).json({ success: true, message: '注册成功!' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '服务器加密出错' });
    }
});


// --- 登录接口 ---
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // 1. 第一步: 只根据用户名查找用户
    const sql = 'SELECT * FROM users WHERE username = ?';
    
    db.query(sql, [username], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: '服务器错误' });

        // 如果连人都没找到
        if (results.length === 0) {
            return res.json({ success: false, message: '用户不存在' });
        }

        const user = results[0];

        // 2. 第二步: 比对密码 (关键步骤!)
        // bcrypt.compare(用户输入的明文, 数据库里的乱码)
        // 这是一个异步操作，会返回 true 或 false
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // 密码正确！
            // ⚡️ 新增: 生成 Token (数字身份证)
            // payload: 身份证上写什么信息? (存 id 和 username)
            // expiresIn: 有效期 (比如 1 小时后过期，需要重新登录)
            const token = jwt.sign(
                { id: user.id, username: user.username }, 
                SECRET_KEY, 
                { expiresIn: '1h' }
            );

            // 把 token 发给前端
            res.json({ 
                success: true, 
                message: '登录成功!', 
                username: user.username,
                token: token // <--- 这里把 token 发过去了
            });
        } else {
            // 密码错误
            res.json({ success: false, message: '密码错误!' });
        }
    });
});

module.exports = router;
