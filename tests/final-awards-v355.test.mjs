import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const here=path.dirname(new URL(import.meta.url).pathname);
const base=path.resolve(here,"..");
const server=fs.readFileSync(path.join(base,"server.mjs"),"utf8");
const app=fs.readFileSync(path.join(base,"public/app.js"),"utf8");
const css=fs.readFileSync(path.join(base,"public/mobile-v35.css"),"utf8");
function getFunction(s,name,endName){
 const a=s.indexOf(`function ${name}(`);
 assert.ok(a>=0,`Missing function ${name}`);
 const b=s.indexOf(`function ${endName}(`,a+15);
 assert.ok(b>a,`Missing next function ${endName}`);
 return s.slice(a,b);
}
const nextFn=getFunction(server,"next","pause");
const displayFns=server.slice(server.indexOf("function currentYear()"),server.indexOf("function currentStageReturn("));
const podiumFn=getFunction(app,"finalPodium","studentView");
test("last price reveal finishes without entering an additional turn",()=>{
 const state={yearIndex:7,stageIndex:1,phase:"result",deadline:123};
 const ctx={state,YEARS:[2019,2020,2021,2022,2023,2024,2025,2026],bad:(condition,message)=>{if(condition)throw Error(message)},beginNews:()=>{throw Error("Extra round started")}};
 vm.runInNewContext(nextFn+"next()",ctx);
 assert.equal(state.phase,"finished");
 assert.equal(state.yearIndex,7);
 assert.equal(state.stageIndex,1);
 assert.equal(state.deadline,null);
});
test("normal step advances only once",()=>{
 const state={yearIndex:7,stageIndex:0,phase:"result",deadline:123};
 let beginCount=0;
 const ctx={state,YEARS:[2019,2020,2021,2022,2023,2024,2025,2026],bad:(condition,message)=>{if(condition)throw Error(message)},beginNews:()=>{beginCount++}};
 vm.runInNewContext(nextFn+"next()",ctx);
 assert.equal(beginCount,1);
 assert.equal(state.stageIndex,1);
 assert.equal(state.yearIndex,7);
});
test("legacy finished state is clamped without deleting saved results",()=>{
 const state={yearIndex:8,stageIndex:0,phase:"finished"};
 const ctx={state,YEARS:[2019,2020,2021,2022,2023,2024,2025,2026]};
 vm.runInNewContext(displayFns+"result = [currentYear(),publicRound(),publicStage()]",ctx);
 assert.equal(JSON.stringify(ctx.result),JSON.stringify([2026,8,2]));
});
test("two team podium only shows actual winners",()=>{
 const ctx={
   h:s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"),
   ico:()=>"<svg aria-hidden='true'></svg>",
   buyClass:v=>Number(v)>=0?"gain":"loss",
   pct:v=>(Number(v)>=0?"+":"")+Number(v).toFixed(2)+"%",
   format:v=>Number(v).toLocaleString("en-US")
 };
 vm.runInNewContext(podiumFn+"html = finalPodium({room:{phase:'finished',totalRounds:8},scores:[{id:'1',name:'111',rank:1,returnPct:187.38,total:287380},{id:'2',name:'Wee',rank:2,returnPct:170.35,total:270350}],team:{id:'2'}})",ctx);
 assert.match(ctx.html,/count-2/);
 assert.match(ctx.html,/111/);
 assert.match(ctx.html,/Wee/);
 assert.match(ctx.html,/16단계 완료/);
 assert.doesNotMatch(ctx.html,/rank-3/);
 assert.doesNotMatch(ctx.html,/empty-slot/);
});
test("mobile progress is clamped and podium styling is included",()=>{
 assert.match(app,/phase==="finished"\?g\.room\.totalRounds\*2/);
 assert.match(css,/\.final-awards-v355/);
 assert.match(css,/\.final-podium\.count-2/);
 assert.match(server,/round:publicRound\(\)/);
});
test("three teams show bronze podium; one team has no fabricated medal",()=>{
 const ctx={
  h:s=>String(s),ico:()=>"<span>🏆</span>",buyClass:()=> "gain",
  pct:v=>Number(v).toFixed(2)+"%",format:v=>String(v)
 };
 vm.runInNewContext(podiumFn+`three=finalPodium({room:{phase:"finished",totalRounds:8},scores:[
  {id:"1",rank:1,name:"Alpha",returnPct:10,total:110000},
  {id:"2",rank:2,name:"Beta",returnPct:9,total:109000},
  {id:"3",rank:3,name:"Gamma",returnPct:8,total:108000}
 ]});one=finalPodium({room:{phase:"finished",totalRounds:8},scores:[
  {id:"1",rank:1,name:"Alpha",returnPct:10,total:110000}
 ]})`,ctx);
 assert.match(ctx.three,/count-3/);
 assert.match(ctx.three,/rank-3/);
 assert.match(ctx.one,/count-1/);
 assert.doesNotMatch(ctx.one,/rank-2/);
});
