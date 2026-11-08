const root=document.querySelector("#app");
const statusTop=document.querySelector("#top-status");
let game=null, source=null, busy=false, lastToastTimer=null, drawChoiceBusy=false;
let timerSoundEnabled=true, timerAlertKey="", timerAlerted=new Set(), audioContext=null;
let ambientEnabled=false, ambientTimer=null; // iOS requires an explicit tap to start background music
const quizDraftByStage=Object.create(null);
// 통일된 벡터 아이콘 — 이모지 대신 단정한 금융 대시보드 스타일
const iconPaths={
  chart:'<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  cards:'<rect x="3" y="5" width="14" height="16" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v14"/>',
  exchange:'<path d="M7 7h14l-4-4m4 4-4 4"/><path d="M17 17H3l4 4m-4-4 4-4"/>',
  newspaper:'<path d="M4 5h14v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M18 8h3v10a3 3 0 0 1-3 3"/><path d="M7 9h8M7 13h3M12 13h3M7 17h8"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 4h10v7a5 5 0 0 1-10 0V4ZM7 7H4v2a4 4 0 0 0 4 4M17 7h3v2a4 4 0 0 1-4 4"/>',
  time:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  qrcode:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v1"/>',
  book:'<path d="M12 7c-2-2-5-2-9-2v14c4 0 7 0 9 2 2-2 5-2 9-2V5c-4 0-7 0-9 2Z"/><path d="M12 7v14"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Z"/><path d="M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sparkles:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM4 19l1 2 1-2 2-1-2-1-1-2-1 2-2 1 2 1Z"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  history:'<path d="M4 6v5h5"/><path d="M4 11a8 8 0 1 1 3 7M12 7v5l3 2"/>',
  play:'<path d="m8 5 12 7-12 7V5Z"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M16 15h2M6 6V4h12"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  settings:'<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
  scale:'<path d="M12 3v18M4 7h16M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7ZM8 21h8"/>',
  dices:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M12 12h.01M16 16h.01M16 8h.01M8 16h.01"/>'

};
const ico=(name,size=18)=>`<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.info}</svg>`;
const nf=new Intl.NumberFormat("ko-KR");
const format=n=>nf.format(Math.round(Number(n)||0));
const pct=n=>`${n>=0?"+":""}${Number(n||0).toFixed(2)}%`;
const h=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sector=id=>game?.sectors.find(s=>s.id===Number(id)) || {name:"알 수 없음",price:0,ticker:"?"};
const buyClass=n=>Number(n)>=0?"gain":"loss";
const phaseText={lobby:"참가팀 모집",news:"뉴스 분석",trade:"카드 교환",result:"가격 발표·해설",paused:"일시정지",finished:"게임 종료"};
const yearName=g=>`${g.room.year}년 · ${g.room.stage}/2차 뉴스`;
const isTrading=()=>game?.room.phase==="trade";
function toast(message){
  const el=document.querySelector("#toast");el.textContent=message;el.classList.add("show");
  clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>el.classList.remove("show"),3300);
}
async function api(url,body=null){
  const res=await fetch(url,{
    method:body===null?"GET":"POST",
    headers:body===null?{}:{"Content-Type":"application/json"},
    body:body===null?undefined:JSON.stringify(body),credentials:"same-origin",cache:"no-store"
  });
  const result=await res.json().catch(()=>({error:"서버 응답을 읽을 수 없습니다."}));
  if(!res.ok)throw Error(result.error||`오류 ${res.status}`);
  return result;
}
async function refresh(force=false){
  if(busy&&!force)return;
  try{
    const next=await api("/api/state");
    if(document.querySelector("#trade-modal")&&
      (next.room.phase!=="trade"||next.role!=="team"))document.querySelector("#trade-modal").close();
    if(!game||game.version!==next.version||game.role!==next.role||force){
      const oldRole=game?.role, oldPhase=game?.room?.phase;
      if(oldPhase && oldPhase!==next.room.phase && ["result","finished"].includes(next.room.phase)){
        document.querySelector("#info-modal")?.close();
        document.querySelector("#asset-modal")?.close();
      }
      game=next;
      render();
      // Preloading is optional and must never block a student joining the game.
      try { scheduleCardWarmup(game); }
      catch(warmupError) { console.warn("카드 이미지 사전 로딩 생략",warmupError); }
      if(oldRole!==next.role)connectStream();
    }else {game=next;tickCountdown();}
  }catch(e){toast(e.message);}
}
function connectStream(){
  if(source){source.close();source=null;}
  if(!game||game.role==="guest")return;
  source=new EventSource("/api/events");
  source.addEventListener("update",()=>refresh());
  source.onerror=()=>{}; // polling additionally handles network interruptions
}
function countdown(g){
  const r=g.room;
  if(r.phase==="paused")return `${r.secondsRemaining??0}초 (일시정지)`;
  if(!r.deadline)return "—";
  const sec=Math.max(0,Math.ceil((r.deadline-Date.now())/1000));
  return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}
function remainingSeconds(g){
  return g?.room?.deadline ? Math.max(0,Math.ceil((g.room.deadline-Date.now())/1000)) : null;
}

// Mobile Safari/Android require media playback to begin in a direct user tap.
// A real, locally generated WAV plays on that tap; the same element is reused
// for later time/phase notifications. Web Audio remains a best-effort fallback.
let notificationAudio=null, ambientAudio=null;
function createGameAudio(src,loop=false){
  const audio=document.createElement("audio");
  audio.src=src;
  audio.preload="auto";
  audio.loop=loop;
  audio.playsInline=true;
  audio.setAttribute("playsinline","");
  audio.setAttribute("webkit-playsinline","");
  audio.setAttribute("aria-hidden","true");
  audio.style.display="none";
  document.body.appendChild(audio);
  return audio;
}
// First user gesture primes WebAudio and the notification media element.
// Background music never starts without the learner explicitly enabling it.
let audioPrimed=false;
function primeAudioOnUserGesture(){
  if(audioPrimed)return;
  audioPrimed=true;
  startWebAudioOnGesture();
  try{soundTrack("notification")?.load();}catch{}
}
document.addEventListener("pointerdown",primeAudioOnUserGesture,{capture:true,once:true,passive:true});
document.addEventListener("touchstart",primeAudioOnUserGesture,{capture:true,once:true,passive:true});
document.addEventListener("keydown",primeAudioOnUserGesture,{capture:true,once:true});

function startWebAudioOnGesture(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    if(!audioContext||audioContext.state==="closed")audioContext=new Ctx();
    if(audioContext.state!=="running"){
      const pending=audioContext.resume();
      pending?.catch?.(()=>{});
      // Some WebKit versions require a node started during the user gesture.
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      gain.gain.value=0;
      oscillator.connect(gain);gain.connect(audioContext.destination);
      oscillator.start();oscillator.stop(audioContext.currentTime+.025);
    }
  }catch{ /* A separate HTML audio fallback is available. */ }
}
function soundTrack(kind){
  try{
    if(kind==="ambient"){
      if(!ambientAudio){
        ambientAudio=createGameAudio("/audio/ambient.mp3?v=audio-352",true);
        ambientAudio.preload="auto";ambientAudio.loop=true;ambientAudio.volume=.62;
      }
      return ambientAudio;
    }
    if(!notificationAudio){
      notificationAudio=createGameAudio("/audio/notify.mp3?v=audio-352",false);
      notificationAudio.preload="auto";notificationAudio.volume=1;
    }
    return notificationAudio;
  }catch{return null;}
}
function playSynthCue(frequencies=[850]){
  try{
    if(!audioContext||audioContext.state!=="running")return false;
    frequencies.forEach((frequency,index)=>{
      const t=audioContext.currentTime+index*.16;
      const osc=audioContext.createOscillator(),gain=audioContext.createGain();
      osc.type="sine";osc.frequency.setValueAtTime(frequency,t);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(.052,t+.024);
      gain.gain.exponentialRampToValueAtTime(.0001,t+.21);
      osc.connect(gain);gain.connect(audioContext.destination);
      osc.start(t);osc.stop(t+.23);
    });
    return true;
  }catch{return false;}
}
function playNotificationSound(fallback=[850]){
  if(document.hidden)return false;
  const track=soundTrack("notification");
  if(!track)return playSynthCue(fallback);
  try{
    track.pause();
    track.currentTime=0;
    const played=track.play();
    played?.catch?.(()=>{playSynthCue(fallback);});
    return true;
  }catch{return playSynthCue(fallback);}
}
function playTimerSound(){
  if(timerSoundEnabled)playNotificationSound([850,850]);
}
function playSceneCue(kind="trade"){
  if(!timerSoundEnabled)return;
  const notes={trade:[520,659],reveal:[392,523,659],phase:[440,523]};
  playNotificationSound(notes[kind]||notes.trade);
}
function syncSoundControlText(){
  const s=document.querySelector('[data-action="toggle-timer-sound"]');
  if(s){
    s.setAttribute("aria-pressed",String(timerSoundEnabled));
    s.innerHTML=`${ico("time",15)} 효과음 ${timerSoundEnabled?"켬":"끔"}`;
  }
  const b=document.querySelector('[data-action="toggle-ambient"]');
  if(b){
    b.setAttribute("aria-pressed",String(ambientEnabled));
    b.innerHTML=`${ico("play",15)} 배경음악 ${ambientEnabled?"켬":"끔"}`;
  }
}
function setAmbient(enabled){
  if(!enabled){
    ambientEnabled=false;
    if(ambientTimer){clearInterval(ambientTimer);ambientTimer=null;}
    ambientAudio?.pause();
    syncSoundControlText();
    return;
  }
  startWebAudioOnGesture(); // Direct user gesture: iOS requires a tap for media playback.
  const track=soundTrack("ambient");
  if(!track){ambientEnabled=false;syncSoundControlText();toast("이 기기에서 배경음악을 재생할 수 없습니다.");return;}
  ambientEnabled=true;
  try{
    track.currentTime=0;
    const result=track.play();
    result?.catch?.(()=>{
      if(ambientEnabled){
        ambientEnabled=false;
        track.pause();
        syncSoundControlText();
        toast("음악이 차단됐습니다. iPhone 음량·무음 모드·오디오 출력을 확인하세요.");
      }
    });
  }catch{
    ambientEnabled=false;syncSoundControlText();
    toast("배경음악을 시작하지 못했습니다. 기기 소리 설정을 확인해 주세요.");
  }
}
function testAudioByTap(){
  // Called on effect toggle, not a separate 'reconnect' UI.
  startWebAudioOnGesture();
  const track=soundTrack("notification");
  if(!track){
    toast("효과음 파일을 불러올 수 없습니다.");
    return;
  }
  try{
    track.pause();track.currentTime=0;
    const result=track.play();
    result?.catch?.(()=>{
      if(timerSoundEnabled)toast("효과음이 차단됐습니다. 기기 음량·무음 모드·블루투스 출력을 확인해 주세요.");
    });
  }catch{
    toast("효과음을 시작하지 못했습니다. 기기 소리 설정을 확인해 주세요.");
  }
}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    ambientAudio?.pause();
  }
  // Do not resume audible playback without an explicit gesture.
});

function tickCountdown(){
  if(!game)return;
  const r=game.room;
  const el=document.querySelector("[data-countdown]");
  if(el)el.textContent=countdown(game);
  const active=["news","trade"].includes(r.phase),sec=active?remainingSeconds(game):null;
  const key=`${r.round}:${r.stage}:${r.phase}:${r.deadline||""}`;
  if(key!==timerAlertKey){timerAlertKey=key;timerAlerted.clear();}
  const state=sec!==null&&sec>0&&sec<=10?"critical":sec!==null&&sec>10&&sec<=30?"warning":"";
  const statEl=el?.closest(".stat");
  if(statEl){statEl.classList.toggle("timer-warning-stat",state==="warning");statEl.classList.toggle("timer-critical-stat",state==="critical");}
  const bar=document.querySelector("[data-timer-alert]");
  const label=r.phase==="news"?"뉴스 분석":"카드 교환";
  if(bar){
    bar.className=`timer-alert-bar ${state?"visible "+state:""}`;
    bar.textContent=state?`${label} 종료까지 ${sec}초 · ${r.phase==="trade"?"교환 제안을 마무리하세요.":"핵심 뉴스를 확인하세요."}`:"";
  }
  const threshold=state==="critical"?10:state==="warning"?30:null;
  if(threshold&&!timerAlerted.has(threshold)){
    timerAlerted.add(threshold);
    toast(`${label} 종료 ${threshold}초 전입니다.`);
    playTimerSound();
  }
}

function headLine(g,title,desc=""){
  return `<div class="section-title"><div><span class="eyebrow">${h(yearName(g))}</span><h2>${h(title)}</h2>${desc?`<div class="small-note">${h(desc)}</div>`:""}</div>
   <span class="pill ${g.room.phase==="trade"?"green":"gold"}">${h(phaseText[g.room.phase]||g.room.phase)}</span></div>`;
}
function stat(label,num,hint="",cls=""){
  return `<div class="stat"><small>${h(label)}</small><strong class="${cls}">${num}</strong>${hint?`<div class="hint">${h(hint)}</div>`:""}</div>`;
}
const cardPath = ticker => `/cards/${encodeURIComponent(ticker)}.png`;
const DRAW_TOTAL=110;
// 초급 전용: 경제 경험이 없는 학습자를 위한 단순한 4단계 안내
function beginnerGuide(g) {
  const phase=g.room.phase;
  const current={
    lobby:["01","먼저 카드를 받아요","모든 팀이 11개 산업 카드를 각 10장씩, 총 110장 받습니다. 처음에는 모두 같은 조건입니다.","#collection","내 카드 보기"],
    news:["02","뉴스를 쉬운 말로 읽어요","기사의 '한 줄 요약'과 '어려운 말 풀이'만 먼저 읽어도 괜찮습니다. 어느 산업이 영향을 받을지 한 가지씩 이야기하세요.","#newsroom","뉴스 확인"],
    trade:["03","다른 팀과 카드를 바꿔요","① 교환 제안을 살펴보고 ② 내 카드에서 '교환 제안하기'를 누르세요. 처음에는 1장씩 바꿔보세요.","#open-listings","제안 살펴보기"],
    result:["04","가격이 어떻게 변했는지 봐요","카드 가격과 우리 팀 평가자산을 확인하세요. 이번 교환이 도움이 됐는지는 '턴별 성과 분석'에서 볼 수 있습니다.","#results","발표 확인"],
    finished:["05","마지막으로 결과를 비교해요","처음 받은 카드를 바꾸지 않았을 때와 실제 교환했을 때를 비교하고, 어떤 판단이 좋았는지 이야기해 보세요.","#results","결과 확인"],
    paused:["일시정지","잠시 쉬어가요","강사가 다시 시작할 때까지 카드를 확인하고 다음 전략을 의논해 보세요.","#collection","카드 보기"]
  };
  const [num,title,desc,link,label]=current[phase]||current.lobby;
  return `<section class="beginner-guide" aria-label="초급용 지금 할 일">
    <div class="beginner-number">${num}</div>
    <div class="beginner-guide-copy"><span class="eyebrow">BEGINNER GUIDE · 지금 할 일</span>
      <h2>${title}</h2><p>${desc}</p></div>
    <a class="beginner-go" href="${link}">${label} ${ico("arrow",17)}</a>
  </section>
  <details class="beginner-glossary"><summary>${ico("book",18)} 초급 투자 용어 5개 쉽게 보기</summary>
    <dl><div><dt>산업 카드</dt><dd>비슷한 일을 하는 기업들을 한 그룹으로 묶은 카드예요.</dd></div>
    <div><dt>가격</dt><dd>게임 안에서 카드 한 장이 현재 얼마만큼의 가치가 있는지 나타냅니다.</dd></div>
    <div><dt>평가자산</dt><dd>내가 가진 각 카드 수량 × 현재 가격을 모두 더한 금액입니다.</dd></div>
    <div><dt>수익률</dt><dd>처음 자산가치에 비해 현재 가치가 몇 퍼센트 변했는지 나타냅니다.</dd></div>
    <div><dt>교환</dt><dd>내 카드와 다른 팀 카드를 서로 바꾸는 행동이에요. 카드는 사거나 팔지 않습니다.</dd></div></dl>
  </details>`;
}

