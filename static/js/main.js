/**
 * main.js — Stroke 应用入口
 */

document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('app');
    if (mount && window.StrokeApp) {
        window.__strokeApp = new window.StrokeApp(mount);
    } else {
        console.error('[Stroke] mount point #app or StrokeApp class not found');
    }
})