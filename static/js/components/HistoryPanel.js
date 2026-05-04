/**
 * HistoryPanel.js — 左栏历史版本
 */

import { el } from './utils.js';

export default class HistoryPanel {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.onSelect = null;
    this.onVersionSwitch = null;
    this.onDelete = null;
    this.render();
  }

  render() {
    this.container.className = 'col-left';
    this.container.innerHTML = '';

    const header = el('div', 'col-header');
    const title = el('span', '', { text: '历史版本' });
    header.appendChild(title);
    const newBtn = el('button', 'hist-new-project-btn', {
      html: '+ 新建',
      title: '新建项目版本',
      onclick: () => {
        if (this.onNewProject) this.onNewProject();
      }
    });
    header.appendChild(newBtn);
    this.container.appendChild(header);

    this.listEl = el('div', 'history-list', { style: 'flex:1;overflow-y:auto;overflow-x:hidden;padding:8px;direction:rtl' });
    this.listWrap = el('div', '', { style: 'direction:ltr' });
    this.listEl.appendChild(this.listWrap);
    if (this.items.length === 0) {
      const emptyMsg = el('div', '', { text: '暂无历史版本', style: 'text-align:center;padding:20px 8px;font-size:12px;color:var(--color-text-tertiary)' });
      this.listWrap.appendChild(emptyMsg);
    }
    this.items.forEach((item, i) => {
      const div = el('div', 'hist-item' + (item.active ? ' active' : ''), {
        style: 'position:relative',
        onclick: () => this.select(i)
      });

      const thumb = el('div', 'hist-thumb', item.bg ? { style: 'background:' + item.bg } : {});
      if (item.type === 'raster' && item.dataUrl) {
        thumb.innerHTML = `<img src="${item.dataUrl}" />`;
      } else {
        thumb.innerHTML = `<svg viewBox="0 0 56 56" fill="none">${item.svg || ''}</svg>`;
      }
      if (item.current) {
        const badge = el('span', '', {
          html: '当前',
          style: 'position:absolute;top:5px;right:7px;background:#EAF3DE;color:#3B6D11;font-size:10px;font-weight:500;padding:1px 6px;border-radius:4px'
        });
        thumb.appendChild(badge);
      }

      // 删除按钮
      const delBtn = el('button', 'hist-delete-btn', {
        html: '×',
        title: '删除此历史项',
        onclick: (e) => {
          e.stopPropagation();
          if (this.onDelete) this.onDelete(i);
        }
      });
      div.appendChild(delBtn);

      const meta = el('div', 'hist-meta');
      meta.appendChild(el('div', 'hist-label', { text: item.label }));
      meta.appendChild(el('div', 'hist-time', { text: item.time }));

      // 版本步进器
      if (item.versionCount > 1) {
        const stepper = this._renderVersionStepper(item, i);
        meta.appendChild(stepper);
      }

      div.appendChild(thumb);
      div.appendChild(meta);
      this.listWrap.appendChild(div);
    });
    this.container.appendChild(this.listEl);
  }

  select(i) {
    this.items.forEach((it, idx) => it.active = idx === i);
    this.listWrap.querySelectorAll('.hist-item').forEach((el, idx) => el.classList.toggle('active', idx === i));
    if (this.onSelect) this.onSelect(i);
  }

  // 版本步进器
  _renderVersionStepper(item, itemIndex) {
    const wrap = el('div', 'ver-stepper');

    // 左箭头
    const prevBtn = el('button', 'ver-step-arrow', {
      html: '◀',
      disabled: item.versionActive <= 0,
      onclick: (e) => {
        e.stopPropagation();
        this.selectVersion(itemIndex, item.versionActive - 1);
      }
    });
    wrap.appendChild(prevBtn);

    // 暗亮点（无标签）
    const dotsWrap = el('div', 'ver-dots-row');
    for (let d = 0; d < item.versionCount; d++) {
      dotsWrap.appendChild(
        el('span', 'ver-dot' + (d === item.versionActive ? ' active' : ''))
      );
    }
    wrap.appendChild(dotsWrap);

    // 右箭头
    const nextBtn = el('button', 'ver-step-arrow', {
      html: '▶',
      disabled: item.versionActive >= item.versionCount - 1,
      onclick: (e) => {
        e.stopPropagation();
        this.selectVersion(itemIndex, item.versionActive + 1);
      }
    });
    wrap.appendChild(nextBtn);

    // 横向可滚动数字行
    const numScrollOuter = el('div', 'ver-num-scroll');
    const numRow = el('div', 'ver-num-row');
    for (let v = 0; v < item.versionCount; v++) {
      const numBtn = el('button', 'ver-num' + (v === item.versionActive ? ' active' : ''), {
        text: String(v + 1),
        onclick: (e) => {
          e.stopPropagation();
          this.selectVersion(itemIndex, v);
        }
      });
      numRow.appendChild(numBtn);
    }
    numScrollOuter.appendChild(numRow);
    wrap.appendChild(numScrollOuter);

    return wrap;
  }

  selectVersion(itemIndex, versionIndex) {
    const item = this.items[itemIndex];
    if (!item) return;
    if (versionIndex < 0 || versionIndex >= item.versionCount) return;
    item.versionActive = versionIndex;
    this._refreshStepper();
    if (this.onVersionSwitch) this.onVersionSwitch(itemIndex, versionIndex);
  }

  _refreshStepper() {
    this.items.forEach((item, i) => {
      const itemEl = this.listWrap.children[i];
      if (!itemEl) return;
      const meta = itemEl.querySelector('.hist-meta');
      const stepper = itemEl.querySelector('.ver-stepper');

      // 不需要步进器，有就移除
      if (item.versionCount <= 1) {
        if (stepper) stepper.remove();
        return;
      }

      // 需要步进器，缺失则添加
      if (!stepper) {
        if (meta) meta.appendChild(this._renderVersionStepper(item, i));
        return;
      }

      // 版本总数变化，重建
      const dotCount = stepper.querySelectorAll('.ver-dot').length;
      if (dotCount !== item.versionCount) {
        stepper.remove();
        if (meta) meta.appendChild(this._renderVersionStepper(item, i));
        return;
      }

      // 更新现有步进器状态
      stepper.querySelectorAll('.ver-dot').forEach((dot, d) => {
        dot.classList.toggle('active', d === item.versionActive);
      });
      const arrows = stepper.querySelectorAll('.ver-step-arrow');
      if (arrows[0]) arrows[0].disabled = item.versionActive <= 0;
      if (arrows[1]) arrows[1].disabled = item.versionActive >= item.versionCount - 1;
      stepper.querySelectorAll('.ver-num').forEach((btn, v) => {
        btn.classList.toggle('active', v === item.versionActive);
      });
    });

    // 更新缩略图（支持 SVG 和光栅图）
    this.items.forEach((item, i) => {
      const itemEl = this.listWrap.children[i];
      if (!itemEl) return;
      const thumb = itemEl.querySelector('.hist-thumb');
      if (!thumb) return;
      if (item.type === 'raster' && item.dataUrl) {
        // 光栅图：更新 <img> 标签
        const imgEl = thumb.querySelector('img');
        if (imgEl) {
          imgEl.src = item.dataUrl;
        } else {
          thumb.innerHTML = `<img src="${item.dataUrl}" />` + thumb.innerHTML;
        }
      } else if (item.svg) {
        // SVG：替换 <svg> 元素
        const svgEl = thumb.querySelector('svg');
        if (svgEl) {
          svgEl.outerHTML = `<svg viewBox="0 0 56 56" fill="none">${item.svg}</svg>`;
        } else {
          thumb.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 56 56" fill="none">${item.svg}</svg>`);
        }
      }
    });
  }

  /**
   * 更新当前选中项（添加新版本）
   * @param {number} versionIndex - 新版本号
   * @param {Object} imageResult - { type:'svg'|'raster', svg, dataUrl } 或纯 SVG 字符串
   * @param {string} timeStr - 时间
   */
  updateActiveItem(versionIndex, imageResult, timeStr) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].current) {
        const item = this.items[i];
        item.versionActive = versionIndex;
        item.versionCount = Math.max(item.versionCount, versionIndex + 1);
        item.time = timeStr;
        // 支持 ImageResult 对象和纯 SVG 字符串两种格式
        if (imageResult && typeof imageResult === 'object' && imageResult.type === 'raster' && imageResult.dataUrl) {
          item.type = 'raster';
          item.dataUrl = imageResult.dataUrl;
          item.svg = '';
        } else if (imageResult && typeof imageResult === 'object' && imageResult.svg) {
          item.type = 'svg';
          item.svg = imageResult.svg;
          item.dataUrl = '';
        } else if (typeof imageResult === 'string') {
          item.type = 'svg';
          item.svg = imageResult;
          item.dataUrl = '';
        }
        this._refreshStepper();
        if (this.onSelect) this.onSelect(i);
        break;
      }
    }
  }

  addItem(item) {
    this.items.forEach(it => { it.active = false; it.current = false; });
    item.active = true;
    item.current = true;
    this.items.unshift(item);
    this.render();
    if (this.onSelect) this.onSelect(0);
  }
}