const drawOptions=[
 {id:"even",title:"모든 팀 공평하게 110장 받기",english:"FAIR START",tag:"초급 추천 · 동일한 출발",
  desc:"11개 산업을 각각 10장씩 받아요. 모든 팀의 시작 카드 구성과 가치는 같습니다.",
  detail:"11개 산업 × 10장 = 110장",icon:"scale",tone:"even"}
];
function drawArtStrip(g){
 return `<div class="draw-card-strip" aria-hidden="true">${g.sectors.map((s,i)=>`
   <span class="draw-mini-card" style="--index:${i}"><img src="${cardPath(s.ticker)}" alt=""></span>`).join("")}</div>`;
}
function drawIntro(g){
 return `<div class="draw-head">
   <span class="draw-kicker">GAME START <span class="draw-kicker-dot">•</span> CARD DRAW</span>
   <h2 id="draw-title">처음 투자카드를 받아보세요 <span>— ${h(g.team.name)}</span></h2>
   <p>처음이라면 어려운 선택은 필요 없어요. <b>공평하게 카드 110장을 받기</b>를 누르고 시작해요.</p>
 </div>
 <div class="draw-option-grid">${drawOptions.map(opt=>`
   <button type="button" class="draw-option ${opt.tone}" data-action="draw" data-id="${opt.id}"
     aria-label="${opt.title}, 팀당 카드 110장, 첫 카드 배분">
     <span class="draw-option-header">
       <span class="draw-option-symbol">${ico(opt.icon,27)}</span>
       <span><strong>${opt.title}</strong><small>${opt.english} · ${opt.tag}</small></span>
     </span>
     <span class="draw-option-desc">${opt.desc}</span>
     ${drawArtStrip(g)}
     <span class="draw-option-amount">${opt.detail}</span>
     <span class="draw-option-cta">선택하기 ${ico("arrow",15)}</span>
   </button>`).join("")}</div>
 <div class="draw-bottom"><span>${ico("lock",14)} 배부 완료 후 변경할 수 없습니다</span>
   <span>11개 산업 · 총 ${DRAW_TOTAL}장 · 초기 자산 1,100,000원</span></div>`;
}
function drawResult(g){
 const rows=g.sectors.map(s=>({s,qty:Number(g.team.holdings[s.id]||0)}));
 return `<div class="draw-head draw-result-head"><span class="draw-kicker">DRAW COMPLETE · PORTFOLIO READY</span>
   <span class="draw-result-mark">${ico("check",36)}</span>
   <h2 id="draw-title">${h(g.team.name)} 카드 배분 완료!</h2>
   <p><b>${g.team.drawMode==="even"?"균등 배분":"균등 배분"}</b>로 ${DRAW_TOTAL}장을 받았습니다. 이제 강사의 게임 시작을 기다려 주세요.</p>
   </div>
   <div class="draw-result-grid">${rows.map((x,i)=>`
     <div class="draw-reveal-card" style="--index:${i}">
       <img src="${cardPath(x.s.ticker)}" alt="${h(x.s.name)} 카드">
       <span>${h(x.s.name)} <strong>${x.qty}장</strong></span>
     </div>`).join("")}</div>
   <div class="draw-finish-footer"><strong>총 ${g.team.cardCount}장</strong>
     <button type="button" class="btn gold" data-action="draw-finish">카드 컬렉션 보기 ${ico("arrow",17)}</button></div>`;
}
function syncDrawDialog(){
 const dlg=document.querySelector("#draw-dialog");
 const required=game?.role==="team"&&game?.team&&game.room.phase==="lobby"&&!game.team.drawMode;
 if(!required){
   if(dlg&&(game?.room.phase!=="lobby"||!["drawing","reveal"].includes(dlg.dataset.step)))dlg.close();
   return;
 }
 if(dlg)return;
 const dialog=document.createElement("dialog");
 dialog.id="draw-dialog";dialog.className="draw-dialog";
 dialog.dataset.step="choose";dialog.setAttribute("aria-labelledby","draw-title");
 dialog.innerHTML=drawIntro(game);
 document.body.append(dialog);
 dialog.addEventListener("cancel",e=>e.preventDefault());
 dialog.addEventListener("close",()=>dialog.remove(),{once:true});
 dialog.showModal();
}


// Noncritical image warmup. Errors are isolated from joining and rendering.
const warmCardUrls=new Set();
const warmCardObjects=new Set();
let warmCardsQueued=false;
function prefetchCardArtwork(sectors){
  if(!Array.isArray(sectors)||!sectors.length)return;
  const ImageCtor=window.Image;
  if(typeof ImageCtor!=="function")return;
  const urls=sectors
    .filter(s=>s&&typeof s.ticker==="string")
    .map(s=>cardPath(s.ticker))
    .filter(url=>url&&!warmCardUrls.has(url));
  urls.forEach(url=>warmCardUrls.add(url));
  let cursor=0,active=0;
  function loadNext(){
    while(active<4&&cursor<urls.length){
      const url=urls[cursor++];active++;
      let image;
      try{
        image=new ImageCtor();
        warmCardObjects.add(image);
        let finished=false;
        const finish=()=>{
          if(finished)return;
          finished=true;
          active--;
          warmCardObjects.delete(image);
          loadNext();
        };
        image.onload=finish;
        image.onerror=finish;
        image.decoding="async";
        image.fetchPriority="high";
        image.src=url;
        if(image.complete)Promise.resolve().then(finish);
      }catch(error){
        active--;
        if(image)warmCardObjects.delete(image);
        console.warn("카드 이미지 일부 사전 로딩 실패",error);
      }
    }
  }
  loadNext();
}
function scheduleCardWarmup(g){
  if(warmCardsQueued||g?.role!=="team"||!Array.isArray(g.sectors)||!g.sectors.length)return;
  warmCardsQueued=true;
  try{
    const ordered=[...g.sectors].sort((a,b)=>
      Number(g.team?.holdings?.[b.id]||0)-Number(g.team?.holdings?.[a.id]||0));
    prefetchCardArtwork(ordered);
  }catch(error){console.warn("카드 이미지 사전 로딩 실패",error);}
}

function sectorArt(s,compact=false,action="card"){
  return `<button type="button" class="sector-image ${compact?"mini":""}" data-action="${action}" data-id="${h(s.ticker)}" aria-label="${h(s.name)} ${action==="trade-card"?"카드 교환 제안 작성":"카드 크게 보기"}">
    <span class="sector-card-fallback" aria-hidden="true"><b>${h(s.name)}</b><small>${h(s.ticker)}</small></span>
    <img loading="lazy" decoding="async" fetchpriority="auto" src="${cardPath(s.ticker)}" alt="${h(s.name)} 산업 카드 이미지"/>
    <span class="image-ticker">${h(s.ticker)}</span>
  </button>`;
}
function market(g,team=false){
  const trading=team&&g.room.phase==="trade";
  return `<section class="section collection-section" id="collection">
    <div class="section-title">
      <div><span class="eyebrow">ASSET COLLECTION · 11 SECTORS</span>
        <h2>${ico("cards",22)} ${team?"나의 산업 카드 컬렉션":"산업 카드 시세"}</h2></div>
      ${team?`<span class="pill ${trading?"green":"gold"}">${ico(trading?"exchange":"lock",15)} ${trading?"카드를 눌러 교환하기":"현재 교환 대기"}</span>`:'<span class="muted text-sm">교육용 가상 원화 가격</span>'}
    </div>
    ${team?`<div class="collection-guide">${ico("info",17)} <span>카드 이미지를 터치하면 크게 확대할 수 있습니다. ${trading?"보유 카드의 '교환 제안하기' 버튼으로 거래하세요.":"교환 제안은 거래 시간에만 열립니다."}</span></div>`:""}
    <div class="asset-gallery">${g.sectors.map(s=>{
       const qty=team?Number(g.team.holdings[s.id]||0):null;
       return `<article class="market-card asset-tile ${team&&qty>0?"has-holdings":""}">
        ${sectorArt(s,false,"card")}
        <div class="asset-info">
          <div class="asset-titleline"><span class="symbol">${h(s.ticker)}</span>${team?`<span class="asset-holding">${qty}장 보유</span>`:""}</div>
          <strong>${h(s.name)}</strong>
          <div class="asset-value">${format(s.price)}<small>원 / 장</small></div>
          ${team?`<div class="weight">평가액 <b>${format(s.price*qty)}원</b></div>
             <div class="asset-card-actions"><button type="button" data-action="card" data-id="${h(s.ticker)}" class="asset-view-cta">
                ${ico("eye",15)} 카드 크게 보기
              </button>
              ${trading&&qty>0?`<button type="button" data-action="trade-card" data-id="${h(s.ticker)}" class="asset-trade-cta">${ico("exchange",15)} 교환 제안하기 ${ico("arrow",14)}</button>`:""}
              </div>`:`<div class="weight">미국 산업 ETF 추적</div>`}
        </div>
       </article>`;
    }).join("")}</div></section>`;
}
function beginnerPractice(g){
  const t=g.team;
  if(!t?.drawMode)return `<section class="panel section easy-practice"><h2>거래 연습하기</h2><p>먼저 카드 배분을 완료하세요.</p></section>`;
  const receipt=t.practiceReceipt;
  return `<section class="panel section easy-practice" id="practice">
    <div class="easy-lesson-head"><span class="easy-lesson-symbol">${ico("exchange",23)}</span>
      <div><span class="eyebrow">PRACTICE MODE · 1 CARD</span>
      <h2>진짜 거래 전에 1장만 연습해요</h2>
      <p>연습 상대와 카드 1장을 교환하는 체험입니다. 실제 카드 수량과 평가자산은 변하지 않습니다.</p></div></div>
    ${t.practiceDone?`<div class="easy-practice-done">${ico("check",19)} 연습 완료!
      ${receipt?`<span>${h(sector(receipt.offerId).name)} 1장 → ${h(sector(receipt.wantId).name)} 1장 (연습 기록)</span>`:""}</div>`:
      `<button type="button" class="btn gold wide" data-action="open-practice">1장 교환 연습 시작</button>`}
  </section>`;
}
function practiceDialog(g){
  const options=g.sectors.map(x=>`<option value="${x.id}">${h(x.name)} (${h(x.ticker)})</option>`).join("");
  return `<div class="modal-head"><div><span class="eyebrow">TRAINING / NO REAL TRADE</span>
    <h2>카드 1장 교환 연습</h2></div>
    <button class="modal-close" type="button" data-action="close-practice" aria-label="닫기">${ico("close",20)}</button></div>
    <div class="easy-practice-steps">
       <div><b>① 내가 줄 산업 카드</b><p>우리 팀에 있는 카드 중 한 장을 고릅니다.</p></div>
       <div><b>② 연습 상대에게 받을 카드</b><p>서로 다른 카드 1장을 골라요.</p></div>
       <div><b>③ 교환 완료!</b><p>다시 실제 카드 구성으로 돌아옵니다.</p></div>
    </div>
    <form id="beginner-practice-form">
      <label class="field">내가 줄 카드<select name="offerId" required>${options}</select></label>
      <label class="field">연습 상대에게 받을 카드<select name="wantId" required>${options}</select></label>
      <div class="easy-practice-warning">연습용 가상 거래입니다. 실제 팀의 110장 카드 수량과 순위는 바뀌지 않습니다.</div>
      <button class="btn gold wide" type="submit">1장 교환 연습 완료하기</button>
    </form>`;
}
function teamLobbyPanel(g){
 const done=Boolean(g.team.drawMode);
 return `<section class="panel section strategy-panel">
   <div class="section-title"><div><span class="eyebrow">TEAM READY · STARTING DECK</span>
     <h2>${ico("cards",21)} 우리 팀 시작 카드</h2></div>
     <span class="pill ${done?"green":"gold"}">${done?"뽑기 완료":"카드 선택 대기"}</span></div>
   <p class="panel-sub">${done?`<b>${g.team.drawMode==="even"?"균등 배분":"균등 배분"}</b> · 총 <b>${g.team.cardCount}장</b> · 초기 평가자산 ${format(g.team.initialAsset)}원. 카드를 다시 뽑을 수 없습니다.`:
     "초급 코스는 모든 팀이 산업별 10장씩 총 110장으로 공평하게 시작해요."}</p>
   <form id="rename-form" class="rename-form"><label class="field">팀명 수정
     <input name="name" value="${h(g.team.name)}" minlength="2" maxlength="18" required></label>
     <button class="btn" type="submit">팀명 변경</button></form>
   <p class="small-note">현재 기기에서는 한 팀만 참가할 수 있습니다. 팀 이름 수정은 게임 시작 전에만 가능합니다.</p>
 </section>`;
}

