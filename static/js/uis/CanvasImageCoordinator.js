/**
 * CanvasImageCoordinator.js — 画布参考图 widget ↔ Canvas 双向同步
 *
 * 管理 canvas_ref_image widget 与 Canvas 之间的数据同步，
 * 以及 image 类型 widget 的深集成。
 */
export default class CanvasImageCoordinator {
  /**
   * @param {import('./App.js').default} app
   */
  constructor(app) {
    this._app = app;
  }

  /**
   * 重新连接所有 ImageWidget → 画布双向同步
   */
  rewireImageSync() {
    const app = this._app;
    const config = app.config;
    const canvas = app.canvas;

    // 1) canvas_ref_image widget ↔ Canvas 双向同步
    const refEntry = config.widgets['canvas_ref_image'];
    if (refEntry && refEntry.widget) {
      refEntry.widget.onChange((dataUrl) => {
        if (dataUrl && dataUrl === canvas.getUserImageDataUrl()) return;
        if (dataUrl) {
          canvas.setCanvasImage(dataUrl);
        } else {
          canvas.clear();
          config.removeTab('canvas_ref_image');
        }
        app._eventWirer.notifyConfigChangeSafe();
      });
    }

    // 2) 所有非只读 image 控件：粘贴/上传图片 → 自动推送到画布
    for (const [id, entry] of Object.entries(config.widgets)) {
      if (id === 'canvas_ref_image') continue;
      if (!entry || !entry.widget) continue;
      const def = entry.def || {};
      if (def.type !== 'image') continue;
      if (entry.widget._readonly) continue;
      if (typeof entry.widget.onImageData === 'function') {
        entry.widget.onImageData((dataUrl) => {
          if (dataUrl && dataUrl === canvas.getUserImageDataUrl()) return;
          if (dataUrl) {
            canvas.setCanvasImage(dataUrl);
            const refW = config.widgets['canvas_ref_image'];
            if (refW && refW.widget) {
              refW.widget.setValue(dataUrl);
            } else {
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
              config.addCustomTab(def2);
              const refW2 = config.widgets['canvas_ref_image'];
              if (refW2 && refW2.widget) {
                refW2.widget.setValue(dataUrl);
              }
            }
            app._eventWirer.notifyConfigChangeSafe();
          }
        });
      }
    }
  }

  /**
   * 创建 onCanvasImage 回调
   */
  _createOnCanvasImage() {
    const app = this._app;
    const config = app.config;
    return (dataUrl) => {
      if (!dataUrl) return;
      let entry = config.widgets['canvas_ref_image'];
      if (!entry) {
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
        config.addCustomTab(def);
        entry = config.widgets['canvas_ref_image'];
        if (entry && entry.widget) {
          entry.widget.setValue(dataUrl);
          this.rewireImageSync();
        }
      } else if (entry && entry.widget) {
        entry.widget.setValue(dataUrl);
      }
      app._eventWirer.notifyConfigChangeSafe();
    };
  }

  /**
   * 创建 onClearCanvas 回调
   */
  _createOnClearCanvas() {
    const app = this._app;
    const config = app.config;
    return () => {
      app._regionCount = 0;
      const refEntry = config.widgets['canvas_ref_image'];
      if (refEntry) {
        config.removeTab('canvas_ref_image');
      }
      config.removeAllRegionPrompts();
      app._eventWirer.notifyConfigChangeSafe();
    };
  }

  /**
   * 创建 onTabRemove 回调
   */
  _createOnTabRemove() {
    const app = this._app;
    return (id, _def) => {
      if (id === 'canvas_ref_image') {
        app.canvas.clear();
        app._eventWirer.notifyConfigChangeSafe();
      }
    };
  }
}
