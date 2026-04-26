/**
 * uis.js — Stroke UI System
 * 组件化构建整个工作台界面
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================================
// 工具函数
// ============================================================

function el(tag, cls, attrs) {
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

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

function iconSvg(w, h, children) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', w);
  s.setAttribute('height', h);
  s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  s.setAttribute('fill', 'none');
  children.forEach(c => s.appendChild(c));
  return s;
}

// ============================================================
// HistoryPanel — 左栏历史版本
// ============================================================

class HistoryPanel {
  constructor(container) {
    this.container = container;
    this.items = [
      {
        label: 'banner_v3', time: '刚刚', active: true, current: true,
        dots: 3, dotActive: 2,
        svg: `<rect x="6" y="6" width="44" height="44" rx="5" stroke="var(--color-border-secondary)" stroke-width="1.2"/><circle cx="20" cy="20" r="5" stroke="var(--color-border-secondary)" stroke-width="1.2"/><path d="M6 40l12-10 9 7 7-9 16 14" stroke="var(--color-border-secondary)" stroke-width="1.2"/>`
      },
      {
        label: 'poster_dark', time: '12分钟前', active: false, current: false,
        dots: 2, dotActive: 0,
        bg: 'var(--color-background-tertiary)',
        svg: `<rect x="6" y="6" width="44" height="44" rx="5" stroke="var(--color-border-secondary)" stroke-width="1.2"/><rect x="14" y="18" width="28" height="5" rx="2" fill="var(--color-border-secondary)"/><rect x="14" y="28" width="20" height="3.5" rx="2" fill="var(--color-border-secondary)" opacity=".5"/><rect x="14" y="37" width="24" height="3.5" rx="2" fill="var(--color-border-secondary)" opacity=".3"/>`
      },
      {
        label: 'icon_set_01', time: '1小时前', active: false, current: false,
        dots: 1, dotActive: 0,
        bg: 'var(--color-background-tertiary)',
        svg: `<rect x="6" y="6" width="44" height="44" rx="5" stroke="var(--color-border-secondary)" stroke-width="1.2"/><circle cx="28" cy="28" r="12" stroke="var(--color-border-secondary)" stroke-width="1.2"/><path d="M16 28h24M28 16v24" stroke="var(--color-border-secondary)" stroke-width="1"/>`
      }
    ];
    this.onSelect = null;
    this.render();
  }

  render() {
    this.container.className = 'col-left';
    this.container.innerHTML = '';

    const header = el('div', 'col-header', { text: '历史版本', style: 'display:block;padding:12px 14px 10px' });
    this.container.appendChild(header);

    this.listEl = el('div', 'history-list');
    this.items.forEach((item, i) => {
      const div = el('div', 'hist-item' + (item.active ? ' active' : ''), {
        onclick: () => this.select(i)
      });

      const thumb = el('div', 'hist-thumb', item.bg ? { style: 'background:' + item.bg } : {});
      thumb.innerHTML = `<svg width="56" height="56" viewBox="0 0 56 56" fill="none">${item.svg}</svg>`;
      if (item.current) {
        const badge = el('span', '', {
          html: '当前',
          style: 'position:absolute;top:5px;right:5px;background:#EAF3DE;color:#3B6D11;font-size:10px;font-weight:500;padding:1px 6px;border-radius:4px'
        });
        thumb.appendChild(badge);
      }

      const meta = el('div', 'hist-meta');
      meta.appendChild(el('div', 'hist-label', { text: item.label }));
      meta.appendChild(el('div', 'hist-time', { text: item.time }));
      const dots = el('div', 'ver-dots');
      for (let d = 0; d < item.dots; d++) {
        dots.appendChild(el('span', 'ver-dot' + (d === item.dotActive ? ' active' : '')));
      }
      meta.appendChild(dots);

      div.appendChild(thumb);
      div.appendChild(meta);
      this.listEl.appendChild(div);
    });
    this.container.appendChild(this.listEl);
  }

  select(i) {
    this.items.forEach((it, idx) => it.active = idx === i);
    this.listEl.querySelectorAll('.hist-item').forEach((el, idx) => el.classList.toggle('active', idx === i));
    if (this.onSelect) this.onSelect(i);
  }
}

// ============================================================
// Canvas — 中栏画布
// ============================================================

class Canvas {
  constructor(container) {
    this.container = container;
    this.tool = 'las';
    this.lassoing = false;
    this.lx = 0;
    this.ly = 0;
    this.currentHistory = 0;
    this.render();
  }

  render() {
    this.container.className = 'col-mid';
    this.container.innerHTML = '';

    // 画布区域
    this.canvasArea = el('div', 'canvas-area');
    this.canvasImg = el('div', 'canvas-img', { id: 'canvas' });
    this.canvasImg.addEventListener('mousedown', e => this.startL(e));
    this.canvasImg.addEventListener('mousemove', e => this.moveL(e));
    this.canvasImg.addEventListener('mouseup', e => this.endL(e));

    // 占位提示
    this.cph = el('div', '', { id: 'cph', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center' });
    const phInner = el('div', '', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--color-text-tertiary)' });
    phInner.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".35"><rect x="3" y="3" width="30" height="30" rx="4"/><circle cx="12" cy="12" r="3.5"/><path d="M3 25l9-7 6 5 5-6 10 9"/></svg>`;
    phInner.appendChild(el('span', '', { text: '生成结果显示在这里', style: 'font-size:12px' }));
    this.cph.appendChild(phInner);
    this.canvasImg.appendChild(this.cph);

    // 套索元素
    this.lEl = el('div', 'lasso-ring', { id: 'lEl', style: 'display:none' });
    this.lLbl = el('div', 'lasso-lbl', { id: 'lLbl', text: '区域 prompt', style: 'display:none' });
    this.canvasImg.appendChild(this.lEl);
    this.canvasImg.appendChild(this.lLbl);

    // 保存的套索
    this.savedL = el('div', '', { id: 'savedL', style: 'display:none' });
    this.savedL.innerHTML = `<div style="position:absolute;left:54%;top:16%;width:32%;height:34%;border:2px dashed #7F77DD;border-radius:50%;pointer-events:none"></div><div style="position:absolute;left:56%;top:10%;background:#EEEDFE;color:#3C3489;font-size:10px;font-weight:500;padding:2px 7px;border-radius:10px;border:1px solid #AFA9EC;pointer-events:none">天空细节</div>`;
    this.canvasImg.appendChild(this.savedL);

    this.canvasArea.appendChild(this.canvasImg);
    this.container.appendChild(this.canvasArea);

    // 工具栏
    this.toolbar = el('div', 'canvas-toolbar');
    this.btnSel = el('button', 'tool-btn', { id: 'btnSel', onclick: () => this.setTool('sel') });
    const selIcon = iconSvg(13, 13, [
      svgEl('path', { d: 'M2 2l4 10 2-4 4-2L2 2z', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnSel.appendChild(selIcon);
    this.btnSel.appendChild(document.createTextNode('选择'));

    this.btnLas = el('button', 'tool-btn active', { id: 'btnLas', onclick: () => this.setTool('las') });
    const lasIcon = iconSvg(13, 13, [
      svgEl('circle', { cx: '7', cy: '7', r: '5', 'stroke-dasharray': '2 1.5', stroke: 'currentColor', 'stroke-width': '1.5' }),
      svgEl('path', { d: 'M7 12v1.5M11 7h1.5', stroke: 'currentColor', 'stroke-width': '1.5' })
    ]);
    this.btnLas.appendChild(lasIcon);
    this.btnLas.appendChild(document.createTextNode('画圈'));

    this.toolbar.appendChild(this.btnSel);
    this.toolbar.appendChild(this.btnLas);
    this.toolbar.appendChild(el('div', 'sflex'));
    this.tHint = el('span', '', { id: 'tHint', text: '拖拽画圈以标注区域', style: 'font-size:11px;color:var(--color-text-tertiary)' });
    this.toolbar.appendChild(this.tHint);
    this.container.appendChild(this.toolbar);
  }

  setTool(t) {
    this.tool = t;
    this.btnSel.classList.toggle('active', t === 'sel');
    this.btnLas.classList.toggle('active', t === 'las');
    this.tHint.textContent = t === 'las' ? '拖拽画圈以标注区域' : '点击选择区域';
    this.canvasImg.style.cursor = t === 'las' ? 'crosshair' : 'default';
  }

  startL(e) {
    if (this.tool !== 'las') return;
    this.lassoing = true;
    const r = this.canvasImg.getBoundingClientRect();
    this.lx = e.clientX - r.left;
    this.ly = e.clientY - r.top;
    this.lEl.style.display = 'block';
    this.lEl.style.left = this.lx + 'px';
    this.lEl.style.top = this.ly + 'px';
    this.lEl.style.width = '0';
    this.lEl.style.height = '0';
    this.lLbl.style.display = 'none';
  }

  moveL(e) {
    if (!this.lassoing) return;
    const r = this.canvasImg.getBoundingClientRect();
    const sz = Math.max(
      Math.abs(e.clientX - r.left - this.lx),
      Math.abs(e.clientY - r.top - this.ly)
    );
    this.lEl.style.left = (this.lx - sz / 2) + 'px';
    this.lEl.style.top = (this.ly - sz / 2) + 'px';
    this.lEl.style.width = sz + 'px';
    this.lEl.style.height = sz + 'px';
  }

  endL(_e) {
    if (!this.lassoing) return;
    this.lassoing = false;
    if (parseFloat(this.lEl.style.width) > 20) {
      this.lLbl.style.display = 'block';
      this.lLbl.style.left = (parseFloat(this.lEl.style.left) + parseFloat(this.lEl.style.width) / 2 - 30) + 'px';
      this.lLbl.style.top = (parseFloat(this.lEl.style.top) - 20) + 'px';
      if (this.onLassoDone) this.onLassoDone();
    } else {
      this.lEl.style.display = 'none';
    }
  }

  showHistory(i) {
    this.currentHistory = i;
    this.savedL.style.display = i === 0 ? 'block' : 'none';
    if (i !== 0) {
      this.lEl.style.display = 'none';
      this.lLbl.style.display = 'none';
    }
  }
}

// ============================================================
// ConfigPanel — 右栏配置面板
// ============================================================

class ConfigPanel {
  constructor(container) {
    this.container = container;
    this.flagDone = false;
    this.isCollapsed = false;
    this.generating = false;
    this.onGenerate = null;
    this.onSettingsOpen = null;
    this.render();
  }

  render() {
    this.container.className = 'col-right';
    this.container.innerHTML = '';

    // Header
    const header = el('div', 'col-header');
    header.appendChild(el('span', '', { text: '配置' }));
    this.flagBtn = el('button', 'flag-btn', {
      id: 'flagBtn',
      title: '标记完成',
      onclick: () => this.toggleFlag()
    });
    const flagIcon = iconSvg(13, 13, [
      svgEl('line', { x1: '2.5', y1: '1.5', x2: '2.5', y2: '11.5', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M2.5 1.5 L10.5 1.5 L8.5 4.5 L10.5 7.5 L2.5 7.5 Z', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linejoin': 'round', fill: 'none' })
    ]);
    this.flagBtn.appendChild(flagIcon);
    header.appendChild(this.flagBtn);
    this.container.appendChild(header);

    // Body
    this.rightBody = el('div', 'right-body', { id: 'rightBody' });
    this.secWrap = el('div', 'sections-wrap', { id: 'secWrap' });
    this.secList = el('div', '', { id: 'secList' });

    this.secList.appendChild(this.makeUploadSection());
    this.secList.appendChild(this.makePromptSection());
    this.secList.appendChild(this.makeParamsSection());

    this.secWrap.appendChild(this.secList);
    this.rightBody.appendChild(this.secWrap);
    this.container.appendChild(this.rightBody);

    // Footer
    this.footer = el('div', 'right-footer', { id: 'rightFooter' });
    this.genBtn = el('button', 'gen-btn', {
      id: 'genBtn',
      text: '重新生成',
      style: 'width:100%;margin-bottom:8px',
      onclick: () => this.doGen()
    });
    this.footer.appendChild(this.genBtn);

    const actions = el('div', '', { style: 'display:flex;gap:8px;margin-bottom:0' });
    actions.appendChild(el('button', 'tool-btn', { text: '保存版本', style: 'flex:1;justify-content:center;font-size:11px;padding:4px 0' }));
    actions.appendChild(el('button', 'tool-btn', { text: '导出图片', style: 'flex:1;justify-content:center;font-size:11px;padding:4px 0' }));
    this.footer.appendChild(actions);

    this.footer.appendChild(el('div', 'divider'));
    const srow = el('div', 'setting-row');
    const sbtn = el('button', 'setting-btn', {
      title: 'API 设置',
      onclick: () => { if (this.onSettingsOpen) this.onSettingsOpen(); }
    });
    const gearIcon = iconSvg(15, 15, [
      svgEl('circle', { cx: '8', cy: '8', r: '2.5', stroke: 'currentColor', 'stroke-width': '1.3' }),
      svgEl('path', { d: 'M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1', stroke: 'currentColor', 'stroke-width': '1.3' })
    ]);
    sbtn.appendChild(gearIcon);
    srow.appendChild(sbtn);
    this.footer.appendChild(srow);
    this.container.appendChild(this.footer);
  }

  makeUploadSection() {
    const sec = el('div', 'drag-section', { draggable: 'true', id: 'sec-upload' });
    sec.addEventListener('dragstart', e => this.dStart(e, 'sec-upload'));
    sec.addEventListener('dragover', e => this.dOver(e));
    sec.addEventListener('dragleave', e => this.dLeave(e));
    sec.addEventListener('drop', e => this.dDrop(e, 'sec-upload'));

    const hdr = el('div', 'drag-header');
    const handle = el('div', 'drag-handle');
    handle.innerHTML = '<span></span><span></span><span></span>';
    hdr.appendChild(handle);
    hdr.appendChild(el('span', 'drag-title', { text: '上传文件' }));
    sec.appendChild(hdr);

    const body = el('div', 'drag-body');
    this.uz = el('div', 'upload-zone', { id: 'uz', onclick: () => this.simUpload() });
    this.uz.appendChild(el('div', 'uzt', { text: '点击或拖入文件' }));
    this.uz.appendChild(el('div', 'uzt', { text: 'PNG · JPG · SVG · PDF', style: 'margin-top:2px;font-size:10px' }));
    body.appendChild(this.uz);

    this.uf = el('div', '', { id: 'uf', style: 'display:none;margin-top:6px' });
    const row = el('div', 'urow');
    row.innerHTML = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.2"><rect x="2" y="1" width="10" height="12" rx="1.5"/><path d="M4 5h6M4 7.5h4"/></svg>';
    row.appendChild(el('span', 'ufn', { text: 'brand_guide_v2.pdf' }));
    const rmBtn = el('button', 'rmbtn', { text: '×', onclick: () => this.remUp() });
    row.appendChild(rmBtn);
    this.uf.appendChild(row);
    body.appendChild(this.uf);

    sec.appendChild(body);
    return sec;
  }

  makePromptSection() {
    const sec = el('div', 'drag-section', { draggable: 'true', id: 'sec-prompt' });
    sec.addEventListener('dragstart', e => this.dStart(e, 'sec-prompt'));
    sec.addEventListener('dragover', e => this.dOver(e));
    sec.addEventListener('dragleave', e => this.dLeave(e));
    sec.addEventListener('drop', e => this.dDrop(e, 'sec-prompt'));

    const hdr = el('div', 'drag-header');
    const handle = el('div', 'drag-handle');
    handle.innerHTML = '<span></span><span></span><span></span>';
    hdr.appendChild(handle);
    hdr.appendChild(el('span', 'drag-title', { text: 'Prompt' }));
    hdr.appendChild(el('span', 'badge-p', { text: '全局' }));
    sec.appendChild(hdr);

    const body = el('div', 'drag-body');
    this.promptBox = el('textarea', 'prompt-box', {
      rows: '4',
      placeholder: '描述你想生成的图像...',
      text: '极简风格企业banner，深蓝配色，现代感，高清'
    });
    body.appendChild(this.promptBox);

    this.rBlock = el('div', 'region-block', { id: 'rBlock', style: 'display:none' });
    this.rBlock.appendChild(el('div', 'region-tag', { text: '◎ 区域 prompt · 天空细节' }));
    this.regionBox = el('textarea', 'region-box', { rows: '2', placeholder: '针对画圈区域的补充描述...', text: '云层更厚实，金色夕阳光晕' });
    this.rBlock.appendChild(this.regionBox);
    body.appendChild(this.rBlock);

    sec.appendChild(body);
    return sec;
  }

  makeParamsSection() {
    const sec = el('div', 'drag-section', { draggable: 'true', id: 'sec-params' });
    sec.addEventListener('dragstart', e => this.dStart(e, 'sec-params'));
    sec.addEventListener('dragover', e => this.dOver(e));
    sec.addEventListener('dragleave', e => this.dLeave(e));
    sec.addEventListener('drop', e => this.dDrop(e, 'sec-params'));

    const hdr = el('div', 'drag-header');
    const handle = el('div', 'drag-handle');
    handle.innerHTML = '<span></span><span></span><span></span>';
    hdr.appendChild(handle);
    hdr.appendChild(el('span', 'drag-title', { text: '参数' }));
    sec.appendChild(hdr);

    const body = el('div', 'drag-body');

    // 尺寸
    const r1 = el('div', 'param-row');
    r1.appendChild(el('span', 'param-name', { text: '尺寸' }));
    const selSize = el('select', 'ps');
    selSize.innerHTML = '<option>1024 × 512</option><option selected>1024 × 1024</option><option>512 × 1024</option>';
    r1.appendChild(selSize);
    body.appendChild(r1);

    // 风格强度
    const r2 = el('div', 'param-row');
    r2.appendChild(el('span', 'param-name', { text: '风格强度' }));
    const rangeStyle = el('input', '', { type: 'range', min: '0', max: '100', value: '72', step: '1' });
    const valStyle = el('span', 'param-val', { text: '72' });
    rangeStyle.addEventListener('input', () => valStyle.textContent = rangeStyle.value);
    r2.appendChild(rangeStyle);
    r2.appendChild(valStyle);
    body.appendChild(r2);

    // 随机种子
    const r3 = el('div', 'param-row', { style: 'margin-bottom:0' });
    r3.appendChild(el('span', 'param-name', { text: '随机种子' }));
    const rangeSeed = el('input', '', { type: 'range', min: '0', max: '999', value: '42', step: '1' });
    const valSeed = el('span', 'param-val', { text: '42' });
    rangeSeed.addEventListener('input', () => valSeed.textContent = rangeSeed.value);
    r3.appendChild(rangeSeed);
    r3.appendChild(valSeed);
    body.appendChild(r3);

    sec.appendChild(body);
    return sec;
  }

  // --- 方法 ---
  toggleFlag() {
    this.flagDone = !this.flagDone;
    this.flagBtn.classList.toggle('done', this.flagDone);
  }

  simUpload() {
    this.uz.style.display = 'none';
    this.uf.style.display = 'block';
  }

  remUp() {
    this.uz.style.display = 'block';
    this.uf.style.display = 'none';
  }

  showRegionBlock() {
    this.rBlock.style.display = 'block';
  }

  hideRegionBlock() {
    this.rBlock.style.display = 'none';
  }

  collapse() {
    const bodyH = this.rightBody.getBoundingClientRect().height;
    const wrapH = this.secWrap.getBoundingClientRect().height;
    const offset = Math.max(0, wrapH - bodyH + 8);
    this.secWrap.style.setProperty('--collapse-offset', offset + 'px');
    this.secWrap.classList.add('collapsed');
    this.isCollapsed = true;
  }

  expand() {
    this.secWrap.classList.remove('collapsed');
    this.isCollapsed = false;
  }

  doGen() {
    if (this.generating) return;
    this.generating = true;
    this.genBtn.textContent = '生成中...';
    this.genBtn.disabled = true;

    this.collapse();

    if (this.onGenerate) this.onGenerate();
  }

  onGenComplete() {
    const self = this;
    setTimeout(() => {
      self.expand();
      self.genBtn.textContent = '重新生成';
      self.genBtn.disabled = false;
      self.generating = false;
      self.flagBtn.classList.add('done');
      self.flagDone = true;
    }, 2200);
  }

  // --- 拖拽排序 ---
  dStart(e, id) {
    this.dragSrc = id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.classList.add('dragging');
    }, 0);
  }

  dOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.add('drag-over');
  }

  dLeave(e) {
    const s = e.currentTarget.closest('.drag-section');
    if (s) s.classList.remove('drag-over');
  }

  dDrop(e, tid) {
    e.preventDefault();
    this.secList.querySelectorAll('.drag-section').forEach(s => s.classList.remove('drag-over', 'dragging'));
    if (this.dragSrc && this.dragSrc !== tid) {
      const src = document.getElementById(this.dragSrc);
      const tgt = document.getElementById(tid);
      if (src && tgt) {
        const si = Array.from(this.secList.children).indexOf(src);
        const ti = Array.from(this.secList.children).indexOf(tgt);
        if (si < ti) this.secList.insertBefore(src, tgt.nextSibling);
        else this.secList.insertBefore(src, tgt);
      }
    }
    this.dragSrc = null;
  }
}

// ============================================================
// SettingsModal — 设置弹窗
// ============================================================

class SettingsModal {
  constructor(container) {
    this.overlay = container;
    this.render();
  }

  render() {
    this.overlay.className = 'overlay hidden';
    this.overlay.innerHTML = '';
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

    this.modal = el('div', 'settings-modal');
    this.modal.addEventListener('click', e => e.stopPropagation());

    // Header
    const hdr = el('div', 'sm-header');
    hdr.appendChild(el('span', 'sm-title', { text: '模型 API 设置' }));
    const closeBtn = el('button', 'sm-close', { text: '×', onclick: () => this.close() });
    hdr.appendChild(closeBtn);
    this.modal.appendChild(hdr);

    // Body
    const body = el('div', 'sm-body');

    // 提供商
    const f1 = el('div', 'sm-field');
    f1.appendChild(el('div', 'sm-label', { text: 'API 提供商' }));
    this.provSelect = el('select', 'sm-input');
    this.provSelect.innerHTML = '<option>OpenAI</option><option>Replicate</option><option>Stability AI</option><option>自定义端点</option>';
    this.provSelect.addEventListener('change', () => this.provChange());
    f1.appendChild(this.provSelect);
    body.appendChild(f1);

    // API Key
    const f2 = el('div', 'sm-field');
    f2.appendChild(el('div', 'sm-label', { text: 'API Key' }));
    f2.appendChild(el('input', 'sm-input', { type: 'password', placeholder: 'sk-...', value: 'sk-••••••••••••••••••••' }));
    const status = el('span', 'sm-status ok');
    status.appendChild(el('span', 'sm-dot'));
    status.appendChild(document.createTextNode('已连接'));
    f2.appendChild(status);
    body.appendChild(f2);

    // 模型
    const f3 = el('div', 'sm-field');
    f3.appendChild(el('div', 'sm-label', { text: '模型' }));
    this.modelSel = el('select', 'sm-input', { id: 'modelSel' });
    this.modelSel.innerHTML = '<option>gpt-image-1</option><option selected>dall-e-3</option><option>dall-e-2</option>';
    f3.appendChild(this.modelSel);
    this.modelHint = el('div', 'sm-hint', { text: '当前：dall-e-3 · 支持 1024×1024, 1024×1792' });
    f3.appendChild(this.modelHint);
    body.appendChild(f3);

    // 自定义端点
    this.epField = el('div', 'sm-field', { id: 'epField', style: 'display:none' });
    this.epField.appendChild(el('div', 'sm-label', { text: '自定义端点 URL' }));
    this.epField.appendChild(el('input', 'sm-input', { type: 'text', placeholder: 'https://api.example.com/v1' }));
    body.appendChild(this.epField);

    // 并发
    const f5 = el('div', 'sm-field', { style: 'margin-bottom:0' });
    f5.appendChild(el('div', 'sm-label', { text: '最大并发请求' }));
    const wrapR = el('div', '', { style: 'display:flex;align-items:center;gap:10px' });
    const rangeCC = el('input', '', { type: 'range', min: '1', max: '8', value: '3', step: '1', style: 'flex:1' });
    this.cvSpan = el('span', '', { text: '3', style: 'font-size:13px;font-weight:500;color:var(--color-text-primary);min-width:16px', id: 'cv' });
    rangeCC.addEventListener('input', () => this.cvSpan.textContent = rangeCC.value);
    wrapR.appendChild(rangeCC);
    wrapR.appendChild(this.cvSpan);
    f5.appendChild(wrapR);
    body.appendChild(f5);

    this.modal.appendChild(body);

    // Footer
    const footer = el('div', 'sm-footer');
    footer.appendChild(el('button', 'sm-btn-sec', { text: '取消', onclick: () => this.close() }));
    footer.appendChild(el('button', 'sm-btn-pri', { text: '保存', onclick: () => this.close() }));
    this.modal.appendChild(footer);

    this.overlay.appendChild(this.modal);
  }

  open() {
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  provChange() {
    const v = this.provSelect.value;
    this.epField.style.display = v === '自定义端点' ? 'block' : 'none';
    if (v === 'OpenAI') {
      this.modelSel.innerHTML = '<option>gpt-image-1</option><option selected>dall-e-3</option><option>dall-e-2</option>';
      this.modelHint.textContent = '当前：dall-e-3 · 支持 1024×1024, 1024×1792';
    } else if (v === 'Replicate') {
      this.modelSel.innerHTML = '<option selected>stability-ai/sdxl</option><option>black-forest-labs/flux</option>';
      this.modelHint.textContent = '当前：stability-ai/sdxl';
    } else if (v === 'Stability AI') {
      this.modelSel.innerHTML = '<option selected>stable-diffusion-xl-1024</option><option>sd3-medium</option>';
      this.modelHint.textContent = '当前：stable-diffusion-xl-1024';
    } else {
      this.modelSel.innerHTML = '<option>custom-model</option>';
      this.modelHint.textContent = '自定义模型 ID';
    }
  }
}

// ============================================================
// App — 根协调器
// ============================================================

class App {
  constructor(mount) {
    this.el = mount;
    this.el.className = 'app';
    this.el.innerHTML = '';

    // 左栏
    this.history = new HistoryPanel(el('div'));
    this.el.appendChild(this.history.container);

    // 中栏
    this.canvas = new Canvas(el('div'));
    this.el.appendChild(this.canvas.container);

    // 右栏
    this.config = new ConfigPanel(el('div'));
    this.el.appendChild(this.config.container);

    // 设置
    this.settings = new SettingsModal(el('div'));
    this.el.appendChild(this.settings.overlay);

    // 连线
    this.history.onSelect = (i) => {
      this.canvas.showHistory(i);
      if (i === 0) {
        this.config.showRegionBlock();
      } else {
        this.config.hideRegionBlock();
      }
    };

    this.canvas.onLassoDone = () => {
      this.config.showRegionBlock();
    };

    this.config.onGenerate = () => {
      this.config.onGenComplete();
    };

    this.config.onSettingsOpen = () => {
      this.settings.open();
    };
  }
}

// 全局入口（由 main.js 调用）
window.StrokeApp = App;
