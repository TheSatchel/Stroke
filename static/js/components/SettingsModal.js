/**
 * SettingsModal.js — API 设置弹窗
 */

import { el } from './utils.js';

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
  constructor(container) {
    this.overlay = container;
    this.onDeleteAll = null;
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
    hdr.appendChild(el('span', 'sm-title', { text: '模型 API 设置' }));
    const closeBtn = el('button', 'sm-close', { text: '×', onclick: () => this.close() });
    hdr.appendChild(closeBtn);
    this.modal.appendChild(hdr);

    const body = el('div', 'sm-body');

    const f1 = el('div', 'sm-field');
    f1.appendChild(el('div', 'sm-label', { text: 'API 提供商' }));
    this.provSelect = el('select', 'sm-input');
    this.provSelect.innerHTML = '<option>OpenAI</option><option>Replicate</option><option>Stability AI</option><option>自定义端点</option>';
    this.provSelect.addEventListener('change', () => this.provChange());
    f1.appendChild(this.provSelect);
    body.appendChild(f1);

    const f2 = el('div', 'sm-field');
    f2.appendChild(el('div', 'sm-label', { text: 'API Key' }));
    f2.appendChild(el('input', 'sm-input', { type: 'password', placeholder: 'sk-...', value: 'sk-••••••••••••••••••••' }));
    const status = el('span', 'sm-status ok');
    status.appendChild(el('span', 'sm-dot'));
    status.appendChild(document.createTextNode('已连接'));
    f2.appendChild(status);
    body.appendChild(f2);

    const f3 = el('div', 'sm-field');
    f3.appendChild(el('div', 'sm-label', { text: '模型' }));
    this.modelSel = el('select', 'sm-input', { id: 'modelSel' });
    this.modelSel.innerHTML = '<option>gpt-image-1</option><option selected>dall-e-3</option><option>dall-e-2</option>';
    f3.appendChild(this.modelSel);
    this.modelHint = el('div', 'sm-hint', { text: '当前：dall-e-3 · 支持 1024×1024, 1024×1792' });
    f3.appendChild(this.modelHint);
    body.appendChild(f3);

    this.epField = el('div', 'sm-field', { id: 'epField', style: 'display:none' });
    this.epField.appendChild(el('div', 'sm-label', { text: '自定义端点 URL' }));
    this.epField.appendChild(el('input', 'sm-input', { type: 'text', placeholder: 'https://api.example.com/v1' }));
    body.appendChild(this.epField);

    const f5 = el('div', 'sm-field', { style: 'margin-bottom:0' });
    f5.appendChild(el('div', 'sm-label', { text: '最大并发请求' }));
    const wrapR = el('div', '', { style: 'display:flex;align-items:center;gap:10px' });
    const rangeCC = el('input', '', { type: 'range', min: '1', max: '8', value: '3', step: '1', style: 'flex:1' });
    this.cvSpan = el('span', '', { text: '3', style: 'font-size:13px;font-weight:500;color:var(--color-text-primary);min-width:16px', id: 'cv' });
    rangeCC.addEventListener('input', () => this.cvSpan.textContent = rangeCC.value);
    wrapR.appendChild(rangeCC);
    wrapR.appendChild(this.cvSpan);
    f5.appendChild(wrapR);
    body.appendChild(f5);

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

    this.modal.appendChild(body);

    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => this.close() }));
    footer.appendChild(el('button', 'sm-btn-pri', { text: '保存', onclick: () => {
      saveThemePrefs(self.currentAccent, self.currentMode);
      self.close();
    }}));
    this.modal.appendChild(footer);

    this.overlay.appendChild(this.modal);
  }

  open() {
    this.overlay.classList.remove('hidden');
    // 打开弹窗时同步当前色值到 color input 和 mode select
    if (this.colorInput) this.colorInput.value = this.currentAccent;
    if (this.modeSelect) this.modeSelect.value = this.currentMode;
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  provChange() {
    const v = this.provSelect.value;
    this.epField.style.display = v === '自定义端点' ? 'block' : 'none';
    if (v === 'OpenAI') {
      this.modelSel.innerHTML = '<option>gpt-image-1</option><option selected>dall-e-3</option><option>dall-e-2</option>';
      this.modelHint.textContent = '当前：dall-e-3 · 支持 1024×1024, 1024×1792';
    } else if (v === 'Replicate') {
      this.modelSel.innerHTML = '<option selected>stability-ai/sdxl</option><option>black-forest-labs/flux</option>';
      this.modelHint.textContent = '当前：stability-ai/sdxl';
    } else if (v === 'Stability AI') {
      this.modelSel.innerHTML = '<option selected>stable-diffusion-xl-1024</option><option>sd3-medium</option>';
      this.modelHint.textContent = '当前：stable-diffusion-xl-1024';
    } else {
      this.modelSel.innerHTML = '<option>custom-model</option>';
      this.modelHint.textContent = '自定义模型 ID';
    }
  }

  getValues() {
    const apiKeyInput = this.overlay.querySelector('.sm-field:nth-child(2) .sm-input');
    const endpointInput = this.overlay.querySelector('#epField .sm-input');
    const concurrencyInput = this.overlay.querySelector('.sm-field input[type=range]');
    return {
      provider: this.provSelect ? this.provSelect.value : 'OpenAI',
      apiKey: apiKeyInput ? apiKeyInput.value : '',
      model: this.modelSel ? this.modelSel.value : 'dall-e-3',
      endpoint: endpointInput ? endpointInput.value : '',
      concurrency: concurrencyInput ? parseInt(concurrencyInput.value) || 3 : 3
    };
  }

  restoreValues(v) {
    if (!v) return;
    if (v.provider && this.provSelect) {
      this.provSelect.value = v.provider;
      this.provChange();
    }
    if (v.apiKey !== undefined) {
      const apiKeyInput = this.overlay.querySelector('.sm-field:nth-child(2) .sm-input');
      if (apiKeyInput) apiKeyInput.value = v.apiKey;
    }
    if (v.model && this.modelSel) {
      this.modelSel.value = v.model;
    }
    if (v.endpoint !== undefined) {
      const endpointInput = this.overlay.querySelector('#epField .sm-input');
      if (endpointInput) endpointInput.value = v.endpoint;
    }
    if (v.concurrency !== undefined) {
      const concurrencyInput = this.overlay.querySelector('.sm-field input[type=range]');
      if (concurrencyInput) {
        concurrencyInput.value = v.concurrency;
        if (this.cvSpan) this.cvSpan.textContent = v.concurrency;
      }
    }
  }
}