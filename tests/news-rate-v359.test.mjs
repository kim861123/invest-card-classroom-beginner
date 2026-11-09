import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {rebalanceRateNews,countPolicyByYear} from "../news_rate_balancer.mjs";
const candidates=JSON.parse(fs.readFileSync(new URL("../data/news_rate_alternatives_v359.json",import.meta.url),"utf8")).candidates;
const make=(id,date,title,extra={})=>({id,date,year:2022,title,fact:"기존 기사",source:{url:`https://original.example/${id}`},analysis:"원본 해설",...extra});
function fixture(){
 return {events:[
   make("2022-1","2022-03-16","연준 기준금리 첫 인상"),
   make("2022-2","2022-06-15","연준 기준금리 0.75%p 인상"),
   make("2022-3","2022-09-21","미 연준 기준금리 재인상"),
   make("2022-4","2022-12-14","연준 기준금리 인상 발표")
 ]};
}
test("2022년: 퀴즈 보호가 없을 경우 금리 기사 1개만 유지하고 나머지를 실제 사건으로 교체한다",()=>{
 const src=fixture();
 const report=rebalanceRateNews(src,{candidates});
 assert.equal(report.before[0].rate,4);
 assert.equal(report.after[0].rate,1);
 assert.equal(report.changed.length,3);
 assert.deepEqual(src.events.map(x=>x.id),["2022-1","2022-2","2022-3","2022-4"]);
 assert.ok(src.events.slice(1).every(x=>x._editorialConcept && x.source?.url && x._editorialImageTopic));
});
test("퀴즈에서 참조하는 기사는 내용·출처까지 보존한다",()=>{
 const src=fixture();
 const original=JSON.stringify(src.events[1]);
 const report=rebalanceRateNews(src,{candidates,protectedIds:["2022-2"]});
 assert.equal(JSON.stringify(src.events[1]),original);
 assert.ok(report.after[0].rate>=1);
 assert.ok(src.events.every(e=>e.id && Number(e.year)===2022));
});
test("2022년 실제 사건은 기존 날짜보다 이후에 배치되지 않는다",()=>{
 const src=fixture();
 const originalDates=src.events.map(x=>x.date);
 rebalanceRateNews(src,{candidates});
 src.events.forEach((x,i)=>assert.ok(x.date<=originalDates[i]));
});
test("한 해 4개 기사가 아니면 보존",()=>{
 const src={events:fixture().events.slice(0,3)};
 const before=JSON.stringify(src);
 const report=rebalanceRateNews(src,{candidates});
 assert.equal(JSON.stringify(src),before);
 assert.equal(report.changed.length,0);
});
test("원본 파일 미존재/빈 구조라면 부작용 없이 유지",()=>{
 const r=rebalanceRateNews({}, {candidates});
 assert.equal(r.changed.length,0);
 assert.ok(r.reason);
});
test("이미 동일한 사건이 있으면 다른 기사로 중복 삽입하지 않는다",()=>{
 const src=fixture();
 src.events[3]=make("2022-4","2022-12-14","미국 10월 CPI 7.7%, 물가상승률 둔화");
 const r=rebalanceRateNews(src,{candidates});
 assert.ok(src.events.filter(e=>e._replacementId==="2022-cpi-oct").length===0);
 assert.ok(r.after[0].rate<=2);
});
test("dryRun 후 기존 데이터 객체가 완전히 복원된다",()=>{
 const src=fixture(),before=JSON.stringify(src);
 const r=rebalanceRateNews(src,{candidates,dryRun:true});
 assert.ok(r.changed.length>0);
 assert.equal(JSON.stringify(src),before);
});
test("후보 기사 출처 및 날짜가 검증 가능한 구조",()=>{
 for(const c of candidates){
  assert.match(c.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(c.date.slice(0,4),String(c.year));
  assert.ok(c.title && c.fact && c.discussion_question);
  assert.match(c.source.url,/^https:\/\//);
 }
});
test("2019~2026 규칙: 기존 4개 외 기사수에는 안전하게 변경하지 않는다",()=>{
 const src={events:[
  {id:"2020-1",year:2020,date:"2020-03-01",title:"연준 금리 인하"},
  {id:"2020-2",year:2020,date:"2020-06-01",title:"연준 금리 인하"},
 ]};
 const before=JSON.stringify(src);
 rebalanceRateNews(src,{candidates});
 assert.equal(JSON.stringify(src),before);
});

test("서버는 금리 뉴스 균형 패치와 새 이미지 개념을 연결한다",()=>{
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 assert.match(server,/applyNewsRatePatch\(newsSource/);
 assert.match(server,/ev\._editorialConcept\|\|lessonConcepts\[ev\.id\]/);
 assert.match(app,/x\?\.editorial_replacement && ARTICLE_IMAGE_KEYS\.has\(explicit\)/);
});
