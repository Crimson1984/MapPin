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


// --- 获取所有笔记(加载地图使用) ---
app.get('/notes', (req,res) => {
    const sql = 'SELECT * FROM notes';

    db.query(sql, (err,results) => {
        if(err){
            console.error("查询失败:", err);
            return res.status(500).json({ error: err.message});
        }
        res.json(results); // 把数据库里的笔记发给前端
    })
})


// --- 发布新笔记(点击地图保存时用)---
app.post('/notes',(req,res) => {
    const { username, title, content, lat , lng } = req.body;

    console.log('收到新笔记:',title, lat, lng);

    const sql = 'INSERT INTO notes (username, title, content, lat, lng) VALUE(?, ?, ?, ?, ?)';
    db.query(sql, [username, title, content, lat, lng], (err,result) => {
        if(err){
            console.error(err);
            return res.status(500).json({ success: false,message:'发布失败'});
        }
        res.json({ success:true, id: result.insertId,message: '笔记已发布!'});
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