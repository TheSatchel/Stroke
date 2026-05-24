/**
 * App.js — Stroke UI System 根协调器
 * 组装各组件，建立事件连线，委托生成与持久化。
 */

import HistoryPanel from '../components/HistoryPanel.js';
import Canvas from '../components/Canvas.js';
import ConfigPanel from '../components/config-panel/ConfigPanel.js';
import DragManager from '../components/config-panel/DragManager.js';
import { defaultConfigTabs } from '../components/ConfigTabs.js';
import SettingsModal from '../components/setting-modal/SettingsModal.js';
import ConfigModal from '../components/setting-modal/ConfigModal.js';
import { migrateLegacyPresets, clearAll } from '../locals/storage.js';
import { GeneratorService } from '../Adapter.js';
import { saveAppState, loadAppState, saveSettingsBarToLineage, loadSettingsBarFromLineage, deleteHistoryItem, deleteAllHistory, TEMPLATE_LINEAGE_ID } from '../locals/Persistence.js';
import { loadVersionBinary } from '../locals/StorageManager.js';
import { performGeneration } from '../generates/Generator.js';
import PersistenceGuard from '../locals/PersistenceGuard.js';
import LineageManager from '../locals/LineageManager.js';
import SegmentationService from '../services/SegmentationService.js';

