/**
 * utils.js — DOM 工具函数
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  return e;
}

export function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

export function iconSvg(w, h, children) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', w);
  s.setAttribute('height', h);
  s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  s.setAttribute('fill', 'none');
  children.forEach(c => s.appendChild(c));
  return s;
}