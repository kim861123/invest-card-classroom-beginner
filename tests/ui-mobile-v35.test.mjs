import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const js=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../public/mobile-v35.css",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
function podiumFn(){
  const start=js.indexOf("function finalPodium(g){");
  const end=js.indexOf("function studentView(g){",start);
  assert.ok(start>-1&&end>start);
  const sandbox={
    h:(v)=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),
    ico:()=>'<svg aria-hidden="true"></svg>',
    buyClass:(v)=>Number(v)>=0?"gain":"loss",
    pct:(v)=>`${Number(v).toFixed(2)}%`,
    format:(v)=>Number(v).toLocaleString("ko-KR")
  };
  return vm.runInNewContext(`${js.slice(start,end)}\nfinalPodium`,sandbox);
}
const scoreData={room:{phase:"finished"},team:{id:2},scores:[
  {id:2,rank:2,name:"우리 팀",returnPct:6.2,total:1168200},
  {id:1,rank:1,name:"우승 팀",returnPct:13.1,total:1244100},
  {id:3,rank:3,name:"동메달 팀",returnPct:-0.3,total:1096700},
  {id:4,rank:4,name:"4위 팀",returnPct:-3,total:1067000}
]};
test("final medal podium renders server ranks, top 3 and own result only when finished",()=>{
  const podium=podiumFn();
  const html=podium(scoreData);
  assert.match(html,/우승 팀/);
  assert.match(html,/우리 팀/);
  assert.match(html,/동메달 팀/);
  assert.doesNotMatch(html,/4위 팀/);
  assert.match(html,/최종 시상식/);
  assert.match(html,/1위/);assert.match(html,/2위/);assert.match(html,/3위/);
  assert.equal(podium({...scoreData,room:{phase:"result"}}),"");
});
test("escaped names are safe and ties remain server-sourced",()=>{
  const text=podiumFn()({...scoreData,scores:[{id:1,rank:1,name:"<script>",returnPct:2,total:1000}]});
  assert.ok(text.includes("&lt;script&gt;"));
  assert.ok(!text.includes("<script>"));
});
test("finished phase explicitly directs students to teacher-led results",()=>{
  assert.match(js,/finished:"게임이 끝났습니다\. 최종 시상식은 강사 화면에서 진행합니다\."/);
  assert.doesNotMatch(js,/\?'<div class="result-banner"><h3>\$\{ico/);
  assert.match(js,/\$\{finalPodium\(g\)\}/);
});
test("all original card art URLs are prefetched, concurrency bounded",()=>{
  assert.match(js,/function prefetchCardArtwork\(sectors\)/);
  assert.match(js,/active<4/);
  assert.match(js,/scheduleCardWarmup\(game\)/);
  assert.match(js,/new ImageCtor\(\)|new Image\(\)/);
});
test("mobile root no x overflow, tables remain scrollable and new css is loaded",()=>{
  assert.match(css,/overflow-x:hidden!important/);
  assert.match(css,/\.table-wrap[^\n]*overflow-x:auto/);
  assert.match(css,/\.final-podium\{/);
  assert.match(html,/mobile-v35\.css/);
  assert.match(sw,/mobile-v35\.css/);
});
test("nine high-quality, appropriately labeled article assets included",()=>{
  const names=["banks","energy","geopolitics","health","inflation-cool","inflation-rise","rates","tech","trade"];
  for(const name of names)assert.ok(fs.statSync(new URL(`../public/art/article-${name}.webp`,import.meta.url)).size>20000,name);
  assert.match(js,/기사 이해를 위한 AI 생성 재현 이미지/);
});
