[🇺🇸 English](README.md) | [🇨🇳 简体中文](README_CN.md) 

# 🗺️ MapPin - 地理笔记

MapPin 是一个结合了地图交互与富文本记录的地理位置笔记应用。它允许用户在地图上的任意位置留下带有图片、视频、Markdown 排版的笔记。

## ✨ 核心特点 (Features)

- **📍 地图交互式记录**：点击地图任意位置即可快速创建带有精确经纬度坐标的笔记。
- **📝 Markdown 富文本编辑**：支持实时预览的 Markdown 编辑器，排版清晰，支持代码块。
- **🖼️ 多媒体上传**：支持图片、视频、音频的直接上传与预览，无缝嵌入笔记中。
- **👤 完善的用户系统**：提供注册、登录、个人主页以及自定义头像上传（支持实时裁剪）。
- **🔐 隐私与可见性控制**：笔记可设置为“公开”、“仅自己可见”或“仅好友可见”，保护个人隐私。
- **🛡️ 安全可靠**：采用 JWT (JSON Web Token) 进行会话管理，Bcrypt 密码加密存储。

## 🛠 技术栈 (Tech Stack)

- **前端 (Frontend)**: 原生 HTML/CSS/JavaScript, Leaflet.js (地图引擎), Marked.js + DOMPurify (Markdown 渲染与 XSS 防护), Cropper.js (图片裁剪)。
- **后端 (Backend)**: Node.js, Express.js, JWT (鉴权), Multer (文件处理), Bcrypt (加密)。
- **数据库 (Database)**: MySQL  (`mysql2/promise` 驱动)。
- **部署 (Deployment)**: Nginx (反向代理与静态资源优化), PM2 (进程守护), Debian/Ubuntu Linux。

------

## 🚀 如何安装与部署 (Installation & Deployment)

以下指南将帮助你在 Linux 服务器上部署此应用。

### 1. 环境准备

确保你的服务器已安装以下基础环境：

- **Node.js** ( v24 LTS)
- **MySQL** 或 **MariaDB**
- **Nginx**
- **Git**

### 2. 获取代码与安装依赖

```bash
# 1. 克隆仓库
git clone https://github.com/Crimson1984/MapPin.git
cd MapPin

# 2. 安装后端依赖
npm install
```

### 3. 配置数据库 (MySQL)

1. 登录 MySQL 控制台并创建数据库与专属用户：

```sql
CREATE DATABASE mappin_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 请设置自己的登陆方式与密码
CREATE USER 'mappin_user'@'localhost' IDENTIFIED BY '你的复杂密码';
GRANT ALL PRIVILEGES ON mappin_db.* TO 'mappin_user'@'localhost';
FLUSH PRIVILEGES;
```

1. 导入数据库结构与数据：

```bash
# SQL 备份文件名为 db_structure.sql
mysql -u mappin_user -p mappin_db < db_structure.sql
```

### 4. 配置环境变量 (.env)

在项目根目录下修改 `.env` 文件

```Bash
# 复制以下内容到 .env 文件中
PORT=10000	#本地运行的端口
JWT_SECRET=在这里填入一个非常长且复杂的随机字符串	#你设置的密钥
DB_HOST=localhost	#服务器登陆方式
DB_USER=mappin_user		#数据库用户
DB_PASS=你在上一步设置的数据库密码	#数据库用户密码
DB_NAME=mappin_db	#数据库名称
```

### 5. 启动 Node.js 服务

使用 PM2 来启动并守护 Node.js 进程：

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 启动服务
pm2 start server.js --name "mappin"

# 设置开机自启
pm2 startup
pm2 save
```

### 6. 配置 Nginx 与权限

1. **设置上传目录权限**（非常重要，否则无法上传图片）：

```bash
mkdir -p uploads
# 假设你的当前登录用户是 $USER，Nginx 用户是 www-data
sudo chown -R $USER:www-data uploads
sudo chmod -R 775 uploads
```

1. **配置 Nginx 反向代理**：

   创建并编辑 Nginx 配置文件 `sudo nano /etc/nginx/sites-available/mappin`：

```nginx
server {
    listen 80; # 指定外界访问的端口
    server_name _; 

    # 将根目录重定向到地图主页
    location = / {
        return 301 /map.html;
    }

    # 静态图片访问优化与防爬虫
    location /uploads/ {
        alias /var/www/MapPin/uploads/;
        expires 7d;
        access_log off;
        
        if ($http_user_agent ~* "bot|spider|crawl|slurp|wget|curl") {
            return 403;
        }
    }

    # API 与前端路由转发
    location / {
        proxy_pass http://localhost:10000; # 对应 .env 中的 PORT
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        client_max_body_size 50M; # 允许大文件上传
    }
}
```

1. **激活配置并重启**：

```bash
sudo ln -s /etc/nginx/sites-available/map-pin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

------

## 📖 使用方式 (How to Use)

1. **访问应用**：在浏览器中输入 `http://你的服务器IP:8081`（或你配置的域名）。
2. **注册登录**：点击右上角进行注册和登录，未登录状态下只能浏览公开笔记。
3. **创建笔记**：
   - 在地图上**单击**任意位置，弹出“快速笔记”窗口。
   - 输入简单的标题和内容，可直接**发布**，或点击**详细编辑**进入全屏 Markdown 编辑器。
4. **多媒体支持**：在详细编辑器中，点击工具栏的“图片”图标即可上传本地文件并插入到笔记中。
5. **个人设置**：点击左上角头像进入个人中心，可上传自定义头像（支持拖拽与缩放裁剪）。

------

> 💡 **提示**: 本项目为个人学习与实战项目，若需部署到公网，强烈建议通过 Certbot 配置 HTTPS (SSL 证书) 以保障数据传输安全。