const REGION_COLORS = ['#3B82F6', '#E11D48', '#F59E0B', '#10B981', '#8B5CF6', '#F97316'];
const REGION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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

    // 预热 AI 分割模型 — 与 UI 渲染并行，避免首次点选等待
    this._segPreheat = SegmentationService.instance.load();

    // 数据层
    this.versionLineages = {};
    this.currentLineageId = null;
    this.currentVersionIndex = 0;
    this._regionCount = 0;

    // 注入 Manager
    this._lineageManager = new LineageManager(this.versionLineages);
    this._persistenceGuard = new PersistenceGuard(this);

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

    // 从存储恢复（异步）
    this._initPromise = loadAppState(this).then(() => {
      console.log('[App] 状态恢复完成');
    });
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
    DragManager.installResizeHandles(this.el, this._handleLeft, this._handleRight);
  }

  // ================================================================
  //  事件连线
  // ================================================================
  _wireEvents() {
    const self = this;

    // 点击历史版本 → 加载版本到画布 + 恢复 setting bar
    this.history.onSelect = async (i) => {
      const item = self.history.items[i];
      if (!item) return;
      self.currentLineageId = item.lineageId;
      self.currentVersionIndex = item.versionActive;
      // 从 lineage 恢复 setting bar
      loadSettingsBarFromLineage(self, item.lineageId);
      const lineage = self.versionLineages[item.lineageId];
      if (lineage) {
        // 懒水合版本二进制
        await lineage.hydrateVersion(item.versionActive, loadVersionBinary, item.lineageId);
        const v = lineage.getVersion(item.versionActive);
        if (v) self.canvas.loadVersion(v);
      }
      self.config.setDownloadLineage(item.lineageId, item.versionActive);
      self.config.showPostGen();
    };

    // 版本切换（步进器）
    this.history.onVersionSwitch = async (itemIndex, versionIndex) => {
      const item = self.history.items[itemIndex];
      if (!item) return;
      item.versionActive = versionIndex;
      self.currentVersionIndex = versionIndex;
      const lineage = self.versionLineages[item.lineageId];
      if (lineage) {
        if (typeof lineage.setHistoryVersionActive === 'function') {
          lineage.setHistoryVersionActive(versionIndex);
        } else if (lineage.history) {
          lineage.history.versionActive = versionIndex;
        }
        await lineage.hydrateVersion(versionIndex, loadVersionBinary, item.lineageId);
        const v = lineage.getVersion(versionIndex);
        if (v) self.canvas.loadVersion(v);
      }
      self.config.setDownloadLineage(item.lineageId, versionIndex);
      saveAppState(self);
    };

    // 新建项目版本
    this.history.onNewProject = () => {
      // 保存当前状态
      saveAppState(self);
      // 取消所有条目的 current 标记
      self.history.items.forEach(it => { it.current = false; it.active = false; });
      self.currentLineageId = TEMPLATE_LINEAGE_ID;
      self.currentVersionIndex = 0;
      // 重置 setting bar 为默认 tabs
      self.config.tabsConfig = defaultConfigTabs.map(t => ({
        ...t,
        options: Array.isArray(t.options) ? [...t.options] : t.options
      }));
      self.config.render();
      self.canvas.clear();
      self._rewireImageSync();
      self._rebuildHistoryItems();
      self.history.render();
      saveAppState(self);
    };

    // 删除历史项
    this.history.onDelete = (i) => {
      deleteHistoryItem(self, i);
    };

    // 重命名 lineage
    this.history.onRename = (itemIndex, newName) => {
      const item = self.history.items[itemIndex];
      if (!item) return;
      const lineage = self.versionLineages[item.lineageId];
      if (lineage) {
        lineage.name = newName || '';
        self._persistenceGuard.markDirty();
      }
    };

    // ★ 选区确认 → 动态创建 region_prompt 实例
    this.canvas.onSelectionConfirm = (data) => {
      const color = self._nextRegionColor();
      const label = self._nextRegionLabel();
      // 在画布上持久显示选区
      self.canvas.addConfirmedSelection(label, { ...data, color, label });
      self.config.addRegionPrompt({ ...data, color, label });
      self._regionCount++;
      self._notifyConfigChangeSafe();
    };

    // 选区取消 → 什么都不做
    this.canvas.onSelectionCancel = () => {};

    // ★ 从 RegionPromptWidget 删除选区时同步清理画布
    this.config.setOnRegionRemove((label) => {
      self.canvas.removeConfirmedSelection(label);
      self._notifyConfigChangeSafe();
    });

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
          unpersist: true,
          defaultValue: dataUrl,
          promptFormat: '',
        };
        self.config.addCustomTab(def);
        entry = self.config.widgets['canvas_ref_image'];
        if (entry) {
          entry.widget.setValue(dataUrl);
          self._rewireImageSync();
        }
      } else {
        entry.widget.setValue(dataUrl);
      }
      self._notifyConfigChangeSafe();
    };

    // ★ Canvas clear button → remove canvas_ref_image widget + all region prompts
    this.canvas.onClearCanvas = () => {
      self._regionCount = 0;
      const refEntry = self.config.widgets['canvas_ref_image'];
      if (refEntry) {
        self.config.removeTab('canvas_ref_image');
      }
      self.config.removeAllRegionPrompts();
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

    // 配置面板拖动/增删/修改后 → 自动存入 lineage（真实或隐藏）
    this.config.onConfigChange = () => {
      // 委托 PersistenceGuard 处理防抖 + 保存
      saveSettingsBarToLineage(self);
      self._persistenceGuard.markDirty();
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

  _rebuildHistoryItems() {
    if (!this.history || typeof this.history.rebuildItems !== 'function') return;
    this.history.rebuildItems(this.versionLineages, this.currentLineageId);
  }

  /**
   * 安全地触发配置变更持久化
   */
  _notifyConfigChangeSafe() {
    if (this._persistenceGuard) {
      this._persistenceGuard.markDirty();
    } else {
      // 回退到旧模式
      if (this._saveDebounce) clearTimeout(this._saveDebounce);
      this._saveDebounce = setTimeout(() => saveAppState(this), 300);
    }
  }

  /**
   * 颜色轮转
   */
  _nextRegionColor() {
    return REGION_COLORS[this._regionCount % REGION_COLORS.length];
  }

  /**
   * 代号轮转 (A, B, C, ...)
   */
  _nextRegionLabel() {
    return REGION_LABELS[this._regionCount % REGION_LABELS.length];
  }

  /**
   * 重新连接所有 ImageWidget → 画布双向同步（config.render() 后必须调用）
   */
  _rewireImageSync() {
    // 1) canvas_ref_image widget ↔ Canvas 双向同步
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

    // 2) 所有非只读 image 控件：粘贴/上传图片 → 自动推送到画布
    for (const [id, entry] of Object.entries(this.config.widgets)) {
      if (id === 'canvas_ref_image') continue; // 已在上面处理
      if (!entry || !entry.widget) continue;
      const def = entry.def || {};
      if (def.type !== 'image') continue;
      if (entry.widget._readonly) continue;
      // 注册深集成回调
      if (typeof entry.widget.onImageData === 'function') {
        entry.widget.onImageData((dataUrl) => {
          if (dataUrl && dataUrl === this.canvas.getUserImageDataUrl()) return;
          if (dataUrl) {
            this.canvas.setCanvasImage(dataUrl);
            // 同时更新 canvas_ref_image widget（如果存在）
            const refW = this.config.widgets['canvas_ref_image'];
            if (refW && refW.widget) {
              refW.widget.setValue(dataUrl);
            } else {
              // 自动创建 canvas_ref_image tab
              const def2 = {
                id: 'canvas_ref_image',
                title: '画布参考图',
                describe: '画布上点击/拖拽上传的参考图',
                type: 'canvas_ref_image',
                order: 1.5,
                removable: true,
                defaultValue: dataUrl,
                promptFormat: '',
              };
              this.config.addCustomTab(def2);
              const refW2 = this.config.widgets['canvas_ref_image'];
              if (refW2 && refW2.widget) {
                refW2.widget.setValue(dataUrl);
              }
            }
            this._notifyConfigChangeSafe();
          }
        });
      }
    }
  }
}

window.StrokeApp = App;