// V3.5.6 / V9.5.6: 기사별 대표 이미지 우선 매칭.
// 정확한 기사 제목·기사 데이터의 image_topic 값이 우선하며,
// 미분류 기사는 관세/무역으로 오분류하지 않고 중립 시장 사진을 사용합니다.
const ARTICLE_IMAGE_KEYS=new Set([
  "rates","geopolitics","energy","trade","health","tech",
  "inflation-rise","inflation-cool","banks","midterm-stocks","market"
]);
const ARTICLE_IMAGE_BY_ID=Object.freeze({
  // 뉴스 원본 JSON에 고유 id가 확인되면 여기에 "기사ID": "이미지키"를 추가합니다.
});
const ARTICLE_IMAGE_BY_TITLE=Object.freeze({
  "미국중간선거이후미국증시반등":"midterm-stocks",
  "미국중간선거이후증시반등":"midterm-stocks",
  "미국중간선거후미국증시반등":"midterm-stocks",
  "미국중간선거후증시반등":"midterm-stocks",
  "who코로나19국제공중보건비상사태종료":"health",
  "미실리콘밸리은행svb폐쇄":"banks",
  "미국실리콘밸리은행svb폐쇄":"banks"
});
function normalizedArticleTitle(value){
  return String(value||"").normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]/gu,"").toLowerCase();
}
function articleTopic(x){
  const id=String(x?.id||"");
  const explicit=String(x?.image_topic||x?.image_key||"");
  if(ARTICLE_IMAGE_KEYS.has(explicit))return explicit;
  if(ARTICLE_IMAGE_KEYS.has(ARTICLE_IMAGE_BY_ID[id]))return ARTICLE_IMAGE_BY_ID[id];
  const title=String(x?.title||"");
  const normalized=normalizedArticleTitle(title);
  if(ARTICLE_IMAGE_KEYS.has(ARTICLE_IMAGE_BY_TITLE[normalized]))return ARTICLE_IMAGE_BY_TITLE[normalized];
  const theme=String(x?.learning_concept?.theme||"");
  // 사건을 정확하게 인식한 뒤 일반 주제 키워드를 검사합니다.
  if(/중간\s*선거|중간선거|midterm/i.test(title) && /증시|주식|주가|월가|주식시장|지수|반등|급등/i.test(title))return "midterm-stocks";
  if(/소비자물가|물가상승|물가 상승|인플레이션|CPI|물가상승률/i.test(title)){
    return /둔화|완화|진정|하락|안정|낮아|꺾|내려|하향|감속|내림|정점/i.test(title)?"inflation-cool":"inflation-rise";
  }
  if(/WHO|세계보건기구|코로나19|팬데믹|비상사태|보건|감염병/i.test(title))return "health";
  if(/실리콘밸리|SVB|은행 폐쇄|뱅크런|은행 파산|은행 위기/i.test(title))return "banks";
  if(/러시아|우크라이나|침공|전쟁|전면전|군사 충돌|군사작전/i.test(title))return "geopolitics";
  if(/증시|주식시장|주가지수|주가 반등|주가 급등|나스닥|다우지수|S&P|월가|stock market/i.test(title))return "market";
  if(/원유|유가|석유|정유|천연가스|OPEC|WTI|에너지/i.test(title))return "energy";
  if(/무역|관세|수입품|수출입|공급망|컨테이너|물류|해운|항만/i.test(title))return "trade";
  if(/반도체|인공지능|인공 지능|생성형\s*AI|AI\s*투자|AI\s*반도체|기술주|빅테크|IT 업종|데이터센터|엔비디아/i.test(title))return "tech";
  if(/연준|금리|긴축|통화|테이퍼링|자산매입|중앙은행/i.test(title))return "rates";
  if(/은행|금융위기|bank/i.test(title+" "+theme))return "banks";
  if(/유가|석유|에너지|energy/i.test(theme))return "energy";
  if(/바이오|제약|의료|health/i.test(theme))return "health";
  if(/기술|반도체|tech|AI/i.test(theme))return "tech";
  if(/금리|긴축|연준|rates/i.test(theme))return "rates";
  return "market";
}
function articleMainTopic(x){
  return articleTopic(x).replace(/^inflation-(rise|cool)$/,"inflation");
}
function articlePairContext(current){
  if(current.length!==2)return "";
  const first=current[0],last=current[1];
  const dates=current.map(x=>Date.parse(String(x.date||"")+"T00:00:00Z"));
  const difference=dates.every(Number.isFinite)?Math.abs(Math.round((dates[1]-dates[0])/86400000)):0;
  const months=Math.max(1,Math.round(difference/30));
  const same=articleMainTopic(first)===articleMainTopic(last);
  const inflation=same&&articleMainTopic(first)==="inflation";
  let label,info;
  if(difference>=45){
    label=same?`후속 변화 비교 · 약 ${months}개월 차이`:`시점 차이 주의 · 약 ${months}개월 차이`;
    info=inflation?
      "먼저 나온 물가 급등 기사와 이후의 상승률 둔화 기사는 서로 모순되지 않습니다. 물가 상승률이 낮아져도 물가 수준은 계속 오를 수 있어요.":
      same?"같은 이슈라도 시간이 흐르며 상황이 달라집니다. 두 기사의 날짜를 비교하고 새로운 정보로 전망이 어떻게 바뀌었는지 생각해 보세요.":
      "두 뉴스는 같은 날 일어난 사건이 아닙니다. 각 기사 날짜에 이미 알려진 정보만 이용해 판단해 보세요.";
  } else if(same){
    label="같은 이슈의 전개";
    info="첫 기사와 두 번째 기사의 발표일을 비교해 상황이 어떻게 바뀌었는지 살펴보세요.";
  }else{
    label="비슷한 시기의 서로 다른 이슈";
    info="두 사건이 시장에 미칠 영향을 따로 살피고, 서로 상충하는 신호가 있다면 불확실성도 함께 고려하세요.";
  }
  return `<aside class="news-pair-context" aria-label="두 뉴스의 관계"><strong>${h(label)}</strong><p>${h(info)}</p></aside>`;
}
function articleHistoricalNote(x,g){
  const title=String(x.title||"");
  const yr=Number(x.year);
  let titleText="",message="",question="";
  if(yr===2022 && /소비자물가|물가상승|물가 상승|인플레이션|CPI/i.test(title)){
    titleText="2022년 물가 흐름을 읽는 법";
    const later=/둔화|완화|진정|하락|안정|낮아|꺾|내려/.test(title);
    message=later?
      "물가 상승률이 이전보다 낮아졌다는 뜻이지, 물가 자체가 내려갔다는 뜻은 아닙니다. 통계 기준월과 실제 발표 날짜는 다를 수 있습니다.":
      "당시에는 물가 상승 압력이 컸습니다. 이후 발표된 지표의 둔화 여부는 그 지표가 실제로 공개된 시점부터 판단에 반영해야 합니다.";
    question=later?
      "물가 상승 속도가 느려진다면 앞으로 금리 기대와 산업별 부담은 어떻게 달라질까요?":
      "물가 상승 압력이 커지면 금리와 기업 비용에 어떤 영향을 줄까요?";
  }else if(/WHO|세계보건기구|코로나19.*(종료|해제)|비상사태.*종료/i.test(title)){
    titleText="오해하지 마세요";
    message="국제공중보건 비상사태 종료는 코로나19가 사라졌다는 뜻이 아닙니다. 비상 대응에서 장기 관리로 전환된다는 의미에 가깝습니다.";
    question="보건 정책의 변화가 여행·의료·소비 산업에 미칠 영향은 무엇일까요?";
  }else if(/실리콘밸리|SVB/i.test(title)){
    titleText="금융시장 판단 기준";
    message="한 은행의 폐쇄가 모든 은행이 같은 위험에 놓였다는 뜻은 아닙니다. 예금 유출, 채권 손실, 당국의 대응을 구분해야 합니다.";
    question="은행 불안이 커지면 금융업과 기술기업의 자금 조달에는 어떤 영향이 있을까요?";
  }
  if(!message)return "";
  return `<aside class="news-context-note"><strong>${h(titleText)}</strong><p>${h(message)}</p><div class="news-context-question"><b>생각해 볼 질문</b><span>${h(question)}</span></div></aside>`;
}
function inflationHistoryBridge(g,current){
  if(Number(g.room.year)!==2022)return "";
  const titles=current.map(x=>String(x.title||"")).join(" ");
  if(!/소비자물가|물가 상승|인플레이션|CPI/i.test(titles))return "";
  const prior=(g.news||[]).filter(x=>Number(x.year)===2022 &&
    !current.some(c=>c.id===x.id)&&/소비자물가|물가 상승|인플레이션|CPI/i.test(String(x.title||"")) &&
    String(x.date||"")<=String(current[current.length-1]?.date||""));
  if(!prior.length)return "";
  const last=prior.sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  return `<aside class="news-history-bridge"><strong>이전 물가 뉴스와 연결해서 보기</strong>
    <p><time>${h(last.date||"이전")}</time> ${h(last.title||"물가 관련 뉴스")} → 이번 뉴스</p>
    <p>뉴스가 서로 반대처럼 보여도, 물가 수준과 물가 상승률은 서로 다릅니다. 새로운 지표가 나왔을 때 당시의 판단을 업데이트해 보세요.</p></aside>`;
}
let activeArticleIndex=0, previousArticleKey="";
function newsList(g){
  const r=g.room;
  const lower=r.stage===1?1:3,upper=r.stage===1?2:4;
  const current=(g.news||[]).filter(x=>x.year===r.year&&Number(x.id.split("-").at(-1))>=lower&&Number(x.id.split("-").at(-1))<=upper);
  const older=(g.news||[]).filter(x=>!current.some(y=>y.id===x.id));
  const articleKey=`${r.year}:${r.stage}`;
  if(articleKey!==previousArticleKey){previousArticleKey=articleKey;activeArticleIndex=0;}
  activeArticleIndex=Math.min(activeArticleIndex,Math.max(0,current.length-1));
  const renderNews=(x,i,isPast=false)=>{
    const concept=x.learning_concept;
    const topic=articleTopic(x), imageBase=`/art/article-${topic}`, image=`${imageBase}.webp?v=photo-v356`;
    const question=x.easy_question||concept?.question||x.discussion_question;
    const summary=x.easy_summary||x.fact;
    const detail=x.fact||"";
    const sourceK=x.source_ko?.url||x.source_ko_search;
    const sourceO=/^https:\/\//.test(x.source?.url||"")?x.source.url:null;
    return `<article id="news-${h(x.id)}" class="news-card news-readable ${isPast?"news-past":"news-current"}" ${isPast?"":'data-current-news="true"'}>
      <div class="news-readable-meta"><span>${ico("newspaper",16)} ${isPast?"지난 뉴스":"시장 뉴스"}</span><time>${h(x.date)}</time></div>
      <h3 class="news-readable-title">${h(x.title)}</h3>
      <figure class="news-readable-image" data-image-topic="${topic}">
        <img src="${image}" srcset="${imageBase}-640.webp?v=photo-v356 640w, ${imageBase}-1200.webp?v=photo-v356 1200w, ${imageBase}.webp?v=photo-v356 1600w" sizes="(max-width:480px) calc(100vw - 64px), (max-width:900px) 85vw, 740px" width="1600" height="900" loading="${isPast?"lazy":"eager"}" fetchpriority="${isPast?"low":"high"}" decoding="async" alt="${h(x.title)} 관련 ${topic==="geopolitics"?"전쟁 상황 재현":topic==="rates"?"중앙은행":"경제 주제"} 이미지"/>
        <figcaption>${topic.startsWith("inflation")?"물가 흐름을 설명하는 AI 생성 이미지 · 실제 통계 그래프가 아니며, 상승률 둔화는 물가 하락과 다릅니다.":topic==="market"?"경제 시장을 표현한 일반 AI 생성 이미지 · 사건 현장 사진이 아닙니다.":"기사 이해를 위한 AI 생성 재현 이미지 · 실제 현장 사진이 아닙니다."}</figcaption>
      </figure>
      <div class="news-readable-summary"><b>한 줄 요약</b><p>${h(summary)}</p></div>
      ${!isPast?articleHistoricalNote(x,g):""}
      ${detail&&detail!==summary?`<div class="news-readable-body"><h4>무슨 일이 있었나요?</h4><p>${h(detail)}</p></div>`:""}
      ${x.easy_term?`<div class="news-readable-term"><strong>어려운 말 풀이</strong><span>${h(x.easy_term)}</span></div>`:""}
      <div class="news-readable-source">
        ${sourceK?`<a href="${h(sourceK)}" target="_blank" rel="noopener noreferrer">관련 기사 보기 ${ico("arrow",15)}</a>`:""}
        ${sourceO?`<a href="${h(sourceO)}" target="_blank" rel="noopener noreferrer">공식 원문 보기 ${ico("arrow",15)}</a>`:""}
      </div>
      ${concept?`<details class="news-learn">
        <summary>${ico("book",19)} 이번 뉴스로 배우는 경제개념 <span class="learn-chevron">⌄</span></summary>
        <div class="news-learn-content">
          <div><small>핵심 개념</small><strong>${h(concept.concept||"경제 변화")}</strong></div>
          <div><small>살펴볼 산업</small><strong>${h(concept.watch||"관련 산업")}</strong></div>
          ${question?`<p>${ico("target",17)} ${h(question)}</p>`:""}
        </div>
      </details>`:question?`<div class="news-readable-question">${ico("target",17)} ${h(question)}</div>`:""}
      ${g.role==="teacher"&&x.analysis?`<details class="news-teacher-note"><summary>${ico("lock",16)} 강사 해설</summary><p>${h(x.analysis)}</p></details>`:""}
    </article>`;
  };
  return `<section class="section newsroom readable-newsroom" id="newsroom">
    <div class="readable-news-heading">
      <div><small>${r.year}년 · ${r.stage}차 뉴스</small><h2>${ico("newspaper",23)} 오늘의 경제 뉴스</h2></div>
      <span>${r.round} / ${r.totalRounds}회차</span>
    </div>
    ${current.length?`${articlePairContext(current)}${inflationHistoryBridge(g,current)}<div class="article-tabs" role="tablist" aria-label="기사 선택">${current.map((x,i)=>`
      <button type="button" role="tab" data-action="article-tab" data-id="${i}" aria-selected="${i===activeArticleIndex}" aria-controls="article-panel-${i}" class="${i===activeArticleIndex?"active":""}">기사 ${i+1}</button>`).join("")}</div>
      <div class="current-news-stack">${current.map((x,i)=>`<div id="article-panel-${i}" class="article-panel" role="tabpanel" ${i===activeArticleIndex?"":"hidden"}>${renderNews(x,i)}</div>`).join("")}</div>`:
      `<div class="empty">${ico("time",18)} ${r.phase==="lobby"?"게임을 시작하면 경제 뉴스가 표시됩니다.":"현재 공개된 뉴스가 없습니다."}</div>`}
    ${older.length?`<details class="archive-news"><summary>${ico("history",18)} 지난 기사 ${older.length}건 다시 보기</summary><div class="archive-list">${older.slice().reverse().map((x,i)=>renderNews(x,i,true)).join("")}</div></details>`:""}
  </section>`;
}

// EASY V2: 현재 공개된 뉴스만으로 생각하도록 돕는 투자 선택 도우미(미래 가격 공개 없음).
function beginnerCoach(g){
  const l=g.beginnerLesson;
  if(!l || !["news","trade","paused"].includes(g.room.phase))return "";
  return `<section class="panel section easy-coach" aria-label="투자 선택 도우미">
    <div class="easy-lesson-head"><span class="easy-lesson-symbol">${ico("sparkles",22)}</span>
      <div><span class="eyebrow">THINK FIRST · INVESTMENT COACH</span>
        <h2>어떤 산업이 영향을 받을까요?</h2><p>${h(l.year)}년 ${l.stage}차 · ${h(l.topic)}</p></div></div>
    <p class="easy-coach-prompt">${h(l.coach.prompt)}</p>
    <div class="easy-coach-checks">${l.coach.checks.map(x=>{
      const parts=x.split(":");return `<div class="easy-coach-chip"><strong>${h(parts[0])}</strong><span>${h(parts.slice(1).join(":").trim())}</span></div>`;
    }).join("")}</div>
    <p class="small-note">🔎 ${h(l.coach.disclaimer)} 교환 여부는 팀이 직접 결정하세요.</p>
  </section>`;
}
function beginnerQuiz(g){
  const l=g.beginnerLesson;
  if(!l||!["news","trade","result","paused"].includes(g.room.phase))return "";
  const sub=l.submission;
  const solved=l.quiz.solution;
  const source=l.quiz.sourceNews;
  const canSubmit=["news","trade"].includes(g.room.phase)&&g.team?.drawMode;
  return `<section class="panel section easy-quiz" id="easy-quiz" aria-label="이번 뉴스 이해 퀴즈">
    <div class="easy-lesson-head"><span class="easy-lesson-symbol">${ico("target",22)}</span>
      <div><span class="eyebrow">ONE QUESTION · ${l.year}-${l.stage}</span><h2>${l.year}년 ${l.stage}차 뉴스 퀴즈</h2>
      <p>지금 공개된 뉴스에 관한 문제입니다. 수익률과 카드 수량에는 영향을 주지 않습니다.</p></div></div>
    ${source?`<div class="easy-quiz-source">
      <span>${ico("newspaper",15)} 퀴즈와 연결된 실제 뉴스 · ${h(source.date)}</span>
      <a href="#news-${h(source.id)}" class="easy-quiz-news-link">${h(source.title)} ${ico("arrow",14)}</a>
      <p>${h(source.summary)}</p></div>`:""}
    <p class="easy-quiz-question">${h(l.quiz.question)}</p>
    ${sub?`<div class="easy-quiz-answer ${sub.correct?"is-correct":"is-wrong"}">
      <strong>${sub.correct?"정답입니다!":"좋은 시도예요!"}</strong>
      <p>정답: ${h(l.quiz.options.find(x=>x.value===sub.correctOption)?.label||"")}</p>
      <p>${h(sub.explanation)}</p></div>`:
      solved?`<div class="easy-quiz-answer is-unanswered" role="status">
        <strong>${ico("book",18)} 가격 발표 완료 · 미응답자도 정답 확인</strong>
        <p>정답: ${h(solved.correctLabel)}</p>
        <p>${h(solved.explanation)}</p>
        <p class="small-note">퀴즈를 제출하지 않아도 결과 발표 후에는 해설을 볼 수 있습니다.</p>
      </div>`:
      canSubmit?`<form id="beginner-quiz-form"><div class="easy-quiz-options">
        ${l.quiz.options.map(x=>`<label class="easy-quiz-choice"><input type="radio" name="answer" value="${h(x.value)}" ${quizDraftByStage[`${l.year}-${l.stage}`]===x.value?"checked":""} required><span>${h(x.label)}</span></label>`).join("")}
        </div><button type="submit" class="btn gold wide">정답 제출하고 배우기</button></form>`:
      `<p class="small-note">현재는 퀴즈 응답이 잠시 멈춰 있습니다. 가격 발표 후 정답과 해설이 공개됩니다.</p>`}
  </section>`;
}
function beginnerQuizReview(g){
  const all=g.quizReviews||[];
  const past=all.filter(x=>!(g.room.phase==="result"&&x.year===g.room.year&&x.stage===g.room.stage));
  if(!past.length)return "";
  return `<details class="panel section easy-quiz-review" id="quiz-review-history">
    <summary>${ico("book",18)} ${g.room.phase==="finished"?"전체 8단계":"지난"} 뉴스 퀴즈 정답 복습 · ${past.length}개</summary>
    <div class="easy-quiz-review-list">${past.map(x=>`<div class="easy-quiz-review-item">
      <strong>${x.year}년 ${x.stage}차 · ${h(x.topic)}</strong>
      <p class="small-note">관련 뉴스: ${h(x.sourceNews.title)}</p>
      <p>${h(x.question)}</p>
      <p class="easy-quiz-review-correct">정답: ${h(x.solution.correctLabel)}</p>
      <p>${h(x.solution.explanation)}</p>
      <span class="easy-quiz-review-status">${x.answered?(x.correct?"정답 제출":"오답 제출"):"미응답 · 정답 자동 공개"}</span>
    </div>`).join("")}</div>
  </details>`;
}
function beginnerResult(g){
  const l=g.beginnerLesson,r=g.lastResult;
  if(g.room.phase!=="result"||!r||!l?.reveal)return "";
  const change=[...r.changes].sort((a,b)=>b.gameModelPct-a.gameModelPct);
  const top=change[0],low=change[change.length-1];
  if(!top||!low)return "";
  const max=Math.max(1,...change.map(x=>Math.abs(x.gameModelPct)));
  const makeRow=(x)=>`<div class="easy-result-row"><span>${h(x.name)}</span>
    <div class="easy-result-bar"><i style="width:${Math.min(100,Math.abs(x.gameModelPct)/max*100).toFixed(1)}%"
      class="${x.gameModelPct>=0?"up":"down"}"></i></div>
    <strong class="${buyClass(x.gameModelPct)}">${pct(x.gameModelPct)}</strong></div>`;
  return `<section class="panel section easy-explain" id="easy-result-explain">
    <div class="easy-lesson-head"><span class="easy-lesson-symbol">${ico("chart",24)}</span>
    <div><span class="eyebrow">RESULT · EASY EXPLAINER</span><h2>산업별 가격 변화 그래프</h2>
    <p>${r.year}년 ${r.stageIndex+1}차 · 쉬운 결과 해설</p></div></div>
    <div class="easy-explain-feature"><strong>이런 일이 있었어요</strong><p>${h(l.reveal.summary)}</p></div>
    <div class="easy-result-bars"><p>막대그래프로 비교하는 산업별 상승·하락 폭</p>
      ${makeRow(top)}${makeRow(low)}</div>
    <p class="small-note">※ 숫자는 역사적 연간 섹터 성과를 나눈 교육용 모델입니다. 위 뉴스 하나가 가격 변동을 일으켰다고 단정할 수 없습니다.</p>
  </section>`;
}
function leaderboard(g){
  const rows=g.scores.map(x=>`<tr><td class="rank">${x.rank}위</td><td>${h(x.name)}${g.team?.id===x.id?" <span class='label-pill'>(내 팀)</span>":""}</td><td class="${buyClass(x.returnPct)}"><strong>${pct(x.returnPct)}</strong></td><td>${format(x.total)}원</td></tr>`).join("");
  return `<div class="panel section"><div class="section-title"><h2>${ico('trophy',21)} 실시간 팀 순위</h2><span class="muted text-sm">신규 게임 초기 자산 1,100,000원 / 팀</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>순위</th><th>팀명</th><th>수익률(순위 기준)</th><th>평가자산</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="4">아직 참가팀이 없습니다.</td></tr>'}</tbody></table></div></div>`;
}
function results(g){
  if(!g.lastResult)return "";
  const r=g.lastResult, who=r.endingYear?"해당 연도 종료":"1차 중간 결과";
  return `<section class="panel section" id="results">
    <div class="result-banner"><h3>${ico('chart',20)} ${h(r.year)}년 ${h(r.stageIndex+1)}차 가격 발표 — ${who}</h3>
      <p>게임용 단계 수익률이 적용되었습니다. ${r.endingYear?"오른쪽의 실측 수익률은 연간 또는 기준일 YTD 성과입니다.":"2차 뉴스·결과는 아직 공개되지 않았습니다."}</p></div>
    <div class="table-wrap"><table class="table result-table"><thead><tr>
      <th>산업</th><th>전(원)</th><th>후(원)</th><th>변동률</th>${r.endingYear?"<th>실제 연간/YTD</th>":""}
    </tr></thead><tbody>${r.changes.map(x=>`<tr><td>${h(x.name)}</td><td>${format(x.previous)}</td>
      <td>${format(x.price)}</td><td class="change ${buyClass(x.gameModelPct)}">${pct(x.gameModelPct)}</td>
      ${r.endingYear?`<td class="${buyClass(x.observedAnnualPct)}">${pct(x.observedAnnualPct)}</td>`:""}</tr>`).join("")}</tbody></table></div>
    <p class="small-note">※ 교육용 변동률: 관측된 사건 직후 변동률이 아닙니다. 2019~2025는 미국 섹터 ETF 연간 총수익률, 2026은 11월 4일 기준 YTD 총수익률 기반 배분입니다.</p>
   </section>`;
}
// Card exchange helpers: keep browser estimates aligned with /api/state.
// The server re-validates both quantities when an offer is submitted.
function availableMine(g,sectorId){
  const key=String(sectorId);
  const supplied=Number(g?.tradeAvailability?.[key]?.mineAvailable);
  if(Number.isFinite(supplied))return Math.max(0,Math.floor(supplied));
  const qty=Number(g?.team?.holdings?.[key]||0);
  const reserved=(g?.listings||[]).filter(l=>
    String(l.sellerId)===String(g?.team?.id)&&String(l.offerId)===key
  ).reduce((sum,l)=>sum+Number(l.offerQty||0),0);
  return Math.max(0,Math.floor(qty-reserved));
}
function availableOther(g,sectorId){
  const supplied=g?.tradeAvailability?.[String(sectorId)]?.maxOtherAvailable;
  const count=Number(supplied);
  return supplied==null||!Number.isFinite(count)?0:Math.max(0,Math.floor(count));
}
function syncTradePreview(form){
  if(!form||!game)return;
  const select=form.elements.namedItem("wantId");
  const qty=form.elements.namedItem("wantQty");
  const submit=form.querySelector('button[type="submit"]');
  if(!select||!qty)return;
  const max=Math.min(30,availableOther(game,Number(select.value)));
  qty.max=String(max);
  if(max>0&&Number(qty.value)>max)qty.value=String(max);
  if(max>0&&Number(qty.value)<1)qty.value="1";
  const hint=form.querySelector("[data-counterparty-max]");
  if(hint)hint.textContent=max>0?
    `다른 팀에서 교환 가능한 카드: 최대 ${max}장`:
    "현재 다른 팀에서 교환 가능한 카드가 없습니다. 다른 산업을 선택하세요.";
  if(submit)submit.disabled=max<1;
}

