import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=fs.readFileSync(path.join(dir,"public/app.js"),"utf8");
const server=fs.readFileSync(path.join(dir,"server.mjs"),"utf8");
const css=fs.readFileSync(path.join(dir,"public/mobile-v32.css"),"utf8");
test("기사 주제별 이미지가 패치에 포함되고 정적 서버가 제공한다",()=>{
 for(const k of ["rates","energy","banks","health","trade","tech"]){
  const ext=k==="rates"?"webp":"svg";
  const pathInRepo=`art/article-${k}.${ext}`;
  assert.ok(fs.statSync(path.join(dir,"public",pathInRepo)).size>500);
  assert.ok(server.includes(`/${pathInRepo}`));
 }
 assert.match(fs.readFileSync(path.join(dir,"public/index.html"),"utf8"),/mobile-v32.css/);
 assert.match(css,/\.news-readable-title/);
});
test("기사: 2개 탭·주제별 이미지·기사 뒤 접힌 개념만 제공",()=>{
 const start=app.indexOf("function articleTopic(x){");
 const end=app.indexOf("function tradeCardModal(",start)>0 ?
    app.indexOf("function tradeCardModal(",start): app.indexOf("// EASY V2:",start);
 assert.ok(start>=0 && end>start);
 const code=app.slice(start,end);
 const ctx={h:s=>String(s??""),ico:()=>"<svg></svg>"};
 vm.createContext(ctx);
 vm.runInContext(code+";globalThis.preview=newsList;",ctx);
 const news=[{
   id:"EVT-2021-01",title:"미 연준, 자산매입 축소(테이퍼링) 시작 발표",
   date:"2021-11-03",year:2021,easy_summary:"연준이 시중에 풀리는 돈을 줄이기 시작했어요.",
   fact:"연준은 자산 매입 규모를 단계적으로 줄인다고 발표했습니다.",
   learning_concept:{theme:"rates",concept:"자산매입 축소·유동성",watch:"금융·기술",question:"왜 중요할까요?"}
 },{
   id:"EVT-2021-02",title:"유가 급등이 에너지 업종에 미친 영향",
   date:"2021-11-04",year:2021,easy_summary:"원유 가격이 뛰었어요.",
   fact:"원유 관련 종목에 영향을 줬어요.",
   learning_concept:{theme:"energy",concept:"원자재 가격",watch:"에너지",question:"수요는?"}
 }];
 const html=ctx.preview({room:{stage:1,year:2021,phase:"news",round:2,totalRounds:4},news,role:"team"});
 assert.match(html,/role="tablist"/);
 assert.match(html,/article-rates.webp/);
 assert.match(html,/article-energy.webp/);
 assert.match(html,/news-readable-title/);
 assert.match(html,/<details class="news-learn">/);
 assert.ok(html.indexOf("무슨 일이 있었나요?")<html.indexOf('class="news-learn"'));
 assert.doesNotMatch(html,/THE INVEST TIMES|MARKET BREAKING|ARTICLE 0/);
 assert.match(html,/article-panel-1" class="article-panel" role="tabpanel" hidden/);
});
test("브라우저 기본 confirm 사용이 없고 게임 모달을 사용한다",()=>{
 assert.doesNotMatch(app,/\bif\s*\(\s*!?confirm\s*\(/);
 assert.match(app,/function gameConfirm\(/);
 assert.match(app,/dialog\.showModal\(\)/);
 assert.match(css,/\.game-confirm-dialog/);
});
