'use strict';
/* ============================================================
   log-ui.js – ログ画面 UI
   ============================================================ */
const LogUI = (() => {
  let charts = {};
  let curPeriod = 'month';

  function init() {
    renderLogScreen();
    Store.subscribe('playLogs', () => { if (document.body.dataset.screen === 'log') refresh(); });
  }

  function renderLogScreen() {
    const area = document.getElementById('log-area');
    if (!area) return;
    area.innerHTML = `
      <div class="log-header">
        <h2 class="log-title">再生ログ</h2>
        <div class="period-selector" id="period-selector">
          ${['today','week','month','year','all'].map((p,i)=>`<button class="period-btn ${p===curPeriod?'active':''}" data-period="${p}">${['今日','今週','今月','今年','全期間'][i]}</button>`).join('')}
        </div>
      </div>
      <div class="log-scroll">
        <div class="log-summary" id="log-summary"></div>
        <div class="log-anniversaries" id="log-anniversaries"></div>
        <div class="log-charts-grid" id="log-charts-grid"></div>
      </div>`;
    area.querySelectorAll('.period-btn').forEach(btn => {
      btn.onclick = () => {
        curPeriod = btn.dataset.period;
        area.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',b===btn));
        refresh();
      };
    });
    refresh();
  }

  function refresh() {
    const stats = computeStats(curPeriod);
    renderSummary(stats);
    renderAnniversaries();
    renderCharts(stats);
  }

  /* ======================== 統計計算 ======================== */
  function getPeriodStart(period) {
    const now = Date.now();
    const d = new Date(); d.setHours(0,0,0,0);
    return { today: d.getTime(), week: now-7*86400000, month: now-30*86400000, year: now-365*86400000, all: 0 }[period];
  }

  function computeStats(period) {
    const logs = Store.get('playLogs');
    const start = getPeriodStart(period);
    const filtered = logs.filter(l => l.startedAt >= start);
    const totalSecs = filtered.reduce((s,l)=>s+l.duration, 0);
    const trackCounts={}, trackTime={};
    filtered.forEach(l => { trackCounts[l.trackId]=(trackCounts[l.trackId]||0)+1; trackTime[l.trackId]=(trackTime[l.trackId]||0)+l.duration; });
    const topTracks = Object.entries(trackCounts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,cnt])=>({ track:Store.getTrack(id), count:cnt, time:trackTime[id]||0 })).filter(x=>x.track);
    const artistTime={};
    filtered.forEach(l=>{ const t=Store.getTrack(l.trackId); if(!t) return; (t.artistIds||[]).forEach(aid=>{ artistTime[aid]=(artistTime[aid]||0)+l.duration; }); });
    const topArtists = Object.entries(artistTime).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,time])=>({ artist:Store.getArtist(id), time })).filter(x=>x.artist);
    const tagTime={};
    filtered.forEach(l=>{ const t=Store.getTrack(l.trackId); if(!t) return; (t.tagIds||[]).forEach(tid=>{ tagTime[tid]=(tagTime[tid]||0)+l.duration; }); });
    const topTags = Object.entries(tagTime).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,time])=>({ tag:Store.getTag(id), time })).filter(x=>x.tag);
    const dailyMap={};
    filtered.forEach(l=>{ const key=getDailyKey(l.startedAt,period); dailyMap[key]=(dailyMap[key]||0)+l.duration; });
    return { totalSecs, totalPlays:filtered.length, uniqueTracks:Object.keys(trackCounts).length, topTracks, topArtists, topTags, dailyMap };
  }

  function getDailyKey(ts, period) {
    const d = new Date(ts);
    if (period==='today') return `${d.getHours()}:00`;
    if (period==='year' || period==='all') return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  function formatListeningTime(secs) {
    if (secs < 60) return `${Math.round(secs)}秒`;
    const min = Math.floor(secs/60);
    if (min < 60) return `${min}分`;
    const hr = Math.floor(min/60), m=min%60;
    return m>0 ? `${hr}時間${m}分` : `${hr}時間`;
  }

  /* ======================== サマリー ======================== */
  function renderSummary(stats) {
    const el = document.getElementById('log-summary');
    if (!el) return;
    if (!stats.totalPlays) {
      el.innerHTML = `<div class="log-empty"><i data-lucide="bar-chart-2"></i><p>この期間の再生記録がありません</p><p class="hint">曲を再生するとここに記録されます</p></div>`;
      Utils.refreshIcons(el);
      return;
    }
    el.innerHTML = `
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-icon"><i data-lucide="clock"></i></div>
          <div class="summary-val">${formatListeningTime(stats.totalSecs)}</div>
          <div class="summary-label">総再生時間</div>
        </div>
        <div class="summary-card">
          <div class="summary-icon"><i data-lucide="play-circle"></i></div>
          <div class="summary-val">${stats.totalPlays}</div>
          <div class="summary-label">再生回数</div>
        </div>
        <div class="summary-card">
          <div class="summary-icon"><i data-lucide="music"></i></div>
          <div class="summary-val">${stats.uniqueTracks}</div>
          <div class="summary-label">ユニーク曲数</div>
        </div>
      </div>`;
    Utils.refreshIcons(el);
  }

  /* ======================== 周年情報 ======================== */
  function getAnniversaries() {
    const now = new Date(); now.setHours(0,0,0,0);
    const results = [];
    for (const track of Store.get('tracks')) {
      if (!track.releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(track.releaseDate)) continue;
      const parts = track.releaseDate.split('-');
      const releaseYear=parseInt(parts[0]), month=parseInt(parts[1])-1, day=parseInt(parts[2]);
      if (now.getFullYear() <= releaseYear) continue;
      for (let yr = now.getFullYear(); yr <= now.getFullYear()+1; yr++) {
        const anniv = new Date(yr, month, day);
        const diffDays = Math.round((anniv - now) / 86400000);
        if (diffDays >= -3 && diffDays <= 30) {
          results.push({ track, annivDate:anniv, yearsAgo:yr-releaseYear, diffDays });
          break;
        }
      }
    }
    return results.sort((a,b)=>a.diffDays-b.diffDays);
  }

  function renderAnniversaries() {
    const el = document.getElementById('log-anniversaries');
    if (!el) return;
    const list = getAnniversaries();
    if (!list.length) { el.innerHTML=''; return; }
    el.innerHTML = `
      <div class="section-header"><i data-lucide="cake"></i><h3>もうすぐ・今日の周年</h3></div>
      <div class="anniversary-list">${list.map(item=>{
        const track=item.track;
        const diffLabel = item.diffDays<0?`${-item.diffDays}日前`:item.diffDays===0?'今日！':`あと${item.diffDays}日`;
        const isToday = item.diffDays===0;
        return `<div class="anniversary-card ${isToday?'today':''}">
          <div class="anniv-thumb-wrap"><div class="anniv-thumb-ph" id="ath-${track.id}"><i data-lucide="music"></i></div></div>
          <div class="anniv-info">
            <div class="anniv-title">${Utils.escapeHtml(track.title)}</div>
            <div class="anniv-years">${item.yearsAgo}周年</div>
            <div class="anniv-date">${Utils.formatReleaseDate(track.releaseDate)}</div>
          </div>
          <div class="anniv-badge ${isToday?'badge-today':'badge-soon'}">${diffLabel}</div>
        </div>`;
      }).join('')}</div>`;
    Utils.refreshIcons(el);
    list.forEach(item => {
      DB.getThumbnail(item.track.id).then(url => {
        const wrap = el.querySelector(`#ath-${item.track.id}`);
        if (wrap && url) { wrap.innerHTML=`<img src="${url}" class="anniv-thumb-img">`; }
      });
    });
  }

  /* ======================== チャート ======================== */
  function renderCharts(stats) {
    const grid = document.getElementById('log-charts-grid');
    if (!grid) return;
    if (!stats.totalPlays) { grid.innerHTML=''; return; }
    grid.innerHTML = `
      <div class="chart-card chart-wide"><h4 class="chart-title"><i data-lucide="music"></i>よく聴いた曲 TOP${Math.min(8,stats.topTracks.length)}</h4><div class="chart-body"><canvas id="chart-tracks"></canvas></div></div>
      <div class="chart-card"><h4 class="chart-title"><i data-lucide="user"></i>よく聴いたアーティスト</h4><div class="chart-body chart-doughnut"><canvas id="chart-artists"></canvas></div></div>
      <div class="chart-card"><h4 class="chart-title"><i data-lucide="tag"></i>よく聴いたタグ</h4><div class="chart-body chart-doughnut"><canvas id="chart-tags"></canvas></div></div>
      <div class="chart-card chart-wide"><h4 class="chart-title"><i data-lucide="activity"></i>日別再生時間</h4><div class="chart-body chart-line"><canvas id="chart-daily"></canvas></div></div>`;
    Utils.refreshIcons(grid);
    Object.values(charts).forEach(c=>{ try{c.destroy();}catch(e){} }); charts={};
    setTimeout(() => {
      drawTracksChart(stats.topTracks);
      drawArtistsChart(stats.topArtists);
      drawTagsChart(stats.topTags);
      drawDailyChart(stats.dailyMap);
    }, 50);
  }

  const CHART_COLORS = ['#6C63FF','#FF6B9D','#4ECDC4','#FFE66D','#FF9F43','#54A0FF','#5F27CD','#00D2D3','#FF6B6B','#48DBFB'];

  function drawTracksChart(topTracks) {
    const canvas = document.getElementById('chart-tracks');
    if (!canvas || !topTracks.length) return;
    charts.tracks = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topTracks.map(x=>x.track.title.length>15?x.track.title.slice(0,15)+'…':x.track.title),
        datasets: [{ label:'再生回数', data:topTracks.map(x=>x.count), backgroundColor:CHART_COLORS.slice(0,topTracks.length), borderRadius:6, borderSkipped:false }]
      },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(0,0,0,0.05)'}, ticks:{color:'#6B6A7E'}}, y:{grid:{display:false}, ticks:{color:'#1C1B2E',font:{size:12}}} } }
    });
  }

  function drawArtistsChart(topArtists) {
    const canvas = document.getElementById('chart-artists');
    if (!canvas || !topArtists.length) { if(canvas) canvas.closest('.chart-card').innerHTML='<div class="chart-empty"><i data-lucide="user"></i><p>データなし</p></div>'; return; }
    charts.artists = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: topArtists.map(x=>x.artist.name),
        datasets: [{ data:topArtists.map(x=>Math.round(x.time/60)), backgroundColor:CHART_COLORS, hoverOffset:8, borderWidth:2, borderColor:'#fff' }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#1C1B2E', padding:12, font:{size:11} } } } }
    });
  }

  function drawTagsChart(topTags) {
    const canvas = document.getElementById('chart-tags');
    if (!canvas || !topTags.length) { if(canvas) canvas.closest('.chart-card').innerHTML='<div class="chart-empty"><i data-lucide="tag"></i><p>データなし</p></div>'; return; }
    charts.tags = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: topTags.map(x=>x.tag.name),
        datasets: [{ data:topTags.map(x=>Math.round(x.time/60)), backgroundColor:topTags.map(x=>x.tag.color), hoverOffset:8, borderWidth:2, borderColor:'#fff' }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#1C1B2E', padding:12, font:{size:11} } } } }
    });
  }

  function drawDailyChart(dailyMap) {
    const canvas = document.getElementById('chart-daily');
    if (!canvas || !Object.keys(dailyMap).length) return;
    const labels = Object.keys(dailyMap).sort();
    const data   = labels.map(k=>+(dailyMap[k]/60).toFixed(1));
    charts.daily = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label:'再生時間(分)', data, backgroundColor:'rgba(108,99,255,0.5)', borderColor:'#6C63FF', borderWidth:2, borderRadius:4, fill:true }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(0,0,0,0.05)'}, ticks:{color:'#6B6A7E',maxRotation:45}}, y:{grid:{color:'rgba(0,0,0,0.05)'}, ticks:{color:'#6B6A7E'}, title:{display:true,text:'分',color:'#6B6A7E'}} } }
    });
  }

  return { init, refresh };
})();