function tradeCardModal(s,g){
  const owned=Number(g.team?.holdings?.[s.id]||0),unreserved=availableMine(g,s.id);
  const options=g.sectors.filter(x=>x.id!==s.id);
  const preferred=options.find(x=>x.ticker==="XLK"&&availableOther(g,x.id)>0)||
    options.find(x=>availableOther(g,x.id)>0)||options[0];
  const counterpartMax=preferred?Math.min(30,availableOther(g,preferred.id)):0;
  const canTrade=g.room.phase==="trade"&&unreserved>0&&counterpartMax>0;
  return `<div class="modal-head">
      <div><span class="eyebrow">CARD EXCHANGE · ${h(s.ticker)}</span><h2 id="trade-modal-title">카드 교환 제안</h2></div>
      <button type="button" class="modal-close" data-action="close-trade" aria-label="교환 창 닫기">${ico("close",20)}</button>
    </div>
    <div class="trade-modal-asset"><button type="button" class="trade-card-preview" data-action="card" data-id="${h(s.ticker)}" aria-label="${h(s.name)} 카드 상세 확대">
       <img src="${cardPath(s.ticker)}" alt="${h(s.name)} 산업 카드"><span>${ico("eye",15)} 원본 이미지 크게 보기</span>
     </button>
      <div><span class="eyebrow">MY COLLECTION</span><h3>${h(s.name)}</h3>
        <p>현재 시세 <strong>${format(s.price)}원</strong> / 장</p>
        <p>보유 <strong>${owned}장</strong> · 새 제안 가능 <strong>${unreserved}장</strong></p>
      </div>
    </div>
    ${canTrade?`<form id="trade-card-form" class="trade-card-form" data-offer-id="${s.id}">
       <div class="trade-form-section">
        <span class="trade-form-step">01 · 내가 줄 카드</span>
        <div class="trade-form-grid"><strong>${h(s.name)}</strong>
        <label class="field">제공 수량<input name="offerQty" type="number" min="1" max="${Math.min(30,unreserved)}" value="1" required></label></div>
       </div>
       <div class="trade-swap-symbol">${ico("exchange",22)}</div>
       <div class="trade-form-section">
        <span class="trade-form-step">02 · 받고 싶은 카드</span>
        <label class="field">받을 산업<select name="wantId" required>${options.map(x=>`
          <option value="${x.id}" ${x.id===preferred.id?"selected":""} ${availableOther(g,x.id)<1?"disabled":""}>
          ${h(x.name)} · ${h(x.ticker)} (상대팀 최대 ${availableOther(g,x.id)}장)</option>`).join("")}</select></label>
        <label class="field">받을 수량<input name="wantQty" type="number" min="1" max="${counterpartMax}" value="1" required></label>
        <div class="counterparty-available" data-counterparty-max>다른 팀에서 실제로 교환 가능한 최대 ${counterpartMax}장</div>
       </div>
       <div class="trade-modal-notice">${ico("info",16)} 서버가 상대 카드 잔여량을 재확인합니다. 다른 팀이 먼저 거래하면 제안이 거절되거나 수락 불가로 바뀔 수 있습니다.</div>
       <button class="btn gold wide trade-submit" type="submit">${ico("check",18)} 교환 제안 등록하기</button>
     </form>`:
     `<div class="trade-modal-locked">${ico(owned>0?"time":"info",24)}
       <strong>${owned===0?"보유한 카드가 없습니다":unreserved===0?"다른 제안에 모두 등록된 카드입니다":g.room.phase!=="trade"?"지금은 거래 시간이 아닙니다":"교환 가능한 상대 카드가 없습니다"}</strong>
       <p>새 제안은 거래 시간 중이며, 내 제공 카드와 다른 팀의 수락 가능한 카드가 모두 있을 때 등록할 수 있습니다.</p></div>`}
    <p class="small-note">카드 교환은 수량 1~30장, 팀당 동시 5개 제안까지 가능합니다. 상대 보유 수량과 기존 제안을 서버에서 검증합니다.</p>`;
}
function tradePickerContent(g){
  const choices=(g?.sectors||[]).filter(x=>Number(g?.team?.holdings?.[x.id]||0)>0);
  return `<p class="trade-picker-hint">보유한 산업 카드를 선택하면 교환 제안 내용을 작성할 수 있습니다.</p>
    <div class="trade-picker-grid">${choices.map(x=>`
      <button type="button" class="trade-picker-choice" data-action="trade-card" data-id="${h(x.ticker)}">
      <strong>${h(x.name)}</strong><small>${format(g.team?.holdings?.[x.id]||0)}장 보유</small>
      ${ico("arrow",18)}</button>`).join("")||"<p>현재 보유 카드가 없습니다.</p>"}</div>`;
}
function listingBoard(g){
  const open=g.room.phase==="trade";
  return `<section class="section listing-board" id="open-listings">
    <div class="section-title"><div><span class="eyebrow">LIVE EXCHANGE · OPEN ORDERS</span>
      <h2>${ico('exchange',20)} 공개된 카드 교환 제안</h2></div>
      <div class="exchange-pills"><span class="pill ${open?"green":"gold"}">${open?"거래 가능":"거래 대기"}</span>
        <span class="pill">${g.listings.length}개 제안</span></div></div>
    ${g.role==="team"&&open?`<button type="button" class="btn gold wide trade-picker-launch" data-action="open-trade-picker">
      ${ico("exchange",18)} 교환 제안하기</button>`:""}
    <p class="small-note">${open?
      "다른 팀의 제안을 확인하고 수락하거나, 내 카드 컬렉션에서 카드를 눌러 새 제안을 등록하세요.":
      "지금은 뉴스 분석·진행 대기 중입니다. 거래 시간이 열리면 이곳에서 주문을 수락할 수 있습니다."}
      <b>최종 교환 성과는 게임이 끝난 뒤에 공개됩니다.</b></p>
    <div class="stack">${g.listings.length?g.listings.map(l=>{
      const mine=g.team?.id===l.sellerId;
      const available=availableMine(g,l.wantId);
      const canAccept=!mine&&isTrading()&&available>=l.wantQty;
      return `<div class="listing"><div class="trade-main"><div><span class="label-pill">${h(l.sellerName)} 제안</span>
        <div><strong>${h(sector(l.offerId).name)} ${l.offerQty}장</strong>
        <span class="trade-arrow"> ⇄ </span><strong>${h(sector(l.wantId).name)} ${l.wantQty}장</strong></div></div>
        ${mine?`<button class="btn tiny danger" data-action="cancel" data-id="${h(l.id)}" ${isTrading()?"":"disabled"}>내 제안 취소</button>`:
          `<button class="btn tiny green" data-action="accept" data-id="${h(l.id)}" ${canAccept?"":"disabled"}>교환 수락</button>`}</div>
        <p class="small-note listing-terms">체결 시 양쪽 카드 보유량을 함께 갱신합니다.</p>
        ${!mine&&!canAccept?`<p class="listing-unavailable">${ico("lock",14)} ${isTrading()?`내가 제공 가능한 카드 ${available}장 · 요구 ${l.wantQty}장`:"거래 시간이 아닙니다."}</p>`:""}
      </div>`;
    }).join(""):'<div class="empty exchange-illustrated-empty"><span class="exchange-empty-art" aria-hidden="true"></span><span class="exchange-empty-copy"><strong>아직 공개된 교환 제안이 없습니다</strong><small>거래 시간이 시작되면 내 카드 컬렉션에서 카드를 눌러 제안할 수 있습니다.</small></span></div>'}</div>
  </section>`;
}
function recentTrades(g){
  return `<div class="stack recent-trade-stack">${g.recentTrades.length?g.recentTrades.map(t=>
    `<div class="member"><div><strong>${h(t.sellerName)}</strong> → <strong>${h(t.buyerName)}</strong><div class="small-note">${h(sector(t.offerId).name)} ${t.offerQty}장 ⇄ ${h(sector(t.wantId).name)} ${t.wantQty}장</div></div><span class="label-pill">${t.year}년 ${t.stage||""}차</span></div>`).join("") :
    `<div class="empty">${ico("history",22)} 아직 성사된 카드 교환이 없습니다.</div>`}</div>`;
}
// V3.5.2/V9.5.2: same server-supplied ranking for beginner and general versions.
function liveRankingContents(g){
  const scores=Array.isArray(g?.scores)?[...g.scores]:[];
  scores.sort((a,b)=>Number(a.rank||999)-Number(b.rank||999));
  const rows=scores.map(x=>`<tr><td><b>${Number(x.rank)||"—"}위</b></td>
    <td>${h(x.name)}${g.team?.id===x.id?` <span class="label-pill">우리 팀</span>`:""}</td>
    <td class="${buyClass(x.returnPct)}"><strong>${pct(x.returnPct)}</strong></td>
    <td>${format(x.total)}원</td></tr>`).join("");
  return `<div class="ranking-live-note">서버에 반영된 최근 가격 발표 기준 순위입니다. 거래 중에는 즉시 변하지 않을 수 있습니다.</div>
    <div class="table-wrap ranking-scroll"><table class="table"><thead><tr>
    <th>순위</th><th>팀</th><th>수익률</th><th>평가자산</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="4">아직 참가팀이 없습니다.</td></tr>'}</tbody></table></div>`;
}
function openLiveRanking(){
  try{
    if(!game){toast("순위를 아직 불러오지 못했습니다.");return;}
    showInfoModal("실시간 팀 순위","현재 공개된 팀별 성적",liveRankingContents(game));
  }catch(error){
    console.error("순위 표시 오류",error);
    toast("순위 화면을 열지 못했습니다. 잠시 후 다시 눌러 주세요.");
  }
}
function quickPanels(g){
  const mineRank=g.team?g.scores.find(s=>s.id===g.team.id)?.rank:null;
  return `<nav class="quick-panels" aria-label="실시간 정보">
    <button type="button" class="quick-panel" data-action="view-rankings">
      <span class="quick-panel-icon">${ico("trophy",24)}</span><span class="quick-panel-copy"><small>현재 순위</small><strong>실시간 팀 순위</strong><em>${mineRank?`우리 팀 ${mineRank}위 · `:""}총 ${g.scores.length}팀</em></span>${ico("arrow",19)}
    </button>
    <button type="button" class="quick-panel" data-action="view-trades">
      <span class="quick-panel-icon">${ico("history",24)}</span><span class="quick-panel-copy"><small>최근 거래</small><strong>최근 성사된 거래</strong><em>최근 ${g.recentTrades.length}건 확인</em></span>${ico("arrow",19)}
    </button>
  </nav>`;
}

