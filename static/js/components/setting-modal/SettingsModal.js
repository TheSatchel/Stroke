/**
 * SettingsModal.js — API 设置弹窗
 */

import { el } from '../../utils/DOM.js';
import { clearAll } from '../../locals/storage.js';

function hexToHsl(hex) {
  let r = 0, g = 0, b = 0;
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// ================================================================
//  主题色系自动生成
// ================================================================

/**
 * 根据 accent 色值生成 accent 相关的 CSS 变量值
 */
function accentVarsFromHex(hex) {
  const { h, s, l } = hexToHsl(hex);
  return {
    '--color-accent':               hex,
    '--color-accent-hover':         `hsl(${h},${s}%,${Math.max(5, l - 14)}%)`,
    '--color-accent-ring':          `hsl(${h},${s}%,${Math.min(90, l + 13)}%)`,
    '--color-accent-bg':            `hsl(${h},${s}%,${Math.min(97, l + 41)}%)`,
    '--color-accent-border':        `hsl(${h},${s}%,${Math.min(92, l + 20)}%)`,
    '--color-accent-text':          `hsl(${h},${s}%,${Math.max(8, l - 27)}%)`,
    '--color-accent-shadow':        `hsla(${h},${s}%,${l}%,0.12)`,
    '--color-accent-shadow-active': `hsla(${h},${s}%,${Math.max(5, l - 4)}%,0.20)`,
  };
}

/**
 * 根据 accent 色相 & 明暗模式，计算可读性良好的基础色系
 * @param {string} accentHex - 主题色
 * @param {'dark'|'light'} mode - 明暗模式
 */
function generateBaseScheme(accentHex, mode) {
  const { h, s } = hexToHsl(accentHex);
  const sh = (h + 75) % 360;   // success hue offset (+75° toward green)

  if (mode === 'dark') {
    return {
      '--color-background-primary':   `hsl(${h}, ${Math.round(s * 0.12)}%, 12%)`,
      '--color-background-secondary': `hsl(${h}, ${Math.round(s * 0.10)}%, 9%)`,
      '--color-background-tertiary':  `hsl(${h}, ${Math.round(s * 0.08)}%, 6%)`,
      '--color-text-primary':         `hsl(${h}, ${Math.round(s * 0.08)}%, 88%)`,
      '--color-text-secondary':       `hsl(${h}, ${Math.round(s * 0.06)}%, 72%)`,
      '--color-text-tertiary':        `hsl(${h}, ${Math.round(s * 0.05)}%, 56%)`,
      '--color-border-primary':       `hsl(${h}, ${Math.round(s * 0.70)}%, 65%)`,
      '--color-border-secondary':     `hsl(${h}, ${Math.round(s * 0.10)}%, 30%)`,
      '--color-border-tertiary':      `hsl(${h}, ${Math.round(s * 0.08)}%, 22%)`,
      '--color-overlay':              'rgba(0,0,0,0.55)',
      '--color-context-menu':         `hsla(${h}, ${Math.round(s * 0.10)}%, 14%, 0.88)`,
      '--color-context-menu-dark':    `hsla(${h}, ${Math.round(s * 0.10)}%, 14%, 0.88)`,
      '--color-white':                '#ffffff',
      '--color-success':              `hsl(${sh}, 55%, 45%)`,
      '--color-success-bg':           `hsla(${sh}, 45%, 40%, 0.15)`,
      '--color-danger':               '#d45050',
      '--color-danger-hover':         '#b33a3a',
      '--color-danger-bg':            'rgba(220,82,82,0.10)',
      // toast 通知颜色
      '--color-error-bg':             'hsl(6,68%,17%)',
      '--color-error-text':           'hsl(6,41%,92%)',
      '--color-error-border':         'hsl(6,37%,38%)',
      '--color-error-shadow':         'hsla(6,68%,6%,0.30)',
      '--color-warning-bg':           'hsl(32,90%,16%)',
      '--color-warning-text':         'hsl(32,63%,93%)',
      '--color-warning-border':       'hsl(32,50%,42%)',
      '--color-warning-shadow':       'hsla(32,90%,6%,0.32)',
    };
  } else {
    return {
      '--color-background-primary':   `hsl(${h}, ${Math.round(s * 0.15)}%, 94%)`,
      '--color-background-secondary': `hsl(${h}, ${Math.round(s * 0.12)}%, 90%)`,
      '--color-background-tertiary':  `hsl(${h}, ${Math.round(s * 0.10)}%, 86%)`,
      '--color-text-primary':         `hsl(${h}, ${Math.round(s * 0.12)}%, 28%)`,
      '--color-text-secondary':       `hsl(${h}, ${Math.round(s * 0.10)}%, 38%)`,
      '--color-text-tertiary':        `hsl(${h}, ${Math.round(s * 0.09)}%, 43%)`,
      '--color-border-primary':       `hsl(${h}, ${Math.round(s * 0.80)}%, 45%)`,
      '--color-border-secondary':     `hsl(${h}, ${Math.round(s * 0.12)}%, 76%)`,
      '--color-border-tertiary':      `hsl(${h}, ${Math.round(s * 0.10)}%, 80%)`,
      '--color-overlay':              'rgba(0,0,0,0.35)',
      '--color-context-menu':         `hsla(${h}, ${Math.round(s * 0.15)}%, 94%, 0.86)`,
      '--color-context-menu-dark':    `hsla(${h}, ${Math.round(s * 0.15)}%, 94%, 0.86)`,
      '--color-white':                '#ffffff',
      '--color-success':              `hsl(${sh}, 45%, 33%)`,
      '--color-success-bg':           `hsla(${sh}, 50%, 40%, 0.12)`,
      '--color-danger':               '#d45050',
      '--color-danger-hover':         '#b33a3a',
      '--color-danger-bg':            'rgba(220,82,82,0.10)',
      // toast 通知颜色
      '--color-error-bg':             'hsl(6,68%,95%)',
      '--color-error-text':           'hsl(6,41%,16%)',
      '--color-error-border':         'hsl(6,37%,64%)',
      '--color-error-shadow':         'hsla(6,68%,40%,0.30)',
      '--color-warning-bg':           'hsl(32,90%,95%)',
      '--color-warning-text':         'hsl(32,63%,18%)',
      '--color-warning-border':       'hsl(32,50%,68%)',
      '--color-warning-shadow':       'hsla(32,90%,38%,0.32)',
    };
  }
}

/** 将完整色系写入 :root */
function applyFullScheme(hex, mode) {
  const root = document.documentElement.style;
  const accent = accentVarsFromHex(hex);
  const base = generateBaseScheme(hex, mode);
  const all = Object.assign({}, accent, base);
  Object.keys(all).forEach(function(k) {
    root.setProperty(k, all[k]);
  });
}

/** 解析模式：若为 'system' 则根据系统偏好返回 'dark' 或 'light' */
function resolveMode(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode === 'light' ? 'light' : 'dark';
}

// --- localStorage 读写 ---
var STORAGE_KEY_ACCENT = 'stroke_theme_accent';
var STORAGE_KEY_MODE   = 'stroke_theme_mode';

function saveThemePrefs(hex, mode) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCENT, hex);
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  } catch (e) { /* 无痕模式等 */ }
}

