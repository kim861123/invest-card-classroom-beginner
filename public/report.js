const root=document.querySelector("#report");
const h=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
fetch("/api/report",{credentials:"same-origin",cache:"no-store"}).then(r=>{if(!r.ok)throw Error("강사 로그인이 필요합니다.");return r.json()}).then(g=>{
const sn=Object.fromEntries(g.sectors.map(s=>[s.id,s.name]));
root.innerHTML=`<p>생성일시: ${h(new Date(g.generatedAt).toLocaleString("ko-KR"))} · ${g.finished?"게임 종료":"진행 중인 게임"}</p>
<section><h2>팀별 순위</h2><table><thead><tr><th>순위</th><th>팀</th><th>평가자산</th><th>수익률</th></tr></thead><tbody>${g.scores.map(t=>`<tr><td>${t.rank}</td><td>${h(t.name)}</td><td>${t.total.toLocaleString("ko-KR")}원</td><td>${t.returnPct.toFixed(2)}%</td></tr>`).join("")}</tbody></table></section>
<section><h2>단계별 가격 발표</h2>${g.rounds.map(r=>`<p><strong>${r.year}년 ${r.stage}차</strong> · ${r.changes.map(c=>`${h(c.name)} ${Number(c.gameModelPct).toFixed(2)}%`).join(", ")}</p>`).join("")}</section>
<section><h2>산업 예측 및 판단 근거</h2>${g.predictions.map(p=>`<h3>${h(p.team)}</h3>${p.entries.map(e=>`<p>${h(e.stage)} · ${h(sn[e.sectorId])} · ${h(e.reason)}</p>`).join("")||"<p>기록 없음</p>"}`).join("")}</section>
<section><h2>성사된 거래 ${g.trades.length}건</h2>${g.trades.map(t=>`<p>${h(t.year)}년 ${h(t.stage)}차 · ${h(t.sellerName)} ↔ ${h(t.buyerName)} · ${h(sn[t.offerId])} ${t.offerQty}장 / ${h(sn[t.wantId])} ${t.wantQty}장</p>`).join("")}</section>
<section><h2>뉴스 퀴즈 참여와 이해도</h2>
<table><thead><tr><th>팀</th><th>제출 횟수</th><th>정답 횟수</th></tr></thead><tbody>${(g.quizzes||[]).map(q=>`<tr><td>${h(q.team)}</td><td>${q.answered}</td><td>${q.correct}</td></tr>`).join("")}</tbody></table></section>
<p class="note">산업별 변동률은 실제 ETF 연간 성과를 학습 목적으로 나눈 모의가격 모델입니다.</p>`;
}).catch(e=>root.textContent=e.message);
