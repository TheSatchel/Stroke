/**
 * App.js — Stroke UI System 根协调器
 * 组装各组件，建立事件连线，委托生成与持久化。
 */

import HistoryPanel from '../components/HistoryPanel.js';
import Canvas from '../components/Canvas.js';
import ConfigPanel from '../components/ConfigPanel.js';
import { defaultConfigTabs } from '../components/ConfigTabs.js';
import SettingsModal from '../components/SettingsModal.js';
import ConfigModal from '../components/ConfigModal.js';
import { migrateLegacyPresets, clearAll } from '../storage.js';
import { GeneratorService } from '../adapter.js';
import { saveAppState, loadAppState, saveSettingsBarToLineage, loadSettingsBarFromLineage, deleteHistoryItem, deleteAllHistory } from './persistence.js';
import { performGeneration } from './Generator.js';

export default class App {
  constructor(mount) {
    this.el = mount;
    this.el.className = 'app';
    this.el.innerHTML = '';

    // 生成服务（注册中心，管理所有平台实现）
    this.generator = new GeneratorService();
    window.__strokeApp = this;

    // 迁移旧预设 → 新配置
    migrateLegacyPresets();

    // 数据层
    this.versionLineages = {};
    this.configFingerprints = {};
    this.currentLineageId = null;
    this.currentVersionIndex = 0;

    // 左栏 — 历史版本
    this.history = new HistoryPanel(document.createElement('div'));
    this.el.appendChild(this.history.container);

    // 左拖拽手柄
    this._handleLeft = this._createResizeHandle();
    this.el.appendChild(this._handleLeft);

    // 中栏 — 画布
    this.canvas = new Canvas(document.createElement('div'));
    this.el.appendChild(this.canvas.container);

    // 右拖拽手柄
    this._handleRight = this._createResizeHandle();
    this.el.appendChild(this._handleRight);

    // 右栏 — 配置面板（传入默认 tab 配置）
    this.config = new ConfigPanel(document.createElement('div'), defaultConfigTabs);
    this.el.appendChild(this.config.container);

    // ▲ 自动 hook：每次 config.render() 后重新接线 ImageWidget→Canvas 双向同步
    const originalConfigRender = this.config.render.bind(this.config);
    this.config.render = () => {
      originalConfigRender();
      this._rewireImageSync();
    };

    // 初始化拖拽调整大小
    this._initResizeHandles();

    // 配置管理二级弹窗
    this.configModal = new ConfigModal(this.generator);

    // 设置弹窗（精简版：主题 + 管理配置按钮 + 危险区）
    this.settings = new SettingsModal(document.createElement('div'), this.generator);
    this.el.appendChild(this.settings.overlay);

    // --- 组件间连线 ---
    this._wireEvents();

    // 从存储恢复
    loadAppState(this);
  }

  // ================================================================
  //  拖拽调整左右面板宽度
  // ================================================================
  _createResizeHandle() {
    const h = document.createElement('div');
    h.className = 'resize-handle';
    return h;
  }

