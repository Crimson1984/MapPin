const mysql = require('mysql2/promise'); 
require('dotenv').config();

const db = mysql.createPool({  
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    
    waitForConnections: true, // 当池子里的连接都被占用时，新的请求排队等待，而不是直接报错
    connectionLimit: 10,      // 最大并发连接数
    queueLimit: 0             // 排队队列的长度限制，0 表示不限制排队人数
});

// 3. 测试连接的方式也需要升级 (借用一个连接来测试，测完还回去)
async function testConnection() {
    try {
        const connection = await db.getConnection();
        console.log('✅ 成功连接到MySQL数据库 !');
        connection.release(); // ⚠️ 借出来的连接必须归还给池子
    } catch (err) {
        console.error('❌ 数据库连接失败, 原因:', err.message);
    }
}

testConnection();

module.exports = db;