// V8: 뉴스 단계가 끝날 때만 실제 포트폴리오와 '이번 단계에서 교환하지 않았을 경우' 비교.
function stageInsightMetrics(report) {
  if(!report?.ready)return `<div class="impact-unavailable">${ico("info",22)} ${h(report?.reason||"이번 단계의 비교 데이터를 아직 확인할 수 없습니다.")}</div>`;
  const d=Number(report.difference||0),pp=Number(report.differencePctPoint||0);
  return `<div class="impact-compare-grid">
    <div class="impact-comparison-card baseline"><small>이 단계에서 교환하지 않았다면</small>
      <strong>${pct(report.untouchedReturnPct)}</strong><span>${format(report.untouchedValue)}원</span></div>
    <div class="impact-comparison-card actual"><small>실제 카드 교환 후</small>
      <strong class="${buyClass(report.actualReturnPct)}">${pct(report.actualReturnPct)}</strong><span>${format(report.actualValue)}원</span></div>
  </div>
  <div class="impact-net ${buyClass(pp)}">
    <div><small>이번 단계 카드 교환 효과</small><strong>${pp>=0?"+":""}${pp.toFixed(2)}%p</strong></div>
    <b>${d>=0?"+":"−"}${format(Math.abs(d))}원</b>
  </div>
  <div class="impact-footnote">${ico("exchange",17)} 이번 단계 체결 <b>${format(report.executedCount)}건</b> · 시장 상승·하락 효과는 두 시나리오에 동일하게 반영했습니다.</div>`;
}
function stageImpactContent(g) {
  const current=g.stageTradeReport||g.stageTradeHistory?.at(-1)?.report;
  const record=g.room.phase==="result"?{year:g.room.year,stage:g.room.stage,report:current}
    :g.stageTradeHistory?.at(-1);
  const history=(g.stageTradeHistory||[]).slice().reverse();
  return `<div class="impact-report-modal-body">
    <div class="impact-illustration" aria-hidden="true"><span>ROUND PERFORMANCE</span></div>
    <p class="impact-lead">${record?`${record.year}년 ${record.stage}차 가격 발표`:"아직 가격 발표 전입니다."} · 이 뉴스 단계의 시작 카드 구성을 그대로 보유했을 경우와, 실제로 교환한 결과를 <b>동일한 발표 가격</b>으로 비교합니다.</p>
    ${stageInsightMetrics(record?.report)}
    ${history.length?`<details class="impact-history"><summary>${ico("history",17)} 이전 뉴스 단계별 교환 성과 ${history.length}건 확인</summary>
      <div class="impact-history-list">${history.map(x=>`<div class="impact-history-row">
        <span>${x.year}년 ${x.stage}차</span>
        ${x.report?.ready?`<strong class="${buyClass(x.report.differencePctPoint)}">${Number(x.report.differencePctPoint)>=0?"+":""}${Number(x.report.differencePctPoint).toFixed(2)}%p</strong>
        <span>${format(x.report.executedCount)}건 교환</span>`:`<em>기록 없음</em>`}
      </div>`).join("")}</div></details>`:""}
    <p class="small-note">※ 수익률은 해당 뉴스 단계의 시작 평가자산 대비 변동률입니다. 교환 효과는 두 시나리오의 차이이며, 미래 성과 예측이 아닙니다.</p>
  </div>`;
}
function impactLaunch(g) {
  const finished=g.room.phase==="finished";
  const latest=g.stageTradeHistory?.at(-1);
  if(!finished && g.room.phase!=="result"&&!latest)return "";
  if(finished)return `<section class="impact-launch final" aria-label="최종 교환 성과 분석 열기">
     <div class="impact-launch-symbol">${ico("trophy",30)}</div>
     <div><span class="eyebrow">THE FINAL REPORT · 8/8</span><h2>최종 카드 교환 성과 분석</h2>
     <p>최초 카드 보유 유지와 실제 교환 전략의 최종 수익률을 비교합니다.</p></div>
     <button type="button" data-action="view-final-impact" class="impact-launch-btn">최종 성과 팝업 보기 ${ico("arrow",18)}</button>
   </section>`;
  const report=g.room.phase==="result"?g.stageTradeReport:latest?.report;
  const isCurrent=g.room.phase==="result";
  const pp=Number(report?.differencePctPoint||0);
  return `<section class="impact-launch ${isCurrent?"active":""}" aria-label="뉴스 단계별 교환 성과 분석 열기">
    <div class="impact-launch-symbol">${ico("chart",28)}</div>
    <div><span class="eyebrow">${isCurrent?"NEW · MARKET REVEAL":"ROUND RECORD · PERFORMANCE"}</span>
    <h2>${isCurrent?"이번 턴 카드 교환 성과 발표":"지난 턴 카드 교환 성과"}</h2>
    <p>${report?.ready?`이번 단계 교환 효과 <b class="${buyClass(pp)}">${pp>=0?"+":""}${pp.toFixed(2)}%p</b> · 교환 ${format(report.executedCount)}건`:"카드 교환 성과 분석을 확인하세요."}</p></div>
    <button type="button" data-action="view-stage-impact" class="impact-launch-btn">성과 분석 팝업 보기 ${ico("arrow",18)}</button>
  </section>`;
}
function teacherStageImpact(g) {
  if(g.room.phase!=="result"||!g.stageTeamReports?.length)return "";
  return `<div class="teacher-impact-promo"><div><span class="eyebrow">ROUND ATTRIBUTION</span><strong>${g.room.year}년 ${g.room.stage}차 팀별 교환 효과</strong></div>
      <button type="button" class="btn gold" data-action="view-teacher-stage">팀별 수익률 분석 보기 ${ico("arrow",17)}</button></div>`;
}
function teacherStageImpactContent(g) {
  const rows=g.stageTeamReports||[];
  return `<p class="impact-lead">${g.room.year}년 ${g.room.stage}차 뉴스 단계에서, 거래하지 않은 경우와 실제 거래 성과를 비교합니다.</p>
    <div class="table-wrap"><table class="table impact-table"><thead><tr><th>팀</th><th>교환 없이</th><th>실제 수익률</th><th>교환 효과</th></tr></thead>
    <tbody>${rows.map(x=>`<tr><td>${h(x.teamName)}</td>${x.report?.ready?`<td>${pct(x.report.untouchedReturnPct)}</td><td>${pct(x.report.actualReturnPct)}</td>
    <td class="${buyClass(x.report.differencePctPoint)}">${x.report.differencePctPoint>=0?"+":""}${Number(x.report.differencePctPoint).toFixed(2)}%p</td>`:`<td colspan="3">${h(x.report?.reason||"분석 불가")}</td>`}</tr>`).join("")}</tbody></table></div>
    <p class="small-note">※ 강사 전용. 학생에게는 자신의 팀 결과만 전송됩니다.</p>`;
}
function autoOpenImpact() {
  if(!game||game.role!=="team"||document.querySelector("#info-modal")||document.querySelector("#draw-dialog"))return;
  let key=null,kind=null;
  if(game.room.phase==="result"&&game.lastResult) {
    key=`impact-v8:${game.team.id}:stage:${game.lastResult.at}`;
    kind="stage";
  } // Final round shows the full podium first; detailed report remains available via button.
  if(!key)return;
  try {
    if(sessionStorage.getItem(key))return;
    sessionStorage.setItem(key,"seen");
  }catch {
    if(window.__lastImpactOpened===key)return;
    window.__lastImpactOpened=key;
  }
  if(kind==="stage")showInfoModal("이번 턴 카드 교환 성과","ROUND IMPACT",stageImpactContent(game));
  else showInfoModal("최종 카드 교환 성과","FINAL PERFORMANCE",tradeImpactReport(game));
}

function tradeImpactReport(g){
  const r=g.tradeReport;
  if(g.room.phase!=="finished")return "";
  if(!r?.ready)return `<section class="panel section final-trade-report">
    <div class="final-impact-art" aria-hidden="true"></div>
    <span class="eyebrow">POST-GAME PERFORMANCE / TRADE ATTRIBUTION</span>
    <h2>${ico("chart",22)} 카드 교환 최종 성과</h2>
    <p class="panel-sub">${h(r?.reason||"최초 카드 구성 기록을 확인할 수 없어 교환 성과를 계산할 수 없습니다.")}</p></section>`;
  const d=r.difference;
  return `<section class="panel section final-trade-report" id="final-trade-impact">
    <div class="final-impact-art" aria-hidden="true"></div>
    <div class="section-title"><div><span class="eyebrow">POST-GAME PERFORMANCE / TRADE ATTRIBUTION</span>
      <h2>${ico("chart",22)} 카드 교환 최종 성과</h2></div><span class="pill green">게임 종료 후 공개</span></div>
    <p class="panel-sub">동일한 최종 산업 가격으로 <b>최초 카드 그대로 보유했다면</b>과 <b>실제 교환 결과</b>를 비교했습니다.</p>
    <div class="final-impact-grid">
      <div class="final-impact-box"><small>교환 없이 보유했다면</small><strong>${pct(r.untouchedReturnPct)}</strong><span>최종 평가액 ${format(r.untouchedValue)}원</span></div>
      <div class="final-impact-box chosen"><small>실제 카드 교환 후</small><strong class="${buyClass(r.actualReturnPct)}">${pct(r.actualReturnPct)}</strong><span>최종 평가액 ${format(r.finalTotal)}원</span></div>
    </div>
    <div class="final-impact-difference ${buyClass(d)}">
      <span>교환으로 달라진 최종 성과</span>
      <strong>${d>=0?"+":"−"}${format(Math.abs(d))}원 <small>(${r.differencePctPoint>=0?"+":""}${r.differencePctPoint.toFixed(2)}%p)</small></strong>
    </div>
    <details class="trade-attribution-details"><summary>${ico("history",17)} 내 카드 교환 ${r.executedCount}건의 최종 가치 기여 보기</summary>
      ${r.hasLegacyTrades?`<p class="small-note">예전 거래 기록 일부에 팀 식별 정보가 없어 거래별 상세 분석은 제공되지 않습니다.</p>`:""}
      ${r.contributions.length?`<div class="stack">${r.contributions.map(c=>`<div class="trade-contribution">
        <div><small>${c.year}년 ${c.stage||""}차 거래</small><strong>${h(sector(c.givenId).name)} ${c.givenQty}장 → ${h(sector(c.receivedId).name)} ${c.receivedQty}장</strong></div>
        <b class="${buyClass(c.difference)}">${c.difference>=0?"+":"−"}${format(Math.abs(c.difference))}원</b>
      </div>`).join("")}</div>`:`<p class="small-note">이 게임에서 확인된 카드 교환이 없습니다.</p>`}
    </details>
    <p class="small-note">※ 교환 효과 = 실제 최종 평가자산 − 초기 카드 그대로 보유했을 때의 최종 평가자산. 이는 같은 시장에서의 가상 비교이며, 개별 뉴스 직후의 실측 수익률이나 미래 수익 예측이 아닙니다. 교환마다 표시한 금액은 최종 가격 기준 기여도입니다.</p>
  </section>`;
}
function teacherTradeReports(g){
  if(g.room.phase!=="finished"||!g.teamTradeReports?.length)return "";
  return `<section class="panel section">
    <h2>${ico("chart",21)} 전체 팀 카드 교환 성과 분석</h2>
    <p class="small-note">같은 최종 가격에서 거래하지 않았을 경우와 비교한 차이입니다. 학생에게는 자기 팀 결과만 보입니다.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>팀</th><th>교환 없이</th><th>실제 수익률</th><th>교환 효과</th></tr></thead>
    <tbody>${g.teamTradeReports.map(x=>`<tr><td>${h(x.teamName)}</td>${x.report?.ready?
      `<td>${pct(x.report.untouchedReturnPct)}</td><td>${pct(x.report.actualReturnPct)}</td><td class="${buyClass(x.report.differencePctPoint)}">${x.report.differencePctPoint>=0?"+":""}${x.report.differencePctPoint.toFixed(2)}%p</td>`:
      `<td colspan="3">과거 최초 카드 기록 없음</td>`}</tr>`).join("")}</tbody></table></div>
  </section>`;
}
function showInfoModal(title,subtitle,contents){
  document.querySelector("#info-modal")?.remove();
  const dialog=document.createElement("dialog");
  dialog.id="info-modal";dialog.className="asset-modal info-modal";
  dialog.setAttribute("aria-labelledby","info-modal-title");
  dialog.innerHTML=`<div class="modal-head">
    <div><span class="eyebrow">${h(subtitle)}</span><h2 id="info-modal-title">${h(title)}</h2></div>
    <button type="button" class="modal-close" data-action="close-info" aria-label="팝업 닫기">${ico("close",20)}</button>
    </div>${contents}`;
  document.body.append(dialog);
  dialog.addEventListener("click",ev=>{if(ev.target===dialog)dialog.close();});
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  dialog.showModal();
}
function priceChangeGraph(changes){
  const values=Array.isArray(changes)?changes:[];
  const peak=Math.max(5,...values.map(x=>Math.abs(Number(x.gameModelPct)||0)));
  return `<div class="price-change-chart" role="img" aria-label="산업별 게임 가격 변동률 막대그래프">
    ${values.map(x=>{
      const value=Number(x.gameModelPct)||0;
      const size=Math.max(2,Math.round(Math.abs(value)/peak*100));
      return `<div class="price-change-item"><span class="price-change-name">${h(x.name)}</span>
        <span class="price-change-meter"><i class="${buyClass(value)}" style="width:${size}%"></i></span>
        <strong class="${buyClass(value)}">${pct(value)}</strong></div>`;
    }).join("")}</div>`;
}
function resultTable(r){
  return `<div class="table-wrap"><table class="table result-table"><thead><tr>
    <th>산업</th><th>전(원)</th><th>후(원)</th><th>변동률</th><th>실측</th>
    </tr></thead><tbody>${r.changes.map(x=>`<tr><td>${h(x.name)}</td>
    <td>${format(x.previous)}</td><td><b>${format(x.price)}</b></td>
    <td class="${buyClass(x.gameModelPct)}">${pct(x.gameModelPct)}</td>
    <td>${r.endingYear&&Number.isFinite(x.observedAnnualPct)?pct(x.observedAnnualPct):"연도 종료 후"}</td>
    </tr>`).join("")}</tbody></table></div>`;
}
function revealSummary(r){
  const sorted=[...r.changes].sort((a,b)=>b.gameModelPct-a.gameModelPct);
  return `<div class="reveal-metrics">
    <div class="reveal-metric"><small>이번 단계 상승 1위</small><strong class="gain">${h(sorted[0].name)} ${pct(sorted[0].gameModelPct)}</strong></div>
    <div class="reveal-metric"><small>이번 단계 하락/최저</small><strong class="${buyClass(sorted.at(-1).gameModelPct)}">${h(sorted.at(-1).name)} ${pct(sorted.at(-1).gameModelPct)}</strong></div>
  </div>`;
}
function teacherReveal(g){
  const active=g.room.phase==="result"||g.room.phase==="finished";
  const r=active?g.lastResult:null;
  const brief=g.teacherBrief||[];
  return `<section class="panel section reveal-panel" id="price-reveal">
    <div class="section-title"><div><span class="eyebrow">INSTRUCTOR REVEAL DESK</span>
      <h2>${ico('chart',22)} 가격 발표 · 쉬운 뉴스 해설</h2></div>
      <span class="pill ${r?"green":"gold"}">${r?"결과 발표 가능":"결과 대기"}</span></div>
    ${r?`<div class="result-banner"><h3>${r.year}년 ${r.stageIndex+1}차 시장 가격 발표</h3>
      <p>아래 숫자와 해설을 화면에 공유해 학생들과 투자 판단을 복기하세요.</p></div>
      ${revealSummary(r)}${priceChangeGraph(r.changes)}<details class="result-detail-table"><summary>산업별 상세 수치 표 보기</summary>${resultTable(r)}</details>${teacherStageImpact(g)}
      <div class="teaching-insight"><b>${ico("shield",17)} 강사용 핵심 해설 · 학생 비공개</b>
        ${brief.map(n=>`<p><strong>${h(n.title)}</strong> — ${h(n.analysis||"사건의 영향과 실제 성과를 구분하여 토론하세요.")}</p>`).join("")}
      </div>`:
      `<div class="reveal-wait"><div class="reveal-icon">${ico("lock",33)}</div><strong>아직 가격 발표 전입니다</strong>
       <p>뉴스 확인 → 카드 교환 시간이 끝나면 서버가 가격을 계산하고 이곳에 <b>11개 산업의 이전 가격·새 가격·변동률</b>을 자동 표시합니다. 그때까지 미공개 수익률은 표시하지 않습니다.</p></div>
       <div class="teaching-insight"><b>${ico("shield",17)} 현재 공개된 뉴스 — 강사 전용 해설</b>
       ${brief.map(n=>`<p><strong>${h(n.title)}</strong> — ${h(n.analysis||"")}</p>`).join("")||"<p>강사가 게임을 시작하면 현재 뉴스의 분석 자료를 볼 수 있습니다.</p>"}</div>`}
    ${(g.resultHistory||[]).length?`<details class="past-results"><summary>${ico("history",17)} 이전 가격 발표 기록 ${(g.resultHistory||[]).length}회 보기</summary>
      ${(g.resultHistory||[]).map(item=>`<details class="result-history-item"><summary>${item.year}년 ${item.stageIndex+1}차 결과</summary>${revealSummary(item)}${resultTable(item)}</details>`).join("")}</details>`:""}
    <p class="small-note">※ 수익률은 11개 미국 섹터 ETF의 연간 또는 YTD 성과를 게임의 두 단계로 배분한 교육용 모델입니다. 개별 뉴스 발표 직후 실제 가격 변화와 동일하지 않습니다.</p>
  </section>`;
}
function teacherActions(g){
  const r=g.room;
  return `<section class="panel section control-panel">
    <div class="section-title"><div><span class="eyebrow">GAME CONTROL CENTER</span><h2>${ico("settings",21)} 강사 진행 콘솔</h2></div>
    <span class="pill gold">${h(phaseText[r.phase])}</span></div>
    <div class="info">시간은 서버에서 관리합니다. <b>가격 발표가 나오면 결과를 설명한 뒤 [다음 뉴스 공개]를 누르세요.</b></div>
    <div class="button-area">
      ${r.phase==="lobby"?`<button class="btn gold" data-action="start" ${r.teamCount<2||r.undrawnTeams>0?"disabled":""}>게임 시작 (${r.teamCount}팀)</button>`:""}
       ${r.phase==="lobby"&&r.undrawnTeams>0?`<p class="small-note draw-teacher-wait">${ico("cards",16)} 카드 뽑기를 마치지 않은 팀: <b>${r.undrawnTeams}팀</b> · 모두 선택하면 시작할 수 있습니다.</p>`:""}
      ${["news","trade"].includes(r.phase)?`<button class="btn" data-action="pause">일시정지</button>`:""}
      ${r.phase==="paused"?`<button class="btn green" data-action="resume">진행 재개</button>`:""}
      ${r.phase==="result"?`<button class="btn gold" data-action="next">${r.round===r.totalRounds&&r.stage===2?"최종 종료·우승팀 확정":"다음 뉴스 공개 →"}</button>`:""}
      <button class="btn" data-action="csv">순위 CSV 저장</button>
      <button class="btn danger reset-main-button" data-action="reset">↺ 새 게임 시작 · 전체 초기화</button>
    </div>
    ${r.phase==="lobby"?`<form id="config-form" class="grid-2" style="margin-top:22px">
      <label class="field">뉴스 읽기 시간(초)<input name="newsSeconds" type="number" min="15" max="300" value="${r.config.newsSeconds}" required></label>
      <label class="field">교환 시간(초)<input name="tradeSeconds" type="number" min="20" max="600" value="${r.config.tradeSeconds}" required></label>
      <button type="submit" class="btn wide" style="grid-column:1/-1">시간 설정 저장</button>
    </form>`:""}
    <div class="reveal-jump"><a href="#price-reveal">${ico("arrow",17)} 가격 발표 및 뉴스 해설 보기</a></div>
  </section>`;
}
function qrTeacher(g){
  const link=g.room.joinUrl||window.location.origin+"/join";
  return `<section class="panel section"><div class="section-title"><h2>${ico("qrcode",21)} 학생 QR 입장</h2><span class="pill green">PIN ${h(g.room.pin)}</span></div>
    <div class="qr-box"><img alt="게임 참가 QR코드" src="/api/qr.svg?time=${g.version}">
      <div><h3>스마트폰 카메라로 스캔</h3><p class="panel-sub">학생은 주소 접속 → 팀명·구성원·PIN 입력으로 참가합니다. PIN은 QR코드에 포함되지 않습니다.</p>
      <p class="qr-url">${h(link)}</p>
      ${new URL(link).hostname==="localhost"||new URL(link).hostname==="127.0.0.1"?
       '<div class="alert">⚠️ 이 QR은 localhost를 가리킵니다. 학생 스마트폰 접속용으로는 강사 PC의 내부 IP 또는 HTTPS 배포 주소로 열어 주세요.</div>':""}
      <div class="btn-row">
      <button class="btn tiny" data-action="copy-link">참가 주소 복사</button>
      ${g.room.phase==="lobby"?'<button class="btn tiny" data-action="pin">PIN 재발급</button>':""}
      </div></div></div></section>`;
}
function teacherMembers(g){
  return `<section class="panel section"><h2>${ico("users",21)} 입장 팀 관리</h2>
    ${g.teacherMembers.length?g.teacherMembers.map(x=>`<div class="member"><div><b>${h(x.name)}</b><div class="small-note">${h(x.members.join(" · "))}</div></div>
     ${g.room.phase==="lobby"?`<button class="btn tiny danger" data-action="kick" data-id="${h(x.id)}">퇴장</button>`:""}</div>`).join(""):'<div class="empty">학생의 입장을 기다립니다.</div>'}
    </section>`;
}
function illustratedStage(g){
  const phase=g.room.phase;
  const stageCopy={
    lobby:["READY ROOM · STARTING PORTFOLIO","게임 시작 준비","110장의 산업 카드로 여러분만의 포트폴리오를 완성하세요."],
    news:["MARKET BRIEFING · RESEARCH","뉴스 분석 시간","지금 공개된 경제 뉴스에서 산업별 기회와 위험을 찾아보세요."],
    trade:["LIVE EXCHANGE · CARD STRATEGY","카드 교환 시간","다른 팀의 제안을 살펴보고 보유 카드로 새로운 기회를 만드세요."],
    paused:["GAME PAUSED · CLASSROOM","강사가 게임을 잠시 멈췄습니다","뉴스를 다시 검토하고 재개 후 진행할 전략을 준비하세요."],
    result:["MARKET REVEAL · PRICE MOVEMENT","시장 가격 발표","뉴스와 산업 가격 변화를 비교하고 다음 판단을 준비하세요."],
    finished:["THE FINAL BELL · RESULTS","최종 투자 결과","최종 투자 수익률과 카드 교환이 성과에 기여한 정도를 살펴보세요."]
  };
  const [eyebrow,title,description]=stageCopy[phase]||stageCopy.lobby;
  return `<section class="illustrated-stage illustrated-${h(phase)}" aria-label="게임 진행 안내">
    <div class="illustrated-stage-text">
      <span class="illustrated-eyebrow">${eyebrow}</span>
      <h2>${title}</h2>
      <p>${description}</p>
      <div class="illustrated-stage-metadata"><span>${g.room.year}년 ${g.room.stage}차 뉴스</span><span>진행 ${g.room.phase==="finished"?g.room.totalRounds*2:Math.max(0,Math.min(g.room.totalRounds*2,(g.room.round-1)*2+g.room.stage))} / ${g.room.totalRounds*2}단계</span></div>
       <div class="stage-flow" aria-label="진행 과정">
         <span class="${phase==="news"?"current":phase==="lobby"?"":"done"}">01 뉴스 분석</span>
         <i></i><span class="${phase==="trade"?"current":["result","finished"].includes(phase)?"done":""}">02 카드 교환</span>
         <i></i><span class="${phase==="result"?"current":phase==="finished"?"done":""}">03 가격 발표</span>
       </div>
    </div><div class="illustrated-stage-art" aria-hidden="true"></div>
  </section>`;
}
function statusStats(g){
  const r=g.room;
  const my=g.team;
  return `<div class="stat-grid">
    ${stat(r.phase==="finished"?"최종 턴":"현재 턴",r.phase==="finished"?`${r.totalRounds} / ${r.totalRounds}`:`${r.round} / ${r.totalRounds}`,r.phase==="finished"?`전체 ${r.totalRounds*2}단계 완료`:`${r.year}년 ${r.stage}단계`)}
    ${stat("남은 시간","<span data-countdown>"+countdown(g)+"</span>",phaseText[r.phase])}
    ${stat("참가팀",`${r.teamCount}팀`,"실시간 동기화")}
    ${stat(my?"우리 팀 수익률":"현재 최고 수익률",my?pct(my.returnPct):pct(g.scores[0]?.returnPct||0),my?format(my.total)+"원 · 마지막 가격 발표 기준":g.scores[0]?.name||"대기 중",my?buyClass(my.returnPct):"")}
  </div><div class="timer-tools">
    <div class="timer-alert-bar" data-timer-alert role="status" aria-live="polite"></div>
    <button type="button" class="timer-sound-btn" data-action="toggle-timer-sound"
      aria-label="효과음 켜기 또는 끄기" aria-pressed="${timerSoundEnabled}">
      ${ico("time",15)} 효과음 ${timerSoundEnabled?"켬":"끔"}</button>
    <button type="button" class="timer-sound-btn ambient-toggle" data-action="toggle-ambient"
      aria-label="배경음악 켜기 또는 끄기" aria-pressed="${ambientEnabled}">
      ${ico("play",15)} 배경음악 ${ambientEnabled?"켬":"끔"}</button>
  </div>`;
}
function resetConfirmDialog(){
  return `<dialog id="reset-dialog" class="asset-modal reset-modal" aria-labelledby="reset-title">
    <div class="modal-head">
      <div><span class="eyebrow">NEW CLASS / RESET</span><h2 id="reset-title">새 강의로 다시 시작</h2></div>
      <button type="button" class="btn tiny" data-action="cancel-reset">닫기 ✕</button>
    </div>
    <div class="reset-warning">⚠️ 아래 자료가 서버와 Supabase에서 모두 초기화됩니다.</div>
    <ul class="reset-list">
      <li>기존 참가팀과 학생 로그인 정보</li>
      <li>보유 카드, 교환 제안 및 체결 기록</li>
      <li>가격 발표, 순위, 게임 진행 단계</li>
    </ul>
    <p class="small-note">2020년 첫 턴 · 참가팀 0팀으로 돌아가며 새 참가 PIN이 발급됩니다. 강사 로그인은 유지됩니다. 수업 기록이 필요하면 먼저 순위 CSV를 저장하세요.</p>
    <form id="reset-form">
      <label class="field">실행하려면 <b>초기화</b>라고 입력하세요.
        <input name="confirm" required pattern="초기화|RESET" placeholder="초기화" autocomplete="off">
      </label>
      <div class="btn-row reset-btn-row">
        <button type="button" class="btn" data-action="cancel-reset">취소</button>
        <button type="submit" class="btn danger reset-confirm-button">전체 초기화 실행</button>
      </div>
    </form>
  </dialog>`;
}
function teacherView(g){
  statusTop.textContent=`강사 모드 · ${g.room.year}년 · ${phaseText[g.room.phase]}`;
  return `${headLine(g,"실시간 강사 대시보드","뉴스 공개 · 거래 시간 · 시장 가격 반영을 서버에서 통제합니다.")}
    ${illustratedStage(g)}${statusStats(g)}${finalPodium(g)}
    <div class="beginner-teacher-banner"><strong>초급 코스 · 2020~2023 · 총 8단계</strong>
       <span>거래 연습 ${g.practiceStats?.completed||0}/${g.practiceStats?.total||0}팀 ·
       현재 퀴즈 참여 ${g.quizStats?.answered||0}/${g.quizStats?.total||0}팀</span>
       <span>힌트는 미래 가격을 공개하지 않으며, 강사용 해설은 학생 API에서 제외됩니다.</span></div>
    <div class="editorial-teacher-actions">
 <a class="btn gold" href="/present" target="_blank" rel="noopener">▣ 발표 전용 화면</a>
 <a class="btn" href="/report" target="_blank" rel="noopener">▤ 수업 리포트 · PDF 인쇄</a>
 </div>${predictionTeacherPanel(g)}${quickPanels(g)}${teacherTradeReports(g)}
    <div class="instructor-command-layout"><div class="instructor-primary">${teacherReveal(g)}</div>
      <aside class="instructor-sidebar">${teacherActions(g)}${qrTeacher(g)}</aside></div>
    <div class="two-col-main"><div>${newsList(g)}${market(g)}</div>
    <div>${teacherMembers(g)}</div></div>
    ${g.lastResetAt?`<p class="reset-success-info">마지막 게임 초기화: ${h(new Date(g.lastResetAt).toLocaleString("ko-KR"))}</p>`:""}
    <div class="btn-row"><button class="btn" data-action="logout">강사 로그아웃</button></div>
    ${resetConfirmDialog()}`;
}

