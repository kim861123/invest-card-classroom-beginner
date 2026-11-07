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
test("왕초보 코스: 4개 연도·8단계, 안전한 시작 카드·쉬운 기사·팀 교환·리셋",async()=>{
  try {
    await start();
    const visitor=client(),teacher=client(),alpha=client(),beta=client();
    const health=await visitor("/api/health");
    assert.equal(health.data.build,"classroom-beginner-v3.1-lesson-presentation");
    const init=(await visitor("/api/state")).data;
    assert.equal(init.room.year,2020);
    assert.equal(init.room.totalRounds,4);
    assert.equal(init.news.length,0);
    assert.equal(init.room.pin,undefined);
    assert.equal((await teacher("/api/login",{password:"MyBeginnerTestPassword!123"})).status,200);
    const pin=(await teacher("/api/state")).data.room.pin;
    assert.equal((await alpha("/api/join",{pin,name:"입문1팀",members:["가"]})).status,200);
    assert.equal((await beta("/api/join",{pin,name:"입문2팀",members:["나"]})).status,200);
    assert.equal((await alpha("/api/team",{action:"draw",mode:"random"})).status,400);
    assert.equal((await teacher("/api/teacher",{action:"start"})).status,400);
    assert.equal((await alpha("/api/team",{action:"draw",mode:"even"})).status,200);
    assert.equal((await beta("/api/team",{action:"draw",mode:"even"})).status,200);
    const beforePractice=(await alpha("/api/state")).data;
    const practice=await alpha("/api/team",{action:"practice",offerId:1,wantId:8});
    assert.equal(practice.status,200);
    assert.equal(practice.data.team.practiceDone,true);
    assert.deepEqual(practice.data.team.holdings,beforePractice.team.holdings);
    assert.equal((await alpha("/api/team",{action:"practice",offerId:1,wantId:8})).status,400);
    assert.equal((await teacher("/api/state")).data.practiceStats.completed,1);
    const a=(await alpha("/api/state")).data;
    assert.equal(a.team.cardCount,110);
    assert.equal(a.team.initialAsset,1_100_000);
    assert.ok(Object.values(a.team.holdings).every(v=>v===10));
    assert.equal((await teacher("/api/teacher",{action:"start"})).status,200);
    let stage=(await alpha("/api/state")).data;
    assert.deepEqual(stage.news.map(x=>x.id),["EVT-2020-01","EVT-2020-02"]);
    assert.ok(stage.news[0].easy_summary.length>12);
    assert.ok(stage.news[0].easy_term.length>12);
    assert.ok(stage.news[0].easy_question.length>12);
    assert.equal(stage.news[0].analysis,undefined);
    assert.ok(stage.beginnerLesson?.quiz?.question.length>10);
    assert.equal(stage.beginnerLesson.quiz.correct,undefined);
    // 현재 뉴스의 기사와 퀴즈를 동일한 뉴스 ID로 연결합니다.
    assert.equal(stage.beginnerLesson.quiz.sourceNews.id,"EVT-2020-02");
    assert.ok(stage.news.some(x=>x.id===stage.beginnerLesson.quiz.sourceNews.id));
    assert.equal(stage.beginnerLesson.quiz.solution,undefined);
    assert.equal(stage.quizReviews.length,0);
    assert.equal(stage.beginnerLesson.reveal,undefined);
    assert.ok(stage.beginnerLesson.coach.checks.length>=2);
    assert.equal((await alpha("/api/quiz",{answer:"B"})).status,200);
    assert.equal((await alpha("/api/quiz",{answer:"B"})).status,400);
    const quizzed=(await alpha("/api/state")).data.beginnerLesson.submission;
    assert.equal(quizzed.correct,true);
    assert.ok(quizzed.explanation.length>10);
    assert.equal((await teacher("/api/state")).data.quizStats.answered,1);
    assert.equal((await alpha("/api/list",{offerId:1,offerQty:1,wantId:8,wantQty:1})).status,403);
    await advance(); // news -> trade
    assert.equal((await alpha("/api/state")).data.room.phase,"trade");
    assert.equal((await alpha("/api/list",{offerId:1,offerQty:1,wantId:8,wantQty:1})).status,200);
    const list=(await beta("/api/state")).data.listings[0];
    assert.ok(list?.id);
    assert.equal((await beta("/api/accept",{id:list.id})).status,200);
    assert.equal((await alpha("/api/state")).data.team.holdings["8"],11);
    assert.equal((await beta("/api/state")).data.team.holdings["8"],9);
    await advance(); // trade -> result
    stage=(await alpha("/api/state")).data;
    assert.equal(stage.room.phase,"result");
    assert.equal(stage.lastResult.changes.length,11);
    // 미응답 팀도 가격 발표 후에는 정답과 쉬운 해설을 확인할 수 있습니다.
    const unanswered=(await beta("/api/state")).data;
    assert.equal(unanswered.beginnerLesson.submission,null);
    assert.equal(unanswered.beginnerLesson.quiz.solution.correctOption,"B");
    assert.ok(unanswered.beginnerLesson.quiz.solution.explanation.length>10);
    assert.equal(unanswered.quizReviews.length,1);
    assert.equal(unanswered.quizReviews[0].answered,false);
    assert.equal(unanswered.quizReviews[0].solution.correctOption,"B");
    assert.ok(stage.beginnerLesson?.reveal?.summary.length>15);
    assert.equal((await beta("/api/quiz",{answer:"A"})).status,400);
    assert.equal(stage.news[0].analysis,undefined);
    assert.equal((await teacher("/api/state")).data.news[0].analysis.length>5,true);
    assert.equal(stage.stageTradeReport.ready,true);
    assert.equal(stage.stageTradeReport.executedCount,1);
    // 7 additional news-stage cycles = 8 stages total
    for(let i=0;i<7;i++){
      assert.equal((await teacher("/api/teacher",{action:"next"})).status,200);
      stage=(await alpha("/api/state")).data;
      assert.equal(stage.room.phase,"news");
      assert.ok(stage.news.some(x=>x.id===stage.beginnerLesson.quiz.sourceNews.id));
      assert.equal(stage.beginnerLesson.quiz.solution,undefined);
      assert.ok(stage.quizReviews.every(x=>x.solution.correctLabel.length>3));
      assert.ok([2020,2021,2022,2023].includes(stage.room.year));
      assert.ok(stage.news.every(x=>x.year>=2020&&x.year<=2023));
      assert.ok(stage.news.every(x=>!Object.hasOwn(x,"analysis")));
      await advance();
      assert.equal((await alpha("/api/state")).data.room.phase,"trade");
      await advance();
      assert.equal((await alpha("/api/state")).data.room.phase,"result");
    }
    assert.equal((await teacher("/api/teacher",{action:"next"})).status,200);
    stage=(await alpha("/api/state")).data;
    assert.equal(stage.room.phase,"finished");
    assert.equal(stage.stageTradeHistory.length,8);
    assert.equal(stage.tradeReport.ready,true);
    assert.equal(stage.quizReviews.length,8);
    assert.ok(stage.quizReviews.some(x=>x.answered===false));
    assert.equal(stage.news.length,16);
    assert.equal(stage.news.some(x=>x.year===2019),false);
    // teacher reset does not erase login, but does erase participant state
    assert.equal((await teacher("/api/teacher",{action:"reset",confirm:"초기화"})).status,200);
    const fresh=(await teacher("/api/state")).data;
    assert.equal(fresh.role,"teacher");
    assert.equal(fresh.room.phase,"lobby");
    assert.equal(fresh.room.year,2020);
    assert.equal(fresh.room.teamCount,0);
    assert.equal(fresh.room.totalRounds,4);
    assert.equal((await alpha("/api/state")).data.role,"guest");
  }finally{await stop();fs.rmSync(tmp,{recursive:true,force:true})}
});
test("초급 UI 및 데이터 파일 확인",()=>{
  const app=fs.readFileSync(path.join(dir,"public/app.js"),"utf8");
  const index=fs.readFileSync(path.join(dir,"public/index.html"),"utf8");
  const sql=fs.readFileSync(path.join(dir,"supabase/schema.sql"),"utf8");
  const store=fs.readFileSync(path.join(dir,"storage.mjs"),"utf8");
  assert.match(app,/function beginnerGuide/);
  assert.match(app,/초보자를 위한 한 줄 뉴스/);
  assert.match(app,/산업 카드/);
  assert.match(index,/EASY V3\.1/);
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
