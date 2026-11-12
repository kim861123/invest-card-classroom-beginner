let lastPresentationResult="";
let newsMode=new URLSearchParams(location.search).get("mode")==="news",activeNewsIndex=0,activeNewsStage="";
function setPresentationMode(value){newsMode=Boolean(value);document.body.classList.toggle("news-mode",newsMode);$("news-focus").hidden=!newsMode;$("mode-news").setAttribute("aria-pressed",String(newsMode));$("mode-overview").setAttribute("aria-pressed",String(!newsMode));}
$("mode-news").addEventListener("click",()=>setPresentationMode(true));
$("mode-overview").addEventListener("click",()=>setPresentationMode(false));
$("fullscreen").addEventListener("click",()=>document.documentElement.requestFullscreen?.().catch(()=>{}));
$("news-tabs").addEventListener("click",event=>{const n=event.target.closest("button[data-index]");if(n){activeNewsIndex=Number(n.dataset.index);refresh();}});
setPresentationMode(newsMode);
const $=id=>document.getElementById(id);
const h=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function refresh(){try{
 let r=await fetch("/api/presentation",{credentials:"same-origin",cache:"no-store"});
 if(r.status===403){$("notice").textContent="강사 콘솔에 로그인한 브라우저에서 다시 열어주세요.";return;}
 if(!r.ok)throw Error("서버 연결 실패");
 let g=await r.json(),phases={lobby:"참가팀 모집",news:"뉴스 분석",trade:"카드 교환",result:"가격 발표",finished:"최종 결과",paused:"일시정지"};
 let rem=g.room.deadline?Math.max(0,Math.ceil((g.room.deadline-Date.now())/1000)):null;
 $("stage").textContent=`${g.room.year}년 · ${g.room.stage}차 뉴스 | ${phases[g.room.phase]||g.room.phase} ${rem!==null?"· "+rem+"초":""}`;
 $("news").innerHTML=g.news.length?g.news.map(x=>`<article><small>${h(x.date)}</small><h3>${h(x.title)}</h3><p>${h(x.easy_summary||x.fact).slice(0,210)}</p></article>`).join(""):"<p>강사가 뉴스를 공개하면 이곳에 표시됩니다.</p>";
 const stageId=String(g.room.year)+"-"+g.room.stage;
 if(stageId!==activeNewsStage){activeNewsStage=stageId;activeNewsIndex=0;}
 activeNewsIndex=Math.min(activeNewsIndex,Math.max(0,g.news.length-1));
 $("news-tabs").innerHTML=g.news.map((x,i)=>'<button type="button" data-index="'+i+'" aria-pressed="'+(i===activeNewsIndex)+'">기사 '+(i+1)+'</button>').join("");
 const selected=g.news[activeNewsIndex];
 $("focus-article").innerHTML=selected?'<small>'+h(selected.date)+'</small><h2>'+h(selected.title)+'</h2><p class="large-fact">'+h(selected.easy_summary||selected.fact)+'</p>'+(selected.easy_term?'<p><b>핵심 개념 · '+h(selected.easy_term)+'</b></p>':'')+(selected.discussion_question||selected.easy_question?'<div class="large-question">생각해 볼 질문 · '+h(selected.easy_question||selected.discussion_question)+'</div>':''):'<h2>현재 공개된 뉴스가 없습니다.</h2><p>수업이 시작되면 기사가 표시됩니다.</p>';
 let changes=g.lastResult?.changes||[];
 const resultKey=g.lastResult?`${g.lastResult.year}-${g.lastResult.stageIndex}-${g.lastResult.at}`:"";
 const animate=resultKey&&resultKey!==lastPresentationResult;
 lastPresentationResult=resultKey;
 $("prices").innerHTML=changes.length?changes.map((x,i)=>`<div class="price ${animate?"price-reveal":""}" style="${animate?`animation-delay:${i*90}ms`:""}"><span>${h(x.name)}</span><b class="${x.gameModelPct>=0?"up":"down"}">${x.gameModelPct>=0?"+":""}${Number(x.gameModelPct).toFixed(2)}%</b></div>`).join(""):"<p>가격 발표 전에는 변동률이 공개되지 않습니다.</p>";
 $("ranks").innerHTML=g.scores.map(x=>`<div class="rank">${x.rank}위 · ${h(x.name)} <strong>${x.returnPct>=0?"+":""}${x.returnPct.toFixed(2)}%</strong></div>`).join("")||"<p>아직 참가팀이 없습니다.</p>";
 const awards=$("awards");
 if(g.room.phase==="finished" && g.scores.length){
 const top=g.scores.slice(0,3),order=[top[1],top[0],top[2]].filter(Boolean);
 const name=x=>`${x.rank}위 · ${h(x.name)}<br><strong>${x.returnPct>=0?"+":""}${x.returnPct.toFixed(2)}%</strong>`;
 awards.hidden=false;awards.innerHTML=`<h2>INVEST PLAY AWARDS · 최종 순위</h2><div class="podium">${order.map(x=>`<div>${name(x)}</div>`).join("")}</div><p>수익률뿐 아니라 판단의 근거와 위험관리도 함께 토론해 보세요.</p>`;
 }else{awards.hidden=true;awards.innerHTML="";}
 $("notice").textContent="강사용 해설과 PIN은 발표 화면에 포함되지 않습니다.";
 }catch(e){$("notice").textContent="연결 상태를 확인해 주세요: "+e.message;}}
refresh();setInterval(refresh,4000);
