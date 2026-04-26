/**
 * PWA 安装 & Service Worker 注册
 */

let deferredPrompt = null;
const installBtn = document.getElementById('install-btn');
const installStatus = document.getElementById('install-status');

// 检查是否已经以 PWA 模式运行
if (window.matchMedia('(display-mode: standalone)').matches) {
    installStatus && (installStatus.textContent = '已通过 PWA 运行');
    if (installBtn) installBtn.style.display = 'none';
}

// 显示按钮的通用函数
function showInstallButton(text, onClick) {
    if (!installBtn) return;
    installBtn.style.display = 'inline-block';
    installBtn.textContent = text;
    installBtn.onclick = onClick;
}

// 注册 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', {scope: '/'})
            .then(reg => {
                installStatus && (installStatus.textContent = 'PWA Service Worker 已注册');

                // SW 就绪后，延迟等待 beforeinstallprompt，如未触发则显示帮助按钮
                setTimeout(() => {
                    if (deferredPrompt) {
                        showInstallButton('添加到桌面', triggerInstall);
                        installStatus && (installStatus.textContent = '可安装此应用！');
                    } else {
                        showInstallButton('如何安装此应用', showHowToInstall);
                        installStatus && (installStatus.textContent = '点击下方按钮查看安装说明');
                    }
                }, 3000);
            })
            .catch(err => {
                installStatus && (installStatus.textContent = 'Service Worker 注册失败');
            });
    });
}

// 监听 beforeinstallprompt（Chrome/Edge 原生安装弹窗）
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    showInstallButton('添加到桌面', triggerInstall);
    installStatus && (installStatus.textContent = '可安装此应用！');
});

// 用户点击按钮 → 触发原生安装
async function triggerInstall() {
    if (!deferredPrompt) {
        showHowToInstall();
        return;
    }
    try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installStatus && (installStatus.textContent = '已添加到桌面');
        } else {
            installStatus && (installStatus.textContent = '已取消');
        }
        deferredPrompt = null;
        installBtn && (installBtn.style.display = 'none');
    } catch (err) {
        showHowToInstall();
    }
}

// 告知用户如何手动安装
function showHowToInstall() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    let message;
    if (isIOS) {
        message = '在 Safari 浏览器底部，点击「分享」图标（📤），然后选择「添加到主屏幕」';
    } else {
        message = isMac
            ? '点击 Chrome 地址栏右侧的安装图标（🔽），或从菜单栏选择「文件 → 安装此页面为应用」'
            : '点击 Chrome 地址栏右侧的安装图标（🔽），或从右上角菜单（⋮）中选择「安装此页面为应用」';
    }

    alert('无法自动触发安装，请手动操作：\n\n' + message);
    installStatus && (installStatus.textContent = message);
}

// 已安装时隐藏按钮
window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.style.display = 'none';
    installStatus && (installStatus.textContent = '已安装到桌面');
});
