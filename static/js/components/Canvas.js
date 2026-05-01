/**
 * Canvas.js — 中栏画布
 */

import { el, svgEl, iconSvg } from './utils.js';

export default class Canvas {
  constructor(container) {
    this.container = container;
    this.tool = 'las';
    this.lassoing = false;
    this.lx = 0;
    this.ly = 0;
    this.currentHistory = 0;
    this.onLassoDone = null;
    this.render();
  }

  render() {
    this.container.className = 'col-mid';
    this.container.innerHTML = '';

    this.canvasArea = el('div', 'canvas-area');
    this.canvasImg = el('div', 'canvas-img', { id: 'canvas' });
    this.canvasImg.addEventListener('mousedown', e => this.startL(e));
    this.canvasImg.addEventListener('mousemove', e => this.moveL(e));
    this.canvasImg.addEventListener('mouseup', e => this.endL(e));

    this.cph = el('div', '', {
      id: 'cph',
      style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center'
    });
    const phInner = el('div', '', {
      style: 'display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--color-text-tertiary)'
    });
    phInner.innerHTML = '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".35"><rect x="3" y="3" width="30" height="30" rx="4"/><circle cx="12" cy="12" r="3.5"/><path d="M3 25l9-7 6 5 5-6 10 9"/></svg>';
    phInner.appendChild(el('span', '', { text: '生成结果显示在这里', style: 'font-size:12px' }));
    this.cph.appendChild(phInner);
    this.canvasImg.appendChild(this.cph);

    this.lEl = el('div', 'lasso-ring', { id: 'lEl', style: 'display:none' });
    this.lLbl = el('div', 'lasso-lbl', { id: 'lLbl', text: '区域 prompt', style: 'display:none' });
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);

    this.canvasArea.appendChild(this.canvasImg);
    this.container.appendChild(this.canvasArea);

    this.toolbar = el('div', 'canvas-toolbar');

    this.btnSel = el('button', 'tool-btn', { id: 'btnSel', onclick: () => this.setTool('sel') });
    const selIcon = iconSvg(13, 13, [
      svgEl('path', { d: 'M2 2l4 10 2-4 4-2L2 2z', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnSel.appendChild(selIcon);
    this.btnSel.appendChild(document.createTextNode('选择'));

    this.btnLas = el('button', 'tool-btn active', { id: 'btnLas', onclick: () => this.setTool('las') });
    const lasIcon = iconSvg(13, 13, [
      svgEl('circle', { cx: '7', cy: '7', r: '5', 'stroke-dasharray': '2 1.5', stroke: 'currentColor', 'stroke-width': '1.5' }),
      svgEl('path', { d: 'M7 12v1.5M11 7h1.5', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnLas.appendChild(lasIcon);
    this.btnLas.appendChild(document.createTextNode('画圈'));

    this.toolbar.appendChild(this.btnSel);
    this.toolbar.appendChild(this.btnLas);
    this.toolbar.appendChild(el('div', 'sflex'));
    this.tHint = el('span', '', {
      id: 'tHint',
      text: '拖拽画圈以标注区域',
      style: 'font-size:11px;color:var(--color-text-tertiary)'
    });
    this.toolbar.appendChild(this.tHint);
    this.container.appendChild(this.toolbar);
  }

  setTool(t) {
    this.tool = t;
    this.btnSel.classList.toggle('active', t === 'sel');
    this.btnLas.classList.toggle('active', t === 'las');
    this.tHint.textContent = t === 'las' ? '拖拽画圈以标注区域' : '点击选择区域';
    this.canvasImg.style.cursor = t === 'las' ? 'crosshair' : 'default';
  }

  startL(e) {
    if (this.tool !== 'las') return;
    this.lassoing = true;
    const r = this.canvasImg.getBoundingClientRect();
    this.lx = e.clientX - r.left;
    this.ly = e.clientY - r.top;
    this.lEl.style.display = 'block';
    this.lEl.style.left = this.lx + 'px';
    this.lEl.style.top = this.ly + 'px';
    this.lEl.style.width = '0';
    this.lEl.style.height = '0';
    this.lLbl.style.display = 'none';
  }

  moveL(e) {
    if (!this.lassoing) return;
    const r = this.canvasImg.getBoundingClientRect();
    const sz = Math.max(
      Math.abs(e.clientX - r.left - this.lx),
      Math.abs(e.clientY - r.top - this.ly)
    );
    this.lEl.style.left = (this.lx - sz / 2) + 'px';
    this.lEl.style.top = (this.ly - sz / 2) + 'px';
    this.lEl.style.width = sz + 'px';
    this.lEl.style.height = sz + 'px';
  }

  endL(_e) {
    if (!this.lassoing) return;
    this.lassoing = false;
    if (parseFloat(this.lEl.style.width) > 20) {
      this.lLbl.style.display = 'block';
      this.lLbl.style.left = (parseFloat(this.lEl.style.left) + parseFloat(this.lEl.style.width) / 2 - 30) + 'px';
      this.lLbl.style.top = (parseFloat(this.lEl.style.top) - 20) + 'px';
      if (this.onLassoDone) this.onLassoDone();
    } else {
      this.lEl.style.display = 'none';
    }
  }

  showHistory(i) {
    this.currentHistory = i;
    if (i !== 0) {
      this.lEl.style.display = 'none';
      this.lLbl.style.display = 'none';
    }
  }

  loadVersion(svg) {
    if (this.cph) this.cph.style.display = 'none';
    this.canvasImg.style.backgroundImage = 'none';
    this.canvasImg.innerHTML = '';
    this.canvasImg.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 56 56" fill="none" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
    // 重新挂载套索层
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);
    this.cph = el('div', '', {
      id: 'cph',
      style: 'position:absolute;inset:0;display:none;align-items:center;justify-content:center'
    });
    this.canvasImg.appendChild(this.cph);
  }
}