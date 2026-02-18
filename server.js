const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
require('dotenv').config();

// --- 0. 基础中间件 (最先执行) ---
app.use(cors());
app.use(express.json()); // 解析 JSON 请求体

// --- 1. 静态资源托管 (顺序很重要) ---

// 1.1 拦截 favicon 请求，防止后端报错 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 1.2 托管头像 (公开访问)
// 访问 http://localhost:3000/uploads/avatars/xxx.jpg -> 直接读取硬盘
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

// 1.3 托管前端网页 (Public 文件夹)
// 访问 http://localhost:3000/map.html -> 读取 public/map.html
app.use(express.static(path.join(__dirname, 'public')));


// --- 2. 引入路由模块 ---
// ⚠️ 如果你还没创建某个文件 (比如 friends.js)，请先注释掉对应的行，否则服务器会启动失败

const authRoutes = require('./routes/auth');     // 登录注册
const noteRoutes = require('./routes/notes');    // 笔记增删改查
const fileRoutes = require('./routes/files');    // 文件上传与安全访问
const userRoutes = require('./routes/users');    // 用户信息/头像
const friendRoutes = require('./routes/friends');// 好友系统

// --- 3. 挂载路由 ---

// 3.1 认证路由 (挂载在根路径)
// auth.js 里写的是 router.post('/login') -> 访问 /login
app.use('/', authRoutes); 

// 3.2 笔记路由 (挂载在 /notes)
// notes.js 里写的是 router.get('/') -> 访问 /notes
app.use('/notes', noteRoutes); 

// 3.3 文件路由 (挂载在根路径)
// files.js 里写的是 router.post('/api/upload') -> 访问 /api/upload
// files.js 里写的是 router.get('/uploads/resources/*') -> 访问 /uploads/resources/...
app.use('/', fileRoutes); 

// 3.4 用户路由 (挂载在 /users)
// users.js 里写 router.get('/me') -> 访问 /users/me
app.use('/users', userRoutes);

// 3.5 好友路由 (挂载在 /friends)
// friends.js 里写 router.post('/request') -> 访问 /friends/request
app.use('/friends', friendRoutes);


// --- 4. 全局错误处理 (兜底) ---
// 放在所有路由之后，拦截 Multer 错误和其他 500 错误
app.use((err, req, res, next) => {
    // 处理 Multer 文件上传错误 (如文件太大)
    if (err.name === 'MulterError') { 
        return res.status(400).json({ success: false, message: '文件上传出错: ' + err.message });
    }
    // 处理其他未知错误
    console.error('🔥 服务器内部错误:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
});


// --- 5. 启动服务器 ---
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0' ,() => {
    console.log(`🚀 服务器正在运行: 端口 ${PORT}`);
});