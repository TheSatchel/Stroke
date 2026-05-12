/**
 * Service Worker - 运行时自动缓存策略（无需手动维护文件清单）
 *
 * 策略：网络优先 + 自动缓存。每个成功的 GET 请求都会被缓存，
 * 后续离线时自动使用缓存版本。不预缓存任何文件（install 为空操作）。
 */

const CACHE_NAME = 'app-cache-v5';

// 安装 — 直接激活，不预缓存（运行时按需缓存）
self.addEventListener('install', () => {
    self.skipWaiting();
});

// 激活 — 清理旧版本缓存
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

// 请求拦截 — 网络优先，自动缓存，离线回退
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    // 只处理同源 http/https 请求
    if (url.origin !== self.location.origin) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功后更新缓存
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) =>
                        cache.put(event.request, clone)
                    );
                }
                return response;
            })
            .catch(() => {
                // 网络失败 → 回退缓存
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // 导航请求无缓存时返回首页
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                    // 非导航请求无缓存 → 返回 503
                    return new Response('Offline — resource not cached', {
                        status: 503,
                        statusText: 'Service Unavailable',
                    });
                });
            })
    );
});