let activeClassroomTab="news",previousClassroomStage="";
function classroomStageTab(g){
 const marker=`${g.room.year}-${g.room.stage}-${g.room.phase}`;
 if(previousClassroomStage!==marker){
   previousClassroomStage=marker;
   activeClassroomTab=["result","finished"].includes(g.room.phase)?"result":
     g.room.phase==="trade"?"trade":"news";
 }
 const tabs=[["news","01","신문·경제개념"],["trade","02","카드 교환·내 카드"],["result","03","결과·리플레이"]];
 return `<nav class="editorial-stage-nav" role="tablist" aria-label="게임 단계">
 ${tabs.map(([id,n,label])=>`<button type="button" role="tab" aria-selected="${activeClassroomTab===id}"
  data-action="classroom-tab" data-id="${id}" class="${activeClassroomTab===id?"active":""}"><small>${n}</small><strong>${label}</strong></button>`).join("")}
 </nav>`;
}
function classroomPane(id,content){
 return `<section class="classroom-pane ${activeClassroomTab===id?"is-active":""}" data-classroom-pane="${id}">${content}</section>`;
}
function predictionPanel(g){
 if(!g.team||g.room.phase==="lobby")return "";
 const p=g.myPrediction,open=["news","trade"].includes(g.room.phase);
 const picked=g.sectors.find(x=>x.id===p?.sectorId);
 const change=g.lastResult?.changes?.find(x=>x.id===p?.sectorId);
 return `<section class="panel section prediction-panel" id="prediction-panel">
 <div class="section-title"><div><span class="eyebrow">PREDICT & LEARN</span><h2>${ico("target",20)} 우리 팀의 산업 예측</h2></div></div>
 <p class="panel-sub">뉴스가 어떤 산업에 영향을 줄까요? 미래 가격을 미리 볼 수 없으며, 선택의 이유가 더 중요합니다.</p>
 ${p?`<div class="prediction-commit"><b>선택 산업: ${h(picked?.name||"")}</b><p>우리 팀의 근거: ${h(p.reason)}</p>
  ${["result","finished"].includes(g.room.phase)&&change?
   `<strong class="${buyClass(change.gameModelPct)}">이번 발표 · ${h(picked?.name||"")} ${pct(change.gameModelPct)}</strong>`:
   "<span>가격 발표 후 예상과 결과를 비교할 수 있어요.</span>"}</div>`:
 open?`<form id="prediction-form" class="prediction-form">
  <label>상승할 것으로 예상하는 산업
   <select name="sectorId" required>${g.sectors.map(s=>`<option value="${s.id}">${h(s.name)} · ${h(s.ticker)}</option>`).join("")}</select></label>
  <label>선택한 이유 (4자 이상)
   <textarea name="reason" maxlength="160" minlength="4" required placeholder="예: 유가가 오르면 에너지 산업에 도움이 될 것 같아요."></textarea></label>
  <button class="btn gold" type="submit">우리 팀 예상 제출</button>
 </form>`:`<p class="small-note">이 단계의 예상 제출 시간이 종료됐습니다.</p>`}
 <p class="small-note">교육용 예측 기록이며 정답 추천이나 미래 가격 공개가 아닙니다.</p>
 </section>`;
}
function predictionTeacherPanel(g){
  const board=g.predictionBoard;
  if(!board)return "";
  const entries=(board.entries||[]).slice().sort((a,b)=>a.teamName.localeCompare(b.teamName,"ko"));
  const counts=Object.entries(entries.reduce((m,p)=>{m[p.sectorId]=(m[p.sectorId]||0)+1;return m;},{}))
    .map(([id,count])=>({sector:g.sectors.find(s=>s.id===Number(id)),count}))
    .sort((a,b)=>b.count-a.count);
  return `<section class="panel section prediction-panel teacher-predictions" id="teacher-predictions">
    <div class="section-title"><div><span class="eyebrow">INSTRUCTOR / LIVE TEAM FORECASTS</span>
      <h2>${ico("target",21)} ${g.room.year}년 ${g.room.stage}차 · 팀별 산업 예측</h2></div>
      <span class="pill green">${board.answered||0}/${board.total||0}팀 제출</span></div>
    <p class="panel-sub">강사용 비공개 기록 · 팀별 예상 산업과 판단 근거를 발표 후 함께 토론하세요.</p>
    ${counts.length?`<div class="teacher-forecast-bars">${counts.map(x=>`<div><span>${h(x.sector?.name||"기타")}</span><i><em style="width:${Math.round(x.count/Math.max(1,board.total)*100)}%"></em></i><b>${x.count}팀</b></div>`).join("")}</div>`:""}
    <div class="teacher-forecast-list">${entries.map(p=>`<article class="teacher-forecast-entry"><b>${h(p.teamName)}</b>
      <span>${h(g.sectors.find(x=>x.id===p.sectorId)?.name||"")}</span><p>${h(p.reason)}</p></article>`).join("")||'<p class="small-note">이번 뉴스 단계에서 아직 제출한 팀이 없습니다.</p>'}</div>
  </section>`;
}

function replayPanel(g){
 const rows=(g.stageTradeHistory||[]).slice().reverse();
 if(!rows.length&&!g.lastResult)return '<section class="panel section"><h3>아직 가격 발표 전입니다</h3><p>발표 후 이번 턴을 복습할 수 있습니다.</p></section>';
 return `<section class="panel section round-replay" aria-label="턴별 카드 교환 성과">
 <h2>턴별 카드 교환 성과</h2>
 ${!rows.length?'<p class="small-note">이번 단계에 기록된 카드 교환 내역이 없습니다.</p>':""}
 ${rows.map(x=>`<div class="replay-history-item"><b>${x.year}년 ${x.stage}차</b>
 ${x.report?.ready?`<span>교환 효과 ${Number(x.report.differencePctPoint)>=0?"+":""}${Number(x.report.differencePctPoint).toFixed(2)}%p</span>`:"<span>해당 기록 없음</span>"}
 </div>`).join("")}
 ${impactLaunch(g)}
 </section>`;
}


