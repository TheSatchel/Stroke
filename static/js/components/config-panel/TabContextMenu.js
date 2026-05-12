/**
 * TabContextMenu.js — 右键操作菜单（删除/修改）
 *
 * 从 ConfigPanel._showTabMenu() / _closeTabMenu() 抽取。
 */

import { el } from '../../utils/DOM.js';

export default class TabContextMenu {
  constructor(panel) {
    /** @type {import('./ConfigPanel.js').default} */
    this.panel = panel;
    this._activeMenu = null;
    this._resizeHandler = null;
  }

  // ================================================================
  //  显示菜单
  // ================================================================
  show(e, tabDef) {
    this.close();

    const menu = el('div', 'tab-context-menu');

    const editItem = el('div', 'tab-context-item', {text: '修改'});
    editItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.close();
      this.panel._tabEditModal.showEdit(tabDef);
    });
    menu.appendChild(editItem);

    const divider = el('div', 'tab-context-divider');
    menu.appendChild(divider);

    const delItem = el('div', 'tab-context-item tab-context-item-danger', {text: '删除'});
    delItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.close();
      this.panel.removeTab(tabDef.id);
    });
    menu.appendChild(delItem);

    document.body.appendChild(menu);
    this._activeMenu = menu;

    // 定位
    const menuRect = menu.getBoundingClientRect();
    const menuH = menuRect.height;
    const menuW = menuRect.width;
    const rect = e.target.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top;
    if (spaceBelow >= menuH + 4 || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = rect.top - menuH - 4;
    }

    let left;
    const containerRect = this.panel.container.getBoundingClientRect();
    if (rect.left + menuW <= window.innerWidth - 4) {
      left = rect.left;
    } else {
      left = containerRect.right - menuW;
      if (left < 0) left = 0;
      menu.classList.add('tab-context-menu--right');
    }

    menu.style.position = 'fixed';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    // 事件清理
    const resizeHandler = () => this.close();
    window.addEventListener('resize', resizeHandler);
    this._resizeHandler = resizeHandler;

    const closeHandler = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== e.target) {
        this.close();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
  }

  // ================================================================
  //  关闭菜单
  // ================================================================
  close() {
    if (this._activeMenu) {
      this._activeMenu.remove();
      this._activeMenu = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }
}