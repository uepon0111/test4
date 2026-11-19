/* js/06-geometry.js — 当たり判定・列車位置・擬似3Dの座標変換 */
/* ---- 当たり判定 ---- */
function dseg(px,py,e){const dx=e[2]-e[0],dy=e[3]-e[1];let t=((px-e[0])*dx+(py-e[1])*dy)/(dx*dx+dy*dy);t=Math.max(0,Math.min(1,t));return[Math.hypot(px-e[0]-t*dx,py-e[1]-t*dy),t]}
function nearEdge(w,r){let best=null;if(!(r>0)||!isFinite(w.x+w.y))return null;const N=Math.ceil(r)+1,ox=Math.round(w.x),oy=Math.round(w.y);
  for(let x=ox-N;x<=ox+N;x++)for(let y=oy-N;y<=oy+N;y++)for(let i=0;i<4;i++){const q=DIRS[i],k=norm(x,y,x+q[0],y+q[1]).join(),e=edges.get(k);if(!e)continue;const[d,t]=dseg(w.x,w.y,e);if(d<r){r=d;best={k,e,t}}}
  return best}
const tpos=t=>{const f=t.t/Math.hypot(t.bx-t.ax,t.by-t.ay);return{x:t.ax+(t.bx-t.ax)*f,y:t.ay+(t.by-t.ay)*f}};
let yaw=-.6,tilt=.66,k3=0,v3=false;   /* 擬似3D: 回転角 / 傾き(縦の圧縮率) / 切替の進行 0〜1 */
const lin=()=>{const a=yaw*k3;return{s:Math.sin(a),c:Math.cos(a),y:1+(tilt-1)*k3}};
const s2w=(x,y)=>{const{s,c,y:q}=lin(),u=x-W/2,v=(y-H/2)/q;return{x:(c*u+s*v)/cam.z+cam.x,y:(c*v-s*u)/cam.z+cam.y}};

