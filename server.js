const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); //引入密钥库
const jwt = require('jsonwebtoken'); // 引入 JWT 库
const xss = require('xss'); //后端清洗 (Sanitization)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 密钥：这是服务器的“私章”，绝对不能泄露给别人！
// 在真实项目中，这个应该放在环境变量里，这里为了演示直接写死
const SECRET_KEY = 'my_super_secret_key_123';

// --- 🛡️ 中间件: 安检门函数 ---
// 它的作用: 拦住请求 -> 检查 Token -> 没问题就放行 (next)
function authenticateToken(req, res, next) {
    // 1. 从请求头里拿 Token
    // 格式通常是: "Authorization: Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // 只要 "Bearer " 后面那串

    // 2. 如果没带 Token，直接踢回去
    if (token == null) return res.status(401).json({ success: false, message: '未登录或无权限' });

    // 3. 验证 Token 真伪
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token 无效或已过期' });

        // 4. Token 是真的！把解密出来的用户信息挂在 req 上
        // 以后在这个请求的后续处理中，req.user 就是这个用户的真实身份
        req.user = user;
        
        // 5. 放行，进入下一个环节 (比如去发笔记)
        next();
    });
}

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
// app.post('/register',(req,res) => {
//     // 1.获取前端发来的数据
//     const{username,password} = req.body;

//     console.log('收到注册请求:',username,password); //在终端打印

//     // 2.准备SQL语句(使用?占位符防止SQL注入)
//     const sql = 'INSERT INTO users (username,password) VALUES (?, ?)';

//     // 3.执行SQL
//     db.query(sql, [username,password], (err,result) => {
//         if(err){
//             console.error(err);
//             //如果报错,告诉前端
//             return res.status(500).json({ success: false, message:'注册失败(可能是用户名已存在)'});
//         }
//         //成功则返回信息
//         res.status(200).json({ success: true, message: '注册成功!'});
//     });
// });
// --- 注册接口 (加密版) ---
// ⚡️ 注意: 函数前面加了 async，因为加密需要时间
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    console.log('收到注册请求:', username); // 密码就不打印了，安全第一

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
// app.post('/login',(req,res) => {
//     const {username, password} = req.body;

//     //查询数据库有没有这个人
//     const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';

