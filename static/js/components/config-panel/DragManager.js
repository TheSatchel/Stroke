/**
 * DragManager.js — ConfigPanel 的拖拽排序逻辑
 *
 * 负责 dragstart/dragend/dragover/drop 事件、ghost 预览、
 * 锁定元素保护（prompt 首位、generate_call 末位）、order 同步。
 * 同时支持 touch 拖拽（降级实现，用于平板等触控设备）。
 */
import { el } from '../../utils/DOM.js';

export default class DragManager {
  constructor(panel) {
    /** @type {import('./ConfigPanel.js').default} */
    this.panel = panel;
    this.dragSrc = null;
    this._touchDrag = null;
  }

  // ================================================================
  //  Mouse 拖拽事件处理
  // ================================================================
  dStart(e) {
    const handle = e.currentTarget;
    const elm = handle.closest('.drag-section');
    if (!elm) return;
    if (elm.classList.contains('drag-section--flagged')) {
      e.preventDefault();
      return;
    }
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

        const simulated = allChildren.map(c => c.id.replace('sec-', ''));
        const moved = simulated.splice(srcIndex, 1)[0];
        const insertAt = srcIndex < tgtIndex ? tgtIndex : tgtIndex;
        simulated.splice(insertAt, 0, moved);

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
  //  Touch 拖拽事件处理 (降级，与 mouse DnD 共享 _performReorder)
  // ================================================================
  tStart(e) {
    const elm = e.currentTarget.closest('.drag-section');
    if (!elm) return;
    if (elm.classList.contains('drag-section--flagged')) return;
    const elmId = elm.id.replace('sec-', '');
    const def = this.panel.tabsConfig.find(t => t.id === elmId);
    if (def && (def.id === 'prompt' || def.type === 'generate_call')) return;

    const touch = e.touches[0];
    const ghost = el('div', '', {
      style: 'position:fixed;z-index:999;opacity:0.7;pointer-events:none;background:var(--color-background-primary);border:1px solid var(--color-accent-ring);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--color-text-primary);box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      text: elm.querySelector('.drag-title')?.textContent || ''
    });
    ghost.style.left = (touch.clientX - 60) + 'px';
    ghost.style.top = (touch.clientY - 15) + 'px';
    document.body.appendChild(ghost);

    elm.classList.add('drag-section--dragging');
    this._touchDrag = { elm, ghost, startY: touch.clientY, moved: false };
  }

  tMove(e) {
    if (!this._touchDrag) return;
    const touch = e.touches[0];
    const dy = Math.abs(touch.clientY - this._touchDrag.startY);
    const dx = Math.abs(touch.clientX - this._touchDrag.startX);
    if (!this._touchDrag.started && dx < 8 && dy < 8) return;
    if (!this._touchDrag.started && dy > dx) { this._touchDrag = null; return; }
    e.preventDefault();
    this._touchDrag.started = true;
    this._touchDrag.ghost.style.left = (touch.clientX - 60) + 'px';
    this._touchDrag.ghost.style.top = (touch.clientY - 15) + 'px';
    this._touchDrag.moved = true;

    const hovering = document.elementFromPoint(touch.clientX, touch.clientY);
    const sec = hovering?.closest('.drag-section');
    this.panel.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-section--dragover'));
    if (sec && sec !== this._touchDrag.elm && !sec.classList.contains('drag-section--flagged')) {
      sec.classList.add('drag-section--dragover');
    }
  }

  tEnd(e) {
    if (!this._touchDrag) return;
    const touch = e.changedTouches[0];
    this._touchDrag.elm.classList.remove('drag-section--dragging');

    if (this._touchDrag.moved && touch) {
      const hovering = document.elementFromPoint(touch.clientX, touch.clientY);
      const sec = hovering?.closest('.drag-section');
      if (sec && sec !== this._touchDrag.elm && !sec.classList.contains('drag-section--flagged')) {
        const tid = sec.id.replace('sec-', '');
        this.dragSrc = this._touchDrag.elm.id;
        this.dDrop({ preventDefault: () => {} }, tid);
      }
    }

    this.panel.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-section--dragover'));
    if (this._touchDrag.ghost) this._touchDrag.ghost.remove();
    this._touchDrag = null;
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
  //  面板宽度持久化（vw 比例）
  // ================================================================
  static installResizeHandles(appEl, handleLeft, handleRight) {
    const ghost = document.createElement('div');
    ghost.className = 'resize-ghost';
    document.body.appendChild(ghost);

    const getRenderedWidths = () => {
      const cs = getComputedStyle(appEl);
      const parts = cs.gridTemplateColumns.split(' ');
      return {
        left: parseFloat(parts[0]) || 190,
        mid: parseFloat(parts[2]) || 400,
        right: parseFloat(parts[4]) || 190
      };
    };

    const setSizesPx = (leftMax, rightMax) => {
      appEl.style.gridTemplateColumns =
        `minmax(140px,${leftMax}px) 4px minmax(200px,1fr) 4px minmax(140px,${rightMax}px)`;
    };

    const setSizesVw = (leftVw, rightVw) => {
      appEl.style.gridTemplateColumns =
        `minmax(140px,${leftVw.toFixed(2)}vw) 4px minmax(200px,1fr) 4px minmax(140px,${rightVw.toFixed(2)}vw)`;
    };

    const vwFromPx = (px) => (px / window.innerWidth) * 100;

    const persistSizes = (leftPx, rightPx) => {
      try {
        const lv = vwFromPx(leftPx);
        const rv = vwFromPx(rightPx);
        localStorage.setItem('stroke_panel_sizes', JSON.stringify({ lv, rv }));
      } catch (e) { /* ignore */ }
    };

    let restored = false;
    try {
      const raw = localStorage.getItem('stroke_panel_sizes');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.lv === 'number' && typeof saved.rv === 'number') {
          setSizesVw(saved.lv, saved.rv);
          restored = true;
        } else if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') {
          const lv = vwFromPx(Math.max(saved.left, 140));
          const rv = vwFromPx(Math.max(saved.right, 140));
          setSizesVw(lv, rv);
          localStorage.setItem('stroke_panel_sizes', JSON.stringify({ lv, rv }));
          restored = true;
        }
      }
    } catch (e) { /* ignore */ }

