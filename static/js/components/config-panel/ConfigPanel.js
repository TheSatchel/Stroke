/**
 * ConfigPanel.js — 右栏配置面板（通用壳子）
 *
 * 接受 tabsConfig 驱动渲染，每个 tab 定义含 describe 和控件字段。
 * 拆分后：DOM 构建委托 TabSectionBuilder，region prompt 管理委托 RegionPromptManager，
 * 导出委托 ExportManager，拖拽/弹窗/右键菜单保持子模块引用。
 */
import { el, svgEl, iconSvg } from '../../utils/DOM.js';
import { widgetRegistry, tabsToPrompt, getGenerateCallSegments } from '../ConfigTabs.js';
import DragManager from './DragManager.js';
import TabEditModal from './TabEditModal.js';
import TabContextMenu from './TabContextMenu.js';
import { makeTabSection } from './TabSectionBuilder.js';
import RegionPromptManager from './RegionPromptManager.js';
import ExportManager from './ExportManager.js';

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
    this.onConfigChange = null;
    this.onTabRemove = null;

    // 子模块
    this.dragManager = new DragManager(this);
    this._tabEditModal = new TabEditModal(this);
    this._tabContextMenu = new TabContextMenu(this);
    this._regionPromptManager = new RegionPromptManager(this);
    this._exportManager = new ExportManager();

    this.render();
  }

  // ================================================================
  //  全量渲染
  // ================================================================
  render() {
    this.container.className = 'col-right';
    this.container.innerHTML = '';
    this.widgets = {};

    const header = el('div', 'col-header');
    header.appendChild(el('span', '', { text: '配置' }));

    const rightGroup = el('span', 'config-header-actions');
    const addBtn = el('button', 'add-tab-btn', {
      title: '添加自定义字段',
      text: '+ 字段',
      onclick: () => this._tabEditModal.showAdd()
    });
    rightGroup.appendChild(addBtn);
    header.appendChild(rightGroup);
    this.container.appendChild(header);

    this.rightBody = el('div', 'right-body', { id: 'rightBody' });
    this.secWrap = el('div', 'sections-wrap', { id: 'secWrap' });
    this.secList = el('div', '', { id: 'secList' });

    const sorted = [...this.tabsConfig].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const tabDef of sorted) {
      this.secList.appendChild(makeTabSection(tabDef, this.dragManager, this._tabContextMenu, this.widgets, this));
    }

    this.secWrap.appendChild(this.secList);
    this.rightBody.appendChild(this.secWrap);
    this.container.appendChild(this.rightBody);

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
      onclick: () => this._exportManager.download(this.widgets)
    });
    this.footer.appendChild(this.exportBtn);

    this.footer.appendChild(el('div', 'divider'));
    const srow = el('div', 'setting-row');
    const sbtn = el('button', 'setting-btn', {
      title: '设置',
      onclick: () => { if (this.onSettingsOpen) this.onSettingsOpen(); }
    });
    const gearIcon = iconSvg(64, 64, [
      svgEl('path', { d: 'M32 4a4 4 0 0 0-3.5 2l-1.5 4c-.3.7-.9 1.2-1.6 1.5l-3.4 1c-.8.3-1.7 0-2.3-.6L17 10a3.8 3.8 0 0 0-5.5 0L6.5 15a3.8 3.8 0 0 0 0 5.5l3.2 3.2c.6.6.8 1.5.6 2.3l-1 3.4c-.3.7-.8 1.3-1.5 1.6l-4 1.5A4 4 0 0 0 2 35.5v5a4 4 0 0 0 2 3.5l4 1.5c.7.3 1.2.9 1.5 1.6l1 3.4c.3.8 0 1.7-.6 2.3l-3.2 3.2a3.8 3.8 0 0 0 0 5.5L11.5 67a3.8 3.8 0 0 0 5.5 0l3.2-3.2c.6-.6 1.5-.8 2.3-.6l3.4 1c.7.3 1.3.8 1.6 1.5l1.5 4a4 4 0 0 0 3.5 2h5.5a4 4 0 0 0 3.5-2l1.5-4c.3-.7.9-1.2 1.6-1.5l3.4-1c.8-.3 1.7 0 2.3.6L53 67a3.8 3.8 0 0 0 5.5 0L63.5 62a3.8 3.8 0 0 0 0-5.5l-3.2-3.2c-.6-.6-.8-1.5-.6-2.3l1-3.4c.3-.7.8-1.3 1.5-1.6l4-1.5A4 4 0 0 0 68 41.5v-5a4 4 0 0 0-2-3.5l-4-1.5c-.7-.3-1.2-.9-1.5-1.6l-1-3.4c-.3-.8 0-1.7.6-2.3l3.2-3.2a3.8 3.8 0 0 0 0-5.5L57.5 9a3.8 3.8 0 0 0-5.5 0l-3.2 3.2c-.6.6-1.5.8-2.3.6l-3.4-1c-.7-.3-1.3-.8-1.6-1.5L40 6.5A4 4 0 0 0 36.5 4.5H31L32 4zm0 17a11 11 0 1 1 0 22 11 11 0 0 1 0-22z', fill: 'none', stroke: 'currentColor', 'stroke-width': '4.5', 'stroke-linejoin': 'round' })
    ]);
    sbtn.appendChild(gearIcon);
    srow.appendChild(sbtn);
    this.footer.appendChild(srow);
    this.container.appendChild(this.footer);
  }

  // ================================================================
  //  值收集 & Prompt 拼接
  // ================================================================
  getSegmentPrompts() {
    const sorted = [...this.tabsConfig].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const values = this.getTabValues();
    const segments = getGenerateCallSegments(sorted);
    return segments.map(seg => ({
      ...seg,
      prompt: tabsToPrompt(values, sorted, seg.endIndex)
    }));
  }

  getTabValues() {
    const values = {};
    for (const [id, entry] of Object.entries(this.widgets)) {
      values[id] = entry.widget.getValue();
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
    const existing = tabDef.id ? this.tabsConfig.find(t => t.id === tabDef.id) : null;
    const id = (tabDef.id && !existing) ? tabDef.id : ('custom_' + Date.now());

    const genCalls = this.tabsConfig.filter(t => t.type === 'generate_call');
    const maxNonGen = this.tabsConfig.filter(t => t.type !== 'generate_call').reduce((max, t) => Math.max(max, t.order ?? 0), 0);
    const lastGenOrder = genCalls.length > 0 ? Math.max(...genCalls.map(t => t.order ?? 1000)) : 1000;
    const safeOrder = (maxNonGen + 1 >= lastGenOrder) ? (maxNonGen + lastGenOrder) / 2 : maxNonGen + 1;

    const def = { ...tabDef, id, removable: true, order: safeOrder };

    const insertAt = this.tabsConfig.findIndex(t => (t.order ?? 0) > safeOrder);
    if (insertAt === -1) {
      this.tabsConfig.push(def);
    } else {
      this.tabsConfig.splice(insertAt, 0, def);
    }

    const genCallEls = Array.from(this.secList.children).filter(el => {
      const tid = el.id.replace('sec-', '');
      const d = this.tabsConfig.find(t => t.id === tid);
      return d && d.type === 'generate_call';
    });
    const lastGenEl = genCallEls[genCallEls.length - 1];
    const sectionEl = makeTabSection(def, this.dragManager, this._tabContextMenu, this.widgets, this);
    if (lastGenEl) {
      this.secList.insertBefore(sectionEl, lastGenEl);
    } else {
      this.secList.appendChild(sectionEl);
    }
    this._notifyConfigChange();
  }

  removeTab(id) {
    const def = this.tabsConfig.find(t => t.id === id);
    if (def && (def.id === 'prompt' || def.type === 'generate_call')) return;

    if (def && def.type === 'region_prompt' && this._onRegionRemove && def.data?.label) {
      this._onRegionRemove(def.data.label);
    }

    delete this.widgets[id];
    this.tabsConfig = this.tabsConfig.filter(d => d.id !== id);
    const node = document.getElementById('sec-' + id);
    if (node) node.remove();
    this._notifyConfigChange();
    if (this.onTabRemove) this.onTabRemove(id, def);
  }

  // ================================================================
  //  区域 prompt 实例管理（委托）
  // ================================================================
  addRegionPrompt(data) {
    this._regionPromptManager.add(data);
  }

  removeAllRegionPrompts() {
    this._regionPromptManager.removeAll();
  }

  setOnRegionRemove(fn) {
    this._onRegionRemove = fn;
  }

  restoreTabValues(values) {
    if (!values) return;
    for (const [id, val] of Object.entries(values)) {
      if (!this.widgets[id]) continue;
      const def = this.widgets[id].def;
      if (def && def.type === 'region_prompt' && values[id + '__raw'] !== undefined) {
        this.widgets[id].widget.setValue(values[id + '__raw']);
      } else {
        this.widgets[id].widget.setValue(val);
      }
    }
  }

  doGen() {
    if (window.__strokeApp && window.__strokeApp._generatingFp) return;
    if (this.onGenerate) this.onGenerate();
  }

  onGenComplete() {
    this.generating = false;
    this.genBtn.textContent = '重新生成';
    this.genBtn.disabled = false;
    this.exportBtn.style.display = '';
  }

  setDownloadLineage(lineageId, versionIndex) {
    this._exportManager.setSource(lineageId, versionIndex);
  }

  showPostGen(isCurrentlyGenerating = false) {
    this.generating = isCurrentlyGenerating;
    if (isCurrentlyGenerating) {
      this.genBtn.textContent = '生成中...';
      this.genBtn.disabled = true;
      this.exportBtn.style.display = 'none';
    } else {
      this.genBtn.textContent = '重新生成';
      this.genBtn.disabled = false;
      this.exportBtn.style.display = '';
    }
  }

  _notifyConfigChange() {
    if (this.onConfigChange) this.onConfigChange();
  }
}
