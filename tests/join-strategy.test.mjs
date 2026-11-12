import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const appDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("학생 링크 분리, 중복 참가 방지, 팀명 변경, 110장 카드 뽑기, 1회 제한, 카드 이미지 제공", async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"invest-v3-"));
  const port=44000+Math.floor(Math.random()*10000),url=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,["server.mjs"],{
    cwd:appDir,env:{...process.env,TEACHER_PASSWORD:"NewTestPasswordStrong#2026",PORT:String(port),HOST:"127.0.0.1",DATA_DIR:tmp,STORAGE_BACKEND:"local"},
    stdio:["ignore","pipe","pipe"]
  });
  let errors="";child.stderr.on("data",b=>errors+=b.toString());
  const client=()=>{let cookie="";return async(route,body)=>{
    const res=await fetch(url+route,{method:body===undefined?"GET":"POST",
      headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{"content-type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const setCookie=res.headers.get("set-cookie");if(setCookie)cookie=setCookie.split(";")[0];
    return {status:res.status,data:await res.json()};
  }};
  try{
    let ready=false;
    for(let i=0;i<80;i++){try{const r=await fetch(url+"/api/health");if(r.ok){ready=true;break;}}catch{}await delay(50);}
    assert.ok(ready,errors);
    const page=await fetch(url+"/join");
    assert.equal(page.status,200);
    assert.match(await page.text(),/src="\/app.js\?v=easy-v4.2"/);
    for(const illustration of ["market-horizon","news-signal","exchange-handshake","victory-market"]){
      const response=await fetch(url+"/art/"+illustration+".webp");
      assert.equal(response.status,200,illustration+" should be published");
      assert.match(response.headers.get("content-type"),/image\/webp/);
      assert.ok((await response.arrayBuffer()).byteLength>20000);
    }
    const card=await fetch(url+"/cards/XLC.png");
    assert.equal(card.status,200);
    assert.match(card.headers.get("content-type"),/image\/png/);
    assert.ok((await card.arrayBuffer()).byteLength>10000);
    const svg=await fetch(url+"/cards/XLK.svg");
    assert.equal(svg.status,200);
    assert.match(svg.headers.get("content-type"),/image\/svg/);
    assert.equal((await fetch(url+"/data/historical_news_2019_2026.json")).status,404);

    const teacher=client(),a=client(),b=client(),c=client();
    assert.equal((await teacher("/api/login",{password:"NewTestPasswordStrong#2026"})).status,200);
    const t=(await teacher("/api/state")).data,pin=t.room.pin;
    assert.equal(t.resultHistory.length,0);
    assert.equal(t.teacherBrief.length,2);
    assert.equal((await a("/api/join",{name:"가치투자 1",pin,members:["학생1"]})).status,200);
    assert.equal((await a("/api/join",{name:"가치투자 2",pin,members:["학생1"]})).status,409);
    assert.equal((await teacher("/api/state")).data.room.teamCount,1);
    assert.equal((await a("/api/team",{action:"rename",name:"가치투자 2"})).status,200);
    assert.equal((await teacher("/api/state")).data.room.teamCount,1);
    assert.equal((await c("/api/join",{name:"가치투자2",pin,members:["중복"]})).status,400);
    assert.equal((await b("/api/join",{name:"가치투자3",pin,members:["학생2"]})).status,200);
    assert.equal((await teacher("/api/state")).data.room.teamCount,2);
    assert.equal((await teacher("/api/teacher",{action:"start"})).status,400,"카드를 뽑지 않은 팀이 있으면 시작 금지");
    const even=await a("/api/team",{action:"draw",mode:"even"});
    assert.equal(even.status,200);
    const team=even.data.team;
    assert.equal(team.drawMode,"even");
    assert.equal(Object.values(team.holdings).reduce((sum,x)=>sum+x,0),110);
    assert.equal(team.total,undefined,"학생에게 평가자산은 공개하지 않습니다.");
    assert.ok(Object.values(team.holdings).every(x=>x===10));
    assert.equal((await a("/api/team",{action:"draw",mode:"random"})).status,400,"1회 뽑기");
    const random=await b("/api/team",{action:"draw",mode:"random"});
    assert.equal(random.status,200);
    assert.equal(random.data.team.drawMode,"random");
    assert.equal(Object.values(random.data.team.holdings).reduce((sum,x)=>sum+x,0),110);
    assert.ok(Object.values(random.data.team.holdings).every(x=>x>=1));
    assert.equal(random.data.team.total,undefined,"학생 평가자산 비공개");
    assert.equal((await teacher("/api/teacher",{action:"start"})).status,200);
    assert.equal((await a("/api/team",{action:"draw",mode:"even"})).status,400);
    assert.equal((await b("/api/team",{action:"rename",name:"변경불가"})).status,400);
    const s=(await a("/api/state")).data;
    assert.equal(s.teacherBrief,undefined);
    assert.equal(s.resultHistory,undefined);
    assert.equal(s.news.length,0,"학생에게 강사용 뉴스가 공개되지 않습니다.");
    assert.ok((await teacher("/api/state")).data.news[0]?.source_ko?.url);
  }finally{
    child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),delay(2000)]);
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
