/**
 * ConfigPanel.js — 右栏配置面板（通用壳子）
 *
 * 接受 tabsConfig 驱动渲染，每个 tab 定义含 describe 和控件字段。
 * 支持用户"当场设计"添加自定义 tab。
 */

import { el, svgEl, iconSvg } from './utils.js';
import { widgetRegistry, getTabTemplate, tabsToPrompt, availableTabPool } from './ConfigTabs.js';

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
    this.dragSrc = null;
    this.onGenerate = null;
    this.onSettingsOpen = null;
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

    // 添加字段按钮
    const addBtn = el('button', 'add-tab-btn', {
      title: '添加自定义字段',
      text: '+ 字段',
      onclick: () => this._showAddPopup()
    });
    header.appendChild(addBtn);
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
      onclick: () => { /* TODO */ }
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
    sec.addEventListener('dragover', e => this._dOver(e));
    sec.addEventListener('dragleave', e => this._dLeave(e));
    sec.addEventListener('drop', e => this._dDrop(e, secId));

    // header
    const hdr = el('div', 'drag-header', { draggable: 'true' });
    hdr.addEventListener('dragstart', e => this._dStart(e));
    hdr.addEventListener('dragend', e => this._dEnd(e));
    const handle = el('div', 'drag-handle');
    handle.innerHTML = '<span></span><span></span><span></span>';
    hdr.appendChild(handle);
    hdr.appendChild(el('span', 'drag-title', { text: tabDef.title || tabDef.id }));

    // flag 按钮
    const flagBtn = this._makeSectionFlagBtn(sec);
    hdr.appendChild(flagBtn);

    // 操作菜单按钮（仅 removable 为 true）
    if (tabDef.removable !== false) {
      const menuBtn = el('button', 'tab-menu-btn', { title: '更多操作' });
      menuBtn.innerHTML = '&ctdot;';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showTabMenu(e, tabDef);
      });
      hdr.appendChild(menuBtn);
    }

    sec.appendChild(hdr);

    // body — 委托给对应 widget
    const body = el('div', 'drag-body');
    const WidgetClass = widgetRegistry[tabDef.type];
    if (WidgetClass) {
      const widget = new WidgetClass(body, tabDef);
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
// ================================================================
  //  操作菜单（删除 / 修改）
  // ================================================================
  _showTabMenu(e, tabDef) {
    // 关闭已有的菜单
    this._closeTabMenu();

    const menu = el('div', 'tab-context-menu');

    // 修改选项
    const editItem = el('div', 'tab-context-item', { text: '修改' });
    editItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeTabMenu();
      this._showEditPopup(tabDef);
    });
    menu.appendChild(editItem);

    // 分割线
    const divider = el('div', 'tab-context-divider');
    menu.appendChild(divider);

    // 删除选项（危险色）
    const delItem = el('div', 'tab-context-item tab-context-item-danger', {
      text: '删除'
    });
    delItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeTabMenu();
      this.removeTab(tabDef.id);
    });
    menu.appendChild(delItem);

    // 先挂到 DOM 里，测量实际尺寸
    document.body.appendChild(menu);
    this._activeTabMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    const menuH = menuRect.height;
    const menuW = menuRect.width;

    // 智能定位：垂直方向下方不足则翻转到按钮上方
    const rect = e.target.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top;
    if (spaceBelow >= menuH + 4 || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = rect.top - menuH - 4;
    }

    // 水平定位：默认左对齐按钮左侧；若右侧放不下则贴死右侧面板右边界
    let left;
    const containerRect = this.container.getBoundingClientRect();
    if (rect.left + menuW <= window.innerWidth - 4) {
      left = rect.left;
    } else {
      left = containerRect.right - menuW;
      if (left < 0) left = 0;
      menu.classList.add('tab-context-menu-right');
    }

    menu.style.position = 'fixed';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    // 视窗大小改变时直接关闭菜单
    const resizeHandler = () => this._closeTabMenu();
    window.addEventListener('resize', resizeHandler);
    this._resizeHandler = resizeHandler;

    // 点击其他地方关闭
    const closeHandler = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== e.target) {
        this._closeTabMenu();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
  }

  _closeTabMenu() {
    if (this._activeTabMenu) {
      this._activeTabMenu.remove();
      this._activeTabMenu = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  _showEditPopup(tabDef) {
    const existing = document.getElementById('editTabPopup');
    if (existing) existing.remove();

    const overlay = el('div', 'add-tab-overlay', { id: 'editTabPopup' });
    const popup = el('div', 'add-tab-popup');

    popup.appendChild(el('h4', 'add-tab-title', { text: '修改字段' }));

    const titleRow = el('div', 'add-tab-row');
    titleRow.appendChild(el('label', 'add-tab-label', { text: '名称' }));
    const titleInput = el('input', 'add-tab-input', {
      type: 'text',
      placeholder: '字段名称',
      value: tabDef.title || ''
    });
    titleRow.appendChild(titleInput);
    popup.appendChild(titleRow);

    const descRow = el('div', 'add-tab-row');
    descRow.appendChild(el('label', 'add-tab-label', { text: '描述' }));
    const descInput = el('input', 'add-tab-input', {
      type: 'text',
      placeholder: '描述这段字段的作用',
      value: tabDef.describe || ''
    });
    descRow.appendChild(descInput);
    popup.appendChild(descRow);

    const btnRow = el('div', 'add-tab-btns');
    const cancelBtn = el('button', 'add-tab-btn-sec', {
      text: '取消',
      onclick: () => overlay.remove()
    });
    const confirmBtn = el('button', 'add-tab-btn-pri', {
      text: '保存',
      onclick: () => {
        const newTitle = titleInput.value.trim();
        const newDescribe = descInput.value.trim();
        if (newTitle) tabDef.title = newTitle;
        if (newDescribe !== undefined) tabDef.describe = newDescribe;
        this.render();
        overlay.remove();
      }
    });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    popup.appendChild(btnRow);

    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  _makeSectionFlagBtn(sec) {
    const btn = el('button', 'section-flag-btn', {
      title: '标记完成',
      onclick: (e) => {
        e.stopPropagation();
        sec.classList.toggle('flagged');
        btn.classList.toggle('done');
      }
    });
    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 13 13" fill="none"><line x1="2.5" y1="1.5" x2="2.5" y2="11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></line><path d="M2.5 1.5 L10.5 1.5 L8.5 4.5 L10.5 7.5 L2.5 7.5 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"></path></svg>';
    return btn;
  }

  // ================================================================
  //  值收集 & Prompt 拼接
  // ================================================================
  getTabValues() {
    const values = {};
    for (const [id, entry] of Object.entries(this.widgets)) {
      values[id] = entry.widget.getValue();
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
  _showAddPopup() {
    const existing = document.getElementById('addTabPopup');
    if (existing) existing.remove();

    const overlay = el('div', 'add-tab-overlay', { id: 'addTabPopup' });
    const popup = el('div', 'add-tab-popup');

    popup.appendChild(el('h4', 'add-tab-title', { text: '添加自定义字段' }));

    const typeRow = el('div', 'add-tab-row');
    typeRow.appendChild(el('label', 'add-tab-label', { text: '类型' }));
    const typeSel = el('select', 'add-tab-select');
    typeSel.innerHTML = '<option value="text">单行文本</option><option value="text-multi">多行文本</option><option value="slider">调节拉杆</option><option value="choice-dropdown">下拉选择</option><option value="choice-toggle">开关</option><option value="choice-radio">单选组</option><option value="image">图片上传</option>';
    typeRow.appendChild(typeSel);
    popup.appendChild(typeRow);

    const titleRow = el('div', 'add-tab-row');
    titleRow.appendChild(el('label', 'add-tab-label', { text: '名称' }));
    const titleInput = el('input', 'add-tab-input', { type: 'text', placeholder: '字段名称', value: '' });
    titleRow.appendChild(titleInput);
    popup.appendChild(titleRow);

    const descRow = el('div', 'add-tab-row');
    descRow.appendChild(el('label', 'add-tab-label', { text: '描述' }));
    const descInput = el('input', 'add-tab-input', { type: 'text', placeholder: '描述这段字段的作用', value: '' });
    descRow.appendChild(descInput);
    popup.appendChild(descRow);

    const btnRow = el('div', 'add-tab-btns');
    const cancelBtn = el('button', 'add-tab-btn-sec', {
      text: '取消',
      onclick: () => overlay.remove()
    });
    const confirmBtn = el('button', 'add-tab-btn-pri', {
      text: '添加',
      onclick: () => {
        const typeVal = typeSel.value;
        const title = titleInput.value.trim() || '自定义字段';
        const describe = descInput.value.trim() || '';
        let tabDef;
        if (typeVal === 'text') {
          tabDef = { ...getTabTemplate('text'), title, describe, multiline: false };
        } else if (typeVal === 'text-multi') {
          tabDef = { ...getTabTemplate('text'), title, describe, multiline: true, rows: 3 };
        } else if (typeVal === 'slider') {
          tabDef = { ...getTabTemplate('slider'), title, describe };
        } else if (typeVal === 'choice-dropdown') {
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'dropdown' };
        } else if (typeVal === 'choice-toggle') {
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'toggle', options: ['关', '开'], defaultValue: '关' };
        } else if (typeVal === 'choice-radio') {
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'radio' };
        } else if (typeVal === 'image') {
          tabDef = { ...getTabTemplate('image'), title, describe };
        }
        if (tabDef) this.addCustomTab(tabDef);
        overlay.remove();
      }
    });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    popup.appendChild(btnRow);

    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  addCustomTab(tabDef) {
    const id = 'custom_' + Date.now();
    const def = { ...tabDef, id, removable: true, order: this.tabsConfig.length };
    this.tabsConfig.push(def);
    this.secList.appendChild(this._makeTabSection(def));
  }

  removeTab(id) {
    delete this.widgets[id];
    this.tabsConfig = this.tabsConfig.filter(d => d.id !== id);
    const node = document.getElementById('sec-' + id);
    if (node) node.remove();
  }

  // ================================================================
  //  区域 prompt（通过隐藏 tab 实现）
  // ================================================================
  showRegionPrompt(label) {
    const sec = document.getElementById('sec-region_prompt');
    if (!sec) return;
    sec.style.display = 'block';
    const titleEl = sec.querySelector('.drag-title');
    if (titleEl) titleEl.textContent = '◎ ' + (label || '区域 prompt');
  }
  hideRegionPrompt() {
    const sec = document.getElementById('sec-region_prompt');
    if (sec) sec.style.display = 'none';
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

  // ================================================================
  //  拖拽排序
  // ================================================================
  _dStart(e) {
    const handle = e.currentTarget;
    const elm = handle.closest('.drag-section');
    if (!elm) return;
    if (elm.classList.contains('flagged')) {
      e.preventDefault();
      return;
    }
    this.dragSrc = elm.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(elm, 0, 0);
    setTimeout(() => {
      elm.classList.add('dragging');
    }, 0);
  }

  _dEnd(e) {
    // 清除所有拖拽样式（拖拽取消、拖出界等）
    this.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('dragging', 'drag-over'));
    this.dragSrc = null;
  }

  _dOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.add('drag-over');
  }

  _dLeave(e) {
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.remove('drag-over');
  }

  _dDrop(e, tid) {
    e.preventDefault();
    this.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-over', 'dragging'));
    if (this.dragSrc && this.dragSrc !== tid) {
      const src = document.getElementById(this.dragSrc);
      const tgt = document.getElementById(tid);
      if (src && tgt) {
        const si = Array.from(this.secList.children).indexOf(src);
        const ti = Array.from(this.secList.children).indexOf(tgt);
        if (si < ti) this.secList.insertBefore(src, tgt.nextSibling);
        else this.secList.insertBefore(src, tgt);
      }
    }
    this.dragSrc = null;
  }
}