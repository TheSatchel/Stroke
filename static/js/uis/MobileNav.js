/**
 * MobileNav.js — 手机端底部导航栏
 *
 * 仅在屏幕宽度 ≤ 767px 时激活，管理三个面板的切换：
 * History | Canvas | Config
 */
import { el, svgEl } from '../utils/DOM.js';

const ICONS = {
  history: [
    svgEl('rect', { x: '2', y: '3', width: '20', height: '18', rx: '2', stroke: 'currentColor', 'stroke-width': '1.5', fill: 'none' }),
    svgEl('line', { x1: '6', y1: '8', x2: '18', y2: '8', stroke: 'currentColor', 'stroke-width': '1.5' }),
    svgEl('line', { x1: '6', y1: '12', x2: '18', y2: '12', stroke: 'currentColor', 'stroke-width': '1.5' }),
    svgEl('line', { x1: '6', y1: '16', x2: '14', y2: '16', stroke: 'currentColor', 'stroke-width': '1.5' }),
  ],
  canvas: [
    svgEl('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', stroke: 'currentColor', 'stroke-width': '1.5', fill: 'none' }),
    svgEl('circle', { cx: '8.5', cy: '8.5', r: '1.5', fill: 'currentColor' }),
    svgEl('path', { d: 'M5 18l4-5 3 2 4-5 4 8', stroke: 'currentColor', 'stroke-width': '1.2', fill: 'none' }),
  ],
  config: [
    svgEl('rect', { x: '3', y: '4', width: '18', height: '16', rx: '2', stroke: 'currentColor', 'stroke-width': '1.5', fill: 'none' }),
    svgEl('line', { x1: '8', y1: '9', x2: '16', y2: '9', stroke: 'currentColor', 'stroke-width': '1.5' }),
    svgEl('line', { x1: '8', y1: '13', x2: '16', y2: '13', stroke: 'currentColor', 'stroke-width': '1.5' }),
    svgEl('circle', { cx: '6', cy: '9', r: '1.2', fill: 'currentColor' }),
    svgEl('circle', { cx: '6', cy: '13', r: '1.2', fill: 'currentColor' }),
  ],
  settings: [
    svgEl('path', { d: 'M12 2a1.6 1.6 0 0 0-1.4.8l-.7 1.6c-.1.3-.3.5-.6.6l-1.4.4c-.3.1-.6 0-.9-.2l-1.2-1.2a1.5 1.5 0 0 0-2.2 0l-2.1 2c-.6.6-.6 1.6 0 2.2l1.3 1.3c.2.2.3.6.2.9l-.4 1.4c-.1.3-.3.5-.6.6l-1.6.7a1.6 1.6 0 0 0-.8 1.4v2.3a1.6 1.6 0 0 0 .8 1.4l1.6.7c.3.1.5.3.6.6l.4 1.4c.1.3 0 .7-.2.9L3.3 21a1.5 1.5 0 0 0 0 2.2l2.1 2.1a1.5 1.5 0 0 0 2.2 0l1.3-1.3c.2-.2.6-.3.9-.2l1.4.4c.3.1.5.3.6.6l.7 1.6a1.6 1.6 0 0 0 1.4.8h3.2a1.6 1.6 0 0 0 1.4-.8l.7-1.6c.1-.3.3-.5.6-.6l1.4-.4c.3-.1.7 0 .9.2l1.2 1.2a1.5 1.5 0 0 0 2.2 0l2.1-2.1a1.5 1.5 0 0 0 0-2.2L23.7 21c-.2-.2-.3-.6-.2-.9l.4-1.4c.1-.3.3-.5.6-.6l1.6-.7a1.6 1.6 0 0 0 .8-1.4v-2.3a1.6 1.6 0 0 0-.8-1.4l-1.6-.7c-.3-.1-.5-.3-.6-.6l-.4-1.4c-.1-.3 0-.7.2-.9L25.3 5a1.5 1.5 0 0 0 0-2.2L23.2.7a1.5 1.5 0 0 0-2.2 0l-1.3 1.3c-.2.2-.6.3-.9.2l-1.4-.4c-.3-.1-.5-.3-.6-.6L16 0a1.6 1.6 0 0 0-1.4-.8h-3.2L12 2zm2 7a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }),
  ],
};

export default class MobileNav {
  constructor(appEl) {
    this.appEl = appEl;
    this._active = 'canvas';
    this._isMobile = window.matchMedia('(max-width: 767px)').matches;
    this.container = null;
    this._backdrop = null;
    this._resizeHandler = null;
    this.onSettingsOpen = null;

    this._render();
    this._listenResize();
  }

  _render() {
    if (!this._isMobile) return;

    this.container = el('nav', 'mobile-nav');

    const tabs = [
      { key: 'history', label: '历史' },
      { key: 'canvas', label: '画布' },
      { key: 'config', label: '配置' },
      { key: 'settings', label: '设置' },
    ];

    tabs.forEach(tab => {
      const btn = el('button', 'mobile-nav__item' + (this._active === tab.key ? ' mobile-nav__item--active' : ''));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      ICONS[tab.key].forEach(child => svg.appendChild(child));
      btn.appendChild(svg);
      btn.appendChild(document.createTextNode(tab.label));
      btn.addEventListener('click', () => this.switchTo(tab.key));
      btn.dataset.panel = tab.key;
      this.container.appendChild(btn);
    });

    this.appEl.appendChild(this.container);

    this._backdrop = el('div', 'mobile-panel-backdrop');
    this._backdrop.addEventListener('click', () => this._closePanels());
    this.appEl.appendChild(this._backdrop);

    this._applyVisibility();
  }

  _listenResize() {
    this._resizeHandler = (e) => {
      this._isMobile = e.matches;
      if (e.matches) {
        if (!this.container || !this.container.parentNode) {
          this._render();
        } else {
          this.container.style.display = '';
        }
        this._applyVisibility();
      } else {
        this._closePanels();
        if (this.container) this.container.style.display = 'none';
        if (this._backdrop) this._backdrop.classList.remove('mobile-panel-backdrop--visible');
      }
    };
    window.matchMedia('(max-width: 767px)').addEventListener('change', this._resizeHandler);
  }

  destroy() {
    if (this._resizeHandler) {
      window.matchMedia('(max-width: 767px)').removeEventListener('change', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
    if (this._backdrop && this._backdrop.parentNode) {
      this._backdrop.remove();
    }
    this.container = null;
    this._backdrop = null;
  }

  switchTo(panel) {
    this._active = panel;
    this._applyVisibility();
    this._updateButtons();
  }

  _applyVisibility() {
    if (!this._isMobile) return;

    const left = this.appEl.querySelector('.col-left');
    const right = this.appEl.querySelector('.col-right');

    this._closePanels();

    switch (this._active) {
      case 'history':
        if (left) left.classList.add('mobile-panel--open');
        if (this._backdrop) this._backdrop.classList.add('mobile-panel-backdrop--visible');
        break;
      case 'config':
        if (right) right.classList.add('mobile-panel--open');
        if (this._backdrop) this._backdrop.classList.add('mobile-panel-backdrop--visible');
        break;
      case 'settings':
        if (this.onSettingsOpen) this.onSettingsOpen();
        break;
      case 'canvas':
      default:
        break;
    }
  }

  _closePanels() {
    const left = this.appEl.querySelector('.col-left');
    const right = this.appEl.querySelector('.col-right');
    if (left) left.classList.remove('mobile-panel--open');
    if (right) right.classList.remove('mobile-panel--open');
    if (this._backdrop) this._backdrop.classList.remove('mobile-panel-backdrop--visible');
  }

  _updateButtons() {
    if (!this.container || !this.container.parentNode) return;
    const btns = this.container.querySelectorAll('.mobile-nav__item');
    btns.forEach(btn => {
      btn.classList.toggle('mobile-nav__item--active', btn.dataset.panel === this._active);
    });
  }
}
