# 🗺️ MapPin - Full-Stack Geospatial Note-Taking Application

MapPin is a location-based note-taking application that combines interactive map navigation with rich text editing. It allows users to "pin" locations anywhere on the map and leave exclusive notes featuring images, videos, and Markdown formatting. It also provides a comprehensive multi-user authentication and privacy control system.

## ✨ Key Features

- **📍 Interactive Map Recording**: Click anywhere on the map to quickly create notes with precise latitude and longitude coordinates.
- **📝 Markdown Rich Text Editor**: Features a real-time preview Markdown editor with clean typography and code block support.
- **🖼️ Multimedia Uploads**: Supports direct uploading and previewing of images, videos, and audio, seamlessly embedding them into your notes.
- **👤 Comprehensive User System**: Includes user registration, login, personal profiles, and custom avatar uploads (with real-time cropping).
- **🔐 Privacy & Visibility Controls**: Notes can be set to "Public," "Private," or "Friends Only" to protect your personal privacy.
- **🛡️ Secure & Reliable**: Utilizes JWT (JSON Web Token) for session management and Bcrypt for secure password hashing.

## 🛠 Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript, Leaflet.js (Map engine), Marked.js + DOMPurify (Markdown rendering & XSS protection), Cropper.js (Image cropping).
- **Backend**: Node.js, Express.js, JWT (Authentication), Multer (File handling), Bcrypt (Encryption).
- **Database**: MySQL / MariaDB (`mysql2/promise` driver).
- **Deployment**: Nginx (Reverse proxy & static resource optimization), PM2 (Process manager), Debian/Ubuntu Linux.

------

## 🚀 Installation & Deployment

The following guide will help you deploy this application on a Linux server (e.g., Debian 12 / Ubuntu).

### 1. Prerequisites

Ensure your server has the following base environment installed:

- **Node.js** (v24 LTS recommended)
- **MySQL** or **MariaDB**
- **Nginx**
- **Git**

### 2. Clone Repository & Install Dependencies

```bash
# 1. Clone the repository
git clone https://github.com/Crimson1984/MapPin.git
cd MapPin

# 2. Install backend dependencies
npm install
```

### 3. Database Configuration (MySQL)

1. Log into the MySQL console and create a database and a dedicated user:

```SQL
CREATE DATABASE mappin_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# set your password
CREATE USER 'mappin_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON mappin_db.* TO 'mappin_user'@'localhost';
FLUSH PRIVILEGES;
```

1. Import the database structure and data:

```bash
# SQL backup file is named db_structure.sql
mysql -u mappin_user -p mappin_db < db_structure.sql
```

### 4. Configure Environment Variables (.env)

Create a `.env` file in the root directory of the project and fill in the following details:

```bash
# Copy the following content into your .env file
PORT=10000
JWT_SECRET=insert_a_very_long_and_complex_random_string_here
DB_HOST=localhost
DB_USER=mappin_user
DB_PASS=the_database_password_you_set_in_the_previous_step
DB_NAME=mappin_db
```

### 5. Start the Node.js Service

Use PM2 to start and daemonize the Node.js process:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the service
pm2 start server.js --name "mappin"

# Setup PM2 to start on system boot
pm2 startup
pm2 save
```

### 6. Configure Nginx & Permissions

1. **Set upload directory permissions** (Crucial for image uploads to work):

```Bash
mkdir -p uploads
# Assuming your current login user is '$USER' and the Nginx user is 'www-data'
sudo chown -R $USER:www-data uploads
sudo chmod -R 775 uploads
```

1. **Configure Nginx Reverse Proxy**:

   Create and edit the Nginx configuration file `sudo nano /etc/nginx/sites-available/map-pin`:

```nginx
server {
    listen 80; 
    server_name _; 

    # Redirect the root directory to the map homepage
    location = / {
        return 301 /map.html;
    }

    # Static image access optimization & anti-crawler configuration
    location /uploads/ {
        alias /var/www/MapPin/uploads/;
        expires 7d;
        access_log off;
        
        if ($http_user_agent ~* "bot|spider|crawl|slurp|wget|curl") {
            return 403;
        }
    }

    # API and frontend routing forwarding
    location / {
        proxy_pass http://localhost:10000; # Must match the PORT in your .env
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        client_max_body_size 50M; # Allow large file uploads
    }
}
```

1. **Enable configuration and restart**:

```bash
sudo ln -s /etc/nginx/sites-available/map-pin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

------

## 📖 How to Use

1. **Access the App**: Open your browser and navigate to `http://Your_Server_IP:8081` (or your configured domain).
2. **Register/Login**: Click the top right corner to register and log in. Guests can only view public notes.
3. **Create Notes**:
   - **Click** anywhere on the map to trigger the "Quick Note" popup.
   - Enter a simple title and content. You can **Publish** directly or click **Full Editor** to enter the full-screen Markdown editor.
4. **Multimedia Support**: In the Full Editor, click the "Image" icon on the toolbar to upload local files and insert them into your notes.
5. **Profile Settings**: Click your avatar in the top left corner to enter the personal center, where you can upload a custom avatar (supports drag-and-drop and zoom cropping).

------

> 💡 **Tip**: This is a personal learning and practical project. If deploying to the public internet, it is highly recommended to configure HTTPS (SSL certificate) via Certbot to ensure data transmission security.

