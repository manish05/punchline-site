// PUNCHLINE frontend logic
let DATA = null, VIEW = [], sortKey = 'score', searchResults = null, category = 'oneliner';
const $ = s => document.querySelector(s);
const grid = $('#grid');

const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M'
  : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : (n||0).toString();
const hms = s => { s=Math.round(s); const m=Math.floor(s/60), x=s%60; return m+':'+String(x).padStart(2,'0'); };

async function boot(){
  try{
    DATA = await (await fetch('jokes.json',{cache:'no-store'})).json();
  }catch(e){ grid.innerHTML = '<div class="empty">Couldn’t load data. Run the pipeline first.</div>'; return; }
  renderStats(); renderMarquee(); renderHow();
  // observe scroll reveals (create BEFORE first render)
  io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }),{threshold:.08, rootMargin:'0px 0px -40px 0px'});
  apply();
  wireControls();
}
let io;

function countUp(el, to){
  const dur=1100, t0=performance.now();
  const step=now=>{ const p=Math.min(1,(now-t0)/dur); el.textContent=fmt(Math.round(to*(1-Math.pow(1-p,3)))); if(p<1)requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderStats(){
  const s=DATA.stats;
  const items=[['jokes',s.total_jokes],['videos analyzed',s.total_videos],['views mined',s.total_views],['comedians',s.comedians],['repeated bits',s.repeated_jokes]];
  $('#stats').innerHTML = items.map(([l],i)=>`<div class="stat"><div class="num" data-i="${i}">0</div><div class="lbl">${l}</div></div>`).join('');
  document.querySelectorAll('.stat .num').forEach((el,i)=>countUp(el, items[i][1]));
}
function renderMarquee(){
  const top = DATA.jokes.slice(0,12).map(j=>`<span><b>#${j.rank}</b> ${j.text.slice(0,60)}${j.text.length>60?'…':''}</span>`).join('');
  $('#marquee').innerHTML = top+top;
}
function renderHow(){
  const w=DATA.weights, defs=[
    ['💥 Punch', w.punch, 'How hard viewers rewatched the punchline (YouTube Most-Replayed percentile).','var(--magenta)'],
    ['👀 Reach', w.reach, 'How many people saw it — log of the source video’s views.','var(--cyan)'],
    ['🔁 Repeat', w.repeat, 'How many different comedians tell a near-identical bit (semantic match).','var(--orange)'],
    ['❤️ Engage', w.engage, 'Like-to-view ratio of the source video.','var(--lime)'],
  ];
  $('#how-grid').innerHTML = defs.map(([t,wt,d,c])=>`<div style="border:1px solid var(--line);border-radius:14px;padding:16px">
    <div style="font-family:'Space Grotesk';font-weight:700;font-size:17px">${t}</div>
    <div style="font-family:'Space Mono';color:${c};font-size:13px;margin:4px 0 8px">weight ${Math.round(wt*100)}%</div>
    <div style="color:var(--muted);font-size:13px">${d}</div></div>`).join('');
}

function wireControls(){
  $('#sorts').addEventListener('click',e=>{
    const b=e.target.closest('.chip'); if(!b)return;
    document.querySelectorAll('#sorts .chip').forEach(c=>c.classList.remove('on'));
    b.classList.add('on'); sortKey=b.dataset.sort; apply();
  });
  const cats=$('#cats');
  if(cats) cats.addEventListener('click',e=>{
    const b=e.target.closest('.chip'); if(!b)return;
    document.querySelectorAll('#cats .chip').forEach(c=>c.classList.remove('on'));
    b.classList.add('on'); category=b.dataset.cat; apply();
  });
  let t; const q=$('#q');
  q.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>doSearch(q.value.trim()),260); });
}

async function doSearch(query){
  if(!query){ searchResults=null; $('#searchmode').textContent='semantic'; apply(); return; }
  try{
    const r = await fetch('/api/search?q='+encodeURIComponent(query));
    if(!r.ok) throw 0;
    const d = await r.json();
    const byId=new Map(DATA.jokes.map(j=>[j.id,j]));
    searchResults = d.results.map(x=>({...byId.get(x.id), similarity:x.similarity})).filter(j=>j.id);
    $('#searchmode').textContent='semantic ✓';
  }catch(e){
    // fallback: client-side text search
    const ql=query.toLowerCase();
    searchResults = DATA.jokes.filter(j=>j.text.toLowerCase().includes(ql));
    $('#searchmode').textContent='text';
  }
  apply();
}

function apply(){
  let list = (searchResults ? searchResults.slice() : DATA.jokes.slice())
             .filter(j => (j.category||'oneliner') === category);
  if(!searchResults || sortKey!=='score'){
    const key = sortKey==='score'?'score': null;
    list.sort((a,b)=> sortKey==='score'? b.score-a.score
      : sortKey==='punch'? (b.breakdown.punch??-1)-(a.breakdown.punch??-1)
      : sortKey==='repeat'? (b.repeated_count-a.repeated_count)||(b.score-a.score)
      : sortKey==='reach'? b.breakdown.reach-a.breakdown.reach : 0);
  }
  VIEW = list.slice(0, 120);
  render();
}