function relationMap(g){
  // 공개된 사건에 해당하는 내용만 표시하며, 로비·미공개 턴에는 보이지 않습니다.
  if(["lobby"].includes(g.room.phase)) return "";
  const r=g.room,low=r.stage===1?1:3,high=r.stage===1?2:4;
  const events=(g.news||[]).filter(x=>x.year===r.year&&
    Number(x.id.split("-").at(-1))>=low&&Number(x.id.split("-").at(-1))<=high);
  if(!events.length)return "";
  return `<section class="panel section industry-relationship" aria-label="공개된 뉴스의 경제 개념">
    <div class="section-title"><div><span class="eyebrow">TODAY'S CONCEPT / ${r.year} · ${r.stage}</span>
      <h2>${ico("book",20)} 이번 뉴스로 배우는 경제 개념</h2></div>
      <span class="pill gold">${events.length}건의 실제 뉴스</span></div>
    <div class="concept-story-list">${events.map((x,i)=>{
      const c=x.learning_concept;
      if(!c)return "";
      return `<article class="concept-story">
        <span class="concept-story-index">ARTICLE ${String(i+1).padStart(2,"0")}</span>
        <h3>${h(x.title)}</h3>
        <div class="relationship-flow">
          <div class="relation-node"><small>경제 개념</small><b>${h(c.concept)}</b></div>
          <div class="relation-arrow" aria-hidden="true">→</div>
          <div class="relation-node"><small>살펴볼 산업</small><b>${h(c.watch)}</b></div>
        </div>
        <p class="concept-story-question">${ico("target",16)} ${h(c.question)}</p>
      </article>`;
    }).join("")}</div>
    <p class="small-note">현재 공개된 사건을 이해하기 위한 질문입니다. 상승·하락 정답이나 미래 가격을 미리 알려주지 않습니다.</p>
  </section>`;
}


// Final standings are read from the server score board; never recompute rank locally.
function finalPodium(g){
  if(g?.room?.phase!=="finished")return "";
  const scores=(g.scores||[])
    .filter(x=>x && Number.isFinite(Number(x.rank)))
    .slice().sort((a,b)=>Number(a.rank)-Number(b.rank)||Number(b.total||0)-Number(a.total||0));
  const top=scores.slice(0,3);
  // Do not show an empty bronze podium when only two teams participated.
  const order=top.length===1?[1]:top.length===2?[2,1]:[2,1,3];
  const medal={1:"🥇",2:"🥈",3:"🥉"};
  const title={1:"투자 챔피언",2:"준우승",3:"3위 수상"};
  const podiumSlot=(rank)=>{
    const x=top.find(item=>Number(item.rank)===rank);
    if(!x)return "";
    const mine=Boolean(g.team&&x.id===g.team.id);
    return `<article class="final-podium-slot rank-${rank} ${mine?"is-mine":""}" aria-label="${rank}위 ${h(x.name)}">
      <span class="podium-ribbon">${h(title[rank])}</span>
      <div class="podium-medal" aria-hidden="true">${medal[rank]}</div>
      <strong class="podium-team">${h(x.name)}${mine?` <span class="podium-me">우리 팀</span>`:""}</strong>
      <span class="podium-score-label">최종 수익률</span>
      <span class="podium-return ${buyClass(x.returnPct)}">${pct(x.returnPct)}</span>
      <div class="podium-step"><span>${rank}<small>위</small></span></div>
    </article>`;
  };
  const mine=scores.find(x=>g.team&&x.id===g.team.id);
  const winner=scores.find(x=>Number(x.rank)===1);
  const maxStages=Number(g.room.totalRounds||0)*2;
  return `<section class="panel final-awards final-awards-v355" id="final-awards" aria-labelledby="final-awards-title">
    <div class="final-awards-heading">
      <span class="final-awards-kicker">${ico("trophy",20)} GAME COMPLETE · 최종 시상식</span>
      <h2 id="final-awards-title">우리들의 투자 올림픽</h2>
      <p>경제 뉴스와 카드 교환으로 완성한 우리 반의 투자 기록</p>
      <div class="final-awards-facts">
        <span>참가 <b>${scores.length}팀</b></span>
        <span>전체 <b>${maxStages}단계 완료</b></span>
        ${winner?`<span>우승 <b>${h(winner.name)}</b></span>`:""}
      </div>
    </div>
    ${top.length?`<div class="final-podium count-${top.length}" role="group" aria-label="최종 상위 ${top.length}개 팀 시상대">
      ${order.map(podiumSlot).join("")}
    </div>`:`<p class="final-no-scores">최종 순위 집계 결과를 기다리고 있습니다.</p>`}
    ${mine?`<div class="final-my-team">
      <span>${ico("target",18)} 우리 팀의 최종 성적</span>
      <strong>${h(mine.name)} <em>${h(mine.rank)}위 / ${scores.length}팀</em></strong>
      <div class="final-my-team-numbers"><b class="${buyClass(mine.returnPct)}">${pct(mine.returnPct)}</b><span>평가자산 ${format(mine.total)}원</span></div>
    </div>`:""}
    <p class="final-awards-footnote">서버 확정 순위를 표시합니다. 아래에서 산업별 가격 변화와 카드 교환 성과를 살펴보세요.</p>
  </section>`;
}

function studentView(g){
  statusTop.textContent=`${g.team.name} · ${g.room.year}년 · ${phaseText[g.room.phase]}`;
  return `${headLine(g,`${h(g.team.name)}의 투자 전략실`,"경제를 몰라도 괜찮아요! 쉬운 뉴스 요약을 읽고 카드 교환을 연습해 보세요.")}
    ${illustratedStage(g)}${statusStats(g)}${beginnerGuide(g)}${quickPanels(g)}
    ${g.room.phase==="paused"?`<div class="alert">${ico("pause",17)} 강사가 게임을 일시정지했습니다. 거래는 잠겨 있습니다.</div>`:""}
    ${g.room.phase==="lobby"?`<div class="info">${ico("check",17)} 참가 완료! <b>우리 팀은 카드 110장을 단 한 번 뽑습니다.</b> 강사의 게임 시작을 기다려 주세요.</div>${teamLobbyPanel(g)}${beginnerPractice(g)}`:""}
    ${g.room.phase==="finished"?`<div class="result-banner"><h3>${ico("trophy",20)} 게임 종료</h3><p>아래 최종 순위 시상식과 산업별 시장 결과를 확인해 보세요.</p></div>`:""}
    ${classroomStageTab(g)}
    ${classroomPane("news",`${newsList(g)}${predictionPanel(g)}${beginnerCoach(g)}${beginnerQuiz(g)}${beginnerQuizReview(g)}`)}
    ${classroomPane("trade",`${listingBoard(g)}
     <details class="collection-dropdown" id="my-cards-dropdown">
       <summary>${ico("cards",22)} <span><b>나의 산업 카드 컬렉션</b><small>보유한 카드를 확인하고 교환 제안을 작성하세요</small></span>
         <em>${g.team?.cardCount||0}장 보유 · 펼쳐보기</em>${ico("arrow",18)}</summary>
       ${market(g,true)}
     </details>`)}
    
    ${classroomPane("result",`${finalPodium(g)}${beginnerResult(g)}${results(g)}${replayPanel(g)}`)}
    <div class="btn-row"><button class="btn" data-action="logout">참가 종료(로그아웃)</button></div>`;
}
function landingView(g){
  statusTop.textContent="2020–2023 · 투자 첫걸음";
  return `<section class="welcome-head">
    <span class="eyebrow">INVEST PLAY · BEGINNER EDITION</span>
    <h1>뉴스를 읽고 카드를 바꾸는,<br><em>나의 첫 투자 수업.</em></h1>
    <p>어려운 경제 용어를 몰라도 괜찮아요. 쉬운 뉴스 요약을 읽고 친구들과 카드를 바꾸며 시장을 배워요.<br>4개 연도 · 8단계 · 팀당 110장</p>
    <div class="welcome-preview">
      ${["XLK","XLE","XLF"].map(t=>{const s=g.sectors.find(x=>x.ticker===t);return s?`<div class="preview-card">${sectorArt(s,true)}<strong>${h(s.name)}</strong></div>`:"";}).join("")}
    </div>
  </section>
  <div class="role-choice-grid">
    <a class="role-choice student-role" href="/join"><span class="role-icon">${ico("cards",30)}</span><span class="eyebrow">STUDENT / TEAM</span>
      <h2>학생으로 참가</h2><p>팀 등록 · 시작 카드 선택 · 뉴스 분석 · 카드 교환</p><span class="role-cta">학생 입장하기 →</span></a>
    <a class="role-choice teacher-role" href="/teacher"><span class="role-icon">${ico("chart",30)}</span><span class="eyebrow">INSTRUCTOR</span>
      <h2>강사 콘솔 접속</h2><p>QR코드 · 뉴스 공개 · 시간 제어 · 가격 발표 및 해설</p><span class="role-cta">강사 화면 열기 →</span></a>
  </div>`;
}
function joinView(g){
  statusTop.textContent="학생 전용 입장 · 강사 로그인 없음";
  if(g.role==="teacher")return `<section class="panel dedicated-entry"><h2>현재 기기에 강사로 로그인되어 있습니다</h2>
    <p>강사 계정으로 참가팀을 등록할 수 없습니다. 학생은 다른 스마트폰 또는 시크릿 창에서 QR코드를 스캔하세요.</p>
    <a class="btn" href="/teacher">강사 콘솔로 이동 →</a></section>`;
  return `<div class="entry-heading"><span class="eyebrow">STUDENT / TEAM ENTRY</span>
    <h1>투자게임에 참가하기</h1><p>강사가 제공한 6자리 참가 PIN과 팀 정보를 입력하세요.</p></div>
    <section class="panel dedicated-entry">
      <form id="join-form">
        <label class="field">팀 이름<input name="name" placeholder="예: 가치투자 1팀" maxlength="18" minlength="2" required autocomplete="off"></label>
        <label class="field">팀 구성원 이름 (쉼표로 구분)<input name="members" placeholder="예: 김학생, 이학생, 박학생" required autocomplete="off"></label>
        <label class="field">참가 PIN (6자리)<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="강사에게 받은 참가 PIN" required autocomplete="off"></label>
        <button class="btn gold wide" type="submit">팀 만들고 시작 카드 선택 →</button>
      </form><p class="small-note">한 브라우저는 한 팀으로 참여합니다. 이미 참가한 팀은 다시 등록하지 말고 기존 팀 화면에서 이름을 변경하세요.</p>
      <div class="entry-state"><strong>현재 등록팀 ${g.room.teamCount}팀</strong><small>서버에 등록된 팀 수이며 접속 중인 기기 수와는 다릅니다.</small></div>
    </section>`;
}
function teacherLoginView(g){
  statusTop.textContent="강사 전용 페이지";
  if(g.role==="team")return `<section class="panel dedicated-entry"><h2>학생팀으로 접속 중입니다</h2>
    <p>강사 콘솔은 별도 브라우저에서 이용하세요.</p><button class="btn" data-action="logout">참가 종료 후 강사 로그인</button></section>`;
  return `<div class="entry-heading"><span class="eyebrow">INSTRUCTOR ACCESS</span>
    <h1>강사 관리 콘솔</h1><p>서버에 설정한 강사용 비밀번호로 입장합니다.</p></div>
    <section class="panel dedicated-entry"><form id="login-form">
      <label class="field">강사 비밀번호<input name="password" type="password" autocomplete="current-password" placeholder="Render 환경변수에 설정한 비밀번호" required></label>
      <button class="btn gold wide" type="submit">대시보드 열기 →</button>
    </form></section>`;
}
function render(){
  if(!game)return;
  const route=location.pathname;
  root.innerHTML=route==="/join"&&game.role==="teacher"?joinView(game):
    game.role==="teacher"?teacherView(game):
    game.role==="team"&&game.team?studentView(game):
    route==="/teacher"?teacherLoginView(game):
    route==="/join"?joinView(game):landingView(game);
  tickCountdown();
  syncDrawDialog();
  document.querySelectorAll(".sector-image img").forEach(img=>{
    if(img.complete&&img.naturalWidth>0)img.closest(".sector-image")?.classList.add("is-loaded");
  });
  if(game.role==="team")Promise.resolve().then(()=>{
    try{autoOpenImpact();}catch(error){console.warn("결과 안내 자동 표시 생략",error);}
  });
}

// Native browser confirm() exposes the site address on iPhone Safari.
// Use a game-themed, keyboard-accessible <dialog> instead.
function gameConfirm(message,{title="확인",confirmText="확인",danger=false}={}){
  return new Promise(resolve=>{
    document.querySelector("#game-confirm-dialog")?.remove();
    const dialog=document.createElement("dialog");
    dialog.id="game-confirm-dialog";
    dialog.className="game-confirm-dialog";
    dialog.setAttribute("aria-labelledby","game-confirm-title");
    dialog.setAttribute("aria-describedby","game-confirm-body");
    dialog.innerHTML=`<div class="game-confirm-head">${ico("exchange",28)}
       <h2 id="game-confirm-title">${h(title)}</h2></div>
       <p id="game-confirm-body">${h(message)}</p>
       <div class="game-confirm-actions">
         <button type="button" class="btn" data-confirm="cancel">취소</button>
         <button type="button" class="btn ${danger?"danger":"gold"}" data-confirm="ok">${h(confirmText)}</button>
       </div>`;
    const finish=confirmed=>{if(dialog.open)dialog.close();dialog.remove();resolve(confirmed);};
    dialog.addEventListener("click",event=>{
      const button=event.target.closest?.("[data-confirm]");
      if(button)finish(button.dataset.confirm==="ok");
      else if(event.target===dialog)finish(false);
    });
    dialog.addEventListener("cancel",()=>{dialog.remove();resolve(false);},{once:true});
    document.body.append(dialog);
    try{dialog.showModal();}catch{dialog.remove();resolve(false);}
  });
}

