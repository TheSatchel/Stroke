/**
 * Service Worker - 基础缓存策略
 */

const CACHE_NAME = 'app-cache-v2';
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/pwa.js',
    '/manifest.json',
    '/static/img/icon-192x192.png',
    '/static/img/icon-512x512.png',
    '/static/img/icon-512x512-maskable.png',
];

// 安装
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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