function loadThemePrefs() {
  try {
    return {
      accent: localStorage.getItem(STORAGE_KEY_ACCENT) || '#534AB7',
      mode:   localStorage.getItem(STORAGE_KEY_MODE)   || 'system',
    };
  } catch (e) {
    return { accent: '#534AB7', mode: 'system' };
  }
}

export default class SettingsModal {
  constructor(container, generator) {
    this.overlay = container;
    this.generator = generator || null;
    this.onConfigOpen = null;
    this.onDeleteAll = null;
    this.onResetAll = null;
    // 从 localStorage 恢复偏好
    var prefs = loadThemePrefs();
    this.currentAccent = prefs.accent;
    this.currentMode = prefs.mode;
    // 初始化时应用已保存的色系
    applyFullScheme(prefs.accent, resolveMode(prefs.mode));
    // 监听系统主题变化（仅当 mode === 'system' 时生效）
    var self = this;
    this._sysListener = function() {
      if (self.currentMode === 'system') {
        applyFullScheme(self.currentAccent, resolveMode('system'));
      }
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this._sysListener);
    this.render();
  }

  render() {
    this.overlay.className = 'overlay hidden';
    this.overlay.innerHTML = '';
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

    this.modal = el('div', 'settings-modal');
    this.modal.addEventListener('click', e => e.stopPropagation());

    const hdr = el('div', 'sm-header');
    hdr.appendChild(el('span', 'sm-title', { text: '设置' }));
    const closeBtn = el('button', 'sm-close', { text: '×', onclick: () => this.close() });
    hdr.appendChild(closeBtn);
    this.modal.appendChild(hdr);

    const body = el('div', 'sm-body');

    // --- 配置管理入口 ---
    const fCfg = el('div', 'sm-field');
    fCfg.appendChild(el('div', 'sm-label', { text: '模型配置' }));
    const cfgBtn = el('button', 'sm-btn-sec', {
      text: '管理配置 …',
      style: 'width:100%',
      onclick: () => { if (this.onConfigOpen) this.onConfigOpen(); }
    });
    fCfg.appendChild(cfgBtn);
    const cfgHint = el('div', 'sm-hint', { text: '添加、编辑或删除 API 提供商与模型配置' });
    fCfg.appendChild(cfgHint);
    body.appendChild(fCfg);

    // 主题色选择字段
    const fColor = el('div', 'sm-field');
    fColor.appendChild(el('div', 'sm-label', { text: '主题色' }));
    var self = this;
    this.colorInput = el('input', 'sm-color', {
      type: 'color',
      value: this.currentAccent,
      style: 'width:100%;height:36px;padding:2px;border:0.5px solid var(--color-border-secondary);border-radius:var(--border-radius-md);background:var(--color-background-primary);cursor:pointer'
    });
    this.colorInput.addEventListener('input', function(e) {
      var hex = e.target.value;
      self.currentAccent = hex;
      applyFullScheme(hex, resolveMode(self.currentMode));
    });
    fColor.appendChild(this.colorInput);
    body.appendChild(fColor);

    // 深浅模式选择字段
    const fMode = el('div', 'sm-field');
    fMode.appendChild(el('div', 'sm-label', { text: '色彩方案' }));
    this.modeSelect = el('select', 'sm-input');
    this.modeSelect.innerHTML = '<option value="dark">深色</option><option value="light">浅色</option><option value="system">跟随系统</option>';
    this.modeSelect.value = this.currentMode;
    this.modeSelect.addEventListener('change', function(e) {
      var mode = e.target.value;
      self.currentMode = mode;
      applyFullScheme(self.currentAccent, resolveMode(mode));
    });
    fMode.appendChild(this.modeSelect);
    body.appendChild(fMode);

    // 危险区：删除全部历史
    const divider = el('div', 'sm-danger-divider');
    body.appendChild(divider);
    const dangerLabel = el('div', 'sm-danger-label', { text: '历史数据' });
    body.appendChild(dangerLabel);
    const dangerBtn = el('button', 'sm-danger-btn', {
      text: '删除全部历史',
      onclick: () => { if (this.onDeleteAll) this.onDeleteAll(); }
    });
    body.appendChild(dangerBtn);
    const dangerHint = el('div', 'sm-danger-hint', { text: '此操作不可撤销' });
    body.appendChild(dangerHint);

    // 初始化按钮：清除所有持久化数据
    const resetDivider = el('div', 'sm-danger-divider');
    body.appendChild(resetDivider);
    const resetLabel = el('div', 'sm-danger-label', { text: '初始化' });
    body.appendChild(resetLabel);
    const resetBtn = el('button', 'sm-danger-btn', {
      text: '重置所有数据',
      style: 'background: var(--color-danger); color: #fff;',
      onclick: () => { if (this.onResetAll) this.onResetAll(); }
    });
    body.appendChild(resetBtn);
    const resetHint = el('div', 'sm-danger-hint', { text: '清除所有配置、历史与偏好，恢复为初始状态' });
    body.appendChild(resetHint);

    this.modal.appendChild(body);

    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => this.close() }));
    footer.appendChild(el('button', 'sm-btn-pri', { text: '确定', onclick: () => {
      saveThemePrefs(self.currentAccent, self.currentMode);
      self.close();
    }}));
    this.modal.appendChild(footer);

    // --- 作者签名 ---
    const signature = el('div', 'sm-signature');
    signature.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;margin-bottom:16px;font-size:13px;color:var(--color-text-tertiary);user-select:none;';
    const githubLink = document.createElement('a');
    githubLink.href = 'https://github.com/TheSatchel/Stroke';
    githubLink.target = '_blank';
    githubLink.rel = 'noopener noreferrer';
    githubLink.style.cssText = 'display:inline-flex;align-items:center;color:var(--color-text-tertiary);text-decoration:none;';
    githubLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
    signature.appendChild(document.createTextNode('Made with ❤️ by '));
    signature.appendChild(githubLink);
    signature.appendChild(document.createTextNode(' Satchel'));
    this.modal.appendChild(signature);

    this.overlay.appendChild(this.modal);
  }

  // ================================================================
  //  打开 / 关闭
  // ================================================================
  open() {
    this.overlay.classList.remove('hidden');
    if (this.colorInput) this.colorInput.value = this.currentAccent;
    if (this.modeSelect) this.modeSelect.value = this.currentMode;
  }

  close() {
    this.overlay.classList.add('hidden');
  }
}