/*
 * Service Worker 注册
 */

// 注册 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .catch(err => {
                console.error('Service Worker 注册失败:', err);
            });
    });
}
