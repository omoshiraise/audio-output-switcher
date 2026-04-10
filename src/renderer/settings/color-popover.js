'use strict';

(function attachColorPopover(globalObject) {
  class ColorPopover {
    constructor(options = {}) {
      this.root = options.root || document.body;
      this.getText = typeof options.getText === 'function'
        ? options.getText
        : (key => key);
      this.normalizeColor = typeof options.normalizeColor === 'function'
        ? options.normalizeColor
        : (value => String(value || '').trim());
      this.presetColors = options.presetColors || [
        '#e575ff', '#ff8a80', '#ffab40', '#ffd54f', '#dce775', '#81c784', '#4dd0e1', '#64b5f6',
        '#9575cd', '#f48fb1', '#ef9a9a', '#a1887f', '#90a4ae', '#ffffff', '#bdbdbd', '#000000'
      ];
      this.popover = null;
      this.onSelect = null;
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
    }

    open({ anchorEvent, currentColor, onSelect }) {
      this.close();

      this.onSelect = typeof onSelect === 'function' ? onSelect : null;
      const normalizedCurrent = this.normalizeColor(currentColor) || '#e575ff';

      const popover = document.createElement('div');
      popover.className = 'color-popover';
      popover.innerHTML = `
        <div class="color-grid">
          ${this.presetColors.map(color => `<button type="button" class="color-cell" data-color="${color}" style="background:${color};"></button>`).join('')}
        </div>
        <div class="color-custom-row">
          <input type="text" class="color-custom-input" value="${normalizedCurrent}" maxlength="7" placeholder="#RRGGBB">
          <button type="button" class="color-apply-btn">${this.getText('colorApply')}</button>
        </div>
      `;

      this.root.appendChild(popover);
      this.popover = popover;

      const rect = popover.getBoundingClientRect();
      const rawLeft = anchorEvent && typeof anchorEvent.clientX === 'number'
        ? anchorEvent.clientX
        : Math.round(window.innerWidth / 2);
      const rawTop = anchorEvent && typeof anchorEvent.clientY === 'number'
        ? anchorEvent.clientY
        : Math.round(window.innerHeight / 2);
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, rawLeft));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, rawTop));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;

      popover.querySelectorAll('.color-cell').forEach(button => {
        button.addEventListener('click', () => {
          if (this.onSelect) {
            this.onSelect(button.dataset.color);
          }
          this.close();
        });
      });

      const customInput = popover.querySelector('.color-custom-input');
      const applyButton = popover.querySelector('.color-apply-btn');
      const applyCustomColor = () => {
        const typed = this.normalizeColor(customInput.value);
        if (!typed) return;
        if (this.onSelect) {
          this.onSelect(typed);
        }
        this.close();
      };

      applyButton.addEventListener('click', applyCustomColor);
      customInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyCustomColor();
        }
      });

      // Delay outside-click registration so the opening click does not immediately close it.
      setTimeout(() => {
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
      }, 0);
    }

    handleDocumentPointerDown(event) {
      if (!this.popover) return;
      if (this.popover.contains(event.target)) return;
      this.close();
    }

    close() {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
      if (this.popover && this.popover.parentNode) {
        this.popover.parentNode.removeChild(this.popover);
      }
      this.popover = null;
      this.onSelect = null;
    }
  }

  globalObject.ColorPopover = ColorPopover;
})(window);
