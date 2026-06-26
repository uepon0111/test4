'use strict';

/* ========== VIRTUAL SCROLL ========== */
class VirtualScroll {
  /**
   * @param {HTMLElement} container - scrollable wrapper
   * @param {Object} opts
   *   itemHeight  {number}   px height of each card row (all same height)
   *   columns     {number}   cards per row (1 or 2+ for grid)
   *   buffer      {number}   extra rows to render above/below viewport
   *   renderItem  {function} (item, index) => HTMLElement
   */
  constructor(container, opts = {}) {
    this.container  = container;
    this.itemHeight = opts.itemHeight || 110;
    this.columns    = opts.columns    || 1;
    this.buffer     = opts.buffer     || CONFIG.VS_BUFFER;
    this.renderItem = opts.renderItem || (() => document.createElement('div'));

    this.items      = [];
    this._pool      = {}; // index -> el
    this._rafId     = null;
    this._scrollTop = 0;
    this._viewH     = 0;
    this._firstRow  = 0;
    this._lastRow   = -1;

    /* Clear any existing content, then create inner wrapper */
    container.innerHTML = '';
    this.inner = document.createElement('div');
    this.inner.style.cssText = 'position:relative;width:100%;';
    container.appendChild(this.inner);

    /* Bind */
    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    container.addEventListener('scroll', this._onScroll, { passive: true });
    this._ro = new ResizeObserver(entries => {
      this._viewH = entries[0].contentRect.height;
      this._render();
    });
    this._ro.observe(container);
    this._viewH = container.clientHeight;
  }

  /* ---- Public API ---- */

  setItems(items) {
    this.items = items;
    this._updateHeight();
    this._clearPool();
    this._render();
  }

  setColumns(n) {
    if (this.columns === n) return;
    this.columns = n;
    this._updateHeight();
    this._clearPool();
    this._render();
  }

  setItemHeight(h) {
    if (this.itemHeight === h) return;
    this.itemHeight = h;
    this._updateHeight();
    this._clearPool();
    this._render();
  }

  scrollToTop() {
    this.container.scrollTop = 0;
  }

  /* Force re-render one item (after edit) */
  updateItem(id) {
    const idx = this.items.findIndex(it => it.id === id);
    if (idx < 0) return;
    const row = Math.floor(idx / this.columns);
    /* Remove and re-render the row(s) containing this item */
    for (let c = 0; c < this.columns; c++) {
      const i = row * this.columns + c;
      if (this._pool[i]) { this._pool[i].remove(); delete this._pool[i]; }
    }
    this._render();
  }

  destroy() {
    this.container.removeEventListener('scroll', this._onScroll);
    this._ro.disconnect();
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  /* ---- Private ---- */

  _updateHeight() {
    const rows = Math.ceil(this.items.length / this.columns);
    this.inner.style.height = `${rows * this.itemHeight}px`;
  }

  _clearPool() {
    for (const el of Object.values(this._pool)) { if (el.parentNode) el.parentNode.removeChild(el); }
    this._pool = {};
  }

  _onScroll() {
    this._scrollTop = this.container.scrollTop;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => this._render());
  }

  _onResize() {}

  _render() {
    if (!this.items.length) { this._clearPool(); return; }

    const st   = this._scrollTop;
    const vh   = this._viewH || this.container.clientHeight;
    const rows = Math.ceil(this.items.length / this.columns);

    const firstRow = Math.max(0, Math.floor(st / this.itemHeight) - this.buffer);
    const lastRow  = Math.min(rows - 1,
      Math.ceil((st + vh) / this.itemHeight) + this.buffer);

    /* Remove rows out of range */
    for (const key of Object.keys(this._pool)) {
      const row = Math.floor(Number(key) / this.columns);
      if (row < firstRow || row > lastRow) {
        if (this._pool[key].parentNode) this._pool[key].parentNode.removeChild(this._pool[key]);
        delete this._pool[key];
      }
    }

    /* Add rows in range */
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = 0; col < this.columns; col++) {
        const idx = row * this.columns + col;
        if (idx >= this.items.length) break;
        if (this._pool[idx]) continue;

        const item = this.items[idx];
        const el   = this.renderItem(item, idx);

        /* Position items in a grid layout using absolute positioning */
        const colW   = 100 / this.columns;
        const gap    = this.columns > 1 ? 8 : 0; // px gap between columns
        const left   = col === 0 ? 0 : (col * colW);
        const width  = colW;
        const padL   = col === 0 ? 0       : gap / 2;
        const padR   = col === this.columns - 1 ? 0 : gap / 2;
        el.style.cssText += [
          'position:absolute',
          `top:${row * this.itemHeight}px`,
          `left:calc(${left}% + ${padL}px)`,
          `width:calc(${width}% - ${padL + padR}px)`,
          `height:${this.itemHeight - 8}px`,
          'box-sizing:border-box',
        ].join(';') + ';';

        this.inner.appendChild(el);
        this._pool[idx] = el;
      }
    }

    this._firstRow = firstRow;
    this._lastRow  = lastRow;
  }
}
