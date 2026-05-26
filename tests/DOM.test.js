import { describe, it, expect } from 'vitest';
import { SVG_NS, el, svgEl, iconSvg } from '../static/js/utils/DOM.js';

describe('SVG_NS', () => {
  it('should be the correct SVG namespace', () => {
    expect(SVG_NS).toBe('http://www.w3.org/2000/svg');
  });
});

describe('el', () => {
  it('should create an HTML element', () => {
    const div = el('div', 'my-class');
    expect(div.tagName).toBe('DIV');
    expect(div.className).toBe('my-class');
  });

  it('should set textContent via "text" attribute', () => {
    const p = el('p', '', { text: 'Hello World' });
    expect(p.textContent).toBe('Hello World');
  });

  it('should set innerHTML via "html" attribute', () => {
    const div = el('div', '', { html: '<span>Hi</span>' });
    expect(div.innerHTML).toBe('<span>Hi</span>');
  });

  it('should set standard attributes', () => {
    const input = el('input', '', { type: 'text', placeholder: 'Enter...', value: 'test' });
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('placeholder')).toBe('Enter...');
    expect(input.getAttribute('value')).toBe('test');
  });

  it('should attach event listeners via "on" prefix', () => {
    let clicked = false;
    const btn = el('button', '', { onclick: () => { clicked = true; } });
    btn.click();
    expect(clicked).toBe(true);
  });

  it('should handle missing className and attrs', () => {
    const span = el('span');
    expect(span.tagName).toBe('SPAN');
    expect(span.className).toBe('');
  });

  it('should return an HTMLUnknownElement for custom tags', () => {
    const custom = el('my-component', 'custom');
    expect(custom.tagName).toBe('MY-COMPONENT');
  });
});

describe('svgEl', () => {
  it('should create an SVG element with correct namespace', () => {
    const rect = svgEl('rect', { width: '100', height: '50' });
    expect(rect.namespaceURI).toBe(SVG_NS);
    expect(rect.getAttribute('width')).toBe('100');
    expect(rect.getAttribute('height')).toBe('50');
  });

  it('should handle no attributes', () => {
    const g = svgEl('g');
    expect(g.namespaceURI).toBe(SVG_NS);
    expect(g.tagName).toBe('g');
  });
});

describe('iconSvg', () => {
  it('should create an SVG icon with correct attributes', () => {
    const path = svgEl('path', { d: 'M0 0L10 10' });
    const icon = iconSvg(24, 24, [path]);
    expect(icon.getAttribute('width')).toBe('24');
    expect(icon.getAttribute('height')).toBe('24');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('fill')).toBe('none');
    expect(icon.children).toHaveLength(1);
    expect(icon.children[0].tagName).toBe('path');
  });

  it('should handle multiple children', () => {
    const c1 = svgEl('circle', { cx: '10', cy: '10', r: '5' });
    const c2 = svgEl('rect', { x: '0', y: '0', width: '20', height: '20' });
    const icon = iconSvg(20, 20, [c1, c2]);
    expect(icon.children).toHaveLength(2);
  });

  it('should handle no children', () => {
    const icon = iconSvg(10, 10, []);
    expect(icon.children).toHaveLength(0);
  });
});