function render(){
  $('#empty').style.display = VIEW.length? 'none':'block';
  grid.innerHTML = '';
  VIEW.forEach((j,idx)=>{
    const v = DATA.videos_map[j.video_id]||{};
    const el = document.createElement('article');
    el.className = 'card' + (idx===0 && sortKey==='score' && !searchResults ? ' top1':'');
    el.style.transitionDelay = Math.min(idx*40,400)+'ms';
    const rep = j.repeated_count>1 ? `<span class="tag rep" title="this joke is told across ${j.repeated_count} different videos">🔁 told in ${j.repeated_count} videos</span>`:'';
    const sim = j.similarity!=null ? `<span class="tag">match ${Math.round(j.similarity*100)}%</span>`:'';
    const fun = j.funny ? `<span class="tag fun" title="editor funniness rating">😂 ${j.funny}/5</span>`:'';
    const body = (j.category==='dadjoke' && j.setup && j.punchline)
      ? `<p class="text qa"><span class="q">${esc(j.setup)}</span><span class="a">${esc(j.punchline)}</span></p>`
      : `<p class="text">“${esc(j.text)}”</p>`;
    const ctx = j.context ? `<p class="ctx">💡 ${esc(j.context)}</p>` : '';
    el.innerHTML = `
      <div class="rank">${searchResults?'★':'#'+(idx+1)}<small>${j.score.toFixed(0)} pts</small></div>
      <div class="jbody">
        ${body}${ctx}
        <div class="jmeta">
          <span class="who">${esc(v.channel||'Unknown')}</span>
          <span>· ${fmt(v.views)} views · ${hms(j.start)}</span>
          <span class="tag type">${j.type}</span>${fun}${rep}${sim}
        </div>
        <button class="play" onclick="openModal(${j.id})">▶ Watch the laugh</button>
      </div>
      <div class="metrics">
        <div class="punch"><span class="v">${j.breakdown.punch==null?'n/a':Math.round(j.breakdown.punch*100)}</span><span class="l">punch<br>power</span></div>
        <svg class="spark" viewBox="0 0 230 46" preserveAspectRatio="none"></svg>
        <div class="bars">
          ${bar('punch',j.breakdown.punch)}${bar('reach',j.breakdown.reach)}
          ${bar('repeat',j.breakdown.repeat)}${bar('engage',j.breakdown.engage)}
        </div>
      </div>`;
    grid.appendChild(el);
    drawSpark(el.querySelector('.spark'), v.heatmap||[], j.start, j.end, v.duration);
    io.observe(el);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      el.querySelectorAll('.fill').forEach(f=>f.style.width=f.dataset.w);
    }));
  });
}
const bar=(k,v)=>`<div class="bar"><span>${k}</span><span class="track"><span class="fill ${k}-c" data-w="${Math.round((v||0)*100)}%"></span></span></div>`;
const esc=s=>(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function drawSpark(svg, hm, start, end, dur){
  if(!hm.length){ svg.innerHTML='<text x="8" y="28" fill="#a79fc4" font-size="10">no replay data</text>'; return; }
  const W=230,H=46, n=hm.length, max=Math.max(...hm.map(p=>p.v))||1;
  const X=i=>i/(n-1)*W, Y=v=>H-4-(v/max)*(H-8);
  let d='M'+X(0)+' '+Y(hm[0].v);
  hm.forEach((p,i)=> d+=' L'+X(i).toFixed(1)+' '+Y(p.v).toFixed(1));
  const area=d+` L${W} ${H} L0 ${H} Z`;
  // highlight window
  const total = dur || hm[hm.length-1].t || 1;
  const x1 = Math.max(0, start/total*W), x2 = Math.min(W, (end||start+6)/total*W);
  svg.innerHTML = `
    <defs><linearGradient id="g${start}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ff2e93" stop-opacity=".45"/><stop offset="1" stop-color="#ff2e93" stop-opacity="0"/></linearGradient></defs>
    <rect x="${x1.toFixed(1)}" y="0" width="${Math.max(3,(x2-x1)).toFixed(1)}" height="${H}" fill="#c8f13522" stroke="#c8f135" stroke-width="1"/>
    <path d="${area}" fill="url(#g${start})"/>
    <path d="${d}" fill="none" stroke="#ff2e93" stroke-width="1.6"/>`;
}

// ---- modal: YouTube IFrame API for PRECISE timestamp seeking ----
let ytReady=false, ytPlayer=null, pendingStart=null;
(function loadYT(){
  const t=document.createElement('script'); t.src='https://www.youtube.com/iframe_api';
  document.head.appendChild(t);
})();
window.onYouTubeIframeAPIReady = ()=>{ ytReady=true; };

function playAt(videoId, start){
  start = Math.max(0, Math.floor(start));
  const mount = $('#vidwrap');
  mount.innerHTML = '<div id="ytplayer"></div>';
  const make = ()=>{
    ytPlayer = new YT.Player('ytplayer', {
      videoId,
      playerVars:{ start, autoplay:1, rel:0, modestbranding:1, playsinline:1 },
      events:{
        onReady:(e)=>{ try{ e.target.seekTo(start, true); e.target.playVideo(); }catch(_){} },
        // some clients reset to 0 right after load — re-seek once playback begins
        onStateChange:(e)=>{ if(e.data===YT.PlayerState.PLAYING && pendingStart!=null){
            if(Math.abs(e.target.getCurrentTime()-pendingStart)>2){ e.target.seekTo(pendingStart,true); }
            pendingStart=null; } }
      }
    });
  };
  pendingStart = start;
  if(ytReady && window.YT && YT.Player){ make(); }
  else {
    // fallback: plain iframe with start param while API loads / if blocked
    mount.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    const wait=setInterval(()=>{ if(ytReady && window.YT && YT.Player){ clearInterval(wait); mount.innerHTML='<div id="ytplayer"></div>'; make(); } }, 150);
    setTimeout(()=>clearInterval(wait), 4000);
  }
}

function openModal(id){
  const j = DATA.jokes.find(x=>x.id===id); if(!j)return;
  const v = DATA.videos_map[j.video_id]||{};
  playAt(j.video_id, j.start);
  $('#m-text').textContent = '“'+j.text+'”';
  $('#m-meta').innerHTML = `<span class="who">${esc(v.channel||'')}</span><span>· ${esc(v.title||'')}</span>
    <span class="tag">starts @ ${hms(j.start)}</span>
    <span class="tag">punch ${j.breakdown.punch==null?'n/a':Math.round(j.breakdown.punch*100)}</span>
    <a class="tag" href="${j.watch_url}" target="_blank" rel="noopener">open on YouTube ↗</a>`;
  $('#m-ctx').innerHTML = j.context ? `💡 <b>the context:</b> ${esc(j.context)}` : '';
  $('#modal').classList.add('show'); document.body.style.overflow='hidden';
}
function closeModal(){ $('#modal').classList.remove('show');
  try{ ytPlayer && ytPlayer.destroy && ytPlayer.destroy(); }catch(_){}
  ytPlayer=null; $('#vidwrap').innerHTML=''; document.body.style.overflow=''; }
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal')closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape')closeModal(); });

