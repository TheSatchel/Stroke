/**
 * DragManager.js — ConfigPanel 的拖拽排序逻辑
 *
 * 负责 dragstart/dragend/dragover/drop 事件、ghost 预览、
 * 锁定元素保护（prompt 首位、generate_call 末位）、order 同步。
 */

export default class DragManager {
  constructor(panel) {
    /** @type {import('./ConfigPanel.js').default} */
    this.panel = panel;
    this.dragSrc = null;
  }

  // ================================================================
  //  拖拽事件处理
  // ================================================================
  dStart(e) {
    const handle = e.currentTarget;
    const elm = handle.closest('.drag-section');
    if (!elm) return;
    if (elm.classList.contains('drag-section--flagged')) {
      e.preventDefault();
      return;
    }
    // 固定元素不可拖拽
    const elmId = elm.id.replace('sec-', '');
    const def = this.panel.tabsConfig.find(t => t.id === elmId);
    if (def && (def.id === 'prompt' || def.type === 'generate_call')) {
      e.preventDefault();
      return;
    }
    this.dragSrc = elm.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(elm, 0, 0);
    setTimeout(() => {
      elm.classList.add('drag-section--dragging');
    }, 0);
  }

  dEnd(e) {
    this.panel.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-section--dragging', 'drag-section--dragover'));
    this.dragSrc = null;
  }

  dOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.add('drag-section--dragover');
  }

  dLeave(e) {
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.remove('drag-section--dragover');
  }

  dDrop(e, tid) {
    e.preventDefault();
    const { secList, tabsConfig } = this.panel;
    secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-section--dragover', 'drag-section--dragging'));
    if (this.dragSrc && this.dragSrc !== tid) {
      const src = document.getElementById(this.dragSrc);
      const tgt = document.getElementById(tid);
      if (src && tgt) {
        const allChildren = Array.from(secList.children);
        const srcIndex = allChildren.indexOf(src);
        const tgtIndex = allChildren.indexOf(tgt);

        // 模拟移动后的顺序
        const simulated = allChildren.map(c => c.id.replace('sec-', ''));
        const moved = simulated.splice(srcIndex, 1)[0];
        const insertAt = srcIndex < tgtIndex ? tgtIndex : tgtIndex;
        simulated.splice(insertAt, 0, moved);

        // 验证：第一个必须是 prompt，最后一个必须是 generate_call
        const firstDef = tabsConfig.find(t => t.id === simulated[0]);
        const lastDef = tabsConfig.find(t => t.id === simulated[simulated.length - 1]);
        if (!firstDef || firstDef.id !== 'prompt') {
          this.dragSrc = null;
          return;
        }
        if (!lastDef || lastDef.type !== 'generate_call') {
          this.dragSrc = null;
          return;
        }

        if (srcIndex < tgtIndex) secList.insertBefore(src, tgt.nextSibling);
        else secList.insertBefore(src, tgt);

        this._syncTabOrder();
      }
    }
    this.dragSrc = null;
  }

  // ================================================================
  //  Order 同步
  // ================================================================
  _syncTabOrder() {
    const { secList, tabsConfig } = this.panel;
    const sortedIds = Array.from(secList.children).map(el => el.id.replace('sec-', ''));
    for (let i = 0; i < sortedIds.length; i++) {
      const def = tabsConfig.find(t => t.id === sortedIds[i]);
      if (def) def.order = i;
    }
    tabsConfig.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (this.panel._notifyConfigChange) this.panel._notifyConfigChange();
  }

  // ================================================================
  //  面板宽度持久化（从 App.js 迁移过来的逻辑）
  // ================================================================
  /**
   * 为 App 安装左右拖拽手柄的 resize 逻辑。
   * @param {HTMLElement} appEl - 根 .app 容器
   * @param {HTMLElement} handleLeft - 左侧拖拽手柄
   * @param {HTMLElement} handleRight - 右侧拖拽手柄
   */
  static installResizeHandles(appEl, handleLeft, handleRight) {
    const ghost = document.createElement('div');
    ghost.className = 'resize-ghost';
    document.body.appendChild(ghost);

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

    // 恢复保存的尺寸
    try {
      const raw = localStorage.getItem('stroke_panel_sizes');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') {
          setSizes(Math.max(saved.left, 140), Math.max(saved.right, 200));
        }
      }
    } catch (e) { /* ignore */ }

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

    makeDragger(handleLeft, true);
    makeDragger(handleRight, false);
  }
}