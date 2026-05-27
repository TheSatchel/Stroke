/**
 * PathPrefix.js — 全局路径前缀拦截器
 *
 * 为所有同源绝对路径（以 / 开头）自动加上 window.__PATH_PREFIX__ 前缀。
 * 适用于 CDN 部署场景：CDN 会将 /image 前缀去掉再转发到源站。
 *
 * 本地开发时 __PATH_PREFIX__ 为空字符串，所有路径不变。
 *
 * 拦截范围：
 *   - fetch()
 *   - XMLHttpRequest.open()
 *   - Worker 构造函数
 *   - navigator.serviceWorker.register()
 *   - HTMLImageElement.src setter
 *   - MutationObserver（动态插入的 DOM 元素的 src/href 属性）
 */

(function (prefix) {
  if (!prefix) return;

  function isAbsolutePath(url) {
    if (!url || typeof url !== 'string') return false;
    return url[0] === '/' && url[1] !== '/';
  }

  function prefixUrl(url) {
    if (typeof url !== 'string') return url;
    if (!isAbsolutePath(url)) return url;
    if (url === prefix || url.startsWith(prefix + '/')) return url;
    return prefix + url;
  }

  // ---- fetch ----
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') {
      input = prefixUrl(input);
    } else if (input && input.url) {
      // Request 对象不可变，需要新建
      return _fetch(prefixUrl(input.url), init);
    }
    return _fetch(input, init);
  };

  // ---- XMLHttpRequest ----
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    return _open.call(this, method, prefixUrl(url));
  };

  // ---- Worker ----
  if (typeof Worker !== 'undefined') {
    var _Worker = window.Worker;
    window.Worker = function (scriptURL, options) {
      return new _Worker(prefixUrl(scriptURL), options);
    };
  }

  // ---- ServiceWorker ----
  if (navigator.serviceWorker) {
    var _register = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function (scriptURL, options) {
      return _register.call(navigator.serviceWorker, prefixUrl(scriptURL), options);
    };
  }

  // ---- Image.src ----
  var srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (srcDescriptor && srcDescriptor.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      get: srcDescriptor.get,
      set: function (value) {
        srcDescriptor.set.call(this, prefixUrl(value));
      },
      configurable: true,
      enumerable: true
    });
  }

  // ---- MutationObserver: 拦截动态插入的 DOM 元素 ----
  var ATTRS = ['src', 'href', 'srcset'];
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return; // 只处理元素节点
        ATTRS.forEach(function (attr) {
          var val = node.getAttribute(attr);
          if (val) {
            node.setAttribute(attr, prefixUrl(val));
          }
        });
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

})(window.__PATH_PREFIX__ || '');
