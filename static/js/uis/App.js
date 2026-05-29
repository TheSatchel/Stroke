/**
 * App.js — Stroke UI System 根协调器
 *
 * 组装各组件，建立事件连线，委托生成与持久化。
 * 拆分后：事件线委托 EventWirer，图片同步委托 CanvasImageCoordinator。
 */
import HistoryPanel from '../components/HistoryPanel.js';
import Canvas from '../components/Canvas.js';
import ConfigPanel from '../components/config-panel/ConfigPanel.js';
import DragManager from '../components/config-panel/DragManager.js';
import { defaultConfigTabs } from '../components/ConfigTabs.js';
import SettingsModal from '../components/setting-modal/SettingsModal.js';
import ConfigModal from '../components/setting-modal/ConfigModal.js';
import { migrateLegacyPresets } from '../locals/storage.js';
import { GeneratorService } from '../adapter.js';
import { loadAppState } from '../locals/Persistence.js';
import PersistenceGuard from '../locals/PersistenceGuard.js';
import LineageManager from '../locals/LineageManager.js';
import SegmentationService from '../services/SegmentationService.js';
import EventWirer from './EventWirer.js';
import CanvasImageCoordinator from './CanvasImageCoordinator.js';
import MobileNav from './MobileNav.js';

const REGION_COLORS = ['#3B82F6', '#E11D48', '#F59E0B', '#10B981', '#8B5CF6', '#F97316'];
const REGION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default class App {
  constructor(mount) {
    this.el = mount;
    this.el.className = 'app';
    this.el.innerHTML = '';

    this.generator = new GeneratorService();
    window.__strokeApp = this;

    migrateLegacyPresets();

    this._segPreheat = SegmentationService.instance.load();

    this.versionLineages = {};
    this.currentLineageId = null;
    this.currentVersionIndex = 0;
    this._regionCount = 0;
    this._generatingFp = null;

    this._lineageManager = new LineageManager(this.versionLineages);
    this._persistenceGuard = new PersistenceGuard(this);

    // 左栏
    this.history = new HistoryPanel(document.createElement('div'));
    this.el.appendChild(this.history.container);

    this._handleLeft = this._createResizeHandle();
    this.el.appendChild(this._handleLeft);

    // 中栏
    this.canvas = new Canvas(document.createElement('div'));
    this.el.appendChild(this.canvas.container);

    this._handleRight = this._createResizeHandle();
    this.el.appendChild(this._handleRight);

    // 右栏
    this.config = new ConfigPanel(document.createElement('div'), defaultConfigTabs);
    this.el.appendChild(this.config.container);

    // 先创建事件线对象（wire() 延后，待子组件就绪）
    this._eventWirer = new EventWirer(this);

    this._imageCoordinator = new CanvasImageCoordinator(this);

    const originalConfigRender = this.config.render.bind(this.config);
    this.config.render = () => {
      originalConfigRender();
      this._imageCoordinator.rewireImageSync();
    };

    this._initResizeHandles();

    this.configModal = new ConfigModal(this.generator);

    this.settings = new SettingsModal(document.createElement('div'), this.generator);
    this.el.appendChild(this.settings.overlay);

    this._mobileNav = new MobileNav(this.el);
    this._mobileNav.onSettingsOpen = () => this.settings.open();

    this._initAndroidBackHandler();

    this._eventWirer.wire();

    this._initPromise = loadAppState(this).then(() => {
      console.log('[App] 状态恢复完成');
    });
  }

  _createResizeHandle() {
    const h = document.createElement('div');
    h.className = 'resize-handle';
    return h;
  }

  _initResizeHandles() {
    DragManager.installResizeHandles(this.el, this._handleLeft, this._handleRight);
  }

  _nextRegionColor() {
    return REGION_COLORS[this._regionCount % REGION_COLORS.length];
  }

  _nextRegionLabel() {
    return REGION_LABELS[this._regionCount % REGION_LABELS.length];
  }

  // ---- 委托方法（保持外部 API 兼容） ----
  _rebuildHistoryItems() {
    this._eventWirer.rebuildHistoryItems();
  }

  _notifyConfigChangeSafe() {
    this._eventWirer.notifyConfigChangeSafe();
  }

  // ---- Android 侧滑返回处理 ----
  _initAndroidBackHandler() {
    history.pushState({ stroke: true, idx: 0 }, '', location.href);
    let _backIdx = 0;

    const _eatBack = () => {
      _backIdx++;
      history.pushState({ stroke: true, idx: _backIdx }, '', location.href);
    };

    window.addEventListener('popstate', (e) => {
      const isConfigOpen = this.configModal && this.configModal.overlay && !this.configModal.overlay.classList.contains('hidden');
      const isSettingsOpen = this.settings && this.settings.overlay && !this.settings.overlay.classList.contains('hidden');

      if (isConfigOpen) {
        this.configModal.close();
        _eatBack();
        return;
      }

      if (isSettingsOpen) {
        this.settings.close();
        _eatBack();
        return;
      }

      const left = this.el.querySelector('.col-left');
      const right = this.el.querySelector('.col-right');
      const isLeftOpen = left && left.classList.contains('mobile-panel--open');
      const isRightOpen = right && right.classList.contains('mobile-panel--open');

      if (isLeftOpen || isRightOpen) {
        if (this._mobileNav) {
          this._mobileNav.switchTo('canvas');
        }
        _eatBack();
        return;
      }

      // 没有任何可关闭的 UI — 退出 PWA
      setTimeout(() => history.back(), 0);
    });
  }
}

window.StrokeApp = App;
