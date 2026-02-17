// public/js/auth.js
import { API } from './api.js';

// ============================
// 登录逻辑 (Login)
// ============================
async function handleLogin() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.querySelector('button'); // 获取登录按钮
    const msgDiv = document.getElementById('message');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        msgDiv.style.color = 'var(--danger-color)';
        msgDiv.innerHTML = '请输入用户名和密码';
        return;
    }

    // UI: 按钮变加载状态
    const originalBtnText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="material-icons spin">hourglass_empty</span> 登录中...';

    try {
        const data = await API.login(username, password);

        if (data.success) {
            // 1. 存 Token 和 用户名
            localStorage.setItem('currentUser', data.username);
            localStorage.setItem('userToken', data.token);
            
            // 2. 只有登录成功才存这个，方便 UI 显示
            localStorage.setItem('username', data.username); 

            // UI: 登录成功提示
            loginBtn.innerHTML = '<span class="material-icons">check</span> 成功';
            loginBtn.style.backgroundColor = 'var(--success-color)';
            
            setTimeout(() => {
                window.location.href = 'map.html';
            }, 500);
        } else {
            msgDiv.style.color = 'var(--danger-color)';
            msgDiv.innerHTML = ("❌ 登录失败: " + data.message);
            // 恢复按钮
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalBtnText;
        }
    } catch (err) {
        console.error(err);
        msgDiv.style.color = 'var(--danger-color)';
        msgDiv.innerHTML = '❌ 服务器连接失败';
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnText;
    }
}

// ============================
// 注册逻辑 (Register)
// ============================
async function handleRegister() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const msgDiv = document.getElementById('message');
    const regBtn = document.querySelector('button');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // 重置消息
    msgDiv.innerText = '';
    
    if (!username || !password) {
        msgDiv.style.color = 'var(--danger-color)';
        msgDiv.innerHTML = '<span class="material-icons" style="font-size:14px; vertical-align:middle;">error</span> 账号密码不能为空';
        return;
    }

    // UI: 按钮变加载状态
    const originalBtnText = regBtn.innerHTML;
    regBtn.disabled = true;
    regBtn.innerHTML = '<span class="material-icons spin">hourglass_empty</span> 注册中...';

    try {
        const data = await API.register(username, password);

        if (data.success) {
            msgDiv.style.color = 'var(--success-color)';
            msgDiv.innerHTML = '✅ ' + data.message;
            
            // 成功后按钮变绿
            regBtn.style.backgroundColor = 'var(--success-color)';
            regBtn.innerHTML = '<span class="material-icons">check</span> 注册成功';

            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            msgDiv.style.color = 'var(--danger-color)';
            msgDiv.innerHTML = '❌ ' + data.message;
            // 恢复按钮
            regBtn.disabled = false;
            regBtn.innerHTML = originalBtnText;
        }
    } catch (err) {
        console.error(err);
        msgDiv.style.color = 'var(--danger-color)';
        msgDiv.innerHTML = '❌ 服务器连接失败';
        regBtn.disabled = false;
        regBtn.innerHTML = originalBtnText;
    }
}

// ============================
// 暴露给全局 window 对象
// ============================
// 因为我们在 HTML 里使用了 onclick="login()" 和 onclick="doRegister()"
// 而模块(module) 里的函数不是全局的，所以必须手动挂载到 window 上
window.login = handleLogin;
window.doRegister = handleRegister;