async function mutate(url,data,success){
  if(busy)return false;busy=true;
  try{await api(url,data);await refresh(true);if(success)toast(success);return true;}
  catch(e){toast(e.message);return false;}
  finally{busy=false;}
}
// Safari defers loading lazy images inside a closed <details>.
function prioritizeCollectionImages(details){
  if(!details?.open)return;
  details.querySelectorAll(".asset-gallery .sector-image img").forEach((img,index)=>{
    img.loading="eager";
    img.fetchPriority=index<6?"high":"auto";
    if(img.complete&&img.naturalWidth>0)img.closest(".sector-image")?.classList.add("is-loaded");
  });
}
document.addEventListener("toggle",event=>{
  const details=event.target;
  if(details?.matches?.(".collection-dropdown"))prioritizeCollectionImages(details);
},true);
document.addEventListener("load",event=>{
  if(event.target?.matches?.(".sector-image img"))
    event.target.closest(".sector-image")?.classList.add("is-loaded");
},true);
document.addEventListener("error",event=>{
  if(event.target?.matches?.(".sector-image img"))
    event.target.closest(".sector-image")?.classList.add("is-error");
},true);
document.addEventListener("submit",async e=>{
  const form=e.target;if(!form.id)return;
  e.preventDefault();
  const d=new FormData(form);
  if(form.id==="login-form")return mutate("/api/login",{password:d.get("password")},"강사로 로그인했습니다.");
  if(form.id==="join-form")return mutate("/api/join",{
    pin:String(d.get("pin")||"").trim(),name:d.get("name"),
    members:String(d.get("members")||"").split(/[,，]/).map(s=>s.trim()).filter(Boolean)
  },"팀 참가가 완료되었습니다.");
  if(form.id==="rename-form")return mutate("/api/team",{
    action:"rename",name:String(d.get("name")||"").trim()
  },"팀 이름을 변경했습니다.");
  if(form.id==="reset-form"){
    const word=String(d.get("confirm")||"").trim();
    if(!["초기화","RESET"].includes(word)){toast("확인란에 '초기화'를 입력하세요.");return;}
    return mutate("/api/teacher",{action:"reset",confirm:word},
      "새 게임으로 초기화했습니다. 기존 학생팀은 다시 참가해야 합니다.");
  }
  if(form.id==="beginner-quiz-form"){
    const answer=String(d.get("answer")||"");
    if(!answer){toast("먼저 답을 선택하세요.");return;}
    const done=await mutate("/api/quiz",{answer},"퀴즈 답안을 제출했습니다. 해설을 확인하세요.");
    if(done)delete quizDraftByStage[`${game.room.year}-${game.room.stage}`];
    return;
  }
  if(form.id==="beginner-practice-form"){
    const offerId=Number(d.get("offerId")),wantId=Number(d.get("wantId"));
    if(offerId===wantId){toast("서로 다른 산업을 선택하세요.");return;}
    const done=await mutate("/api/team",{action:"practice",offerId,wantId},"연습 완료! 실제 카드 수량은 바뀌지 않았습니다.");
    if(done)document.querySelector("#practice-modal")?.close();
    return;
  }
  if(form.id==="config-form")return mutate("/api/teacher",{
    action:"config",newsSeconds:Number(d.get("newsSeconds")),tradeSeconds:Number(d.get("tradeSeconds"))
  },"진행 시간을 저장했습니다.");
  if(form.id==="trade-card-form"){
    const payload={offerId:Number(form.dataset.offerId),offerQty:Number(d.get("offerQty")),
      wantId:Number(d.get("wantId")),wantQty:Number(d.get("wantQty"))};
    if(payload.offerId===payload.wantId){toast("서로 다른 카드를 선택하세요.");return;}
    if(payload.offerQty>availableMine(game,payload.offerId)){
      toast("이미 등록된 제안을 제외하면 제공 가능한 카드가 부족합니다.");return;
    }
    if(payload.wantQty>availableOther(game,payload.wantId)){
      toast("상대 팀이 제공 가능한 수량을 초과했습니다.");return;
    }
    const ok=await mutate("/api/list",payload,"교환 제안이 게시되었습니다.");
    if(ok)document.querySelector("#trade-modal")?.close();
    return;
  }
});
document.addEventListener("input",e=>{
  const form=e.target.closest?.("#trade-card-form");
  if(form)syncTradePreview(form);
});
document.addEventListener("change",e=>{
  const form=e.target.closest?.("#trade-card-form");
  if(form)syncTradePreview(form);
  if(e.target.matches?.('#beginner-quiz-form input[name="answer"]')&&game){
    quizDraftByStage[`${game.room.year}-${game.room.stage}`]=e.target.value;
  }
});
document.addEventListener("click",async e=>{
  const target=e.target?.closest?.("[data-action]");
  if(!target)return;
  const action=target.dataset.action,id=target.dataset.id;
  if(action==="open-practice"){
    if(game?.role!=="team"||game.room.phase!=="lobby"||!game.team.drawMode||game.team.practiceDone)return;
    document.querySelector("#practice-modal")?.remove();
    const modal=document.createElement("dialog");
    modal.id="practice-modal";modal.className="asset-modal easy-practice-modal";
    modal.innerHTML=practiceDialog(game);
    document.body.append(modal);
    modal.addEventListener("click",event=>{if(event.target===modal)modal.close();});
    modal.addEventListener("close",()=>modal.remove(),{once:true});
    modal.showModal();return;
  }
  if(action==="close-practice"){document.querySelector("#practice-modal")?.close();return;}
  if(action==="view-rankings"){
    openLiveRanking();
    return;
  }
  if(action==="view-trades"){
    showInfoModal("최근 성사된 거래","TRADE ACTIVITY",recentTrades(game));
    return;
  }
  if(action==="view-stage-impact"){
    showInfoModal("이번 턴 카드 교환 성과","ROUND IMPACT",stageImpactContent(game));return;
  }
  if(action==="view-final-impact"){
    showInfoModal("최종 카드 교환 성과","FINAL PERFORMANCE",tradeImpactReport(game));return;
  }
  if(action==="view-teacher-stage"){
    showInfoModal("전체 팀 교환 성과","INSTRUCTOR ONLY",teacherStageImpactContent(game));return;
  }
  if(action==="close-info"){document.querySelector("#info-modal")?.close();return;}
  if(action==="toggle-ambient"){
    setAmbient(!ambientEnabled);
    syncSoundControlText();
    if(!ambientEnabled)toast("배경음악을 껐습니다.");
    return;
  }
  if(action==="toggle-timer-sound"){
    timerSoundEnabled=!timerSoundEnabled;
    if(timerSoundEnabled) testAudioByTap(); // unlock + immediate audible test on iPhone/iPad
    else toast("효과음을 껐습니다.");
    syncSoundControlText();
    return;
  }
  if(action==="open-trade-picker"){
    try{
      showInfoModal("교환할 카드 선택","교환 제안하기",tradePickerContent(game));
    }catch(error){console.error("교환 카드 선택 오류",error);toast("교환할 카드를 표시할 수 없습니다.");}
    return;
  }
  if(action==="trade-card"){
    try{
      const s=game?.sectors?.find(x=>x.ticker===id);
      if(!s||game?.role!=="team"||!game.team){
        toast("참가팀 카드 정보를 확인할 수 없습니다. 화면을 새로고침해 주세요.");
        return;
      }
      if(game.room?.phase!=="trade"){
        toast("교환 제안은 거래 시간에만 가능합니다.");
        return;
      }
       document.querySelector("#info-modal")?.close();
       document.querySelector("#trade-modal")?.remove();
       const dialog=document.createElement("dialog");
      dialog.id="trade-modal";
      dialog.className="asset-modal trade-modal";
      dialog.setAttribute("aria-labelledby","trade-modal-title");
      dialog.innerHTML=tradeCardModal(s,game);
      document.body.append(dialog);
      dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
      dialog.addEventListener("close",()=>dialog.remove(),{once:true});
       if(typeof dialog.showModal==="function")dialog.showModal();
       else {dialog.setAttribute("open","");dialog.classList.add("game-dialog-fallback");}
       const form=dialog.querySelector("#trade-card-form");
       if(form)syncTradePreview(form);
       dialog.querySelector("[data-action='close-trade']")?.focus();
    }catch(error){
      console.error("카드 교환 제안창 오류",error);
      document.querySelector("#trade-modal")?.remove();
      toast("교환 제안창을 열지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
    }
    return;
  }
  if(action==="close-trade"){document.querySelector("#trade-modal")?.close();return;}
  if(action==="card"){
    const s=game?.sectors?.find(x=>x.ticker===id);
    if(!s)return;
    document.querySelector("#asset-modal")?.remove();
    const modal=document.createElement("dialog");
    modal.id="asset-modal";
    modal.className="asset-modal card-detail-dialog";
    modal.setAttribute("aria-labelledby","card-detail-title");
    modal.innerHTML=`<div class="modal-head detail-head"><div><span class="eyebrow">INDUSTRIAL ASSET CARD / ${h(s.ticker)}</span>
      <h2 id="card-detail-title">${h(s.name)} 산업 카드 · 원본 상세보기</h2></div><button type="button" class="modal-close" data-action="close-card" aria-label="닫기">${ico("close",21)}</button></div>
      <div class="card-detail-layout">
        <div class="card-detail-image-wrap" id="card-image-wrap">
          <img id="card-detail-image" decoding="async" fetchpriority="high" data-action="card-zoom" data-zoom-level="1" src="${cardPath(s.ticker)}" alt="${h(s.name)} 카드 원본. 대표산업, 산업설명, 티커가 이미지에 적혀 있습니다.">
        </div>
        <aside class="card-detail-sidebar">
          <span class="eyebrow">CARD INTELLIGENCE</span>
          <h3>${h(s.name)}</h3><span class="detail-symbol">${h(s.ticker)}</span>
          <div class="detail-number"><small>현재 카드 가격</small><strong>${format(s.price)}원</strong></div>
          ${game.team?`<div class="detail-number"><small>내 보유 카드</small><strong>${format(game.team.holdings[s.id]||0)}장</strong></div>`:""}
          <p>이미지에 적힌 <b>대표산업 · 산업설명 · 티커</b>를 확인하세요. 확대 버튼으로 원본을 더 크게 볼 수 있습니다.</p>
          <div class="card-zoom-controls">
            <button type="button" class="btn tiny" data-action="card-zoom-out" aria-label="축소">− 축소</button>
            <button type="button" class="btn tiny" data-action="card-zoom-reset">100%</button>
            <button type="button" class="btn tiny" data-action="card-zoom-in" aria-label="확대">+ 확대</button>
          </div>
          ${game.role==="team"&&game.room.phase==="trade"&&Number(game.team.holdings[s.id]||0)>0?
             `<button type="button" class="btn gold wide" data-action="detail-to-trade" data-id="${h(s.ticker)}">${ico("exchange",17)} 이 카드로 교환 제안</button>`:""}
        </aside>
      </div>`;
    document.body.append(modal);
    modal.addEventListener("click",ev=>{if(ev.target===modal)modal.close();});
    modal.addEventListener("close",()=>modal.remove(),{once:true});
    modal.showModal();
    return;
  }
  if(action==="detail-to-trade"){
    document.querySelector("#asset-modal")?.close();
    const tradeBtn=document.createElement("button");
    tradeBtn.dataset.action="trade-card";tradeBtn.dataset.id=id;
    document.body.append(tradeBtn);tradeBtn.click();tradeBtn.remove();return;
  }
  if(["card-zoom","card-zoom-in","card-zoom-out","card-zoom-reset"].includes(action)){
    const img=document.querySelector("#card-detail-image");
    if(!img)return;
    let value=Number(img.dataset.zoomLevel||1);
    value=action==="card-zoom-reset"?1:action==="card-zoom-out"?Math.max(1,value-.25):Math.min(2.5,value+.25);
    img.dataset.zoomLevel=String(value);
    img.style.transform=`scale(${value})`;
    const reset=document.querySelector("[data-action='card-zoom-reset']");
    if(reset)reset.textContent=`${Math.round(value*100)}%`;
    return;
  }
  if(action==="close-card"){document.querySelector("#asset-modal")?.close();return;}
  if(action==="draw"){
    if(drawChoiceBusy||busy||!drawOptions.some(x=>x.id===id))return;
    const dialog=document.querySelector("#draw-dialog");
    if(!dialog||game?.room.phase!=="lobby"||game.team.drawMode)return;
    drawChoiceBusy=true;busy=true;
    dialog.dataset.step="drawing";
    dialog.querySelectorAll("[data-action='draw']").forEach(button=>button.disabled=true);
    dialog.insertAdjacentHTML("beforeend",`<div class="draw-anim-overlay" role="status" aria-live="polite">
      <div class="draw-shuffle">
        ${game.sectors.slice(0,5).map((s,i)=>`<img style="--index:${i}" src="${cardPath(s.ticker)}" alt="">`).join("")}
      </div><strong>${id==="even"?"산업별 10장씩 배분 중":"110장 랜덤 카드 셔플 중"}</strong>
      <span>우리 팀 카드 구성을 확정하고 있습니다…</span></div>`);
    try{
      const result=await api("/api/team",{action:"draw",mode:id});
      game=result;render();
      await new Promise(resolve=>setTimeout(resolve,850));
      if(dialog.open){
        dialog.dataset.step="reveal";
        dialog.innerHTML=drawResult(game);
        dialog.scrollTop=0;
      }
    }catch(err){
      toast(err.message);
      if(dialog.open){dialog.dataset.step="choose";dialog.innerHTML=drawIntro(game);}
    }finally{busy=false;drawChoiceBusy=false;}
    return;
  }
  if(action==="draw-finish"){
    document.querySelector("#draw-dialog")?.close();
    const deck=document.querySelector("#my-cards-dropdown");if(deck){deck.open=true;deck.scrollIntoView({behavior:"smooth",block:"start"});}
    return;
  }
  if(action==="csv"){location.href="/api/export.csv";return;}
  if(action==="copy-link"){try{await navigator.clipboard.writeText(game.room.joinUrl||location.origin+"/join");toast("참가 주소를 복사했습니다.");}catch{toast("브라우저 주소를 직접 복사해 주세요.");}return;}
  if(action==="cancel-accept"){document.querySelector("#accept-dialog")?.close();return;}
  if(action==="confirm-accept"){
    const ok=await mutate("/api/accept",{id},"카드 교환 완료! 실제 수익률은 가격 발표 때 반영됩니다.");
    if(ok){document.querySelector("#accept-dialog")?.close();playSceneCue("trade");}
    return;
  }
  if(action==="accept"){
    const l=game?.listings?.find(l=>l.id===id);
    if(!l)return;
    document.querySelector("#accept-dialog")?.remove();
    const dlg=document.createElement("dialog");
    dlg.id="accept-dialog";dlg.className="asset-modal accept-dialog";
    dlg.setAttribute("aria-labelledby","accept-dialog-title");
    dlg.innerHTML=`<div class="modal-head">
      <div><span class="eyebrow">INVEST PLAY · CARD EXCHANGE</span><h2 id="accept-dialog-title">교환을 확정할까요?</h2></div>
      <button type="button" class="modal-close" data-action="cancel-accept" aria-label="취소">${ico("close",20)}</button></div>
      <div class="accept-trade-scene"><div class="trade-exchange-symbol">${ico("exchange",30)}</div>
      <div class="accept-trade-row"><small>내가 제공하는 카드</small><strong>${h(sector(l.wantId).name)} ${l.wantQty}장</strong></div>
      <div class="accept-trade-row highlight"><small>내가 받는 카드</small><strong>${h(sector(l.offerId).name)} ${l.offerQty}장</strong></div></div>
      <p class="accept-warning">거래는 취소할 수 없습니다. <b>수익률은 거래 종료 후 가격 발표 때 갱신</b>됩니다.</p>
      <div class="accept-actions"><button type="button" class="btn" data-action="cancel-accept">돌아가기</button>
      <button type="button" class="btn gold" data-action="confirm-accept" data-id="${h(l.id)}">카드 교환 확정</button></div>`;
    document.body.append(dlg);
    dlg.addEventListener("click",ev=>{if(ev.target===dlg)dlg.close();});
    dlg.addEventListener("close",()=>dlg.remove(),{once:true});
    dlg.showModal();return;
  }
  if(action==="cancel"){if(await gameConfirm("등록한 카드 교환 제안을 취소할까요?",{title:"교환 제안 취소",confirmText:"제안 취소",danger:true}))return mutate("/api/cancel",{id},"제안을 취소했습니다.");return;}
  if(action==="logout")return mutate("/api/logout",{},"로그아웃했습니다.");
  if(action==="pin"){
    if(!await gameConfirm("PIN을 바꾸면 이전 PIN으로는 입장할 수 없습니다. 재발급할까요?",{title:"팀 입장 PIN 재발급",confirmText:"재발급"}))return;
    return mutate("/api/teacher",{action:"pin"},"새 PIN을 발급했습니다.");
  }
  if(action==="kick"){
    if(!await gameConfirm("해당 팀을 대기실에서 퇴장시킬까요?",{title:"팀 퇴장",confirmText:"퇴장시키기",danger:true}))return;
    return mutate("/api/teacher",{action:"kick",teamId:id},"팀을 퇴장시켰습니다.");
  }
  if(action==="reset"){
    const dialog=document.querySelector("#reset-dialog");
    if(dialog && !dialog.open){
      dialog.showModal();
      dialog.querySelector('input[name="confirm"]')?.focus();
    }
    return;
  }
  if(action==="cancel-reset"){
    document.querySelector("#reset-dialog")?.close();
    return;
  }
  if(["start","next","pause","resume"].includes(action)){
    if(action==="start"&&!await gameConfirm("게임을 시작할까요? 이후에는 새 팀을 참가시킬 수 없습니다.",{title:"게임 시작",confirmText:"시작하기"}))return;
    return mutate("/api/teacher",{action},action==="next"?"다음 단계로 넘어갔습니다.":"변경되었습니다.");
  }
});

document.addEventListener("submit",async e=>{
 if(e.target.id!=="prediction-form")return;
 e.preventDefault();
 const d=new FormData(e.target);
 await mutate("/api/predict",{sectorId:Number(d.get("sectorId")),reason:String(d.get("reason")||"")},
 "우리 팀의 예측이 기록됐습니다. 결과 발표 뒤 비교해 보세요.");
},true);
document.addEventListener("click",e=>{
 const target=e.target.closest("[data-action='classroom-tab']");
 if(!target)return;
 activeClassroomTab=target.dataset.id;
 document.querySelectorAll("[data-classroom-pane]").forEach(el=>
  el.classList.toggle("is-active",el.dataset.classroomPane===activeClassroomTab));
 document.querySelectorAll(".editorial-stage-nav button").forEach(el=>{
  const chosen=el.dataset.id===activeClassroomTab;
  el.classList.toggle("active",chosen);el.setAttribute("aria-selected",String(chosen));
 });
 document.querySelector(".editorial-stage-nav")?.scrollIntoView({block:"nearest",behavior:"smooth"});
},true);
refresh(true).then(()=>connectStream());
setInterval(tickCountdown,1000);
setInterval(()=>refresh(),5000);
if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

// 기사 탭: 다른 기사로 이동할 때 별도의 네트워크 요청을 하지 않습니다.
document.addEventListener("click",event=>{
  const tab=event.target.closest?.('[data-action="article-tab"]');
  if(!tab)return;
  const index=Number(tab.dataset.id);
  if(!Number.isInteger(index)||index<0)return;
  activeArticleIndex=index;
  document.querySelectorAll(".article-tabs [data-action='article-tab']").forEach(button=>{
    const selected=Number(button.dataset.id)===index;
    button.classList.toggle("active",selected);
    button.setAttribute("aria-selected",String(selected));
  });
  document.querySelectorAll(".article-panel").forEach((panel,i)=>{panel.hidden=i!==index;});
});
