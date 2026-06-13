const registry = new Map();

function getViewport(el) {
  return el.getBoundingClientRect().height || el.clientHeight || 0;
}

export function renderVirtualList(container, items, renderItem, options = {}) {
  const itemHeight = options.itemHeight || 92;
  const overscan = options.overscan || 4;
  const key = options.key || container.id || 'virtual';
  const viewport = getViewport(container);
  const scrollTop = container.scrollTop || 0;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewport / itemHeight) + overscan * 2;
  const end = Math.min(items.length, start + visibleCount);
  const top = start * itemHeight;
  const bottom = Math.max(0, (items.length - end) * itemHeight);
  container.dataset.vkey = key;
  container.innerHTML = `
    <div style="height:${top}px"></div>
    ${items.slice(start, end).map((item, i) => renderItem(item, start + i)).join('')}
    <div style="height:${bottom}px"></div>
  `;
  registry.set(key, { items, renderItem, options, container });
}

export function bindVirtualList(container, items, renderItem, options = {}) {
  const key = options.key || container.id || 'virtual';
  if (!container.dataset.vbound) {
    container.dataset.vbound = '1';
    container.addEventListener('scroll', () => {
      const reg = registry.get(key);
      if (reg) renderVirtualList(reg.container, reg.items, reg.renderItem, reg.options);
    }, { passive: true });
  }
  renderVirtualList(container, items, renderItem, { ...options, key });
}

export function refreshVirtualList(key) {
  const reg = registry.get(key);
  if (!reg) return;
  renderVirtualList(reg.container, reg.items, reg.renderItem, reg.options);
}
