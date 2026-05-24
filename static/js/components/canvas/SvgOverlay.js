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
    this._selections = {};
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
  //  坐标映射 — 处理 object-fit: contain 的 letterbox
  // ================================================================
  _computeRenderArea(natW, natH, containerW, containerH) {
    const imgRatio = natW / natH;
    const containerRatio = containerW / containerH;
    if (imgRatio > containerRatio) {
      const renderedW = containerW;
      const renderedH = containerW / imgRatio;
      return { renderedW, renderedH, padLeft: 0, padTop: (containerH - renderedH) / 2 };
    }
    const renderedH = containerH;
    const renderedW = containerH * imgRatio;
    return { renderedW, renderedH, padLeft: (containerW - renderedW) / 2, padTop: 0 };
  }

  _toDisplayCoords(rawX, rawY, origArea, currArea) {
    const imgRelX = (rawX - origArea.padLeft) / (origArea.renderedW || 1);
    const imgRelY = (rawY - origArea.padTop) / (origArea.renderedH || 1);
    return {
      x: imgRelX * currArea.renderedW + currArea.padLeft,
      y: imgRelY * currArea.renderedH + currArea.padTop,
    };
  }

  // ================================================================
  //  持久化选区
  // ================================================================
  addConfirmedSelection(label, data) {
    this._selections[label] = data;
    this._renderSelection(label, data);
  }

  _renderSelection(label, data) {
    this._removeConfirmedElements(label);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-label', label);

    const natW = data.naturalWidth || data.canvasWidth || 1;
    const natH = data.naturalHeight || data.canvasHeight || 1;
    const origArea = this._computeRenderArea(natW, natH, data.canvasWidth || 1, data.canvasHeight || 1);
    const currArea = this._computeRenderArea(natW, natH, this.svgParent.clientWidth, this.svgParent.clientHeight);
    const s = Math.min(currArea.renderedW / (origArea.renderedW || 1), currArea.renderedH / (origArea.renderedH || 1));

    if (data.type === 'point') {
      const rawX = data.x ?? data.points?.[0]?.x ?? 0;
      const rawY = data.y ?? data.points?.[0]?.y ?? 0;
      const dc = this._toDisplayCoords(rawX, rawY, origArea, currArea);
      const r = Math.max(15 * s, 8);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', dc.x);
      circle.setAttribute('cy', dc.y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', data.color);
      circle.setAttribute('fill-opacity', '0.35');
      circle.setAttribute('stroke', data.color);
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);
      g.appendChild(this._makeLabelElement(dc.x - r, dc.y - r - 6, label));
    } else if ((data.type === 'lasso' || data.type === 'segmentation') && data.points && data.points.length >= 3) {
      const scaled = data.points.map(p => this._toDisplayCoords(p.x, p.y, origArea, currArea));
      let d = 'M ' + scaled[0].x + ' ' + scaled[0].y;
      for (let i = 1; i < scaled.length; i++) {
        d += ' L ' + scaled[i].x + ' ' + scaled[i].y;
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
      for (const p of scaled) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      g.appendChild(this._makeLabelElement(minX + 2, minY + 14, label));
    }

    this._confirmedGroup.appendChild(g);
  }

  refreshAllSelections() {
    this._confirmedGroup.innerHTML = '';
    for (const [label, data] of Object.entries(this._selections)) {
      this._renderSelection(label, data);
    }
  }

  removeConfirmedSelection(label) {
    this._removeConfirmedElements(label);
    delete this._selections[label];
  }

  clearAllSelections() {
    this._confirmedGroup.innerHTML = '';
    this._selections = {};
  }

  _removeConfirmedElements(label) {
    const els = this._confirmedGroup.querySelectorAll('[data-label="' + label + '"]');
    els.forEach(el => el.remove());
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