import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("VNext: 신문형 뉴스·공개된 경제 개념·접이식 카드·교환 확인창·오디오·표 폭",()=>{
 const code=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
 const cut=code.slice(0,code.indexOf("refresh(true).then(()=>connectStream());"));
 const dom={innerHTML:"",textContent:"",classList:{add(){},remove(){}}};
 const sandbox={document:{querySelector:()=>dom,addEventListener(){}},
   window:{location:{origin:"https://example.com"}},location:{pathname:"/join",origin:"https://example.com"},
   Intl,Date,Number,String,Math,URL,console,setTimeout,clearTimeout};
 const ctx=vm.createContext(sandbox);
 vm.runInContext(cut+`
   globalThis.ux={relationMap,studentView,newsList,teacherReveal,predictionTeacherPanel,resultTable};
 `,ctx);
 const s=Array.from({length:11},(_,i)=>({id:i+1,ticker:["XLE","XLB","XLI","XLF","XLY","XLP","XLV","XLK","XLC","XLU","XLRE"][i],name:"산업"+(i+1),price:10000}));
 const lesson={concept:"관세·무역비용",watch:"산업재·소비재",question:"비용은?",theme:"trade"};
 const event={id:"EVT-2019-01",year:2019,date:"2019-05-10",title:"수입품에 관세 부과",fact:"관세가 높아졌습니다",learning_concept:lesson};
 const game={version:3,role:"team",room:{year:2019,stage:1,round:1,totalRounds:8,phase:"lobby",teamCount:2,config:{}},
  team:{id:"t1",name:"샘플팀",holdings:Object.fromEntries(s.map(x=>[x.id,10])),cardCount:110,total:1100000,initialAsset:1100000,returnPct:0,drawMode:"even"},
  news:[],sectors:s,scores:[],listings:[],recentTrades:[],priceHistory:[],tradeAvailability:Object.fromEntries(s.map(x=>[x.id,{mineAvailable:10,maxOtherAvailable:10}]))};
 assert.equal(ctx.ux.relationMap(game),"","공개 전에는 경제개념 미표시");
 const active={...game,room:{...game.room,phase:"news"},news:[event]};
 const concept=ctx.ux.relationMap(active);
 assert.match(concept,/관세·무역비용/);
 assert.match(concept,/수입품에 관세 부과/);
 assert.doesNotMatch(concept,/생성형 AI/);
 const news=ctx.ux.newsList(active);
 assert.match(news,/data-image-topic="trade"/);
 assert.match(news,/newsroom readable-newsroom/);
 const trade={...game,room:{...game.room,phase:"trade"}};
 const html=ctx.ux.studentView(trade);
 assert.ok(html.indexOf("공개된 카드 교환 제안")<html.indexOf("나의 산업 카드 컬렉션"));
 assert.match(html,/collection-dropdown/);
 assert.match(html,/data-action="toggle-ambient"/);
 assert.doesNotMatch(html,/data-classroom-pane="collection"/);
 const prediction=ctx.ux.predictionTeacherPanel({...game,role:"teacher",predictionBoard:{total:2,answered:1,entries:[{teamName:"A팀",sectorId:1,reason:"유가와 비용을 살펴봤습니다"}]}});
 assert.match(prediction,/A팀/);
 assert.match(prediction,/유가와 비용을 살펴봤습니다/);
 assert.match(code,/id="accept-dialog"/);
 assert.match(code,/function playSceneCue/);
 assert.match(code,/function setAmbient/);
 assert.doesNotMatch(code,/if\(!confirm\(message\)\)return/);
 const table=ctx.ux.resultTable({changes:s.map(x=>({...x,previous:10000,price:10200,gameModelPct:2})),endingYear:false});
 assert.match(table,/전\(원\)/);
 assert.match(table,/변동률/);
 const style=fs.readFileSync(path.join(root,"public/editorial.css"),"utf8");
 assert.match(style,/result-table\{width:100%!important;min-width:0!important/);
 assert.match(style,/overflow-x:clip/);
 assert.match(style,/collection-dropdown/);
 assert.ok(fs.existsSync(path.join(root,"public/art/news-trade.svg")));
 assert.ok(fs.existsSync(path.join(root,"data/news_concepts_2019_2026.json")));
 assert.doesNotMatch(code,/const newsConcepts\s*=/,"미래 경제 사건의 개념 자료를 학생 JS에 일괄 포함하지 않음");
});

test("VNext: 거래 중 수익률·순위 동결, 발표 뒤 반영, 팀별 산업예측 강사 전용",async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"invest-announced-return-"));
 const port=45000+Math.floor(Math.random()*12000),base=`http://127.0.0.1:${port}`;
 let proc=null;
 async function boot(){
  proc=spawn(process.execPath,["server.mjs"],{cwd:root,env:{...process.env,
   TEACHER_PASSWORD:"ClassroomTestSecretPass!35",STORAGE_BACKEND:"local",DATA_DIR:tmp,
   HOST:"127.0.0.1",PORT:String(port)},stdio:["ignore","pipe","pipe"]});
  let err="";proc.stderr.on("data",x=>err+=x.toString());
  for(let i=0;i<110;i++){
   try{if((await fetch(base+"/api/health")).ok)return;}catch{}
   if(proc.exitCode!==null)throw Error("서버 실행 실패: "+err);
   await delay(45);
  }
  throw Error("server timeout "+err);
 }
 async function stop(){if(!proc)return;proc.kill("SIGTERM");await delay(150);proc=null;}
 async function expire(){
  await stop();
  const filename=path.join(tmp,"game-state.json");
  const obj=JSON.parse(fs.readFileSync(filename,"utf8"));
  obj.deadline=Date.now()-1000;
  fs.writeFileSync(filename,JSON.stringify(obj));
  await boot();
 }
 function client(){let cookie="";
  return async(route,body)=>{
   const r=await fetch(base+route,{method:body===undefined?"GET":"POST",
    headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(r.headers.has("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];
   return {status:r.status,data:await r.json().catch(()=>null)};
  };
 }
 try{
  await boot();
  const teacher=client(),alpha=client(),beta=client();
  assert.equal((await teacher("/api/login",{password:"ClassroomTestSecretPass!35"})).status,200);
  const pin=(await teacher("/api/state")).data.room.pin;
  assert.equal((await alpha("/api/join",{pin,name:"수익률A팀",members:["A"]})).status,200);
  assert.equal((await beta("/api/join",{pin,name:"수익률B팀",members:["B"]})).status,200);
  assert.equal((await alpha("/api/team",{action:"draw",mode:"even"})).status,200);
  assert.equal((await beta("/api/team",{action:"draw",mode:"even"})).status,200);
  const lobby=(await alpha("/api/state")).data;
  assert.equal(lobby.news.length,0);
  assert.equal((await teacher("/api/teacher",{action:"start"})).status,200);
  const news=(await alpha("/api/state")).data;
  assert.equal(news.news.some(n=>n.learning_concept?.concept),true);
  assert.ok(news.news.every(n=>n.year===news.room.year));
  assert.equal((await alpha("/api/predict",{sectorId:1,reason:"에너지 비용에 영향을 줄 수 있음"})).status,200);
  const tm=(await teacher("/api/state")).data;
  assert.equal(tm.predictionBoard.answered,1);
  assert.equal(tm.predictionBoard.entries[0].teamName,"수익률A팀");
  assert.equal((await beta("/api/state")).data.predictionBoard,undefined);
  await expire();
  assert.equal((await alpha("/api/state")).data.room.phase,"trade");
  assert.equal((await alpha("/api/list",{offerId:1,offerQty:6,wantId:8,wantQty:2})).status,200);
  const list=(await beta("/api/state")).data.listings[0];
  assert.equal((await beta("/api/accept",{id:list.id})).status,200);
  const stateA=(await alpha("/api/state")).data;
  const stateB=(await beta("/api/state")).data;
  assert.equal(stateA.team.holdings["1"],4);
  assert.equal(stateA.team.holdings["8"],12);
  assert.equal(stateA.team.total,1100000);
  assert.equal(stateB.team.total,1100000);
  assert.equal(stateA.team.returnPct,0,"체결 직후 수익률은 발표 전까지 유지");
  assert.ok(stateA.scores.every(t=>t.returnPct===0));
  await expire();
  const reveal=(await alpha("/api/state")).data;
  assert.equal(reveal.room.phase,"result");
  assert.equal(reveal.scores[0].rank,1);
  assert.equal(reveal.scores[0].returnPct>=reveal.scores[1].returnPct,true);
  assert.ok(reveal.lastResult?.changes?.length===11);
  assert.notEqual(reveal.team.total,stateA.team.total,"발표 시점에만 새로운 가치 반영");
 }finally{await stop();fs.rmSync(tmp,{recursive:true,force:true});}
});
