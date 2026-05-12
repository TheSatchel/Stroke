/**
 * ConfigPanel.js — 右栏配置面板（通用壳子）
 *
 * 接受 tabsConfig 驱动渲染，每个 tab 定义含 describe 和控件字段。
 * 支持用户"当场设计"添加自定义 tab。
 * - 第一个永远是 prompt，最后一个永远是 generate_call，二者不可拖拽
 * - 新增字段始终插入到最后生成调用之前
 *
 * 拆分后，拖拽逻辑委托给 DragManager，弹窗委托给 TabEditModal，
 * 右键菜单委托给 TabContextMenu。
 */

import { el, svgEl, iconSvg } from '../../utils/DOM.js';
import { showToast } from '../../utils/Toast.js';
import { widgetRegistry, tabsToPrompt, getGenerateCallSegments } from '../ConfigTabs.js';
import DragManager from './DragManager.js';
import TabEditModal from './TabEditModal.js';
import TabContextMenu from './TabContextMenu.js';

export default class ConfigPanel {
  /**
   * @param {HTMLElement} container
   * @param {Array} tabsConfig - tab 定义数组
   */
  constructor(container, tabsConfig = []) {
    this.container = container;
    this.tabsConfig = tabsConfig;
    /** @type {Object<string, {widget, def}>} */
    this.widgets = {};
    this.isCollapsed = false;
    this.generating = false;
    this.onGenerate = null;
    this.onSettingsOpen = null;
    this.onConfigChange = null;   // 拖动/增删/修改后自动存入 lineage
    this.onTabRemove = null;      // tab 被删除时回调 (id, def)

    // 子模块
    this.dragManager = new DragManager(this);
    this._tabEditModal = new TabEditModal(this);
    this._tabContextMenu = new TabContextMenu(this);

    this.render();
  }

  // ================================================================
  //  全量渲染
  // ================================================================
  render() {
    this.container.className = 'col-right';
    this.container.innerHTML = '';

    // header
    const header = el('div', 'col-header');
    header.appendChild(el('span', '', { text: '配置' }));

    // 右侧按钮组（靠右）
    const rightGroup = el('span', 'config-header-actions');

    // 添加字段按钮
    const addBtn = el('button', 'add-tab-btn', {
      title: '添加自定义字段',
      text: '+ 字段',
      onclick: () => this._tabEditModal.showAdd()
    });
    rightGroup.appendChild(addBtn);
    header.appendChild(rightGroup);
    this.container.appendChild(header);

    // body
    this.rightBody = el('div', 'right-body', { id: 'rightBody' });
    this.secWrap = el('div', 'sections-wrap', { id: 'secWrap' });
    this.secList = el('div', '', { id: 'secList' });

    // 按 order 排序后渲染所有 tab
    const sorted = [...this.tabsConfig].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const tabDef of sorted) {
      this.secList.appendChild(this._makeTabSection(tabDef));
    }

    this.secWrap.appendChild(this.secList);
    this.rightBody.appendChild(this.secWrap);
    this.container.appendChild(this.rightBody);

    // footer
    this.footer = el('div', 'right-footer', { id: 'rightFooter' });
    this.genBtn = el('button', 'gen-btn', {
      id: 'genBtn',
      text: '开始生成',
      style: 'width:100%;margin-bottom:8px',
      onclick: () => this.doGen()
    });
    this.footer.appendChild(this.genBtn);

    this.exportBtn = el('button', 'gen-btn', {
      id: 'exportBtn',
      text: '导出图片',
      style: 'width:100%;margin-bottom:8px;display:none',
      onclick: () => this._downloadResult()
    });
    this.footer.appendChild(this.exportBtn);

