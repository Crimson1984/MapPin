// 基础配置
const API_BASE_URL = 'http://localhost:3000';

// 获取 Token
function getToken() {
    return localStorage.getItem('userToken');
}

// 通用 Fetch 封装
async function request(endpoint, options = {}) {
    // 拼接地址
    const url = `${API_BASE_URL}${endpoint}`;
    
    // 自动添加 Header
    const headers = {
        ...options.headers
    };
    
    // 1. 添加 Token
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 2. 智能添加 Content-Type
    // 只有当有 body，且 body 不是 FormData (是 JSON 字符串) 时，才加 application/json
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, config);
        

        // 同时拦截 401 和 403
        // 401: 未授权 (没 Token)
        // 403: 禁止访问 (Token 过期或无效)
        if (response.status === 401 || response.status === 403) {
            // 避免在登录页死循环
            if (!window.location.pathname.includes('login.html')) {
                // 清除失效的 Token，防止下次进来又读到脏数据
                localStorage.removeItem('userToken'); 
                
                alert('登录状态已失效，请重新登录');
                window.location.href = 'login.html';
            }
            // 抛出错误中断后续代码执行
            throw new Error('Unauthorized'); 
        }

        // 这里的 await 是必须的，否则报错捕获不到
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// --- 导出 API 方法 ---
export const API = {
    // 登录接口
    async login(username, password) {
        return request('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    // 注册接口
    async register(username, password) {
        return request('/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },


    // 笔记相关
    getNotes: (targetUser = null) => {
        let path = '/notes'; // 建议变量名叫 path，避免混淆
        if (targetUser) {
            path += `?targetUser=${targetUser}`;
        }
        // ✅ 修正核心：去掉引号，传递变量
        return request(path); 
    },

    // 创建笔记 (POST)
    createNote: (data) => request('/notes', {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    // 更新笔记
    updateNote: (id, data) => request(`/notes/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify(data) 
    }),
    
    // 删除笔记 (DELETE)
    deleteNote: (id) => request(`/notes/${id}`, {
        method: 'DELETE'
    }),

    // 用户相关
    getCurrentUser: () => request('/users/me'),

    // 上传头像
    uploadAvatar: (formData) => request('/users/avatar', { 
        method: 'POST', 
        body: formData 
    }),
    
    // 文件上传
    uploadFile: (formData) => request('/api/upload', { 
        method: 'POST', 
        body: formData 
    }),

    // 好友相关
    // 搜索用户
    searchUsers: (query) => request(`/users/search?q=${query}`),
    
    // 发送好友请求 
    sendFriendRequest: (receiverUsername) => request('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ receiver: receiverUsername })
    }),
    
    // 获取待处理请求 (收件箱)
    getPendingRequests: () => request('/friends/pending'),

    // 处理请求 (同意/拒绝)
    respondToRequest: (id, action) => request('/friends/response', { 
        method: 'PUT', 
        body: JSON.stringify({ id, action }) 
    })
};