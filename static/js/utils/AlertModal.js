import { el } from './DOM.js';

export function showAlertModal(title, message, okText = '确定') {
  const existing = document.getElementById('alertModalOverlay');
  if (existing) existing.remove();

  const overlay = el('div', 'overlay', { id: 'alertModalOverlay', style: 'z-index:1005' });
  overlay.classList.remove('hidden');

  const modal = el('div', 'settings-modal', { style: 'max-width:380px' });
  modal.addEventListener('click', e => e.stopPropagation());

  const hdr = el('div', 'sm-header');
  hdr.appendChild(el('span', 'sm-title', { text: title }));
  overlay.addEventListener('click', () => overlay.remove());
  modal.appendChild(hdr);

  const body = el('div', 'sm-body');
  body.appendChild(el('p', 'alert-modal-msg', { text: message, style: 'white-space:pre-line;line-height:1.6;color:var(--color-text-primary);' }));
  modal.appendChild(body);

  const footer = el('div', 'sm-footer');
  const okBtn = el('button', 'sm-btn-pri', {
    text: okText,
    onclick: () => overlay.remove()
  });
  footer.appendChild(okBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  okBtn.focus();
}
