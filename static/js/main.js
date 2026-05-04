/**
 * main.js — Stroke 应用入口
 */

import { installGlobalErrorHandlers, showToast } from './components/Toast.js';

// ⚠ 尽早安装全局错误捕获，确保应用未初始化时的错误也能显示
installGlobalErrorHandlers();

document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('app');
    if (mount && window.StrokeApp) {
        window.__strokeApp = new window.StrokeApp(mount);
    } else {
        showToast('应用初始化失败：未找到挂载点或 StrokeApp 类', 'error', 0);
    }
})
