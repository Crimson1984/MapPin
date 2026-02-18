const mysql = require('mysql2');
require('dotenv').config();

//--- 配置数据库连接 ---
const db = mysql.createConnection({   //放入db.js
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASS,
    database:process.env.DB_NAME
});

//--- 测试链接 ---
db.connect(err => {
    if(err) {
        console.error('❌连接失败,原因:',err.message);
        return;
    }
    console.log('✅成功连接到MySQL数据库!');
});

module.exports = db;