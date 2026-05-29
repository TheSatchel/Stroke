/**
 * EventWirer.js — 组件间事件连线
 *
 * 将所有组件（HistoryPanel, Canvas, ConfigPanel, SettingsModal 等）
 * 之间的事件回调集中管理。
 */
import { defaultConfigTabs } from '../components/ConfigTabs.js';
import { saveAppState, saveSettingsBarToLineage, deleteHistoryItem, deleteAllHistory, loadSettingsBarFromLineage, TEMPLATE_LINEAGE_ID } from '../locals/Persistence.js';
import { loadVersionBinary, clearAllData } from '../locals/StorageManager.js';
import { performGeneration } from '../generates/Generator.js';

export default class EventWirer {
  /**
   * @param {import('./App.js').default} app
   */
  constructor(app) {
    this._app = app;
  }

  wire() {
    const self = this._app;

    // 点击历史版本 → 加载版本到画布 + 恢复 setting bar
    self.history.onSelect = async (i) => {
      const item = self.history.items[i];
      if (!item) return;
      self.currentLineageId = item.lineageId;
      self.currentVersionIndex = item.versionActive;
      loadSettingsBarFromLineage(self, item.lineageId);
      const lineage = self.versionLineages[item.lineageId];
      if (lineage) {
        await lineage.hydrateVersion(item.versionActive, loadVersionBinary, item.lineageId);
        const v = lineage.getVersion(item.versionActive);
        if (v) self.canvas.loadVersion(v);
      }
      self.config.setDownloadLineage(item.lineageId, item.versionActive);
      this._restoreRegionOverlays();
      const lineageFp = (lineage && lineage.fingerprint) || '';
      const isGenerating = !!(self._generatingFp && self._generatingFp === lineageFp);
      self.config.showPostGen(isGenerating);
      if (self._mobileNav) self._mobileNav.switchTo('canvas');
    };

    // 版本切换（步进器）
    self.history.onVersionSwitch = async (itemIndex, versionIndex) => {
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
      this._restoreRegionOverlays();
      saveAppState(self);
      if (self._mobileNav) self._mobileNav.switchTo('canvas');
    };

    // 新建项目版本
    self.history.onNewProject = () => {
      saveAppState(self);
      self.history.items.forEach(it => { it.current = false; it.active = false; });
      self.currentLineageId = TEMPLATE_LINEAGE_ID;
      self.currentVersionIndex = 0;
      self.config.tabsConfig = defaultConfigTabs.map(t => ({
        ...t,
        options: Array.isArray(t.options) ? [...t.options] : t.options
      }));
      self.config.render();
      self.canvas.clear();
      self._imageCoordinator.rewireImageSync();
      this.rebuildHistoryItems();
      self.history.render();
      saveAppState(self);
    };

    // 删除历史项
    self.history.onDelete = (i) => {
      deleteHistoryItem(self, i);
    };

    // 重命名 lineage
    self.history.onRename = (itemIndex, newName) => {
      const item = self.history.items[itemIndex];
      if (!item) return;
      const lineage = self.versionLineages[item.lineageId];
      if (lineage) {
        lineage.name = newName || '';
        self._persistenceGuard.markDirty();
      }
    };

    // 选区确认 → 动态创建 region_prompt 实例
    self.canvas.onSelectionConfirm = (data) => {
      const color = self._nextRegionColor();
      const label = self._nextRegionLabel();
      self.canvas.addConfirmedSelection(label, { ...data, color, label });
      self.config.addRegionPrompt({ ...data, color, label });
      self._regionCount++;
      this.notifyConfigChangeSafe();
    };

    self.canvas.onSelectionCancel = () => {};

    // 从 RegionPromptWidget 删除选区时同步清理画布
    self.config.setOnRegionRemove((label) => {
      self.canvas.removeConfirmedSelection(label);
      this.notifyConfigChangeSafe();
    });

    // 画布上传图片委托 CanvasImageCoordinator
    self.canvas.onCanvasImage = self._imageCoordinator._createOnCanvasImage();
    self.canvas.onClearCanvas = self._imageCoordinator._createOnClearCanvas();
    self.config.onTabRemove = self._imageCoordinator._createOnTabRemove();

    // 初始连接画布参考图
    self._imageCoordinator.rewireImageSync();

    // 点击「生成」
    self.config.onGenerate = () => {
      performGeneration(self);
    };

    // 打开设置弹窗
    self.config.onSettingsOpen = () => {
      self.settings.open();
    };
    self.settings.onConfigOpen = () => {
      self.configModal.open();
    };
    self.settings.onDeleteAll = () => {
      deleteAllHistory(self);
    };
    self.settings.onResetAll = () => {
      clearAllData().finally(() => {
        window.location.reload();
      });
    };

    // 配置面板拖动/增删/修改后 → 自动存入 lineage
    self.config.onConfigChange = () => {
      saveSettingsBarToLineage(self);
      self._persistenceGuard.markDirty();
    };

    // ConfigModal 关闭后刷新所有 GenerateCallWidget 的配置下拉
    self.configModal.onConfigsChanged = () => {
      this.refreshAllCallWidgetConfigs();
    };
  }

  // ================================================================
  refreshAllCallWidgetConfigs() {
    const config = this._app.config;
    if (!config || !config.widgets) return;
    for (const [k, w] of Object.entries(config.widgets)) {
      if (w.def && w.def.type === 'generate_call' && w.widget && typeof w.widget.refreshConfigs === 'function') {
        w.widget.refreshConfigs();
        if (typeof w.widget._loadConfigAndRender === 'function') {
          w.widget._loadConfigAndRender();
        }
      }
    }
  }

  rebuildHistoryItems() {
    const h = this._app.history;
    if (!h || typeof h.rebuildItems !== 'function') return;
    h.rebuildItems(this._app.versionLineages, this._app.currentLineageId);
  }

  /**
   * 从 config.tabsConfig 中的 region_prompt 条目恢复画布上的选区叠加层
   * 用于 lineage/version 切换后重建 SVG 蒙版显示
   */
  _restoreRegionOverlays() {
    const config = this._app.config;
    const canvas = this._app.canvas;
    const tabs = config.tabsConfig || [];

    let count = 0;
    for (const tab of tabs) {
      if (tab.type === 'region_prompt' && tab.data && tab.data.label) {
        canvas.addConfirmedSelection(tab.data.label, tab.data);
        count++;
      }
    }
    this._app._regionCount = count;
  }

  notifyConfigChangeSafe() {
    const app = this._app;
    if (app._persistenceGuard) {
      app._persistenceGuard.markDirty();
    } else {
      if (app._saveDebounce) clearTimeout(app._saveDebounce);
      app._saveDebounce = setTimeout(() => saveAppState(app), 300);
    }
  }
}
