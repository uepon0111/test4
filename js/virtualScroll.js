// js/virtualScroll.js

export class VirtualScroll {
  constructor(containerId, contentId) {
    this.container  = document.getElementById(containerId);
    this.content    = document.getElementById(contentId);

    this.items     = [];
    this.renderFn  = null;
    this.cols      = 2;
    this.rowH      = 340;   // 行の高さ推定値（カード高+gap）
    this.gap       = 16;
    this.buffer    = 3;     // バッファ行数
    this._prevRange = null;
    this._rafId    = null;
    this._measured = false;

    this.container.addEventListener('scroll', this._onScroll.bind(this), { passive: true });

    this._ro = new ResizeObserver(() => {
      this._measured = false;
      this._scheduledRender();
    });
    this._ro.observe(this.container);
  }

  /** アイテムをセットして再描画 */
  setItems(items, renderFn) {
    this.items    = items;
    this.renderFn = renderFn;
    this._prevRange = null;
    this._measured  = false;
    this.container.scrollTop = 0;
    this._scheduledRender();
  }

  _onScroll() { this._scheduledRender(); }

  _scheduledRender() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._render();
    });
  }

  /** グリッドの列数を CSS から読み取る */
  _getCols() {
    const cs = getComputedStyle(this.content);
    const tmpl = cs.gridTemplateColumns;
    if (!tmpl || tmpl === 'none') return 2;
    const parts = tmpl.trim().split(/\s+/);
    return Math.max(1, parts.length);
  }

  /** 行の高さを最初のカードから計測 */
  _measureRowH() {
    const card = this.content.querySelector('.result-card');
    if (!card) return;
    const h = card.offsetHeight;
    if (h > 0) {
      this.rowH   = h + this.gap;
      this._measured = true;
    }
  }

  _render() {
    if (!this.items.length) {
      this.content.innerHTML = '';
      this.content.style.paddingTop    = '0';
      this.content.style.paddingBottom = '0';
      return;
    }

    // 列数更新
    this.cols = this._getCols();

    const totalRows = Math.ceil(this.items.length / this.cols);
    const scrollTop = this.container.scrollTop;
    const viewH     = this.container.clientHeight;

    const startRow = Math.max(0, Math.floor(scrollTop / this.rowH) - this.buffer);
    const endRow   = Math.min(totalRows, Math.ceil((scrollTop + viewH) / this.rowH) + this.buffer);

    const rangeKey = `${startRow}-${endRow}-${this.items.length}-${this.cols}`;
    if (rangeKey === this._prevRange) return;
    this._prevRange = rangeKey;

    const startIdx = startRow * this.cols;
    const endIdx   = Math.min(this.items.length, endRow * this.cols);

    const padTop    = startRow * this.rowH;
    const padBottom = Math.max(0, (totalRows - endRow)) * this.rowH;

    this.content.style.paddingTop    = `${padTop}px`;
    this.content.style.paddingBottom = `${padBottom}px`;

    // DOM更新（差分更新でなくリビルド）
    this.content.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = startIdx; i < endIdx; i++) {
      frag.appendChild(this.renderFn(this.items[i]));
    }
    this.content.appendChild(frag);

    // 行高さを計測してズレを補正
    if (!this._measured) {
      this._measureRowH();
      if (this._measured) {
        // 計測後に再描画
        this._prevRange = null;
        this._render();
      }
    }
  }

  /** スクロール位置を先頭に戻す */
  scrollToTop() {
    this.container.scrollTop = 0;
    this._prevRange = null;
  }

  /** 強制再描画 */
  refresh() {
    this._prevRange = null;
    this._render();
  }

  destroy() {
    this._ro.disconnect();
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}