    this.footer.appendChild(el('div', 'divider'));
    const srow = el('div', 'setting-row');
    const sbtn = el('button', 'setting-btn', {
      title: 'API 设置',
      onclick: () => { if (this.onSettingsOpen) this.onSettingsOpen(); }
    });
    const gearIcon = iconSvg(15, 15, [
      svgEl('circle', { cx: '8', cy: '8', r: '2.5', stroke: 'currentColor', 'stroke-width': '1.3' }),
      svgEl('path', { d: 'M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1', stroke: 'currentColor', 'stroke-width': '1.3' })
    ]);
    sbtn.appendChild(gearIcon);
    srow.appendChild(sbtn);
    this.footer.appendChild(srow);
    this.container.appendChild(this.footer);
  }

  // ================================================================
  //  根据 tabDef 生成一个 drag-section
  // ================================================================
  _makeTabSection(tabDef) {
    const secId = 'sec-' + tabDef.id;
    const sec = el('div', 'drag-section', { id: secId });
    if (tabDef.hidden) sec.style.display = 'none';
    sec.addEventListener('dragover', e => this.dragManager.dOver(e));
    sec.addEventListener('dragleave', e => this.dragManager.dLeave(e));
    sec.addEventListener('drop', e => this.dragManager.dDrop(e, secId));

    // header — prompt 和 generate_call 锁定不可拖
    const isPinnedSection = tabDef.id === 'prompt' || tabDef.type === 'generate_call';
    const hdr = el('div', 'drag-header', isPinnedSection ? { style: 'cursor:default' } : { draggable: 'true' });
    if (!isPinnedSection) {
      hdr.addEventListener('dragstart', e => this.dragManager.dStart(e));
      hdr.addEventListener('dragend', e => this.dragManager.dEnd(e));
    }
    const handle = el('div', 'drag-handle');
    if (isPinnedSection) {
      handle.style.opacity = '0.1';
      handle.style.cursor = 'default';
    }
    handle.innerHTML = '<span></span><span></span><span></span>';
    hdr.appendChild(handle);
    hdr.appendChild(el('span', 'drag-title', { text: tabDef.title || tabDef.id }));

    // dblclick 删除（非锁定元素）
    if (isPinnedSection !== true && tabDef.removable !== false) {
      hdr.addEventListener('dblclick', () => {
        this.removeTab(tabDef.id);
      });
    }

    // flag 按钮
    const flagBtn = this._makeSectionFlagBtn(sec);
    hdr.appendChild(flagBtn);

    // 操作菜单按钮（仅 removable 为 true）
    if (tabDef.removable !== false) {
      const menuBtn = el('button', 'tab-menu-btn', { title: '更多操作' });
      menuBtn.innerHTML = '&ctdot;';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._tabContextMenu.show(e, tabDef);
      });
      hdr.appendChild(menuBtn);
    }

    sec.appendChild(hdr);

    // body — 委托给对应 widget
    const body = el('div', 'drag-body');
    const WidgetClass = widgetRegistry[tabDef.type];
    if (WidgetClass) {
      const widget = new WidgetClass(body, tabDef, tabDef.configId || null);
      this.widgets[tabDef.id] = { widget, def: tabDef };
    } else {
      body.appendChild(el('span', '', { text: '未知控件类型: ' + tabDef.type }));
    }

    sec.appendChild(body);
    return sec;
  }

  // ================================================================
  //  旗标按钮
  // ================================================================
  _makeSectionFlagBtn(sec) {
    const btn = el('button', 'section-flag-btn', {
      title: '标记完成',
      onclick: (e) => {
        e.stopPropagation();
        btn.classList.toggle('section-flag-btn--done');
        sec.classList.toggle('drag-section--flagged');
      }
    });
    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 13 13" fill="none"><line x1="2.5" y1="1.5" x2="2.5" y2="11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></line><path d="M2.5 1.5 L10.5 1.5 L8.5 4.5 L10.5 7.5 L2.5 7.5 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"></path></svg>';
    return btn;
  }

  /**
   * 获取按 generate_call 分段的所有 prompt
   */
  getSegmentPrompts() {
    const sorted = [...this.tabsConfig].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const values = this.getTabValues();
    const segments = getGenerateCallSegments(sorted);
    return segments.map(seg => ({
      ...seg,
      prompt: tabsToPrompt(values, sorted, seg.endIndex)
    }));
  }

  // ================================================================
  //  值收集 & Prompt 拼接
  // ================================================================
  getTabValues() {
    const values = {};
    for (const [id, entry] of Object.entries(this.widgets)) {
      values[id] = entry.widget.getValue();
      // 对 region_prompt 类型，同时存原始用户输入用于指纹计算
      if (entry.def.type === 'region_prompt' && typeof entry.widget.getUserInput === 'function') {
        values[id + '__raw'] = entry.widget.getUserInput();
      }
    }
    return values;
  }

  getFullPrompt() {
    const values = this.getTabValues();
    return tabsToPrompt(values, this.tabsConfig);
  }

  // ================================================================
  //  添加 / 删除 tab
  // ================================================================
  addCustomTab(tabDef) {
    // 尊重调用方传入的 id（如果 unique），否则自动生成
    const existing = tabDef.id ? this.tabsConfig.find(t => t.id === tabDef.id) : null;
    const id = (tabDef.id && !existing) ? tabDef.id : ('custom_' + Date.now());

    // 新增字段插入到最后一个 generate_call 之前
    const genCalls = this.tabsConfig.filter(t => t.type === 'generate_call');
    const maxNonGen = this.tabsConfig.filter(t => t.type !== 'generate_call').reduce((max, t) => Math.max(max, t.order ?? 0), 0);
    const lastGenOrder = genCalls.length > 0 ? Math.max(...genCalls.map(t => t.order ?? 1000)) : 1000;
    const safeOrder = (maxNonGen + 1 >= lastGenOrder) ? (maxNonGen + lastGenOrder) / 2 : maxNonGen + 1;

    const def = { ...tabDef, id, removable: true, order: safeOrder };

    // 按 order 插入数组，保持 tabsConfig 始终有序
    const insertAt = this.tabsConfig.findIndex(t => (t.order ?? 0) > safeOrder);
    if (insertAt === -1) {
      this.tabsConfig.push(def);
    } else {
      this.tabsConfig.splice(insertAt, 0, def);
    }

    // DOM 插入到最后一个 generate_call 之前
    const genCallEls = Array.from(this.secList.children).filter(el => {
      const tid = el.id.replace('sec-', '');
      const d = this.tabsConfig.find(t => t.id === tid);
      return d && d.type === 'generate_call';
    });
    const lastGenEl = genCallEls[genCallEls.length - 1];
    const sectionEl = this._makeTabSection(def);
    if (lastGenEl) {
      this.secList.insertBefore(sectionEl, lastGenEl);
    } else {
      this.secList.appendChild(sectionEl);
    }
    this._notifyConfigChange();
  }

  removeTab(id) {
    // 锁定元素不可删除
    const def = this.tabsConfig.find(t => t.id === id);
    if (def && (def.id === 'prompt' || def.type === 'generate_call')) return;

    delete this.widgets[id];
    this.tabsConfig = this.tabsConfig.filter(d => d.id !== id);
    const node = document.getElementById('sec-' + id);
    if (node) node.remove();
    this._notifyConfigChange();
    if (this.onTabRemove) this.onTabRemove(id, def);
  }

  // ================================================================
  //  区域 prompt 实例管理（新管线）
  // ================================================================
  _regionCount = 0;

  /**
   * 添加一个 region_prompt 实例
   * @param {Object} data - { imageDataUrl, points, color, label, type, canvasWidth, canvasHeight }
   */
  addRegionPrompt(data) {
    const id = 'region_' + data.label.toLowerCase();

    // 如果该 label 的 tab 已存在，更新它
    const existingDef = this.tabsConfig.find(t => t.id === id);
    if (existingDef) {
      const entry = this.widgets[id];
      if (entry && entry.widget && typeof entry.widget.updateImage === 'function') {
        entry.widget.updateImage(data.imageDataUrl);
        entry.def.data = data;
      }
      return;
    }

    const def = {
      id,
      title: `选区 ${data.label}`,
      describe: `选区 ${data.label} — 输入该区域的处理方式`,
      type: 'region_prompt',
      order: 2 + 0.1 * this._regionCount,
      removable: true,
      data,
    };
    this._regionCount++;
    this.addCustomTab(def);

    // 绑定删除 → 清理画布上对应选区
    const entry = this.widgets[id];
    if (entry && entry.widget) {
      entry.widget.onRemove(() => {
        // 通过 App 回调来清理 canvas 选区
        if (this._onRegionRemove) {
          this._onRegionRemove(data.label);
        }
        this.removeTab(id);
      });
    }
  }

  /**
   * 移除所有 region_prompt 类型的 tab
   */
  removeAllRegionPrompts() {
    const toRemove = this.tabsConfig.filter(t => t.type === 'region_prompt');
    for (const def of toRemove) {
      delete this.widgets[def.id];
      this.tabsConfig = this.tabsConfig.filter(d => d.id !== def.id);
      const node = document.getElementById('sec-' + def.id);
      if (node) node.remove();
    }
    this._regionCount = 0;
  }

  /**
   * 设置选区从 canvas 删除时的回调
   */
  setOnRegionRemove(fn) {
    this._onRegionRemove = fn;
  }

  restoreTabValues(values) {
    if (!values) return;
    for (const [id, val] of Object.entries(values)) {
      if (this.widgets[id]) {
        this.widgets[id].widget.setValue(val);
      }
    }
  }

  doGen() {
    if (this.generating) return;
    if (this.onGenerate) this.onGenerate();
  }

  onGenComplete() {
    this.generating = false;
    this.genBtn.textContent = '重新生成';
    this.genBtn.disabled = false;
    this.exportBtn.style.display = '';
  }

  /**
   * 下载最后一个 generate_call widget 生成的结果图片
   */
  _downloadResult() {
    const genCalls = Object.entries(this.widgets)
      .filter(([_, entry]) => entry.def.type === 'generate_call')
      .sort((a, b) => (a[1].def.order || 0) - (b[1].def.order || 0));

    const last = genCalls[genCalls.length - 1];
    if (!last) {
      showToast('没有可导出的结果', 'warning');
      return;
    }

    const widget = last[1].widget;
    const base64 = widget._resultBase64 || (typeof widget.getResultBase64 === 'function' ? widget.getResultBase64() : '');
    const svgRaw = widget._svgOutput || (typeof widget.getSvgOutput === 'function' ? widget.getSvgOutput() : '');

    if (!base64 && !svgRaw) {
      showToast('请先生成图片', 'warning');
      return;
    }

    let ext = 'png';
    let downloadUrl;
    let needsRevoke = false;

    if (svgRaw) {
      ext = 'svg';
      const blob = new Blob([svgRaw], { type: 'image/svg+xml' });
      downloadUrl = URL.createObjectURL(blob);
      needsRevoke = true;
    } else if (base64) {
      downloadUrl = base64;
      if (base64.startsWith('data:image/svg+xml')) ext = 'svg';
      else if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) ext = 'jpg';
      else if (base64.startsWith('data:image/webp')) ext = 'webp';
      else if (base64.startsWith('data:image/png')) ext = 'png';
    } else {
      showToast('没有可下载的图片数据', 'warning');
      return;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `generated_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (needsRevoke) {
      URL.revokeObjectURL(downloadUrl);
    }

    showToast(`图片已导出为 ${a.download}`, 'success', 3000);
  }

  _notifyConfigChange() {
    if (this.onConfigChange) this.onConfigChange();
  }
}
