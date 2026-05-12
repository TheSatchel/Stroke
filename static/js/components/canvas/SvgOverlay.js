/**
 * SvgOverlay.js — Canvas 的 SVG 叠加层
 *
 * 职责：
 *   1) 持久化选区渲染 (confirmedMasks — circle / path / label)
 *   2) 临时套索路径 (lassoPath / lassoClose)
 *   3) label 元素生成
 *   4) 清空选区
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export default class SvgOverlay {
  /**
   * @param {HTMLElement} svgParent - canvasImg 容器
   */
  constructor(svgParent) {
    this.svgParent = svgParent;
    this.svg = this._createSvg();
  }

  // ================================================================
  //  创建 SVG 根元素
  // ================================================================
  _createSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'lassoSvg');
    svg.setAttribute('class', 'lasso-svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';

    // 持久化选区组
    this._confirmedGroup = document.createElementNS(SVG_NS, 'g');
    this._confirmedGroup.setAttribute('id', 'confirmedMasks');
    svg.appendChild(this._confirmedGroup);

    // 临时套索路径
    this._lassoPath = document.createElementNS(SVG_NS, 'path');
    this._lassoPath.setAttribute('id', 'lassoPath');
    this._lassoPath.setAttribute('fill', 'none');
    this._lassoPath.setAttribute('stroke', 'var(--color-accent-ring, #3B82F6)');
    this._lassoPath.setAttribute('stroke-width', '1.5');
    this._lassoPath.setAttribute('stroke-dasharray', '4 3');
    this._lassoPath.style.display = 'none';
    svg.appendChild(this._lassoPath);

    // 临时闭合线
    this._lassoClose = document.createElementNS(SVG_NS, 'line');
    this._lassoClose.setAttribute('id', 'lassoClose');
    this._lassoClose.setAttribute('stroke', 'var(--color-accent-ring, #3B82F6)');
    this._lassoClose.setAttribute('stroke-width', '1');
    this._lassoClose.setAttribute('stroke-dasharray', '3 3');
    this._lassoClose.style.display = 'none';
    svg.appendChild(this._lassoClose);

    return svg;
  }

  // ================================================================
  //  临时路径（画圈中）
  // ================================================================
  showLassoPath() { this._lassoPath.style.display = 'block'; }
  hideLassoPath() { this._lassoPath.style.display = 'none'; }

  showLassoClose() { this._lassoClose.style.display = 'block'; }
  hideLassoClose() { this._lassoClose.style.display = 'none'; }

  updateLassoPath(points) {
    if (!points || points.length === 0) { this.hideLassoPath(); return; }
    let d = 'M ' + points[0].x + ' ' + points[0].y;
    for (let i = 1; i < points.length; i++) {
      d += ' L ' + points[i].x + ' ' + points[i].y;
    }
    this._lassoPath.setAttribute('d', d);
    this.showLassoPath();
  }

  setLassoClose(x1, y1, x2, y2) {
    this._lassoClose.setAttribute('x1', x1);
    this._lassoClose.setAttribute('y1', y1);
    this._lassoClose.setAttribute('x2', x2);
    this._lassoClose.setAttribute('y2', y2);
    this.showLassoClose();
  }

  setLassoStrokeDash(style) {
    this._lassoPath.setAttribute('stroke-dasharray', style);
  }

  // ================================================================
  //  持久化选区
  // ================================================================
  addConfirmedSelection(label, data) {
    this._removeConfirmedElements(label);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-label', label);

    if (data.type === 'point') {
      const cx = data.x ?? data.points?.[0]?.x ?? 0;
      const cy = data.y ?? data.points?.[0]?.y ?? 0;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', '15');
      circle.setAttribute('fill', data.color);
      circle.setAttribute('fill-opacity', '0.35');
      circle.setAttribute('stroke', data.color);
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);
      g.appendChild(this._makeLabelElement(cx - 15, cy - 15 - 6, label));
    } else if ((data.type === 'lasso' || data.type === 'segmentation') && data.points && data.points.length >= 3) {
      let d = 'M ' + data.points[0].x + ' ' + data.points[0].y;
      for (let i = 1; i < data.points.length; i++) {
        d += ' L ' + data.points[i].x + ' ' + data.points[i].y;
      }
      d += ' Z';
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', data.color);
      path.setAttribute('fill-opacity', '0.35');
      path.setAttribute('stroke', data.color);
      path.setAttribute('stroke-width', '1.5');
      g.appendChild(path);

      let minX = Infinity, minY = Infinity;
      for (const p of data.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      g.appendChild(this._makeLabelElement(minX + 2, minY + 14, label));
    }

    this._confirmedGroup.appendChild(g);
  }

  removeConfirmedSelection(label) {
    this._removeConfirmedElements(label);
  }

  _removeConfirmedElements(label) {
    const els = this._confirmedGroup.querySelectorAll('[data-label="' + label + '"]');
    els.forEach(el => el.remove());
  }

  clearAllSelections() {
    this._confirmedGroup.innerHTML = '';
  }

  // ================================================================
  //  Label 元素
  // ================================================================
  _makeLabelElement(x, y, label) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', x + 4);
    text.setAttribute('y', y);
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('stroke', 'rgba(0,0,0,0.5)');
    text.setAttribute('stroke-width', '2');
    text.setAttribute('paint-order', 'stroke');
    text.textContent = label;
    return text;
  }

  // ================================================================
  //  获取 / 挂载
  // ================================================================
  getElement() {
    return this.svg;
  }
}