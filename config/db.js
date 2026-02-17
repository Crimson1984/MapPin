const mysql = require('mysql2');

//--- 配置数据库连接 ---
const db = mysql.createConnection({   //放入db.js
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

module.exports = db;