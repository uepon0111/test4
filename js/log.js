import { icon } from './icons.js';
import { formatDate, formatDateTime, formatDuration } from './utils.js';

function periodRange(period) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (period === 'today') start.setHours(0,0,0,0);
  else if (period === 'week') start.setDate(start.getDate() - 6), start.setHours(0,0,0,0);
  else if (period === 'month') start.setMonth(start.getMonth() - 1), start.setHours(0,0,0,0);
  else if (period === 'year') start.setFullYear(start.getFullYear() - 1), start.setHours(0,0,0,0);
  else if (period === 'all') start = new Date(0);
  return { start, end };
}

function filterLogs(logs, period) {
  const { start, end } = periodRange(period);
  return logs.filter((log) => {
    const t = new Date(log.playedAt || 0);
    return t >= start && t <= end;
  });
}

function aggregateLogs(state, logs) {
  const tracks = new Map(state.data.tracks.map((t) => [t.id, t]));
  const artists = new Map(state.data.artists.map((a) => [a.id, a]));
  const tags = new Map(state.data.tags.map((t) => [t.id, t]));
  const trackCounts = new Map();
  const artistCounts = new Map();
  const tagCounts = new Map();
  let totalMs = 0;
  for (const log of logs) {
    totalMs += log.playMs || 0;
    const track = tracks.get(log.trackId);
    if (!track) continue;
    trackCounts.set(track.id, (trackCounts.get(track.id) || 0) + 1);
    for (const aid of track.artistIds || []) artistCounts.set(aid, (artistCounts.get(aid) || 0) + 1);
    for (const tid of track.tagIds || []) tagCounts.set(tid, (tagCounts.get(tid) || 0) + 1);
  }
  const topTracks = [...trackCounts.entries()].map(([id, count]) => ({ id, count, track: tracks.get(id) })).filter((x) => x.track).sort((a, b) => b.count - a.count).slice(0, 8);
  const topArtists = [...artistCounts.entries()].map(([id, count]) => ({ id, count, artist: artists.get(id) })).filter((x) => x.artist).sort((a, b) => b.count - a.count).slice(0, 8);
  const topTags = [...tagCounts.entries()].map(([id, count]) => ({ id, count, tag: tags.get(id) })).filter((x) => x.tag).sort((a, b) => b.count - a.count).slice(0, 8);
  return { totalMs, trackCounts, artistCounts, tagCounts, topTracks, topArtists, topTags };
}

