/**
 * uis.js — Stroke UI System
 * 模块协调器，从 components/ 加载组件并组装 App
 */

import HistoryPanel from './components/HistoryPanel.js';
import Canvas from './components/Canvas.js';
import ConfigPanel from './components/ConfigPanel.js';
import { defaultConfigTabs } from './components/ConfigTabs.js';
import SettingsModal from './components/SettingsModal.js';
import { saveAll, loadAll, clearHistory } from './storage.js';

class App {
  constructor(mount) {
    this.el = mount;
    this.el.className = 'app';
    this.el.innerHTML = '';

    // 数据层
    this.versionLineages = {};
    this.configFingerprints = {};
    this.currentLineageId = null;
    this.currentVersionIndex = 0;

    // 左栏 — 历史版本
    this.history = new HistoryPanel(document.createElement('div'));
    this.el.appendChild(this.history.container);

    // 中栏 — 画布
    this.canvas = new Canvas(document.createElement('div'));
    this.el.appendChild(this.canvas.container);

    // 右栏 — 配置面板（传入默认 tab 配置）
    this.config = new ConfigPanel(document.createElement('div'), defaultConfigTabs);
    this.el.appendChild(this.config.container);

    // 设置弹窗
    this.settings = new SettingsModal(document.createElement('div'));
    this.el.appendChild(this.settings.overlay);

    // --- 组件间连线 ---
    const self = this;

    // 点击历史版本 → 加载版本到画布 + 区域 prompt 显隐
    this.history.onSelect = (i) => {
      const item = self.history.items[i];
      if (!item) return;
      self.currentLineageId = item.lineageId;
      self.currentVersionIndex = item.versionActive;
      const lineage = self.versionLineages[item.lineageId];
      if (lineage && lineage.versions[item.versionActive]) {
        self.canvas.loadVersion(lineage.versions[item.versionActive].svg);
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
        self.canvas.loadVersion(lineage.versions[versionIndex].svg);
      }
      self._saveAll();
    };

    // 删除历史项
    this.history.onDelete = (i) => {
      self._deleteHistoryItem(i);
    };

    // 画布套索完成 → 显示区域 prompt
    this.canvas.onLassoDone = () => {
      this.config.showRegionPrompt('区域 prompt');
    };

    // 点击「生成」
    this.config.onGenerate = () => {
      self._doGenerate();
    };

    // 打开设置弹窗
    this.config.onSettingsOpen = () => {
      this.settings.open();
    };

    // 删除全部历史
    this.settings.onDeleteAll = () => {
      self._deleteAllHistory();
    };

    // 从存储恢复
    this._loadFromStorage();
  }

