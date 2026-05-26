/**
 * TabSectionBuilder.js — 根据 tabDef 生成 DOM section
 *
 * 负责构建单个配置项的拖拽区域 DOM，包含头部、旗标按钮和 widget 容器。
 */
import { el, svgEl, iconSvg } from '../../utils/DOM.js';
import { widgetRegistry } from '../ConfigTabs.js';

/**
 * 构建一个带旗标按钮的 section DOM
 * @param {Object} tabDef - tab 定义
 * @param {Object} dragManager - 拖拽管理器实例
 * @param {Object} tabContextMenu - 右键菜单实例
 * @param {Object} widgets - widgets 存储对象 { [id]: { widget, def } }
 * @param {Object} panel - ConfigPanel 实例引用
 * @returns {HTMLElement}
 */
export function makeTabSection(tabDef, dragManager, tabContextMenu, widgets, panel) {
  const secId = 'sec-' + tabDef.id;
  const sec = el('div', 'drag-section', { id: secId });
  if (tabDef.hidden) sec.style.display = 'none';
  sec.addEventListener('dragover', e => dragManager.dOver(e));
  sec.addEventListener('dragleave', e => dragManager.dLeave(e));
  sec.addEventListener('drop', e => dragManager.dDrop(e, secId));

  const isPinnedSection = tabDef.id === 'prompt' || tabDef.type === 'generate_call';
  const hdr = el('div', 'drag-header', isPinnedSection ? { style: 'cursor:default' } : { draggable: 'true' });
  if (!isPinnedSection) {
    hdr.addEventListener('dragstart', e => dragManager.dStart(e));
    hdr.addEventListener('dragend', e => dragManager.dEnd(e));
  }
  const handle = el('div', 'drag-handle');
  if (isPinnedSection) {
    handle.style.opacity = '0.1';
    handle.style.cursor = 'default';
  }
  handle.innerHTML = '<span></span><span></span><span></span>';
  hdr.appendChild(handle);
  hdr.appendChild(el('span', 'drag-title', { text: tabDef.title || tabDef.id }));

  if (isPinnedSection !== true && tabDef.removable !== false) {
    hdr.addEventListener('dblclick', () => {
      panel.removeTab(tabDef.id);
    });
  }

  const flagBtn = makeSectionFlagBtn(sec);
  hdr.appendChild(flagBtn);

  if (tabDef.removable !== false) {
    const menuBtn = el('button', 'tab-menu-btn', { title: '更多操作' });
    menuBtn.innerHTML = '&ctdot;';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tabContextMenu.show(e, tabDef);
    });
    hdr.appendChild(menuBtn);
  }

  sec.appendChild(hdr);

  const body = el('div', 'drag-body');
  const WidgetClass = widgetRegistry[tabDef.type];
  if (WidgetClass) {
    const widget = new WidgetClass(body, tabDef, tabDef.configId || null);
    widgets[tabDef.id] = { widget, def: tabDef };
  } else {
    body.appendChild(el('span', '', { text: '未知控件类型: ' + tabDef.type }));
  }

  sec.appendChild(body);
  return sec;
}

/**
 * 创建旗标按钮
 * @param {HTMLElement} sec - section 元素
 * @returns {HTMLElement}
 */
export function makeSectionFlagBtn(sec) {
  const btn = el('button', 'section-flag-btn', {
    title: '标记完成',
    onclick: (e) => {
      e.stopPropagation();
      btn.classList.toggle('section-flag-btn--done');
      sec.classList.toggle('drag-section--flagged');
    }
  });
  btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 13 13" fill="none"><line x1="2.5" y1="1.5" x2="2.5" y2="11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></line><path d="M2.5 1.5 L10.5 1.5 L8.5 4.5 L10.5 7.5 L2.5 7.5 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"></path></svg>';
  return btn;
}
