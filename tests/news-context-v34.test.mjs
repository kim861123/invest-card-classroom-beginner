import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=fs.readFileSync(path.join(dir,"public/app.js"),"utf8");
const server=fs.readFileSync(path.join(dir,"server.mjs"),"utf8");
const code=app.slice(app.indexOf("function articleTopic(x){"),app.indexOf("let activeArticleIndex="));
const ctx={h:s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;")};
vm.createContext(ctx);vm.runInContext(code+";globalThis.api={articleTopic,articlePairContext,articleHistoricalNote,inflationHistoryBridge}",ctx);
const {articleTopic,articlePairContext,articleHistoricalNote,inflationHistoryBridge}=ctx.api;
test("사건별 이미지: WHO·SVB·전쟁·CPI 2개 방향 모두 주제에 맞는다",()=>{
 assert.equal(articleTopic({title:"WHO, 코로나19 국제공중보건 비상사태 종료"}),"health");
 assert.equal(articleTopic({title:"미 실리콘밸리은행(SVB) 폐쇄"}),"banks");
 assert.equal(articleTopic({title:"러시아, 우크라이나 전면 침공"}),"geopolitics");
 assert.equal(articleTopic({title:"미국 소비자물가 CPI 급등"}),"inflation-rise");
 assert.equal(articleTopic({title:"미국 CPI 상승세 둔화"}),"inflation-cool");
 for(const name of ["health","banks","geopolitics","inflation-rise","inflation-cool","rates","energy","trade","tech"]){
  const file=`public/art/article-${name}.webp`;
  assert.ok(fs.existsSync(path.join(dir,file)),file);
  assert.ok(fs.statSync(path.join(dir,file)).size>10000,file);
  assert.ok(server.includes(`"/art/article-${name}.webp"`),name);
 }
});
test("4개월 이상 떨어진 두 물가 뉴스는 후속 비교로 설명한다",()=>{
 const s=articlePairContext([{date:"2022-06-20",title:"소비자물가 급등"},{date:"2022-10-20",title:"CPI 둔화"}]);
 assert.match(s,/후속 변화 비교/);
 assert.match(s,/물가 상승률이 낮아져도 물가 수준은 계속 오를 수 있어요/);
});
test("시점이 다른 별개 이슈는 동일 시점으로 혼동하지 않는다",()=>{
 const s=articlePairContext([{date:"2023-03-10",title:"SVB 폐쇄"},{date:"2023-05-05",title:"WHO 비상사태 종료"}]);
 assert.match(s,/시점 차이 주의/);
});
test("기사별 오해 방지: CPI/WHO/SVB 판단 질문",()=>{
 for(const x of [
  {year:2022,title:"소비자물가 급등",needle:/금리와 기업 비용/},
  {year:2022,title:"CPI 상승률 둔화",needle:/물가 자체가 내려갔다는 뜻은 아닙니다/},
  {year:2023,title:"WHO, 코로나19 국제공중보건 비상사태 종료",needle:/코로나19가 사라졌다는 뜻이 아닙니다/},
  {year:2023,title:"실리콘밸리은행(SVB) 폐쇄",needle:/한 은행의 폐쇄/}
 ]){
  assert.match(articleHistoricalNote(x,{}),x.needle);
 }
});
test("이전 뉴스 연결은 공개된 과거 CPI 기록에서만 작성한다",()=>{
 const room={year:2022};
 const g={room,news:[
  {id:"EVT-2022-01",year:2022,date:"2022-06-10",title:"소비자물가 급등"},
  {id:"EVT-2022-03",year:2022,date:"2022-10-10",title:"CPI 둔화"},
  {id:"EVT-2022-04",year:2022,date:"2022-12-02",title:"CPI 전망"}
 ]};
 const s=inflationHistoryBridge(g,[g.news[1]]);
 assert.match(s,/소비자물가 급등/);
 assert.doesNotMatch(s,/CPI 전망/);
 assert.equal(inflationHistoryBridge({room,news:[g.news[1]]},[g.news[1]]),"");
});
test("영문 뉴스 장식이 노출되지 않도록 CSS 우선순위 확보",()=>{
 const css=fs.readFileSync(path.join(dir,"public/mobile-v32.css"),"utf8");
 assert.match(css,/\.newsroom \.news-card\.news-current::before/);
 assert.match(css,/display:none!important;content:none!important/);
 assert.match(css,/\.news-pair-context/);
});