    if (!restored) {
      setSizesVw(7.42, 7.42);
    }

    const makeDragger = (handleEl, isLeft) => {
      let dragging = false;
      let startX = 0;
      let startCols = null;
      let touchId = null;
      const minW = isLeft ? 140 : 140;
      const maxW = isLeft ? 340 : 480;

      const onStart = (clientX) => {
        dragging = true;
        startX = clientX;
        startCols = getRenderedWidths();
        handleEl.classList.add('active');
        ghost.style.display = 'block';
        ghost.style.left = clientX + 'px';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
      };

      const onMove = (clientX) => {
        if (!dragging) return;
        ghost.style.left = clientX + 'px';
        const dx = clientX - startX;
        if (isLeft) {
          const newLeft = Math.round(Math.max(minW, Math.min(maxW, startCols.left + dx)));
          setSizesPx(newLeft, startCols.right);
        } else {
          const newRight = Math.round(Math.max(minW, Math.min(maxW, startCols.right - dx)));
          setSizesPx(startCols.left, newRight);
        }
      };

      const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        handleEl.classList.remove('active');
        ghost.style.display = 'none';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        const ren = getRenderedWidths();
        persistSizes(ren.left, ren.right);
        setSizesVw(vwFromPx(ren.left), vwFromPx(ren.right));
      };

      const onTouchMove = (e) => {
        if (!dragging || touchId === null) return;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === touchId) {
            onMove(e.touches[i].clientX);
            return;
          }
        }
      };

      const onTouchEnd = (e) => {
        if (touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            onEnd();
            touchId = null;
            return;
          }
        }
      };

      handleEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onStart(e.clientX);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
      });

      handleEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches[0]) {
          touchId = e.touches[0].identifier;
          onStart(e.touches[0].clientX);
          document.addEventListener('touchmove', onTouchMove, { passive: false });
          document.addEventListener('touchend', onTouchEnd);
        }
      }, { passive: false });
    };

    makeDragger(handleLeft, true);
    makeDragger(handleRight, false);

    window.addEventListener('resize', () => {
      try {
        const raw = localStorage.getItem('stroke_panel_sizes');
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && typeof saved.lv === 'number' && typeof saved.rv === 'number') {
            setSizesVw(saved.lv, saved.rv);
          }
        }
      } catch (e) { /* ignore */ }
    });
  }
}