  _initResizeHandles() {
    const appEl = this.el;
    const ghost = document.createElement('div');
    ghost.className = 'resize-ghost';
    document.body.appendChild(ghost);

    // Parse the rendered px widths from minmax() columns
    const getRenderedWidths = () => {
      const cs = getComputedStyle(appEl);
      const parts = cs.gridTemplateColumns.split(' ');
      return {
        left: parseFloat(parts[0]) || 200,
        mid: parseFloat(parts[2]) || 400,
        right: parseFloat(parts[4]) || 260
      };
    };

    const setSizes = (leftMax, rightMax) => {
      appEl.style.gridTemplateColumns =
        `minmax(140px,${leftMax}px) 4px minmax(200px,1fr) 4px minmax(200px,${rightMax}px)`;
    };

    const persistSizes = (leftW, rightW) => {
      try {
        localStorage.setItem('stroke_panel_sizes', JSON.stringify({ left: leftW, right: rightW }));
      } catch (e) { /* ignore */ }
    };

    // Restore saved sizes
    try {
      const raw = localStorage.getItem('stroke_panel_sizes');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') {
          setSizes(Math.max(saved.left, 140), Math.max(saved.right, 200));
        }
      }
    } catch (e) { /* ignore */ }

    // Drag logic
    const makeDragger = (handleEl, isLeft) => {
      let dragging = false;
      let startX = 0;
      let startCols = null;
      const minW = isLeft ? 140 : 200;
      const maxW = isLeft ? 340 : 480;

      handleEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startCols = getRenderedWidths();
        handleEl.classList.add('active');
        ghost.style.display = 'block';
        ghost.style.left = e.clientX + 'px';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
      });

      const onMove = (e) => {
        if (!dragging) return;
        ghost.style.left = e.clientX + 'px';
        const dx = e.clientX - startX;
        if (isLeft) {
          const newLeft = Math.round(Math.max(minW, Math.min(maxW, startCols.left + dx)));
          setSizes(newLeft, startCols.right);
        } else {
          const newRight = Math.round(Math.max(minW, Math.min(maxW, startCols.right - dx)));
          setSizes(startCols.left, newRight);
        }
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        handleEl.classList.remove('active');
        ghost.style.display = 'none';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        const ren = getRenderedWidths();
        persistSizes(ren.left, ren.right);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    makeDragger(this._handleLeft, true);
    makeDragger(this._handleRight, false);
  }

  // ================================================================
  //  事件连线
  // ================================================================
  _wireEvents() {
    const self = this;

    // 点击历史版本 → 加载版本到画布 + 区域 prompt 显隐 + 恢复 setting bar
    this.history.onSelect = (i) => {
      const item = self.history.items[i];
      if (!item) return;
      self.currentLineageId = item.lineageId;
      self.currentVersionIndex = item.versionActive;
      // 从 lineage 恢复 setting bar（tabsConfig + 值 + 排序）
      loadSettingsBarFromLineage(self, item.lineageId);
      const lineage = self.versionLineages[item.lineageId];
      if (lineage && lineage.versions[item.versionActive]) {
        self.canvas.loadVersion(lineage.versions[item.versionActive]);
      }
      if (item.regionLabel) {
        self.config.showRegionPrompt(item.regionLabel);
      } else {
        self.config.hideRegionPrompt();
      }
    };

    // 版本切换
    this.history.onVersionSwitch = (itemIndex, versionIndex) => {
      const item = self.history.items[itemIndex];
      if (!item) return;
      item.versionActive = versionIndex;
      self.currentVersionIndex = versionIndex;
      const lineage = self.versionLineages[item.lineageId];
      if (lineage && lineage.versions[versionIndex]) {
        self.canvas.loadVersion(lineage.versions[versionIndex]);
      }
      saveAppState(self);
    };

    // 新建项目版本
    this.history.onNewProject = () => {
      // 保存当前状态
      saveAppState(self);
      // 取消所有条目的 current 标记
      self.history.items.forEach(it => { it.current = false; it.active = false; });
      self.currentLineageId = null;
      self.currentVersionIndex = 0;
      // 重置 setting bar 为默认 tabs
      self.config.tabsConfig = defaultConfigTabs.map(t => ({
        ...t,
        options: Array.isArray(t.options) ? [...t.options] : t.options
      }));
      self.config.render();
      self.canvas.clear();
      self._rewireImageSync();
      self.history.render();
      saveAppState(self);
    };

    // 删除历史项
    this.history.onDelete = (i) => {
      deleteHistoryItem(self, i);
    };

    // 画布套索完成 → 显示区域 prompt
    this.canvas.onLassoDone = () => {
      this.config.showRegionPrompt('区域 prompt');
    };

    // ★ 画布上传图片 → 动态添加/更新「画布参考图」widget
    this.canvas.onCanvasImage = (dataUrl) => {
      if (!dataUrl) return;
      let entry = self.config.widgets['canvas_ref_image'];
      if (!entry) {
        // 首次上传：动态添加 tab
        const def = {
          id: 'canvas_ref_image',
          title: '画布参考图',
          describe: '画布上点击/拖拽上传的参考图',
          type: 'canvas_ref_image',
          order: 1.5,
          removable: true,
          defaultValue: dataUrl,
          promptFormat: '',
        };
        self.config.addCustomTab(def);
        entry = self.config.widgets['canvas_ref_image'];
        if (entry) self._rewireImageSync();
      } else {
        entry.widget.setValue(dataUrl);
      }
      self._notifyConfigChangeSafe();
    };

    // ★ Canvas clear button → remove canvas_ref_image widget
    this.canvas.onClearCanvas = () => {
      const refEntry = self.config.widgets['canvas_ref_image'];
      if (refEntry) {
        self.config.removeTab('canvas_ref_image');
      }
      self._notifyConfigChangeSafe();
    };

    // ★ widget tab 被删除（⋮ 菜单） → 同步清画布
    this.config.onTabRemove = (id, _def) => {
      if (id === 'canvas_ref_image') {
        self.canvas.clear();
        self._notifyConfigChangeSafe();
      }
    };

    // ★ 初始连接画布参考图（如果已存在）
    self._rewireImageSync();

    // 点击「生成」
    this.config.onGenerate = () => {
      performGeneration(self);
    };

    // 打开设置弹窗 → 可以打开配置管理
    this.config.onSettingsOpen = () => {
      this.settings.open();
    };
    this.settings.onConfigOpen = () => {
      this.configModal.open();
    };
    this.settings.onDeleteAll = () => {
      deleteAllHistory(self);
    };
    this.settings.onResetAll = () => {
      // 初始化：清除所有持久化数据并重新加载页面
      clearAll();
      window.location.reload();
    };

    // 配置面板拖动/增删/修改后 → 仅持久化全局状态，不自动写入 lineage
    this.config.onConfigChange = () => {
      // 防抖：延迟写 localStorage，避免高频拖动卡顿
      if (self._saveDebounce) clearTimeout(self._saveDebounce);
      self._saveDebounce = setTimeout(() => saveAppState(self), 300);
    };

    // 手动保存按钮 → 存入当前 lineage
    this.config.onSaveToLineage = () => {
      saveSettingsBarToLineage(self);
      saveAppState(self);
    };

    // ConfigModal 关闭后刷新所有 GenerateCallWidget 的配置下拉
    this.configModal.onConfigsChanged = () => {
      self._refreshAllCallWidgetConfigs();
    };
  }

  // ================================================================
  //  刷新所有 GenerateCallWidget 的配置下拉
  // ================================================================
  _refreshAllCallWidgetConfigs() {
    if (!this.config || !this.config.widgets) return;
    for (const [k, w] of Object.entries(this.config.widgets)) {
      if (w.def && w.def.type === 'generate_call' && w.widget && typeof w.widget.refreshConfigs === 'function') {
        w.widget.refreshConfigs();
        if (typeof w.widget._loadConfigAndRender === 'function') {
          w.widget._loadConfigAndRender();
        }
      }
    }
  }

  /**
   * 安全地触发配置变更持久化
   */
  _notifyConfigChangeSafe() {
    if (this._saveDebounce) clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(() => saveAppState(this), 300);
  }

  /**
   * 重新连接右侧 ImageWidget onChange → 画布（config.render() 后必须调用）
   */
  _rewireImageSync() {
    const refEntry = this.config.widgets['canvas_ref_image'];
    if (refEntry && refEntry.widget) {
      refEntry.widget.onChange((dataUrl) => {
        // 避免环形更新
        if (dataUrl && dataUrl === this.canvas.getUserImageDataUrl()) return;
        if (dataUrl) {
          this.canvas.setCanvasImage(dataUrl);
        } else {
          // 用户清除了画布参考图 → 清除画布并移除整个 widget tab
          this.canvas.clear();
          this.config.removeTab('canvas_ref_image');
        }
        this._notifyConfigChangeSafe();
      });
    }
  }
}