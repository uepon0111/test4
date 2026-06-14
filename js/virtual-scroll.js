'use strict';
/* ============================================================
   virtual-scroll.js – 仮想スクロール
   ============================================================ */

/* ---- リスト型仮想スクロール ---- */
class VirtualScroll {
  constructor(container, opts = {}) {
    this.container  = container;
    this.itemHeight = opts.itemHeight || 72;
    this.buffer     = opts.buffer     || 5;
    this.renderItem = opts.renderItem || (() => document.createElement('div'));
    this.onEmpty    = opts.onEmpty    || null;

    this._items     = [];
    this._rendered  = new Map(); // index -> element
    this._scrollTop = 0;
    this._height    = 0;

    this._inner = document.createElement('div');
    this._inner.style.cssText = 'position:relative;width:100%;';
    this.container.appendChild(this._inner);

    this.container.style.overflow = 'auto';
    this.container.style.position = 'relative';

    this._onScroll = Utils.throttle(() => this._handleScroll(), 16);
    this.container.addEventListener('scroll', this._onScroll);

    this._ro = new ResizeObserver(() => this._handleResize());
    this._ro.observe(this.container);
  }

  setItems(items) {
    this._items = items;
    this._rendered.clear();
    this._inner.innerHTML = '';
    this._inner.style.height = (items.length * this.itemHeight) + 'px';
    this._height = this.container.clientHeight;

    if (items.length === 0 && this.onEmpty) {
      this._inner.style.height = '';
      this._inner.appendChild(this.onEmpty());
    } else {
      this._render();
    }
  }

  scrollToIndex(idx) {
    this.container.scrollTop = idx * this.itemHeight;
  }

  _handleScroll() {
    this._scrollTop = this.container.scrollTop;
    this._render();
  }

  _handleResize() {
    this._height = this.container.clientHeight;
    this._render();
  }

  _render() {
    // height が 0 なら clientHeight を再取得
    if (this._height === 0) this._height = this.container.clientHeight;
    const { itemHeight, buffer, _items, _height, _scrollTop } = this;
    if (!_items.length || _height === 0) return;

    const firstVis = Math.floor(_scrollTop / itemHeight);
    const lastVis  = Math.ceil((_scrollTop + _height) / itemHeight);
    const start    = Math.max(0, firstVis - buffer);
    const end      = Math.min(_items.length - 1, lastVis + buffer);

    // 不要な要素を削除
    for (const [i, el] of this._rendered) {
      if (i < start || i > end) { el.remove(); this._rendered.delete(i); }
    }

    // 新しい要素を追加
    for (let i = start; i <= end; i++) {
      if (this._rendered.has(i)) continue;
      const el = this.renderItem(this._items[i], i);
      el.style.cssText += `position:absolute;top:${i*itemHeight}px;left:0;right:0;height:${itemHeight}px;`;
      this._inner.appendChild(el);
      this._rendered.set(i, el);
    }
  }

  refresh() {
    this._rendered.clear();
    this._inner.innerHTML = '';
    if (this._items.length === 0 && this.onEmpty) {
      this._inner.style.height = '';
      this._inner.appendChild(this.onEmpty());
    } else {
      this._inner.style.height = (this._items.length * this.itemHeight) + 'px';
      this._render();
    }
  }

  destroy() {
    this.container.removeEventListener('scroll', this._onScroll);
    this._ro.disconnect();
  }
}

/* ---- グリッド型仮想スクロール ---- */
class GridVirtualScroll {
  constructor(container, opts = {}) {
    this.container  = container;
    this.itemHeight = opts.itemHeight || 220;
    this.cols       = opts.cols       || 4;
    this.buffer     = opts.buffer     || 2;
    this.renderItem = opts.renderItem || (() => document.createElement('div'));
    this.onEmpty    = opts.onEmpty    || null;
    this.gap        = opts.gap        || 12;

    this._items    = [];
    this._rows     = [];
    this._rendered = new Map();
    this._scrollTop = 0;
    this._height   = 0;

    this._inner = document.createElement('div');
    this._inner.style.cssText = 'position:relative;width:100%;';
    this.container.appendChild(this._inner);

    this.container.style.overflow = 'auto';
    this.container.style.position = 'relative';

    this._onScroll = Utils.throttle(() => this._handleScroll(), 16);
    this.container.addEventListener('scroll', this._onScroll);

    this._ro = new ResizeObserver(() => this._handleResize());
    this._ro.observe(this.container);
  }

  setCols(cols) {
    this.cols = cols;
    this.refresh();
  }

  setItems(items) {
    this._items = items;
    this._buildRows();
    this._rendered.clear();
    this._inner.innerHTML = '';
    this._height = this.container.clientHeight;

    if (items.length === 0 && this.onEmpty) {
      this._inner.style.height = '';
      this._inner.appendChild(this.onEmpty());
    } else {
      const rowCount = Math.ceil(items.length / this.cols);
      this._inner.style.height = (rowCount * (this.itemHeight + this.gap)) + 'px';
      this._render();
    }
  }

  _buildRows() {
    this._rows = [];
    for (let i = 0; i < this._items.length; i += this.cols) {
      this._rows.push(this._items.slice(i, i + this.cols));
    }
  }

  _handleScroll() {
    this._scrollTop = this.container.scrollTop;
    this._render();
  }

  _handleResize() {
    this._height = this.container.clientHeight;
    this._render();
  }

  _render() {
    if (this._height === 0) this._height = this.container.clientHeight;
    const { itemHeight, buffer, _rows, _height, _scrollTop, gap } = this;
    if (!_rows.length || _height === 0) return;
    const rowH = itemHeight + gap;
    const firstVis = Math.floor(_scrollTop / rowH);
    const lastVis  = Math.ceil((_scrollTop + _height) / rowH);
    const start    = Math.max(0, firstVis - buffer);
    const end      = Math.min(_rows.length - 1, lastVis + buffer);

    for (const [i, el] of this._rendered) {
      if (i < start || i > end) { el.remove(); this._rendered.delete(i); }
    }

    for (let rowIdx = start; rowIdx <= end; rowIdx++) {
      if (this._rendered.has(rowIdx)) continue;
      const rowEl = document.createElement('div');
      rowEl.className = 'vgrid-row';
      rowEl.style.cssText = `position:absolute;top:${rowIdx*rowH}px;left:0;right:0;height:${itemHeight}px;display:grid;grid-template-columns:repeat(${this.cols},1fr);gap:${gap}px;`;
      const row = _rows[rowIdx];
      const globalStart = rowIdx * this.cols;
      row.forEach((item, colIdx) => {
        const cell = this.renderItem(item, globalStart + colIdx);
        rowEl.appendChild(cell);
      });
      // 空セル埋め
      for (let c = row.length; c < this.cols; c++) {
        const empty = document.createElement('div');
        empty.className = 'vgrid-empty';
        rowEl.appendChild(empty);
      }
      this._inner.appendChild(rowEl);
      this._rendered.set(rowIdx, rowEl);
    }
  }

  refresh() {
    this._buildRows();
    this._rendered.clear();
    this._inner.innerHTML = '';
    if (this._items.length === 0 && this.onEmpty) {
      this._inner.style.height = '';
      this._inner.appendChild(this.onEmpty());
    } else {
      const rowCount = Math.ceil(this._items.length / this.cols);
      this._inner.style.height = (rowCount * (this.itemHeight + this.gap)) + 'px';
      this._height = this.container.clientHeight;
      this._render();
    }
  }

  destroy() {
    this.container.removeEventListener('scroll', this._onScroll);
    this._ro.disconnect();
  }
}
