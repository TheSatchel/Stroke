/**
 * ModelSelectorModal.js — 模型选择子模态框
 *
 * 从 ConfigModal._createModelSubModal() 抽取。
 * 提供主模型 + 备用模型的"从列表选择 / 自定义名称"双模式切换。
 */

import { el } from '../../utils/DOM.js';

export default class ModelSelectorModal {
  /**
   * @param {object} opts
   * @param {string} opts.currentModel - 当前主模型值
   * @param {string|null} opts.currentFallbackModel - 当前备用模型值
   * @param {Array} opts.allModels - 模型列表 [{id, label}, ...]
   * @param {function} opts.onConfirm - 确认回调 ({model, fallbackModel}) => void
   */
  static open(opts) {
    const existing = document.getElementById('configModelSubOverlay');
    if (existing) existing.remove();

    const { currentModel, currentFallbackModel, allModels = [], onConfirm } = opts;
    let _model = currentModel || '';
    let _fallback = currentFallbackModel || null;
    const self = this;

    const overlay = el('div', 'overlay', { id: 'configModelSubOverlay', style: 'z-index:1003' });
    overlay.classList.remove('hidden');

    const modal = el('div', 'settings-modal', { style: 'max-width:420px' });
    modal.addEventListener('click', e => e.stopPropagation());

    // header
    const hdr = el('div', 'sm-header');
    hdr.appendChild(el('span', 'sm-title', { text: '选择模型' }));
    hdr.appendChild(el('button', 'sm-close', { text: '×', onclick: () => overlay.remove() }));
    modal.appendChild(hdr);

    const body = el('div', 'sm-body');

    // ---------- 主模型 ----------
    const fMain = el('div', 'sm-field');
    fMain.appendChild(el('div', 'sm-label', { text: '主模型' }));

    const isMainPredefined = allModels.length > 0 && allModels.some(m => m.id === _model);
    const radioPredefined = el('input', '', { type: 'radio', name: 'mainModelType', value: 'predefined' });
    radioPredefined.checked = isMainPredefined;
    const radioCustom = el('input', '', { type: 'radio', name: 'mainModelType', value: 'custom' });
    radioCustom.checked = !isMainPredefined;

    const radioContainer = el('div', 'sm-radio-group');
    const labelPre = el('label', 'sm-radio-item');
    labelPre.appendChild(radioPredefined);
    labelPre.appendChild(el('span', '', { text: '从列表选择' }));
    const labelCus = el('label', 'sm-radio-item');
    labelCus.appendChild(radioCustom);
    labelCus.appendChild(el('span', '', { text: '自定义名称' }));
    radioContainer.appendChild(labelPre);
    radioContainer.appendChild(labelCus);
    fMain.appendChild(radioContainer);

    // 下拉菜单（predefined 时可见）
    const mainDropdown = el('select', 'sm-input sm-model-select-row');
    mainDropdown.style.display = isMainPredefined ? 'block' : 'none';
    mainDropdown.innerHTML = allModels.length === 0
      ? '<option value="">无可用模型</option>'
      : allModels.map(m => {
          const sel = (isMainPredefined && m.id === _model) ? ' selected' : '';
          return '<option value="' + m.id + '"' + sel + '>' + m.label + '</option>';
        }).join('');
    fMain.appendChild(mainDropdown);

    // 自定义输入（custom 时可见）
    const mainCustomInput = el('input', 'sm-input sm-model-select-row', {
      type: 'text',
      placeholder: '例如: gpt-4o-2024-11-20',
      value: !isMainPredefined && _model ? _model : ''
    });
    mainCustomInput.style.display = isMainPredefined ? 'none' : 'block';
    fMain.appendChild(mainCustomInput);

    radioPredefined.addEventListener('change', () => {
      mainDropdown.style.display = 'block';
      mainCustomInput.style.display = 'none';
    });
    radioCustom.addEventListener('change', () => {
      mainDropdown.style.display = 'none';
      mainCustomInput.style.display = 'block';
    });

    body.appendChild(fMain);

    // ---------- 备用模型 ----------
    const fFb = el('div', 'sm-field');
    fFb.appendChild(el('div', 'sm-label', { text: '备用模型 (Fallback)' }));

    const isFallbackPredefined = allModels.length > 0 && _fallback &&
      allModels.some(m => m.id === _fallback);
    const fbRadioPredefined = el('input', '', { type: 'radio', name: 'fbModelType', value: 'predefined' });
    fbRadioPredefined.checked = isFallbackPredefined || !_fallback;
    const fbRadioCustom = el('input', '', { type: 'radio', name: 'fbModelType', value: 'custom' });
    fbRadioCustom.checked = _fallback && !isFallbackPredefined;

    const fbRadioContainer = el('div', 'sm-radio-group');
    const fbLabelPre = el('label', 'sm-radio-item');
    fbLabelPre.appendChild(fbRadioPredefined);
    fbLabelPre.appendChild(el('span', '', { text: '从列表选择' }));
    const fbLabelCus = el('label', 'sm-radio-item');
    fbLabelCus.appendChild(fbRadioCustom);
    fbLabelCus.appendChild(el('span', '', { text: '自定义名称' }));
    fbRadioContainer.appendChild(fbLabelPre);
    fbRadioContainer.appendChild(fbLabelCus);
    fFb.appendChild(fbRadioContainer);

    // 下拉菜单
    const fbDropdown = el('select', 'sm-input sm-model-select-row');
    fbDropdown.style.display = fbRadioPredefined.checked ? 'block' : 'none';
    fbDropdown.innerHTML = '<option value="">无</option>' +
      allModels.map(m => {
        const sel = (isFallbackPredefined && m.id === _fallback) ? ' selected' : '';
        return '<option value="' + m.id + '"' + sel + '>' + m.label + '</option>';
      }).join('');
    fFb.appendChild(fbDropdown);

    // 自定义输入
    const fbCustomInput = el('input', 'sm-input sm-model-select-row', {
      type: 'text',
      placeholder: '例如: gpt-3.5-turbo',
      value: (!isFallbackPredefined && _fallback) ? _fallback : ''
    });
    fbCustomInput.style.display = fbRadioCustom.checked ? 'block' : 'none';
    fFb.appendChild(fbCustomInput);

    fbRadioPredefined.addEventListener('change', () => {
      fbDropdown.style.display = 'block';
      fbCustomInput.style.display = 'none';
    });
    fbRadioCustom.addEventListener('change', () => {
      fbDropdown.style.display = 'none';
      fbCustomInput.style.display = 'block';
    });

    fFb.appendChild(el('div', 'sm-hint', { text: '主模型出错时自动切换到备用模型重试' }));
    body.appendChild(fFb);

    // footer
    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => overlay.remove() }));
    footer.appendChild(el('button', 'sm-btn-pri', {
      text: '确定',
      onclick: () => {
        // 读取主模型
        if (radioPredefined.checked) {
          _model = mainDropdown.value;
        } else {
          _model = mainCustomInput.value.trim();
        }
        // 读取备用模型
        if (fbRadioPredefined.checked) {
          _fallback = fbDropdown.value || null;
        } else {
          const fbVal = fbCustomInput.value.trim();
          _fallback = fbVal || null;
        }
        onConfirm({ model: _model, fallbackModel: _fallback });
        overlay.remove();
      }
    }));

    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
}