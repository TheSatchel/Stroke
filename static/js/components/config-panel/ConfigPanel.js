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
    if (this.generating) return;
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

  showPostGen() {
    this.generating = false;
    this.genBtn.textContent = '重新生成';
    this.genBtn.disabled = false;
    this.exportBtn.style.display = '';
  }

  _notifyConfigChange() {
    if (this.onConfigChange) this.onConfigChange();
  }
}
