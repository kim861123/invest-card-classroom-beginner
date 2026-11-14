import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {analyze,topic} from "../tools/news_diversity_audit.mjs";

const root=process.cwd(), app=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
const server=fs.readFileSync(path.join(root,"server.mjs"),"utf8");
const sw=fs.readFileSync(path.join(root,"public/sw.js"),"utf8");
const html=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
const topics=["rates","geopolitics","energy","trade","health","tech","inflation-rise","inflation-cool","banks"];

test("9 article subjects each have 640/1200/1600 responsive images",()=>{
 for(const t of topics){
  for(const size of [640,1200,1600]){
   const f=path.join(root,"public/art",`article-${t}${size===1600?"":"-"+size}.webp`);
   assert.ok(fs.existsSync(f),`missing ${f}`);
   assert.ok(fs.statSync(f).size>8000,`image too small ${f}`);
  }
 }
});
test("client requests a proper srcset with sizes and retains alt text",()=>{
 assert.match(app,/srcset="\$\{imageBase\}-640\.webp/);
 assert.match(app,/width="1600" height="900"/);
 assert.match(app,/v=photo-v3515/);
 assert.match(app,/loading="\$\{isPast\?"lazy":"eager"\}"/);
});
test("server only exposes whitelisted article sizes and main images",()=>{
 assert.match(server,/article-\(rates\|geopolitics/);
 assert.match(server,/640\|1200/);
 assert.match(server,/article-health\.webp/);
});
test("service worker does not eager-download every photo at install",()=>{
 assert.match(sw,/easy-v500-softlight/);
 assert.doesNotMatch(sw,/"\/art\/article-rates\.webp"/);
});
test("html references new version",()=>{
 assert.match(html,/EASY V5\.0/);
});
test("headline classification keeps rate distinct from inflation",()=>{
 assert.equal(topic("연준 기준금리 인상"),"기준금리·통화정책");
 assert.equal(topic("미국 CPI 상승률 둔화"),"물가");
 assert.equal(topic("원유 WTI 가격 급락"),"에너지");
 assert.equal(topic("AI 반도체 수요 증가"),"기술·AI");
});
test("audit flags repeated monetary policy news",()=>{
 const events=[
  {id:"2022-01",year:2022,date:"2022-01-01",title:"연준 기준금리 인상"},
  {id:"2022-02",year:2022,date:"2022-02-01",title:"미국 CPI 상승"},
  {id:"2022-03",year:2022,date:"2022-03-01",title:"금리 인하 기대"},
  {id:"2022-04",year:2022,date:"2022-04-01",title:"러시아 우크라이나 침공"}];
 const [item]=analyze(events);
 assert.equal(item.rateCount,2);
 assert.equal(item.needsReview,true);
});
test("audit is read-only and accepts an empty list",()=>{
 assert.deepEqual(analyze([]),[]);
});
