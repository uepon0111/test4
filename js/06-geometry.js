/* js/06-geometry.js — 当たり判定・列車位置・擬似3Dの座標変換 */
/* ---- 当たり判定 ---- */
function dseg(px,py,e){const dx=e[2]-e[0],dy=e[3]-e[1];let t=((px-e[0])*dx+(py-e[1])*dy)/(dx*dx+dy*dy);t=Math.max(0,Math.min(1,t));return[Math.hypot(px-e[0]-t*dx,py-e[1]-t*dy),t]}
function nearEdge(w,r){let best=null;if(!(r>0)||!isFinite(w.x+w.y))return null;const N=Math.ceil(r)+1,ox=Math.round(w.x),oy=Math.round(w.y);
  for(let x=ox-N;x<=ox+N;x++)for(let y=oy-N;y<=oy+N;y++)for(let i=0;i<4;i++){const q=DIRS[i],k=norm(x,y,x+q[0],y+q[1]).join(),e=edges.get(k);if(!e)continue;const[d,t]=dseg(w.x,w.y,e);if(d<r){r=d;best={k,e,t}}}
  return best}
const tpos=t=>{const f=t.t/Math.hypot(t.bx-t.ax,t.by-t.ay);return{x:t.ax+(t.bx-t.ax)*f,y:t.ay+(t.by-t.ay)*f}};
/* ---- 編成: 列車の位置(tpos)=編成の中心。1両=20m=CPマスずつ線路に沿って並べる (後ろは通った線路の履歴 t.h、前は進路 go() をたどり、線路の端は直線で延長) ---- */
const along=(P,s)=>{for(let i=1;i<P.length;i++){const l=Math.hypot(P[i].x-P[i-1].x,P[i].y-P[i-1].y);if(s<=l||i===P.length-1){const f=s/l;return{x:P[i-1].x+(P[i].x-P[i-1].x)*f,y:P[i-1].y+(P[i].y-P[i-1].y)*f}}s-=l}};
function cars(t){   /* 各両の中心・向き・車体の線 [{x,y,a,p}] (最後が先頭の両。p=車体の後端→前端の折れ線で、カーブでは線路に沿って曲げて描く) */
  const n=t.nc>0?t.nc:1,LM=n*CP/2+CP,c=tpos(t),fw=[c,{x:t.bx,y:t.by}],bw=[c,{x:t.ax,y:t.ay}];
  let e=[t.ax,t.ay,t.bx,t.by],s=Math.hypot(e[2]-e[0],e[3]-e[1])-t.t;
  for(let g=0;s<LM&&g<LM+3;g++){const r=go(t.cf,...e);e=r.turn?[e[2],e[3],2*e[2]-e[0],2*e[3]-e[1]]:r.nx;fw.push({x:e[2],y:e[3]});s+=Math.hypot(e[2]-e[0],e[3]-e[1])}
  let q={x:t.ax,y:t.ay},dr=Math.max(0,dirIdx(t.bx-t.ax,t.by-t.ay)),h=t.h||[];s=t.t;
  for(let g=0;s<LM&&g<LM+3;g++){const o=h[g];let p=null;
    if(o&&o[2]===q.x&&o[3]===q.y&&has(...o))p={x:o[0],y:o[1]};
    else{for(const j of[0,1,7]){const d=DIRS[(dr+j)%8];if(has(q.x-d[0],q.y-d[1],q.x,q.y)){p={x:q.x-d[0],y:q.y-d[1]};break}}
      if(!p)p={x:q.x-DIRS[dr][0],y:q.y-DIRS[dr][1]}}
    dr=Math.max(0,dirIdx(q.x-p.x,q.y-p.y));bw.push(p);s+=Math.hypot(q.x-p.x,q.y-p.y);q=p}
  const at=d=>along(d>=0?fw:bw,Math.abs(d)),cu=P=>{let s=0;return P.map((p,i)=>i?(s+=Math.hypot(p.x-P[i-1].x,p.y-P[i-1].y)):0).slice(1)},bk=[...cu(fw),...cu(bw).map(v=>-v)];   /* bk=線路の各点までの距離 (前が+ 後ろが-) */
  return Array.from({length:n},(_,i)=>{const m=(i-(n-1)/2)*CP,d0=m-SZ.cl/2,d1=m+SZ.cl/2,p=[d0,...bk.filter(v=>v>d0+1e-6&&v<d1-1e-6).sort((a,b)=>a-b),d1].map(at),A=p[p.length-1],B=p[0];return{x:(A.x+B.x)/2,y:(A.y+B.y)/2,a:Math.atan2(A.y-B.y,A.x-B.x),p}})}
const thit=(t,w)=>{const r=SZ.trw/2+hit(.3,18);return cars(t).some(q=>q.p.some((s,i)=>i&&dseg(w.x,w.y,[q.p[i-1].x,q.p[i-1].y,s.x,s.y])[0]<r))};   /* 車体(20m)のどこをクリックしても当たる */
let yaw=-.6,tilt=.66,k3=0,v3=false;   /* 擬似3D: 回転角 / 傾き(縦の圧縮率) / 切替の進行 0〜1 */
const lin=()=>{const a=yaw*k3;return{s:Math.sin(a),c:Math.cos(a),y:1+(tilt-1)*k3}};
const s2w=(x,y)=>{const{s,c,y:q}=lin(),u=x-W/2,v=(y-H/2)/q;return{x:(c*u+s*v)/cam.z+cam.x,y:(c*v-s*u)/cam.z+cam.y}};

