/**
 * Service Worker - 基础缓存策略
 */

const CACHE_NAME = 'app-cache-v4';
const ASSETS = [
    '/',
    '/static/css/workspace.css',
    '/static/js/main.js',
    '/static/js/pwa.js',
    '/static/js/ui.js',
    '/static/js/storage.js',
    '/static/js/segmentparser.js',
    '/static/js/adapter.js',
    '/static/js/workspace.js',
    '/static/js/uis/App.js',
    '/static/js/uis/Generator.js',
    '/static/js/uis/persistence.js',
    '/static/js/uis/fingerprint.js',
    '/static/js/components/HistoryPanel.js',
    '/static/js/components/Canvas.js',
    '/static/js/components/ConfigPanel.js',
    '/static/js/components/ConfigTabs.js',
    '/static/js/components/ConfigModal.js',
    '/static/js/components/SettingsModal.js',
    '/static/js/components/utils.js',
    '/static/js/components/widgets/TextWidget.js',
    '/static/js/components/widgets/ImageWidget.js',
    '/static/js/components/widgets/ChoiceWidget.js',
    '/static/js/components/widgets/SliderWidget.js',
    '/static/js/components/widgets/GenerateCallWidget.js',
    '/static/js/components/widgets/AbstractImageWidget.js',
    '/static/js/adapters/BaseAdapters.js',
    '/static/js/adapters/ResponseParser.js',
    '/static/js/adapters/XianyuAdapter.js',
    '/manifest.json',
    '/static/img/icon-192x192.png',
    '/static/img/icon-512x512.png',
    '/static/img/icon-512x512-maskable.png',
];

// 安装 — 逐个缓存，单个文件失败不影响整体
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.allSettled(
                ASSETS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[SW] 缓存失败:', url, err.message);
                    })
                )
            )
        )
    );
    self.skipWaiting();
});

// 激活
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// 请求拦截 - 缓存优先
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // 只处理 http/https 请求（排除 chrome-extension:// 等）
    const url = new URL(event.request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetched = fetch(event.request)
                .then((response) => {
                    // 成功后更新缓存（只缓存 http/https 响应）
                    if (response.ok && (url.protocol === 'http:' || url.protocol === 'https:')) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) =>
                            cache.put(event.request, clone)
                        );
                    }
                    return response;
                })
                .catch(() => {
                    // 离线回退
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                });

            return cached || fetched;
        })
    );
});
