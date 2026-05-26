/**
 * RegionPromptManager.js — 区域 prompt 实例管理
 *
 * 负责动态 region_prompt tab 的添加、移除和计数。
 */
export default class RegionPromptManager {
  /**
   * @param {Object} panel - ConfigPanel 实例
   */
  constructor(panel) {
    this._panel = panel;
    this._count = 0;
    this._onRemove = null;
  }

  get count() { return this._count; }

  /**
   * 添加一个 region_prompt 实例
   * @param {Object} data - { imageDataUrl, points, color, label, type, canvasWidth, canvasHeight }
   */
  add(data) {
    const id = 'region_' + data.label.toLowerCase();
    const panel = this._panel;

    const existingDef = panel.tabsConfig.find(t => t.id === id);
    if (existingDef) {
      const entry = panel.widgets[id];
      if (entry && entry.widget && typeof entry.widget.updateImage === 'function') {
        entry.widget.updateImage(data.imageDataUrl, data);
        entry.def.data = data;
      }
      return;
    }

    const def = {
      id,
      title: `选区 ${data.label}`,
      describe: `选区 ${data.label} — 输入该区域的处理方式`,
      type: 'region_prompt',
      order: 2 + 0.1 * this._count,
      removable: true,
      data,
    };
    this._count++;
    panel.addCustomTab(def);

    const entry = panel.widgets[id];
    if (entry && entry.widget) {
      entry.widget.onRemove(() => panel.removeTab(id));
    }
  }

  /**
   * 移除所有 region_prompt 类型的 tab
   */
  removeAll() {
    const panel = this._panel;
    const toRemove = panel.tabsConfig.filter(t => t.type === 'region_prompt');
    for (const def of toRemove) {
      delete panel.widgets[def.id];
      panel.tabsConfig = panel.tabsConfig.filter(d => d.id !== def.id);
      const node = document.getElementById('sec-' + def.id);
      if (node) node.remove();
    }
    this._count = 0;
  }

  reset() {
    this._count = 0;
  }
}
