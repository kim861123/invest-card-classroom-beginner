import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const presentation=fs.readFileSync(new URL("../public/present.html",import.meta.url),"utf8");
const presentationJs=fs.readFileSync(new URL("../public/present.js",import.meta.url),"utf8");

function turnHarness(){
 const turn=server.slice(server.indexOf("function tradeMode()"),server.indexOf("function expireListings()"));
 const offer=server.slice(server.indexOf("function postTrade(sess, body)"),server.indexOf("function acceptTrade(sess, id)"));
 const accept=server.slice(server.indexOf("function acceptTrade(sess, id)"),server.indexOf("/**\n * 강의 전체 초기화:"));
 assert.ok(turn.startsWith("function tradeMode()") && offer.startsWith("function postTrade(") && accept.startsWith("function acceptTrade("));
 const state={
  phase:"trade",deadline:null,stageIndex:0,config:{tradeSeconds:60,responseSeconds:20,turnMode:"A"},
  turnTrade:{mode:"A",proposalOrder:["A","B","C"],offerIndex:0,status:"proposal",
   currentListingId:null,responders:[],responderIndex:0,highestFirst:["C","B","A"]},
  listings:[],completedTrades:[],
  participants:["A","B","C"].map(id=>({id,name:"팀"+id,holdings:{1:10,2:10,3:10,4:10}}))
 };
 const sectors=[1,2,3,4].map(id=>({id,name:"산업"+id}));
 const make=new Function("state","sectors","crypto",
  "const bad=(yes,message)=>{if(yes)throw new Error(message||'invalid')};\n"+
  "const restricted=bad;const currentYear=()=>2020;\n"+
  "const ensureTrade=role=>{if(role!=='team'||state.phase!=='trade')throw new Error('forbidden')};\n"+
  "const reservedFor=(teamId,sectorId)=>state.listings.filter(l=>l.status==='open'&&l.sellerId===teamId&&l.offerId===sectorId).reduce((n,l)=>n+l.offerQty,0);\n"+
  "const availableFor=(team,sectorId)=>Math.max(0,(team.holdings[sectorId]||0)-reservedFor(team.id,sectorId));\n"+
  "const maxCounterpartyAvailable=(id,sectorId)=>Math.max(0,...state.participants.filter(p=>p.id!==id).map(p=>availableFor(p,sectorId)));\n"+
  turn+"\n"+offer+"\n"+accept+
  "\nreturn {startProposerTurn,postTrade,skipProposal,passResponse,acceptTrade,skipCurrentTurn,turnPublic};"
 );
 return {state,...make(state,sectors,crypto)};
}
function fullSeconds(deadline,seconds){
 const left=(deadline-Date.now())/1000;
 assert.ok(left>seconds-2&&left<=seconds+1,"expected independent "+seconds+"s clock, got "+left);
}
test("separate proposer time; multiple different offers queued within the same turn",()=>{
 const x=turnHarness();x.startProposerTurn();
 fullSeconds(x.state.deadline,60);
 const initial=x.state.deadline;
 x.postTrade({role:"team",teamId:"A"},{requestId:"first",offerId:1,offerQty:2,wantId:2,wantQty:1});
 x.postTrade({role:"team",teamId:"A"},{requestId:"second",offerId:3,offerQty:1,wantId:4,wantQty:1});
 assert.equal(x.state.turnTrade.status,"proposal");
 assert.equal(x.state.deadline,initial,"Submitting an offer must not steal the remaining proposer time");
 assert.equal(x.state.turnTrade.pendingListingIds.length,2);
 assert.equal(x.state.turnTrade.proposedCount,2);
 x.postTrade({role:"team",teamId:"A"},{requestId:"second",offerId:3,offerQty:1,wantId:4,wantQty:1});
 assert.equal(x.state.listings.length,2,"retry ID must be idempotent");
 x.skipProposal({role:"team",teamId:"A"});
 assert.equal(x.state.turnTrade.status,"response");
 assert.equal(x.state.turnTrade.responders[0],"C");
 fullSeconds(x.state.deadline,20);
 const first=x.state.turnTrade.currentListingId;
 x.state.deadline=Date.now()+800;
 x.passResponse({role:"team",teamId:"C"});
 assert.equal(x.state.turnTrade.responders[x.state.turnTrade.responderIndex],"B");
 fullSeconds(x.state.deadline,20);
 x.passResponse({role:"team",teamId:"B"});
 assert.equal(x.state.listings.find(l=>l.id===first).status,"expired");
 assert.notEqual(x.state.turnTrade.currentListingId,first);
 assert.equal(x.state.turnTrade.responders[0],"C");
 fullSeconds(x.state.deadline,20);
 x.acceptTrade({role:"team",teamId:"C"},x.state.turnTrade.currentListingId);
 assert.equal(x.state.completedTrades.length,1);
 assert.equal(x.state.turnTrade.status,"proposal");
 assert.equal(x.state.turnTrade.proposalOrder[x.state.turnTrade.offerIndex],"B");
 fullSeconds(x.state.deadline,60);
});
test("no offer skips safely to the next proposer",()=>{
 const x=turnHarness();x.startProposerTurn();x.skipProposal({role:"team",teamId:"A"});
 assert.equal(x.state.turnTrade.proposalOrder[x.state.turnTrade.offerIndex],"B");
 fullSeconds(x.state.deadline,60);
});
test("clear clock, mobile guard, real card assets, large news explanation mode",()=>{
 assert.match(app,/pendingProposalCount|proposedCount/);
 assert.match(app,/응답팀 남은 시간/);
 assert.match(app,/data-action="skip-proposal"/);
 assert.match(presentation,/id="news-focus"/);
 assert.match(presentationJs,/setPresentationMode/);
 assert.match(app,/ticker==="XLC"\?"png":"svg"/);
 for(const ticker of ["XLE","XLV"])assert.ok(fs.statSync(new URL("../public/cards/"+ticker+".svg",import.meta.url)).size>200);
 assert.ok(fs.statSync(new URL("../public/cards/XLV.png",import.meta.url)).size>100000);
 assert.match(html,/GENERAL V10\.2|EASY V4\.2/);
});
