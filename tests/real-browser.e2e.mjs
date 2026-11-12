import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {setTimeout as wait} from "node:timers/promises";
import {chromium} from "playwright";

const edition=(process.env.GITHUB_REPOSITORY||"local").split("/").pop();
const password="PlaywrightOnlyPassword!2026";
const port=39000+Math.floor(Math.random()*12000),base="http://127.0.0.1:"+port;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"game-browser-isolated-"));
const out=path.resolve("test-artifacts/browser");fs.mkdirSync(out,{recursive:true});
const report={edition,sha:process.env.GITHUB_SHA||"",data:"isolated local temporary state, no Supabase",checks:[],images:[],screenshots:[],pageErrors:[]};
let server,browser,stderr="";
const pass=(name,data={})=>{report.checks.push({name,status:"PASS",...data});console.log("BROWSER_PASS "+name,JSON.stringify(data));};
const no=(condition,message)=>assert.ok(condition,message);
const capture=async(page,name)=>{const file=edition+"-"+name+".png";await page.screenshot({path:path.join(out,file),fullPage:true,animations:"disabled"});report.screenshots.push(file);};
async function api(ctx,route,body){
 const r=body===undefined?await ctx.request.get(base+route):await ctx.request.post(base+route,{data:body});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{}
 return {status:r.status(),data,text};
}
async function ok(ctx,route,body){const r=await api(ctx,route,body);assert.equal(r.status,200,route+" "+r.status+" "+r.text.slice(0,220));return r.data;}
async function state(ctx){return ok(ctx,"/api/state");}
async function until(ctx,pred,name,ms=9000){
 const end=Date.now()+ms;let s;
 while(Date.now()<end){s=await state(ctx);if(pred(s))return s;await wait(250);}
 throw Error("timeout "+name+" "+JSON.stringify({phase:s?.room?.phase,turn:s?.room?.turnTrade}));
}
async function launchServer(){
 server=spawn(process.execPath,["server.mjs"],{cwd:process.cwd(),
  env:{...process.env,HOST:"127.0.0.1",PORT:String(port),TEACHER_PASSWORD:password,
   STORAGE_BACKEND:"local",DATA_DIR:dir,SECURE_COOKIES:"false",SUPABASE_URL:"",
   SUPABASE_SERVICE_ROLE_KEY:"",SUPABASE_ANON_KEY:"",DATABASE_URL:"",
   PUBLIC_BASE_URL:"",RENDER_EXTERNAL_URL:""},stdio:["ignore","pipe","pipe"]});
 server.stderr.on("data",d=>stderr+=d);
 for(let i=0;i<130;i++){
  if(server.exitCode!==null)throw Error("test server crashed "+stderr.slice(-800));
  try{const r=await fetch(base+"/api/health");if(r.ok){report.health=await r.json();return;}}catch{}
  await wait(100);
 }
 throw Error("server startup timeout "+stderr.slice(-800));
}
async function overflow(page,context){
 const r=await page.evaluate(()=>{
  const width=innerWidth,documentWidth=document.documentElement.scrollWidth;
  const offending=[...document.querySelectorAll("button,input,select,summary,.student-trading-shell,.turn-board")]
   .filter(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&b.height>0&&b.width>0&&b.right>width+3;})
   .slice(0,6).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,70),right:Math.round(e.getBoundingClientRect().right)}));
  return {width,documentWidth,offending};
 });
 no(r.documentWidth<=r.width+2,context+" horizontal overflow "+JSON.stringify(r));
 no(r.offending.length===0,context+" elements beyond edge "+JSON.stringify(r));
 return r;
}
async function assets(page,width){
 const results=await page.evaluate(async()=>{
  const files=["XLE.svg","XLV.svg","XLE.png","XLV.png"],list=[];
  for(const file of files){
   const start=performance.now();
   const result=await new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>resolve({loaded:true,width:img.naturalWidth,height:img.naturalHeight});
    img.onerror=()=>resolve({loaded:false,width:0,height:0});
    img.src="/cards/"+file;
   });
   list.push({file,...result,ms:Math.round(performance.now()-start)});
  }
  return list;
 });
 for(const r of results){
  no(r.loaded&&r.width>0&&r.height>0,"broken "+r.file+" at "+width+"px");
  const response=await page.context().request.get(base+"/cards/"+r.file);
  assert.equal(response.status(),200,"asset HTTP "+r.file);
  report.images.push({...r,bytes:(await response.body()).length,viewport:width});
 }
}
async function instructorLayout(page){
 const data=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll(".instructor-sidebar button")].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height;});
  const overlaps=[];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
   const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)
    overlaps.push([nodes[i].textContent.trim(),nodes[j].textContent.trim()]);
  }
  return {buttons:nodes.length,overlaps};
 });
 no(data.buttons>=3,"teacher buttons missing");assert.deepEqual(data.overlaps,[]);return data;
}
const clock=s=>{const left=(s.room.deadline-Date.now())/1000;no(left>15&&left<=21,"fresh 20 sec timer expected, got "+left);return Math.round(left);};
async function run(){
 await launchServer();pass("isolated local server",{build:report.health.build});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 report.chromium=browser.version();
 const teacherCtx=await browser.newContext({viewport:{width:1440,height:960}});
 const teacher=await teacherCtx.newPage();
 teacher.on("pageerror",e=>report.pageErrors.push({page:"teacher",error:e.message}));
 await teacher.goto(base+"/teacher");
 await teacher.locator('#login-form input[name="password"]').fill(password);
 await teacher.locator('#login-form button[type="submit"]').click();
 await until(teacherCtx,s=>s.role==="teacher","teacher login");
 await teacher.locator(".control-panel").waitFor();
 pass("teacher actual browser login");
 const pin=(await state(teacherCtx)).room.pin,teams=[];
 for(const [i,width] of [360,390,430].entries()){
  const ctx=await browser.newContext({viewport:{width,height:860},hasTouch:true,isMobile:true});
  const page=await ctx.newPage();
  page.on("pageerror",e=>report.pageErrors.push({page:"student "+width,error:e.message}));
  await page.goto(base+"/join");
  await page.locator('#join-form input[name="pin"]').fill(pin);
  await page.locator('#join-form input[name="name"]').fill("학생"+(i+1)+"팀");
  await page.locator('#join-form input[name="members"]').fill("학습자"+(i+1));
  await page.locator('#join-form button[type="submit"]').tap();
  const joined=await until(ctx,s=>s.role==="team","student join "+width);
  await ok(ctx,"/api/team",{action:"draw",mode:"even"});
  await until(ctx,s=>s.team?.drawMode==="even","student draw");
  await page.locator("#my-cards-dropdown summary").waitFor();
  const before=await page.locator("#my-cards-dropdown").evaluate(e=>e.open);
  await page.locator("#my-cards-dropdown summary").tap();
  const after=await page.locator("#my-cards-dropdown").evaluate(e=>e.open);
  no(before!==after,"touch toggle failed "+width);
  const view=await overflow(page,"lobby "+width);
  await assets(page,width);
  await capture(page,"mobile-"+width+"-lobby");
  teams.push({ctx,page,width,id:joined.team.id,name:joined.team.name});
  pass("mobile browser login/touch/assets "+width,{overflow:view,imageFiles:4});
 }
 assert.equal((await state(teacherCtx)).room.teamCount,3);
 pass("one teacher plus three distinct student browser contexts");
 pass("desktop instructor buttons",await instructorLayout(teacher));
 await capture(teacher,"desktop-teacher-lobby");
 await teacher.locator('[data-action="start"]').click();
 await teacher.locator('[data-confirm="ok"]').click();
 await until(teacherCtx,s=>s.room.phase==="news","teacher starts");
 await capture(teacher,"desktop-teacher-news");
 const presentation=await teacherCtx.newPage();
 presentation.on("pageerror",e=>report.pageErrors.push({page:"presentation",error:e.message}));
 await presentation.goto(base+"/present?mode=news");
 await presentation.locator("#news-focus").waitFor({state:"visible",timeout:9000});
 await presentation.locator("#focus-article h2").waitFor({timeout:9000});
 const first=await presentation.locator("#focus-article h2").textContent();
 const tabs=presentation.locator("#news-tabs button");
 no(await tabs.count()>=2,"news tab count less than 2");
 await tabs.nth(1).click();
 await presentation.waitForFunction(old=>document.querySelector("#focus-article h2")?.textContent!==old,first,{timeout:9000});
 const second=await presentation.locator("#focus-article h2").textContent();
 assert.notEqual(first,second);
 await presentation.locator("#fullscreen").click();
 await presentation.waitForTimeout(350);
 const full=await presentation.evaluate(()=>Boolean(document.fullscreenElement));
 await capture(presentation,"teacher-news-fullscreen");
 no(full,"Fullscreen API did not open in headless Chromium");
 pass("teacher full news presentation and real fullscreen",{fullscreen:full,tabs:await tabs.count()});
 await teacher.locator('[data-action="openTrade"]').click();
 await teacher.locator('[data-confirm="ok"]').click();
 const opened=await until(teacherCtx,s=>s.room.phase==="trade"&&s.room.turnTrade?.status==="proposal","open trade");
 assert.equal(opened.room.config.responseSeconds,20);
 await capture(teacher,"desktop-teacher-trade");
 pass("instructor opens turn trade",{proposer:opened.room.turnTrade.proposerName,responseSeconds:20});
 for(const t of teams){
  await t.page.locator(".turn-board").waitFor();
  const view=await overflow(t.page,"trade "+t.width);
  await capture(t.page,"mobile-"+t.width+"-trade");
  pass("mobile trade viewport "+t.width,view);
 }
 const proposer=teams.find(x=>x.id===opened.room.turnTrade.proposerId);no(proposer,"proposer missing");
 await proposer.page.locator('[data-action="open-trade-picker"]').tap();
 await proposer.page.locator('.trade-picker-choice[data-action="trade-card"][data-id="XLE"]').tap();
 await proposer.page.locator("#trade-card-form").waitFor();
 await proposer.page.locator('#trade-card-form input[name="offerQty"]').fill("2");
 await proposer.page.locator('#trade-card-form select[name="wantId"]').selectOption("8");
 await proposer.page.locator('#trade-card-form input[name="wantQty"]').fill("1");
 await capture(proposer.page,"trade-modal-"+proposer.width);
 await proposer.page.locator('#trade-card-form button[type="submit"]').tap();
 await until(proposer.ctx,s=>s.listings?.some(x=>x.offerId===1&&x.offerQty===2),"mobile card proposal");
 pass("mobile card proposal with actual touch form");
 await ok(proposer.ctx,"/api/list",{requestId:"browser-offer-2",offerId:3,offerQty:1,wantId:4,wantQty:1});
 let s=await state(proposer.ctx);assert.equal(s.room.turnTrade.proposedCount,2);
 const secondOffer=s.listings.find(x=>x.offerId===3);no(secondOffer,"second offer missing");
 pass("multiple card offers queued",{count:s.room.turnTrade.proposedCount});
 await proposer.page.locator('[data-action="skip-proposal"]').tap();
 s=await until(teacherCtx,x=>x.room.turnTrade?.status==="response","start responses");
 const firstResponder=teams.find(t=>t.id===s.room.turnTrade.responderId);no(firstResponder,"first responder unknown");
 const firstSeconds=clock(s);
 await firstResponder.page.locator('[data-action="pass-response"]').tap();
 s=await until(teacherCtx,x=>x.room.turnTrade?.status==="response"&&x.room.turnTrade.responderId!==firstResponder.id,"after pass");
 const secondSeconds=clock(s);
 const acceptor=teams.find(t=>t.id===s.room.turnTrade.responderId);no(acceptor,"acceptor missing");
 await acceptor.page.locator('[data-action="accept"]').tap();
 await acceptor.page.locator('#accept-dialog [data-action="confirm-accept"]').tap();
 await until(teacherCtx,x=>x.recentTrades?.length===1,"accepted trade");
 pass("pass and accept through mobile browsers with independent 20s timers",{firstSeconds,secondSeconds,passer:firstResponder.name,acceptor:acceptor.name});
 const all=await Promise.all(teams.map(async t=>({id:t.id,name:t.name,team:(await state(t.ctx)).team})));
 const overall=all.reduce((sum,x)=>sum+Object.values(x.team.holdings).reduce((a,b)=>a+b,0),0);
 assert.equal(overall,330);
 const seller=all.find(x=>x.id===proposer.id),buyer=all.find(x=>x.id===acceptor.id);
 assert.equal(seller.team.holdings[1],8);assert.equal(seller.team.holdings[8],11);
 assert.equal(buyer.team.holdings[1],12);assert.equal(buyer.team.holdings[8],9);
 pass("correct holdings and 330-card conservation",{overall});
 s=await state(teacherCtx);
 assert.equal(s.room.turnTrade.currentListingId,secondOffer.id);
 const timeoutId=s.room.turnTrade.responderId,begin=clock(s);
 s=await until(teacherCtx,x=>x.room.turnTrade?.status==="response"&&x.room.turnTrade.currentListingId===secondOffer.id&&x.room.turnTrade.responderId!==timeoutId,"real automatic timeout",30000);
 const resetSeconds=clock(s);
 const finalResponder=teams.find(t=>t.id===s.room.turnTrade.responderId);
 await finalResponder.page.locator('[data-action="pass-response"]').tap();
 await until(teacherCtx,x=>x.room.turnTrade?.status==="proposal"||x.room.turnTrade?.status==="complete","second offer expired");
 const endStates=await Promise.all(teams.map(t=>state(t.ctx)));
 assert.equal(endStates.reduce((n,x)=>n+Object.values(x.team.holdings).reduce((a,b)=>a+b,0),0),330);
 pass("real 20s automatic expiration and fresh next team timer",{begin,resetSeconds,expiredResponder:timeoutId});
 no(report.pageErrors.length===0,"browser script errors "+JSON.stringify(report.pageErrors));
 pass("no JavaScript page errors",{errors:0});
}
try{await run();report.result="PASS";console.log("BROWSER_E2E_PASS "+edition);}
catch(e){report.result="FAIL";report.error=String(e.stack||e);console.error("BROWSER_E2E_FAIL "+edition+" "+report.error);process.exitCode=1;}
finally{
 report.completedAt=new Date().toISOString();
 fs.writeFileSync(path.join(out,edition+"-report.json"),JSON.stringify(report,null,2));
 try{if(browser)await browser.close();}catch{}
 try{if(server&&server.exitCode===null)server.kill("SIGTERM");}catch{}
 fs.rmSync(dir,{recursive:true,force:true});
}
