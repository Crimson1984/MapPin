const jwt = require('jsonwebtoken'); // 引入 JWT 库
const { SECRET_KEY } = require('../config/config');

// --- 中间件: 安检门函数 ---
// 作用: 拦住请求 -> 检查 Token -> 没问题就放行 (next)
function authenticateToken(req, res, next) {
    // 1. 从请求头里拿 Token
    // 格式通常是: "Authorization: Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token; // 只要 "Bearer " 后面那串

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

module.exports = authenticateToken;