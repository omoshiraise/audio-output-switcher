'use strict';

(function attachIconPopover(globalObject) {
  class IconPopover {
    constructor(options = {}) {
      this.root = options.root || document.body;
      this.getText = typeof options.getText === 'function'
        ? options.getText
        : (key => key);
      this.popover = null;
      this.onSelect = null;
      this.iconChoices = [];
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
    }

    open({ anchorEvent, iconChoices, currentIconName, onSelect }) {
      this.close();

      this.onSelect = typeof onSelect === 'function' ? onSelect : null;
      this.iconChoices = Array.isArray(iconChoices) ? iconChoices : [];
      const selectedIconName = String(currentIconName || '').trim();

      const popover = document.createElement('div');
      popover.className = 'icon-popover';
      popover.innerHTML = `
        <div class="icon-grid">
          ${this.iconChoices.map(choice => `
            <button
              type="button"
              class="icon-cell${choice.id === selectedIconName ? ' is-selected' : ''}"
              data-icon-name="${choice.id}"
              title="${choice.id}"
            >
              <img src="${choice.iconUrl}" alt="${choice.id}">
            </button>
          `).join('')}
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

      popover.querySelectorAll('.icon-cell').forEach(button => {
        button.addEventListener('click', () => {
          if (this.onSelect) {
            this.onSelect(button.dataset.iconName);
          }
          this.close();
        });
      });

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
      this.iconChoices = [];
    }
  }

  globalObject.IconPopover = IconPopover;
})(window);
