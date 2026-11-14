import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"invest-easy-"));
const port=41000+Math.floor(Math.random()*15000);
const base=`http://127.0.0.1:${port}`;
let server;
async function start(){
  server=spawn(process.execPath,["server.mjs"],{
    cwd:dir,
    env:{...process.env,STORAGE_BACKEND:"local",TEACHER_PASSWORD:"MyBeginnerTestPassword!123",
         HOST:"127.0.0.1",PORT:String(port),DATA_DIR:tmp},
    stdio:["ignore","pipe","pipe"]});
  let stderr="";
  server.stderr.on("data",x=>stderr+=x.toString());
  for(let i=0;i<120;i++){
    if(server.exitCode!==null)throw Error(`server exited: ${stderr}`);
    try {if((await fetch(base+"/api/health")).ok)return;}catch{}
    await delay(50);
  }
  throw Error("server start timeout "+stderr);
}
async function stop(){
  if(!server||server.exitCode!==null)return;
  const old=server;
  await new Promise(resolve=>{
    old.once("exit",resolve);old.kill("SIGTERM");
    setTimeout(()=>{old.kill("SIGKILL");resolve()},1500).unref();
  });
  server=null;
}
function client(){
  let cookie="";
  return async(route,body)=>{
    const r=await fetch(base+route,{
      method:body===undefined?"GET":"POST",
      headers:{...(cookie?{Cookie:cookie}:{}),
        ...(body===undefined?{}:{"Content-Type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(r.headers.has("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];
    const data=await r.json().catch(()=>null);
    return {status:r.status,data};
  };
}
async function advance(){
  await stop();
  const save=path.join(tmp,"game-state.json");
  const st=JSON.parse(fs.readFileSync(save,"utf8"));
  st.deadline=Date.now()-1000;
  fs.writeFileSync(save,JSON.stringify(st));
  await start();
}
test("왕초보 코스: 강사 진행 8단계, 균등 카드, 연습, 퀴즈, 턴제, 초기화",async()=>{
 try{
  await start();
  const guest=client(),teacher=client(),alpha=client(),beta=client();
  assert.equal((await guest("/api/health")).data.build,"invest-play-easy-v4.2-review");
  const initial=(await guest("/api/state")).data;
  assert.equal(initial.room.year,2020);assert.equal(initial.room.totalRounds,4);
  assert.equal(initial.room.pin,undefined);
  assert.equal((await teacher("/api/login",{password:"MyBeginnerTestPassword!123"})).status,200);
  const pin=(await teacher("/api/state")).data.room.pin;
  assert.equal((await alpha("/api/join",{pin,name:"입문1팀",members:["가"]})).status,200);
  assert.equal((await beta("/api/join",{pin,name:"입문2팀",members:["나"]})).status,200);
  assert.equal((await alpha("/api/team",{action:"draw",mode:"random"})).status,400);
  assert.equal((await teacher("/api/teacher",{action:"start"})).status,400);
  assert.equal((await alpha("/api/team",{action:"draw",mode:"even"})).status,200);
  assert.equal((await beta("/api/team",{action:"draw",mode:"even"})).status,200);
  const before=(await alpha("/api/state")).data.team;
  const practice=await alpha("/api/team",{action:"practice",offerId:1,wantId:8});
  assert.equal(practice.status,200);
  assert.equal(practice.data.team.practiceDone,true);
  assert.deepEqual(practice.data.team.holdings,before.holdings,"practice must not mutate holdings");
  assert.equal((await alpha("/api/team",{action:"practice",offerId:1,wantId:8})).status,400);
  assert.equal((await teacher("/api/state")).data.practiceStats.completed,1);
  assert.equal(before.cardCount,110);
  assert.ok(Object.values(before.holdings).every(v=>v===10));
  assert.equal((await teacher("/api/teacher",{action:"start"})).status,200);
  let t=(await teacher("/api/state")).data;
  assert.deepEqual(t.news.map(x=>x.id),["EVT-2020-01","EVT-2020-02"]);
  assert.ok(t.news[0].easy_summary.length>12);
  assert.ok(t.beginnerLesson?.quiz?.question.length>10);
  assert.equal((await alpha("/api/state")).data.news.length,0);
  assert.equal((await alpha("/api/state")).data.beginnerLesson,undefined);
  assert.equal((await alpha("/api/list",{offerId:1,offerQty:1,wantId:8,wantQty:1})).status,403);
  assert.equal((await alpha("/api/quiz",{answer:"B"})).status,200);
  assert.equal((await alpha("/api/quiz",{answer:"B"})).status,400);
  assert.equal((await teacher("/api/state")).data.quizStats.answered,1);
  assert.equal((await teacher("/api/teacher",{action:"openTrade"})).status,200);
  t=(await teacher("/api/state")).data;
  const proposer=t.room.turnTrade.proposerName==="입문1팀"?alpha:beta;
  const responder=proposer===alpha?beta:alpha;
  assert.equal(t.room.phase,"trade");
  assert.equal((await proposer("/api/list",{offerId:1,offerQty:1,wantId:8,wantQty:1})).status,200);
  const listing=(await responder("/api/state")).data.listings[0];
  assert.ok(listing?.id);
  assert.equal((await proposer("/api/skip-proposal",{})).status,200);
  assert.equal((await responder("/api/accept",{id:listing.id})).status,200);
  assert.equal((await responder("/api/accept",{id:listing.id})).status,403,"already completed exchange cannot be accepted out of turn");
  assert.equal((await proposer("/api/state")).data.team.holdings[8],11);
  assert.equal((await responder("/api/state")).data.team.holdings[8],9);
  assert.equal((await teacher("/api/teacher",{action:"closeTrade"})).status,200);
  t=(await teacher("/api/state")).data;
  assert.equal(t.room.phase,"result");
  assert.equal(t.lastResult.changes.length,11);
  assert.equal(t.stageTeamReports.length,2);
  assert.ok(t.stageTeamReports.every(r=>r.report?.executedCount===1));
  assert.equal((await responder("/api/quiz",{answer:"A"})).status,400);
  assert.equal((await alpha("/api/state")).data.lastResult,null,"teacher-only published results");
  for(let i=1;i<8;i++){
   assert.equal((await teacher("/api/teacher",{action:"next"})).status,200);
   t=(await teacher("/api/state")).data;
   assert.equal(t.room.phase,"news");
   assert.ok([2020,2021,2022,2023].includes(t.room.year));
   assert.equal(t.teacherBrief.length,2);
   assert.equal((await teacher("/api/teacher",{action:"openTrade"})).status,200);
   assert.equal((await teacher("/api/teacher",{action:"closeTrade"})).status,200);
   t=(await teacher("/api/state")).data;
   assert.equal(t.room.phase,"result");
   assert.equal(t.resultHistory.length,i+1);
  }
  assert.equal((await teacher("/api/teacher",{action:"next"})).status,200);
  t=(await teacher("/api/state")).data;
  assert.equal(t.room.phase,"finished");
  assert.equal(t.resultHistory.length,8);
  assert.equal(t.priceHistory.length,8);
  assert.equal(t.news.length,16);
  assert.ok(t.news.every(x=>x.year!==2019));
  assert.equal(t.teamTradeReports.length,2);
  assert.ok(t.teamTradeReports.every(x=>x.report?.ready));
  assert.equal((await alpha("/api/state")).data.news.length,0);
  assert.equal((await teacher("/api/teacher",{action:"reset",confirm:"초기화"})).status,200);
  const fresh=(await teacher("/api/state")).data;
  assert.equal(fresh.room.phase,"lobby");
  assert.equal(fresh.room.year,2020);
  assert.equal(fresh.room.teamCount,0);
  assert.equal((await alpha("/api/state")).data.role,"guest");
 }finally{await stop();fs.rmSync(tmp,{recursive:true,force:true});}
});

test("초급 UI 및 데이터 파일 확인",()=>{
  const app=fs.readFileSync(path.join(dir,"public/app.js"),"utf8");
  const index=fs.readFileSync(path.join(dir,"public/index.html"),"utf8");
  const sql=fs.readFileSync(path.join(dir,"supabase/schema.sql"),"utf8");
  const store=fs.readFileSync(path.join(dir,"storage.mjs"),"utf8");
  assert.match(app,/function beginnerGuide/);
  assert.match(app,/한 줄 요약/);
  assert.match(app,/산업 카드/);
  assert.match(index,/EASY V5\.0/);
  assert.match(app,/function beginnerCoach/);
  assert.match(app,/function beginnerQuiz/);
  assert.match(app,/function beginnerPractice/);
  assert.match(app,/function beginnerResult/);
  const style=fs.readFileSync(path.join(dir,"public/style.css"),"utf8");
  assert.match(style,/V2\/V8 NEWS FOCUS/);
  assert.match(style,/easy-quiz-options/);
  const lessons=JSON.parse(fs.readFileSync(path.join(dir,"data/beginner_lessons.json"),"utf8")).lessons;
  assert.equal(lessons.length,8);
  assert.match(sql,/classroom_beginner_state/);
  assert.match(store,/classroom_beginner_state/);
  assert.match(store,/beginner-main/);
  for(const ticker of ["XLE","XLB","XLI","XLF","XLY","XLP","XLV","XLK","XLC","XLU","XLRE"]){
    assert.ok(fs.existsSync(path.join(dir,"public/cards",ticker+".png")),ticker);
  }
});
