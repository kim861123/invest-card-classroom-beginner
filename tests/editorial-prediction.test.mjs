import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("V3/V9: 예측 저장·중복제출 차단·학생별 비공개·강사용 발표/보고서",async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"editorial-classroom-"));
 const port=45000+Math.floor(Math.random()*12000);
 const base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,["server.mjs"],{cwd:root,env:{...process.env,
   STORAGE_BACKEND:"local",TEACHER_PASSWORD:"SecureEditorTestPass!423",DATA_DIR:tmp,
   HOST:"127.0.0.1",PORT:String(port)},stdio:["ignore","pipe","pipe"]});
 try{
   let ready=false;
   for(let i=0;i<130;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await delay(40);}
   assert.ok(ready,"서버 시작 실패");
   const client=()=>{let cookie="";
    return async(route,body)=>{
     const r=await fetch(base+route,{method:body===undefined?"GET":"POST",
      headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
     if(r.headers.has("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];
     return {status:r.status,data:await r.json().catch(()=>null)};
    };
   };
   const teacher=client(),alpha=client(),beta=client(),guest=client();
   assert.equal((await guest("/api/presentation")).status,403);
   assert.equal((await guest("/api/report")).status,403);
   assert.equal((await teacher("/api/login",{password:"SecureEditorTestPass!423"})).status,200);
   const pin=(await teacher("/api/state")).data.room.pin;
   assert.equal((await alpha("/api/join",{pin,name:"신문1팀",members:["가"]})).status,200);
   assert.equal((await beta("/api/join",{pin,name:"신문2팀",members:["나"]})).status,200);
   assert.equal((await alpha("/api/team",{action:"draw",mode:"even"})).status,200);
   assert.equal((await beta("/api/team",{action:"draw",mode:"even"})).status,200);
   assert.equal((await teacher("/api/teacher",{action:"start"})).status,200);
   assert.equal((await alpha("/api/predict",{sectorId:1,reason:"경제활동 변화가 산업에 영향을 미칠 것 같습니다"})).status,200);
   assert.equal((await alpha("/api/predict",{sectorId:2,reason:"다시 제출"})).status,400);
   assert.equal((await beta("/api/state")).data.myPrediction,undefined,"student does not receive prediction analytics");
   assert.equal((await beta("/api/state")).data.predictionBoard,undefined);
   const ta=(await teacher("/api/state")).data;
   assert.equal(ta.predictionBoard.answered,1);
   assert.equal(ta.predictionBoard.entries[0].teamName,"신문1팀");
   const pub=(await teacher("/api/presentation")).data;
   assert.equal(pub.room.phase,"news");
   assert.equal(pub.room.pin,undefined);
   assert.equal(pub.teacherBrief,undefined);
   assert.equal(pub.news[0]?.analysis,undefined);
   assert.ok((await teacher("/api/report")).data.predictions[0].entries.length===1);
   assert.equal((await alpha("/api/report")).status,403);
   assert.equal((await guest("/api/report")).status,403);
   const html=await fetch(base+"/present");
   assert.equal(html.status,200);
   const editorial=await fetch(base+"/editorial.css");
   assert.equal(editorial.status,200);
   assert.match(await editorial.text(),/newspaper-masthead/);
 }finally{
   if(proc.exitCode===null){proc.kill("SIGTERM");await delay(150);}
   fs.rmSync(tmp,{recursive:true,force:true});
 }
});
