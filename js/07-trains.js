/* js/07-trains.js — 列車の命名・追加・削除 */
/* ---- 列車 ---- */
/* 列車名: 親は「列車N」、子は「親の名前-M」(列車1-1, 列車1-2…)。番号は消しても詰め直さず、空いた最小の番号を使う */
const nextNo=()=>{const u=new Set(trains.filter(t=>t.pid==null).map(t=>t.no));let i=1;while(u.has(i))i++;return i},
  nextCi=p=>{const u=new Set(trains.filter(t=>t.pid===p.id).map(t=>t.ci));let i=1;while(u.has(i))i++;return i},
  parentOf=t=>t.pid!=null?t._p||trains.find(q=>q.id===t.pid)||null:null,
  tname=t=>{if(t.nm)return t.nm;const p=parentOf(t);return p&&p!==t?tname(p)+'-'+(t.ci||1):'列車'+(t.no||t.id)};
function addTrainAt(n,r){const e=n.e;snap();   /* n=置く位置 (辺と辺上の位置) / r=辺とは逆向きに走らせるか */
  const t={id:++tid,no:nextNo(),ax:r?e[2]:e[0],ay:r?e[3]:e[1],bx:r?e[0]:e[2],by:r?e[1]:e[3],t:(r?1-n.t:n.t)*Math.hypot(e[2]-e[0],e[3]-e[1]),cf:{s:{},b:{},d:{}},dw:30,iv:0};
  trains.push(t);save();selectTrain(t,false)}
function addTrain(w){const n=nearEdge(w,hit(.6,26));if(n)addTrainAt(n,false)}
const rmTrain=t=>{snap();trains.splice(trains.indexOf(t),1);save()};

/* ---- 編成: 1両=1マス。nc=両数 (複製した列車は親と同じ編成) ---- */
const cars=t=>{const p=parentOf(t)||t;return Math.max(1,Math.min(CMAX,Math.round(p.nc)||2))};
function along(t,s){   /* 列車の中心から、経路に沿って s マス先(+)/後ろ(-)の位置と向き。先は go() で辿り、後ろは通ってきた辺の履歴 (t.h) を使う */
  let e=[t.ax,t.ay,t.bx,t.by],u=t.t+s,L=Math.hypot(e[2]-e[0],e[3]-e[1]),g=0;
  while(u>L&&g++<24){u-=L;e=go(t.cf,...e).nx;L=Math.hypot(e[2]-e[0],e[3]-e[1])}
  const h=t.h||[];let j=0;
  while(u<0&&j<h.length){e=h[j++];L=Math.hypot(e[2]-e[0],e[3]-e[1]);u+=L}
  return{x:e[0]+(e[2]-e[0])*u/L,y:e[1]+(e[3]-e[1])*u/L,a:Math.atan2(e[3]-e[1],e[2]-e[0])}}
const carAt=(t,i)=>along(t,i+.5-cars(t)/2);   /* i=0 が最後尾、cars(t)-1 が先頭 */
