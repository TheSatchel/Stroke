/**
 * TabEditModal.js — 添加/修改字段弹窗（合并两弹窗）
 *
 * 之前的 _showAddPopup() 和 _showEditPopup() 共享 90% 的 DOM 结构，
 * 仅标题、预填值、确认动作不同。统一为一个可参数化的模态框。
 */

import { el } from '../../utils/DOM.js';
import { getTabTemplate } from '../ConfigTabs.js';

export default class TabEditModal {
  /**
   * @param {object} panel - ConfigPanel 实例引用
   */
  constructor(panel) {
    this.panel = panel;
  }

  /**
   * 打开"添加字段"弹窗
   */
  showAdd() {
    this._show({
      id: 'addTabPopup',
      title: '添加自定义字段',
      showTypeSelector: true,
      initialValues: {},
      onConfirm: (values) => {
        const { type, title, describe, options } = values;
        let tabDef;
        if (type === 'text') {
          tabDef = { ...getTabTemplate('text'), title, describe, multiline: false };
        } else if (type === 'text-multi') {
          tabDef = { ...getTabTemplate('text'), title, describe, multiline: true, rows: 3 };
        } else if (type === 'slider') {
          tabDef = { ...getTabTemplate('slider'), title, describe };
        } else if (type === 'choice-dropdown') {
          const opts = options || ['选项 A', '选项 B', '选项 C'];
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'dropdown', options: opts, defaultValue: opts[0] };
        } else if (type === 'choice-toggle') {
          const opts = options || ['关', '开'];
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'toggle', options: opts, defaultValue: opts[0] };
        } else if (type === 'choice-radio') {
          const opts = options || ['选项 A', '选项 B', '选项 C'];
          tabDef = { ...getTabTemplate('choice'), title, describe, displayAs: 'radio', options: opts, defaultValue: opts[0] };
        } else if (type === 'image') {
          tabDef = { ...getTabTemplate('image'), title, describe };
        } else if (type === 'generate_call') {
          tabDef = {
            id: 'generate_call_' + Date.now(),
            title: title || '生成调用',
            describe: describe || '触发一次图像生成。上游所有 prompt 将拼接后发送。',
            type: 'generate_call',
            order: 999,
            removable: true,
            defaultValue: null,
            promptFormat: '',
            showPromptSummary: true,
          };
        }
        if (tabDef) this.panel.addCustomTab(tabDef);
      }
    });
  }

  /**
   * 打开"修改字段"弹窗
   * @param {object} tabDef - 被修改的 tab 定义
   */
  showEdit(tabDef) {
    this._show({
      id: 'editTabPopup',
      title: '修改字段',
      showTypeSelector: false,
      editTabDef: tabDef,
      initialValues: {
        title: tabDef.title || '',
        describe: tabDef.describe || '',
        options: tabDef.options ? [...tabDef.options] : undefined
      },
      onConfirm: (values) => {
        if (values.title) tabDef.title = values.title;
        if (values.describe !== undefined) tabDef.describe = values.describe;
        if (values.options !== undefined) tabDef.options = values.options;
        this.panel.render();
        if (this.panel._notifyConfigChange) this.panel._notifyConfigChange();
      }
    });
  }

  // ================================================================
  //  内部：渲染弹窗
  // ================================================================
  _show(opts) {
    const { id, title, showTypeSelector, initialValues, editTabDef, onConfirm } = opts;
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = el('div', 'add-tab-overlay', { id });
    const popup = el('div', 'add-tab-popup');

    popup.appendChild(el('h4', 'add-tab-title', { text: title }));

    // 类型选择器（仅"添加"模式显示）
    let typeSel = null;
    if (showTypeSelector) {
      const typeRow = el('div', 'add-tab-row');
      typeRow.appendChild(el('label', 'add-tab-label', { text: '类型' }));
      typeSel = el('select', 'add-tab-select');
      typeSel.innerHTML = '<option value="text">单行文本</option><option value="text-multi">多行文本</option><option value="slider">调节拉杆</option><option value="choice-dropdown">下拉选择</option><option value="choice-toggle">开关</option><option value="choice-radio">单选组</option><option value="image">图片上传</option><option value="generate_call">生成调用</option>';
      typeRow.appendChild(typeSel);
      popup.appendChild(typeRow);
    }

    // 名称
    const titleRow = el('div', 'add-tab-row');
    titleRow.appendChild(el('label', 'add-tab-label', { text: '名称' }));
    const titleInput = el('input', 'add-tab-input', { type: 'text', placeholder: '字段名称', value: initialValues.title || '' });
    titleRow.appendChild(titleInput);
    popup.appendChild(titleRow);

    // 描述
    const descRow = el('div', 'add-tab-row');
    descRow.appendChild(el('label', 'add-tab-label', { text: '描述' }));
    const descInput = el('input', 'add-tab-input', { type: 'text', placeholder: '描述这段字段的作用', value: initialValues.describe || '' });
    descRow.appendChild(descInput);
    popup.appendChild(descRow);

    // ---- 选项编辑器（choice 类型专属） ----
    const optionsWrap = el('div', 'add-tab-row', { id: id + '-options-wrap', style: 'display:none' });
    optionsWrap.appendChild(el('label', 'add-tab-label', { text: '选项' }));
    const optionsList = el('div', 'add-tab-options-list');
    const addOptionBtn = el('button', 'add-tab-option-add-btn', {
      text: '+ 添加选项',
      onclick: () => {
        const row = this._createOptionRow('');
        optionsList.insertBefore(row, addOptionBtn);
      }
    });
    optionsList.appendChild(addOptionBtn);
    optionsWrap.appendChild(optionsList);
    popup.appendChild(optionsWrap);

    // 按钮
    const btnRow = el('div', 'add-tab-btns');
    const cancelBtn = el('button', 'add-tab-btn-sec', {
      text: '取消',
      onclick: () => overlay.remove()
    });
    const confirmBtn = el('button', 'add-tab-btn-pri', {
      text: showTypeSelector ? '添加' : '保存',
      onclick: () => {
        const typeVal = showTypeSelector ? (popup.querySelector('.add-tab-select')?.value || 'text') : null;
        const values = {
          type: typeVal,
          title: titleInput.value.trim() || '自定义字段',
          describe: descInput.value.trim() || ''
        };
        // 收集选项
        if (optionsWrap.style.display !== 'none') {
          const inputs = optionsList.querySelectorAll('.add-tab-option-row input');
          const opts = [];
          inputs.forEach(inp => { const v = inp.value.trim(); if (v) opts.push(v); });
          values.options = opts.length > 0 ? opts : undefined;
        }
        onConfirm(values);
        overlay.remove();
      }
    });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    popup.appendChild(btnRow);

    // ---- 添加模式：监听类型切换，显示/隐藏选项编辑器 ----
    if (showTypeSelector && typeSel) {
      const showOptionsEditor = (typeValue) => {
        const isChoice = ['choice-dropdown', 'choice-toggle', 'choice-radio'].includes(typeValue);
        optionsWrap.style.display = isChoice ? 'flex' : 'none';
        if (isChoice) {
          // 清空已有选项并填入默认选项
          const existingRows = optionsList.querySelectorAll('.add-tab-option-row');
          existingRows.forEach(r => r.remove());
          const defaults = typeValue === 'choice-toggle' ? ['关', '开'] : ['选项 A', '选项 B', '选项 C'];
          defaults.forEach(opt => {
            const row = this._createOptionRow(opt);
            optionsList.insertBefore(row, addOptionBtn);
          });
        }
      };
      typeSel.addEventListener('change', () => showOptionsEditor(typeSel.value));
    }

    // ---- 编辑模式：若编辑的 tab 是 choice 类型，显示选项编辑器并预填 ----
    if (editTabDef && editTabDef.type === 'choice') {
      optionsWrap.style.display = 'flex';
      const opts = initialValues.options || [];
      opts.forEach(opt => {
        const row = this._createOptionRow(opt);
        optionsList.insertBefore(row, addOptionBtn);
      });
    }

    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ---- 工具方法：创建选项行 ----
  _createOptionRow(value) {
    const row = el('div', 'add-tab-option-row');
    const input = el('input', '', { type: 'text', value: value || '', placeholder: '选项内容' });
    const delBtn = el('button', 'add-tab-option-del', {
      text: '×',
      onclick: () => row.remove()
    });
    row.appendChild(input);
    row.appendChild(delBtn);
    return row;
  }
}