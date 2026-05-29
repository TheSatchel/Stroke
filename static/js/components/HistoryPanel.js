/**
 * HistoryPanel.js — 左栏历史版本
 */

import { el } from '../utils/DOM.js';
import { pinyin } from '../lib/pinyin-pro.mjs';
import { svgToBase64DataUrl } from '../adapters/ResponseParser.js';

function matchLabel(label, keywords) {
  if (keywords.length === 0) return true;
  const lowerLabel = label.toLowerCase();
  const initials = pinyin(label, { toneType: 'none', pattern: 'first', type: 'array' }).join('').toLowerCase();
  const fullPinyin = pinyin(label, { toneType: 'none', type: 'array' }).join('');
  return keywords.every(kw =>
    lowerLabel.includes(kw) ||
    initials.includes(kw) ||
    fullPinyin.includes(kw)
  );
}

export default class HistoryPanel {
  constructor(container) {
    this.container = container;
    this.items = [];
    this._searchQuery = '';
    this.onSelect = null;
    this.onVersionSwitch = null;
    this.onDelete = null;
    this.onRename = null;
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

    // 过滤列表
    const keywords = this._searchQuery.split(/\s+/).filter(Boolean);
    const filtered = keywords.length > 0
      ? this.items.filter(item => matchLabel(item.label, keywords))
      : this.items;

    this.listEl = el('div', 'history-list');
    if (filtered.length === 0) {
      const emptyMsg = el('div', '', { text: this._searchQuery ? '无匹配结果' : '暂无历史版本', style: 'text-align:center;padding:20px 8px;font-size:12px;color:var(--color-text-tertiary)' });
      this.listEl.appendChild(emptyMsg);
    }
    filtered.forEach((item, i) => {
      const div = el('div', 'hist-item' + (item.active ? ' active' : ''), {
        style: 'position:relative',
        onclick: () => this.select(i)
      });

      const thumb = el('div', 'hist-thumb', item.bg ? { style: 'background:' + item.bg } : {});
      if (item.thumbnail) {
        thumb.innerHTML = `<img src="${item.thumbnail}" />`;
      } else if (item.type === 'raster' && item.dataUrl) {
        thumb.innerHTML = `<img src="${item.dataUrl}" />`;
      } else if (item.svg) {
        const dataUrl = svgToBase64DataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="none">${item.svg}</svg>`);
        if (dataUrl) {
          thumb.innerHTML = `<img src="${dataUrl}" draggable="false" style="width:100%;height:100%;object-fit:contain" />`;
        }
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
      const labelEl = el('div', 'hist-label', { text: item.label, title: '双击重命名' });
      labelEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startRename(labelEl, i);
      });
      meta.appendChild(labelEl);
      meta.appendChild(el('div', 'hist-time', { text: item.time }));

      // 版本步进器
      if (item.versionCount > 1) {
        const stepper = this._renderVersionStepper(item, i);
        meta.appendChild(stepper);
      }

      div.appendChild(thumb);
      div.appendChild(meta);
      this.listEl.appendChild(div);
    });
    this.container.appendChild(this.listEl);

    // 搜索栏（底部）
    const searchWrap = el('div', 'hist-search-wrap');
    const searchInput = el('textarea', 'hist-search-input', {
      placeholder: '搜索名称 (拼音/首字母, 空格分词)',
      text: this._searchQuery,
      rows: 2
    });
    let _composing = false;
    searchInput.addEventListener('compositionstart', () => { _composing = true; });
    searchInput.addEventListener('compositionend', () => {
      _composing = false;
      this._searchQuery = searchInput.value.toLowerCase();
      this.render();
      const newInput = this.container.querySelector('.hist-search-input');
      if (newInput) { newInput.focus(); newInput.setSelectionRange(newInput.value.length, newInput.value.length); }
    });
    searchInput.addEventListener('input', () => {
      if (_composing) return;
      this._searchQuery = searchInput.value.toLowerCase();
      this.render();
      const newInput = this.container.querySelector('.hist-search-input');
      if (newInput) { newInput.focus(); newInput.setSelectionRange(newInput.value.length, newInput.value.length); }
    });
    searchWrap.appendChild(searchInput);
    this.container.appendChild(searchWrap);

    this._sizeGrid();
  }

  _sizeGrid() {
    if (window.innerWidth > 767) return;
    requestAnimationFrame(() => {
      const list = this.listEl;
      if (!list || !list.parentNode) return;
      const availableH = list.clientHeight;
      const gap = 8;
      const rows = 3;
      const rowH = Math.floor((availableH - gap * (rows - 1)) / rows);
      if (rowH > 0) {
        list.style.gridAutoRows = rowH + 'px';
      }
    });
  }

  rebuildItems(lineages, currentLineageId) {
    this.items = Object.entries(lineages)
      .filter(([lid]) => lid !== 'lineage_0')
      .map(([lid, l]) => ({
        label: (l && l.name) || lid,
        lineageId: lid,
        ...(l && l.history || {}),
        active: lid === currentLineageId,
        current: lid === currentLineageId
      }));
    // 按 lineageId 排序（新的在前）
    this.items.sort((a, b) => b.lineageId.localeCompare(a.lineageId));
  }

  select(i) {
    this.items.forEach((it, idx) => it.active = idx === i);
    this.listEl.querySelectorAll('.hist-item').forEach((el, idx) => el.classList.toggle('active', idx === i));
    if (this.onSelect) this.onSelect(i);
  }

  // 版本步进器
  _renderVersionStepper(item, itemIndex) {
    const wrap = el('div', 'ver-stepper');

    if (item.versionCount <= 1) return wrap;
    const currentIdx = item.currentVersionIndex || 0;

    // 箭头左
    const btnPrev = el('button', 'ver-step-btn', { text: '⟨' });
    btnPrev.disabled = currentIdx === 0;
    btnPrev.addEventListener('click', (e) => { e.stopPropagation(); this._stepVersion(itemIndex, currentIdx - 1); });
    wrap.appendChild(btnPrev);

    wrap.appendChild(el('span', 'ver-step-indicator', { text: `${currentIdx + 1}/${item.versionCount}` }));

    // 箭头右
    const btnNext = el('button', 'ver-step-btn', { text: '⟩' });
    btnNext.disabled = currentIdx >= item.versionCount - 1;
    btnNext.addEventListener('click', (e) => { e.stopPropagation(); this._stepVersion(itemIndex, currentIdx + 1); });
    wrap.appendChild(btnNext);

    return wrap;
  }

  _stepVersion(itemIndex, versionIndex) {
    if (versionIndex < 0 || versionIndex >= this.items[itemIndex].versionCount) return;
    this.items[itemIndex].currentVersionIndex = versionIndex;
    const item = this.items[itemIndex];
    const versions = item.versionEntries || [];
    const entry = versions[versionIndex];
    if (entry) {
      item.thumbnail = entry.thumbnail;
      item.bg = entry.bg;
    }
    this.render();
    if (this.onVersionSwitch) this.onVersionSwitch(itemIndex, versionIndex);
  }

  _refreshStepper() {
    this.items.forEach((item, i) => {
      const itemEl = this.listEl.children[i];
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
      const itemEl = this.listEl.children[i];
      if (!itemEl) return;
      const thumb = itemEl.querySelector('.hist-thumb');
      if (!thumb) return;
      const rasterSrc2 = item.thumbnail || item.dataUrl;
      if (item.type === 'raster' && rasterSrc2) {
        // 光栅图：更新 <img> 标签
        const imgEl = thumb.querySelector('img');
        if (imgEl) {
          imgEl.src = rasterSrc2;
        } else {
          thumb.innerHTML = `<img src="${rasterSrc2}" />` + thumb.innerHTML;
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
        if (imageResult && typeof imageResult === 'object' && imageResult.type === 'raster' && (imageResult.thumbnail || imageResult.dataUrl)) {
          item.type = 'raster';
          item.thumbnail = imageResult.thumbnail || imageResult.dataUrl;
          item.dataUrl = '';
          item.svg = '';
        } else if (imageResult && typeof imageResult === 'object' && imageResult.svg) {
          item.type = 'svg';
          item.svg = imageResult.svg;
          item.thumbnail = '';
          item.dataUrl = '';
        } else if (typeof imageResult === 'string') {
          item.type = 'svg';
          item.svg = imageResult;
          item.thumbnail = '';
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

  _startRename(labelEl, itemIndex) {
    const item = this.items[itemIndex];
    if (!item) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'hist-label-input';
    input.value = item.label;
    input.style.width = (labelEl.offsetWidth - 8) + 'px';

    const commit = () => {
      const newName = input.value.trim();
      labelEl.textContent = newName || item.lineageId;
      item.label = newName || item.lineageId;
      if (this.onRename) this.onRename(itemIndex, newName);
      input.remove();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { input.value = item.label; commit(); }
    });

    labelEl.textContent = '';
    labelEl.appendChild(input);
    input.focus();
    input.select();
  }
}