function barSvg(items, labelFn, valueFn) {
  const width = 780;
  const height = Math.max(240, items.length * 32 + 40);
  const max = Math.max(1, ...items.map(valueFn));
  const bars = items.map((item, index) => {
    const y = 26 + index * 32;
    const w = Math.round((valueFn(item) / max) * 560);
    const label = labelFn(item).slice(0, 30);
    return `
      <text x="12" y="${y + 14}" font-size="12" fill="#5c6f8b">${escapeXml(label)}</text>
      <rect x="180" y="${y}" width="${w}" height="18" rx="9" fill="#2f6fed" fill-opacity="0.2" />
      <rect x="180" y="${y}" width="${Math.max(20, w)}" height="18" rx="9" fill="#2f6fed" fill-opacity="0.8" />
      <text x="748" y="${y + 14}" font-size="12" text-anchor="end" fill="#0f1f36">${valueFn(item)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${bars}</svg>`;
}

function escapeXml(str = '') { return String(str).replace(/[<>&"]/g, (s) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[s])); }

function anniversaryItems(state, period) {
  const now = new Date();
  const tracks = state.data.tracks.filter((t) => t.releasedAt);
  const items = [];
  for (const track of tracks) {
    const rd = new Date(track.releasedAt);
    if (Number.isNaN(rd.getTime())) continue;
    const thisYear = new Date(now.getFullYear(), rd.getMonth(), rd.getDate());
    const years = now.getFullYear() - rd.getFullYear();
    const diffDays = Math.floor((thisYear - now) / 86400000);
    const inPeriod = period === 'today' ? diffDays === 0
      : period === 'week' ? diffDays >= 0 && diffDays <= 6
      : period === 'month' ? diffDays >= 0 && diffDays <= 30
      : period === 'year' ? diffDays >= 0 && diffDays <= 365
      : true;
    if (inPeriod && years >= 1) items.push({ track, years, date: thisYear, diffDays });
  }
  return items.sort((a, b) => a.diffDays - b.diffDays).slice(0, 8);
}

function topCard(title, items, render) {
  return `<div class="card card-pad chart-box"><div class="toolbar"><strong>${title}</strong><span class="small muted">上位</span></div>${render(items)}</div>`;
}

export function renderLogScreen(state) {
  const period = state.filters.log.period || 'month';
  const logs = filterLogs(state.data.playLogs || [], period);
  const ag = aggregateLogs(state, logs);
  const annivs = anniversaryItems(state, period);
  const now = new Date();
  const stats = [
    { label: '再生回数', value: logs.length },
    { label: '再生時間', value: formatDuration((ag.totalMs || 0) / 1000) },
    { label: '曲数', value: new Set(logs.map((l) => l.trackId)).size },
  ];
  const periodButtons = [
    ['today', '本日'], ['week', '今週'], ['month', '今月'], ['year', '今年'], ['all', '全期間'],
  ];
  return `
    <div class="screen-body log-screen">
      <div class="toolbar card card-pad">
        <strong>ログの集計</strong>
        <div class="toolbar-row">
          ${periodButtons.map(([v, label]) => `<button class="seg-btn ${period === v ? 'is-active' : ''}" data-action="log-period" data-value="${v}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="log-layout">
        <div class="log-col">
          <div class="log-stats">${stats.map((s) => `<div class="stat-card"><div class="small muted">${s.label}</div><div class="value">${s.value}</div></div>`).join('')}</div>
          ${topCard('よく再生した曲', ag.topTracks, (items) => barSvg(items, (it) => it.track.title || '無題', (it) => it.count))}
          ${topCard('よく再生したアーティスト', ag.topArtists, (items) => barSvg(items, (it) => it.artist.name || '不明', (it) => it.count))}
          ${topCard('よく使われたタグ', ag.topTags, (items) => barSvg(items, (it) => it.tag.name || 'タグ', (it) => it.count))}
        </div>
        <div class="log-main">
          <div class="card card-pad">
            <div class="toolbar"><strong>周年情報</strong><span class="small muted">投稿日ベース</span></div>
            <div class="anniversary-list">${annivs.length ? annivs.map((a) => `
              <div class="anniv-card">
                <img class="thumb" src="${a.track.thumbnail}" alt="" />
                <div class="stack">
                  <strong>${a.track.title || '無題'}</strong>
                  <span class="small muted">${a.years}周年 · ${formatDate(a.track.releasedAt)}</span>
                </div>
                <span class="badge">${a.diffDays === 0 ? '今日' : `${a.diffDays}日後`}</span>
              </div>`).join('') : '<div class="muted">この期間の周年情報はありません。</div>'}</div>
          </div>
          <div class="card card-pad timeline">
            <div class="toolbar"><strong>再生の履歴</strong><span class="small muted">最新順</span></div>
            ${logs.slice().sort((a,b)=> (b.playedAt||0)-(a.playedAt||0)).slice(0, 18).map((log) => {
              const track = state.data.tracks.find((t) => t.id === log.trackId);
              return `
                <div class="timeline-item">
                  <img class="thumb" src="${track?.thumbnail || ''}" alt="" />
                  <div class="stack">
                    <strong class="truncate">${track?.title || '削除済みの曲'}</strong>
                    <span class="small muted">${track ? (track.artistIds || []).length ? 'アーティスト情報あり' : 'アーティスト未設定' : '削除済み'}</span>
                  </div>
                  <span class="small muted">${formatDateTime(log.playedAt)}</span>
                </div>`;
            }).join('') || '<div class="muted">再生履歴がありません。</div>'}
          </div>
        </div>
      </div>
    </div>`;
}