// ---- confetti ----
function laugh(e){
  const colors=['#c8f135','#ff2e93','#21e6ff','#ff8a3d','#9b6bff'];
  const cx=e.clientX, cy=e.clientY;
  for(let i=0;i<26;i++){
    const c=document.createElement('div'); c.className='confetti';
    c.style.background=colors[i%colors.length]; c.style.left=cx+'px'; c.style.top=cy+'px';
    c.style.borderRadius=Math.random()<.5?'50%':'2px';
    document.body.appendChild(c);
    const ang=Math.random()*Math.PI*2, dist=80+Math.random()*160;
    const dx=Math.cos(ang)*dist, dy=Math.sin(ang)*dist - 120;
    c.animate([{transform:'translate(0,0) rotate(0)',opacity:1},
      {transform:`translate(${dx}px,${dy+260}px) rotate(${Math.random()*720}deg)`,opacity:0}],
      {duration:1100+Math.random()*500, easing:'cubic-bezier(.2,.8,.3,1)'}).onfinish=()=>c.remove();
  }
}
// ---- custom funky cursor ----
function initCursor(){
  if(!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const mk=id=>{ const d=document.createElement('div'); d.id=id; document.body.appendChild(d); return d; };
  const dot=mk('curDot'), ring=mk('curRing'), emo=mk('curEmoji');
  emo.textContent='😂';
  let mx=innerWidth/2, my=innerHeight/2, rx=mx, ry=my;
  addEventListener('mousemove',e=>{
    mx=e.clientX; my=e.clientY;
    dot.style.transform=`translate(${mx}px,${my}px) translate(-50%,-50%)`;
    emo.style.left=mx+'px'; emo.style.top=my+'px';   // CSS transform keeps the offset+scale
  });
  (function raf(){ rx+=(mx-rx)*0.18; ry+=(my-ry)*0.18;
    ring.style.transform=`translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(raf); })();
  addEventListener('mouseover',e=>{
    const hot=e.target.closest('.play,.chip,a,button,.rank');
    ring.classList.toggle('hot', !!hot);
    const fun=e.target.closest('.play,.react button,.rank,.tag.fun');
    emo.classList.toggle('show', !!fun);
  });
  addEventListener('mousedown',()=>ring.classList.add('click'));
  addEventListener('mouseup',()=>ring.classList.remove('click'));
  addEventListener('mouseleave',()=>{ dot.style.opacity=ring.style.opacity='0'; });
  addEventListener('mouseenter',()=>{ dot.style.opacity=ring.style.opacity='1'; });
}
initCursor();
boot();
