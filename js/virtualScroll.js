/**
 * VirtualGridScroll
 *
 * Renders only the rows that are visible (plus a buffer) in a scrollable
 * container. Uses topSpacer / bottomSpacer divs outside the grid for height.
 *
 * Layout in container:
 *   <topSpacer>
 *   <gridEl>  ← only visible cards
 *   <bottomSpacer>
 *
 * All cards must be the same height (CARD_H + gap = rowHeight).
 */
export class VirtualGridScroll {
  /**
   * @param {{
   *   container: HTMLElement,  scroll container (overflow-y: auto)
   *   gridEl: HTMLElement,     the CSS grid element
   *   renderItem: (rec) => HTMLElement,
   *   cardHeight?: number,     px (default 280)
   *   gap?: number,            px (default 16)
   *   buffer?: number,         extra rows (default 3)
   * }} opts
   */
  constructor({ container, gridEl, renderItem, cardHeight = 280, gap = 16, buffer = 3 }) {
    this.container  = container;
    this.gridEl     = gridEl;
    this.renderItem = renderItem;
    this.CARD_H     = cardHeight;
    this.GAP        = gap;
    this.BUFFER     = buffer;
    this.items      = [];
    this.cols       = 1;

    this.topSpacer    = document.createElement('div');
    this.bottomSpacer = document.createElement('div');
    this.topSpacer.setAttribute('aria-hidden', 'true');
    this.bottomSpacer.setAttribute('aria-hidden', 'true');
    container.insertBefore(this.topSpacer, gridEl);
    container.appendChild(this.bottomSpacer);

    this._onScroll = () => { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._render(); this._raf = 0; }); };
    this._ro       = new ResizeObserver(() => { this._updateCols(); this._render(); });

    container.addEventListener('scroll', this._onScroll, { passive: true });
    this._ro.observe(container);
    this._ro.observe(gridEl);
  }

  /** Replace the items list and re-render. */
  update(items) {
    this.items = items;
    this._updateCols();
    this.container.scrollTop = 0; // reset scroll on data change
    this._render();
  }

  /** Force a re-render without resetting scroll. */
  refresh() {
    this._updateCols();
    this._render();
  }

  destroy() {
    this.container.removeEventListener('scroll', this._onScroll);
    this._ro.disconnect();
    this.topSpacer.remove();
    this.bottomSpacer.remove();
  }

  _updateCols() {
    const cs   = window.getComputedStyle(this.gridEl);
    const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    this.cols  = cols || 1;
  }

  _render() {
    const { items, cols, CARD_H, GAP, BUFFER } = this;
    const rowH       = CARD_H + GAP;
    const totalRows  = Math.ceil(items.length / cols);
    const scrollTop  = this.container.scrollTop;
    const viewH      = this.container.clientHeight;

    const startRow   = Math.max(0, Math.floor(scrollTop / rowH) - BUFFER);
    const endRow     = Math.min(totalRows - 1, Math.ceil((scrollTop + viewH) / rowH) + BUFFER - 1);
    const startIdx   = startRow * cols;
    const endIdx     = Math.min(items.length, (endRow + 1) * cols);

    this.topSpacer.style.height    = (startRow * rowH) + 'px';
    const tailRows                 = Math.max(0, totalRows - endRow - 1);
    this.bottomSpacer.style.height = (tailRows * rowH) + 'px';

    // Only rebuild DOM if needed
    const needed = items.slice(startIdx, endIdx);
    const current = Array.from(this.gridEl.children);

    // Fast path: same records
    const needIds = needed.map(r => r.id).join(',');
    const currIds = current.map(el => el.dataset.id ?? '').join(',');
    if (needIds === currIds) return;

    const frag = document.createDocumentFragment();
    for (const item of needed) frag.appendChild(this.renderItem(item));
    this.gridEl.replaceChildren(frag);
  }
}