  // ================================================================
  //  简单 djb2 哈希，用于图片指纹压缩
  // ================================================================
  _simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;  // 32-bit 整数截断
    }
    return (hash >>> 0).toString(16);
  }

  // ================================================================
  //  配置指纹计算（图片用哈希替代原始 base64）
  // ================================================================
  _computeConfigFingerprint() {
    const vals = this.config.getTabValues();
    const stable = {};
    Object.keys(vals).sort().forEach(k => {
      let v = vals[k];
      // 图片类型值：用哈希替代原始 base64，保持指纹紧凑
      if (typeof v === 'string' && v.startsWith('data:image/')) {
        v = 'img:' + this._simpleHash(v);
      }
      stable[k] = v;
    });
    return JSON.stringify(stable);
  }

  // ================================================================
  //  生成逻辑（指纹匹配 lineage）
  // ================================================================
  _doGenerate() {
    if (this.config.generating) return;
    this.config.generating = true;
    this.config.genBtn.textContent = '生成中...';
    this.config.genBtn.disabled = true;
    this.config.exportBtn.style.display = 'none';

    const prompt = this.config.getFullPrompt();
    console.log('[Stroke] Prompt:', prompt);

    const regionWidget = this.config.widgets['region_prompt'];
    const regionVal = regionWidget ? regionWidget.widget.getValue() : '';
    const label = regionVal ? '区域 prompt' : null;

    const self = this;
    setTimeout(() => {
      self.config.onGenComplete();

      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                      now.getMinutes().toString().padStart(2, '0');
      const genId = 'gen_' + (self.history.items.length + 1);
      const genSvg =
        '<rect x="6" y="6" width="44" height="44" rx="5" fill="var(--color-background-secondary)" stroke="var(--color-border-secondary)" stroke-width="1.2"/>' +
        '<path d="M6 40l12-10 9 7 7-9 16 14" stroke="var(--color-border-secondary)" stroke-width="1.2"/>';

      const fingerprint = self._computeConfigFingerprint();
      let lineageId = self.configFingerprints[fingerprint];
      let versionIndex = 0;

      if (lineageId && self.versionLineages[lineageId]) {
        versionIndex = self.versionLineages[lineageId].versions.length;
        self.versionLineages[lineageId].versions.push({
          index: versionIndex,
          svg: genSvg,
          time: timeStr
        });
        // 更新当前活跃项（不新开窗口）
        self.history.updateActiveItem(versionIndex, genSvg, timeStr);
        self.currentLineageId = lineageId;
        self.currentVersionIndex = versionIndex;
        self._saveAll();
        return;
      } else {
        lineageId = 'lineage_' + Date.now();
        self.versionLineages[lineageId] = {
          fingerprint: fingerprint,
          versions: [{
            index: 0,
            svg: genSvg,
            time: timeStr
          }],
          historyItemIndex: 0
        };
        self.configFingerprints[fingerprint] = lineageId;
        versionIndex = 0;
      }

      self.currentLineageId = lineageId;
      self.currentVersionIndex = versionIndex;

      self.history.addItem({
        label: genId,
        time: timeStr,
        versionCount: self.versionLineages[lineageId].versions.length,
        versionActive: versionIndex,
        lineageId: lineageId,
        svg: genSvg,
        regionLabel: label,
        active: true,
        current: true
      });

      self._saveAll();
    }, 2200);
  }

  // ================================================================
  //  删除单个历史项
  // ================================================================
  _deleteHistoryItem(index) {
    const items = this.history.items;
    if (index < 0 || index >= items.length) return;
    const item = items[index];
    const lineageId = item.lineageId;
    if (lineageId && this.versionLineages[lineageId]) {
      Object.keys(this.configFingerprints).forEach(fp => {
        if (this.configFingerprints[fp] === lineageId) {
          delete this.configFingerprints[fp];
        }
      });
      delete this.versionLineages[lineageId];
    }
    items.splice(index, 1);
    if (this.currentLineageId === lineageId) {
      this.currentLineageId = null;
      this.currentVersionIndex = 0;
    }
    this.history.render();
    this._saveAll();
  }

  // ================================================================
  //  删除全部历史
  // ================================================================
  _deleteAllHistory() {
    this.history.items = [];
    this.versionLineages = {};
    this.configFingerprints = {};
    this.currentLineageId = null;
    this.currentVersionIndex = 0;
    this.history.render();
    clearHistory();
    this._saveAll();
  }

  // ================================================================
  //  持久化保存
  // ================================================================
  _saveAll() {
    const customTabs = this.config.tabsConfig.filter(t => t.id.startsWith('custom_'));
    const tabOrder = this.config.tabsConfig.map(t => t.id);
    const tabValues = this.config.getTabValues();
    const apiValues = this.settings.getValues ? this.settings.getValues() : null;

    saveAll({
      historyItems: this.history.items,
      lineages: this.versionLineages,
      fingerprints: this.configFingerprints,
      currentLineageId: this.currentLineageId,
      currentVersionIndex: this.currentVersionIndex,
      customTabs: customTabs,
      tabOrder: tabOrder,
      tabValues: tabValues,
      apiValues: apiValues
    });
  }

  // ================================================================
  //  从存储恢复
  // ================================================================
  _loadFromStorage() {
    const saved = loadAll();

    if (saved.historyItems && saved.historyItems.length > 0) {
      this.history.items = saved.historyItems;
    }
    if (saved.lineages) {
      this.versionLineages = saved.lineages;
    }
    if (saved.fingerprints) {
      this.configFingerprints = saved.fingerprints;
    }
    this.currentLineageId = saved.currentLineageId || null;
    this.currentVersionIndex = saved.currentVersionIndex || 0;

    // 合并自定义 tabs
    if (saved.customTabs && saved.customTabs.length > 0) {
      this.config.tabsConfig = this.config.tabsConfig.filter(t => !t.id.startsWith('custom_'));
      for (const ct of saved.customTabs) {
        this.config.tabsConfig.push(ct);
      }
    }

    // 恢复排序
    if (saved.tabOrder && Array.isArray(saved.tabOrder)) {
      const orderMap = {};
      saved.tabOrder.forEach((id, idx) => { orderMap[id] = idx; });
      this.config.tabsConfig.sort((a, b) => {
        const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 999;
        const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 999;
        return oa - ob;
      });
    }

    // 恢复 tab 值（延迟等 widget 就绪）
    if (saved.tabValues) {
      const self = this;
      setTimeout(() => {
        self.config.restoreTabValues(saved.tabValues);
      }, 50);
    }

    // 恢复 API 设置
    if (saved.apiValues && this.settings.restoreValues) {
      this.settings.restoreValues(saved.apiValues);
    }

    this.history.render();
    this.config.render();

    // 恢复当前版本画布
    if (this.currentLineageId && this.versionLineages[this.currentLineageId]) {
      const lineage = this.versionLineages[this.currentLineageId];
      const v = lineage.versions[this.currentVersionIndex];
      if (v) {
        setTimeout(() => {
          this.canvas.loadVersion(v.svg);
        }, 100);
      }
    }
  }
}

// 全局入口（由 main.js 在 DOMContentLoaded 时调用）
window.StrokeApp = App;