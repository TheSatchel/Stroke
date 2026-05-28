/*
 * Service Worker 注册
 */

// 注册 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const pfx = window.__PATH_PREFIX__ || '';
        navigator.serviceWorker.register(pfx + '/sw.js', { scope: pfx + '/' })
            .catch(err => {
                console.error('Service Worker 注册失败:', err);
            });
    });
}

// PWA standalone 模式下限制窗口最小尺寸（仅桌面端）
(function () {
    const MIN_W = 980;
    const MIN_H = 650;

    function enforceMinSize() {
        if (window.matchMedia('(max-width: 767px)').matches) return;
        if (!window.matchMedia('(display-mode: standalone)').matches) return;
        const w = Math.max(window.outerWidth, MIN_W);
        const h = Math.max(window.outerHeight, MIN_H);
        if (window.outerWidth < MIN_W || window.outerHeight < MIN_H) {
            window.resizeTo(w, h);
        }
    }

    window.addEventListener('resize', enforceMinSize);
    enforceMinSize();
})();
