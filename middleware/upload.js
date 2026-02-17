// middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- 配置 Multer 存储引擎 ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';

        // 1. 根据 fieldname 决定去哪个大类
        // 头像去 avatars，其他去 resources
        if (file.fieldname === 'avatar') {
            uploadPath += 'avatars/';
        } else {
            // 2. 笔记资源按日期归档
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            uploadPath += `resources/${year}/${month}/`;
        }

        // 3. 检查文件夹是否存在
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } 
});

// 导出 upload 实例
module.exports = upload;