//     db.query(sql, [username, password],(err, results) => {
//         if(err){
//             return res.status(500).json({ success: false, message: '服务器错误'});
//         }
//         if(results.length > 0){
//             //登陆成功,返回用户信息
//             res.json({ success: true, message: '登陆成功!', username: username});
//         } else{
//             //查不到说明账号或者密码错误
//             res.json({success: false, message:'账号或者密码错误!'});
//         }
//     });
// });
// --- 登录接口 (加密验证版) ---
app.post('/login', (req, res) => {
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



// --- 获取所有笔记(加载地图使用) ---
// app.get('/notes', (req,res) => {

//     // ⚠️ 我们需要知道是谁在查，才能决定给他看什么
//     // 这里简单起见，让前端把当前用户名通过 query 参数传过来
//     // 例如: /notes?username=Garvofadge
//     const currentUser = req.query.username;
//     const targetUser = req.query.targetUser; // 查谁 (可选)

//     let sql = '';
//     let params = [];

//     if (targetUser) {
//         // A. 访问特定模式: 只查 targetUser 的笔记
//         // 规则: 如果 targetUser 是我自己，看全部; 否则只能看 public
//         if (currentUser === targetUser) {
//             sql = 'SELECT * FROM notes WHERE username = ?';
//             params = [currentUser];
//         } else {
//             sql = 'SELECT * FROM notes WHERE username = ? AND visibility = "public"';
//             params = [targetUser];
//         }
//     } else {
//         // B. 默认模式 (全图): 看所有公开 + 我的私密 (这就是你上一步写的逻辑)
//         sql = `
//             SELECT * FROM notes 
//             WHERE visibility = 'public' 
//             OR (visibility = 'private' AND username = ?)
//         `;
//         params = [currentUser];
//     }

//     db.query(sql, params, (err, results) => {
//         if (err) return res.status(500).json({ error: err.message });
//         res.json(results);
//     });
// });

// --- 获取笔记接口 (终极版: 支持好友可见性) ---
app.get('/notes', authenticateToken, (req, res) => {
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



// --- 发布新笔记(点击地图保存时用)---
// app.post('/notes',(req,res) => {
//     const { username, title, content, lat, lng, visibility } = req.body;

//     // 默认为 public，防止前端没传
//     const safeVisibility = visibility || 'private';

//     console.log('收到新笔记:',title, lat, lng);

//     const sql = 'INSERT INTO notes (username, title, content, lat, lng, visibility) VALUES (?, ?, ?, ?, ?, ?)';
//     db.query(sql, [username, title, content, lat, lng, safeVisibility], (err,result) => {
//         if(err){
//             console.error(err);
//             return res.status(500).json({ success: false,message:'发布失败'});
//         }
//         res.json({ 
//             success: true, 
//             id: result.insertId, 
//             message: '发布成功',
//             note: { id: result.insertId, username, title, content, lat, lng, visibility: safeVisibility, created_at: new Date() }
//         });
//     });
// });
// --- 发布新笔记 (安全版) ---
// 1. 在路径后面加上 authenticateToken，表示先过安检，再执行后面的函数
app.post('/notes', authenticateToken, (req, res) => {
    
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
app.delete('/notes/:id', authenticateToken, (req,res) => { //加安检
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
                // webPath 是 "/uploads/resources/..."
                // 我们要把它转回硬盘绝对路径: D:\project\uploads\resources\...
                // path.join(__dirname, webPath) 会自动处理斜杠问题
                // 注意: webPath 开头有个 /, path.join 可能会把它当根目录，最好去掉开头的 /
                const diskPath = path.join(__dirname, webPath.substring(1)); // substring(1) 去掉开头的 /
                
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
app.put('/notes/:id', authenticateToken, (req,res) =>{
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


// --- 1. 发送好友请求 ---
app.post('/friends/request', authenticateToken, (req, res) => {
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
app.get('/friends/pending', authenticateToken, (req, res) => {
    const myName = req.user.username;
    // 查 requester 是别人，receiver 是我，且状态是 pending 的记录
    const sql = 'SELECT * FROM friendships WHERE receiver = ? AND status = "pending"';
    
    db.query(sql, [myName], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- 3. 同意/拒绝好友请求 ---
app.put('/friends/response', authenticateToken, (req, res) => {
    const { id, action } = req.body; // id 是 friendship 表的主键, action 是 'accepted' 或 'rejected'
    
    const sql = 'UPDATE friendships SET status = ? WHERE id = ?';
    db.query(sql, [action, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: '操作失败' });
        res.json({ success: true, message: '操作成功' });
    });
});

// --- 配置静态资源服务 ---
// 只公开 avatars 文件夹
// 访问 /uploads/avatars/xxx.jpg -> 直接给看
//对于/uploads/resources/里的文件,使用动态接口提供
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

// --- 配置 Multer 存储引擎 ---
// --- 智能存储引擎: 自动按月分类 ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';

        // 1. 根据 fieldname 决定去哪个大类
        // 头像去 avatars，其他去 resources
        if (file.fieldname === 'avatar') {
            uploadPath += 'avatars/';
        } else {
            // 2. 笔记资源按日期归档: uploads/resources/2026/02/
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            
            uploadPath += `resources/${year}/${month}/`;
        }

        // 3. 检查文件夹是否存在，不存在则创建 (递归创建)
        // sync 是同步方法，但在配置阶段用没问题
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // 保持文件名唯一性
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// 配置 multer
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 资源文件限制放宽到 50MB (为了视频)
});

// --- 通用文件上传接口 (笔记附件) ---
// upload.single('file') 表示接收字段名为 'file' 的文件
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {

    const currentUser = req.user.username; 
    console.log(`[上传文件] 用户 ${currentUser} 正在上传文件...`);

    if (!req.file) {
        console.log(`[上传文件] 用户 ${currentUser} 未选择文件❓`);
        return res.status(400).json({ success: false, message: '未选择文件' });
    }

// ⚡️ 修正核心: 将硬盘绝对路径转换为 Web 相对路径
    // 1. 获取相对于项目根目录的路径 (去掉 D:\project\...)
    // 结果可能是 "uploads\resources\2026\02\xxx.jpg"
    const relativePath = path.relative(__dirname, req.file.path);
    
    // 2. 把 Windows 的反斜杠 "\" 替换为 Web 的正斜杠 "/"
    // 3. 加上开头的 "/"
    // 结果变成 "/uploads/resources/2026/02/xxx.jpg"
    const fileUrl = '/' + relativePath.replace(/\\/g, '/');

    // 识别文件类型 (image, video, audio)
    const mimeType = req.file.mimetype;
    let type = 'file';
    if (mimeType.startsWith('image/')) type = 'image';
    else if (mimeType.startsWith('video/')) type = 'video';
    else if (mimeType.startsWith('audio/')) type = 'audio';

    console.log(`[上传文件] 用户 ${currentUser} 上传${type} 🟢路径:${fileUrl}`);

    res.json({ 
        success: true, 
        url: fileUrl, 
        type: type, 
        originalName: req.file.originalname 
    });
});


// --- 上传头像接口 ---
// upload.single('avatar') 表示接收一个字段名为 'avatar' 的文件
app.post('/users/avatar', authenticateToken, upload.single('avatar'), (req, res) => {

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
    const relativePath = path.relative(__dirname, req.file.path);
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
app.get('/users/me', authenticateToken, (req, res) => {
    const sql = 'SELECT id, username, avatar FROM users WHERE id = ?';
    db.query(sql, [req.user.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: '用户不存在' });
        res.json(results[0]);
    });
});

// --- 全局错误处理中间件 ---
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer 报错 (比如文件太大)
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: '文件太大！请上传 5MB 以内的图片' });
        }
    }
    next(err);
});


// --- 🔐 安全资源访问接口 (最终修复版) ---
app.get('/uploads/resources/*filepath', (req, res) => {
    
    // ⚡️ 修复核心: 处理数组类型的路径参数
    let relativePath = req.params.filepath;
    if (Array.isArray(relativePath)) {
        relativePath = relativePath.join('/'); // 把 ['2026', '02', 'x.png'] 变成 "2026/02/x.png"
    }

    // 构造数据库查询路径
    const dbStoredPath = `/uploads/resources/${relativePath}`;

    // 获取 Token
    const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) return res.status(401).send('无权访问: 请登录');

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).send('无权访问: Token 无效');
        
        const currentUsername = user.username;

        // SQL 查询
        const sql = `
            SELECT n.*, f.status as friend_status
            FROM notes n
            LEFT JOIN friendships f ON 
                (f.requester = ? AND f.receiver = n.username) OR 
                (f.requester = n.username AND f.receiver = ?)
            WHERE n.content LIKE ? 
            LIMIT 1
        `;
        
        db.query(sql, [currentUsername, currentUsername, `%${dbStoredPath}%`], (dbErr, results) => {
            if (dbErr || results.length === 0) {
                return res.status(404).send('资源未找到或无权访问'); 
            }

            const note = results[0];
            let isAllowed = false;

            if (note.username === currentUsername) isAllowed = true;
            else if (note.visibility === 'public') isAllowed = true;
            else if (note.visibility === 'friends' && note.friend_status === 'accepted') isAllowed = true;

            if (isAllowed) {
                // 发送文件
                const absolutePath = path.join(__dirname, 'uploads', 'resources', relativePath);
                if (fs.existsSync(absolutePath)) {
                    res.sendFile(absolutePath);
                } else {
                    res.status(404).send('文件实体丢失');
                }
            } else {
                res.status(403).send('无权访问此资源');
            }
        });
    });
});


// ⚡️ 2. 新增: 托管前端网页 (public 文件夹)
app.use(express.static(path.join(__dirname, 'public')));

// --- 启动服务器 ---
app.listen(3000, ()=>{
    console.log('🚀服务器正在运行:http://localhost:3000');
});