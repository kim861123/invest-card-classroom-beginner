#!/usr/bin/env node
// 사용: node tools/news_image_audit.mjs path/to/historical_news_2019_2026.json
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const file=process.argv[2];
if(!file){
  console.error("원본 뉴스 JSON이 필요합니다. 사용: node tools/news_image_audit.mjs <뉴스JSON파일>");
  process.exit(2);
}
let document;
try{document=JSON.parse(fs.readFileSync(file,"utf8"));}
catch(e){console.error("뉴스 파일을 읽을 수 없습니다:",e.message);process.exit(2);}
const js=fs.readFileSync(path.resolve("public/app.js"),"utf8");
const a=js.indexOf("const ARTICLE_IMAGE_KEYS=");
const b=js.indexOf("function articleMainTopic(",a);
if(a<0||b<0){console.error("이미지 매칭 함수를 찾지 못했습니다.");process.exit(1);}
const ctx=vm.createContext({});
vm.runInContext(js.slice(a,b),ctx);
const records=[];
const visited=new Set();
function walk(v){
  if(!v||typeof v!=="object"||visited.has(v))return;
  visited.add(v);
  if(typeof v.title==="string" && (typeof v.date==="string" || /news|article/i.test(String(v.id||"")))){
    records.push(v);
  }
  for(const item of Object.values(v))if(item&&typeof item==="object")walk(item);
}
walk(document);
if(records.length===0){console.error("기사 객체를 찾지 못했습니다. 데이터 구조를 확인해 주세요.");process.exit(1);}
const counts=new Map();
for(const a of records){
  ctx.record=a;
  const topic=vm.runInContext("articleTopic(record)",ctx);
  counts.set(topic,(counts.get(topic)||0)+1);
  console.log(`${String(a.date||"").padEnd(12)} ${topic.padEnd(17)} ${String(a.id||"").padEnd(14)} ${a.title}`);
}
console.log("\n전체 기사:",records.length);
for(const [topic,n] of [...counts].sort((a,b)=>b[1]-a[1]))console.log(`  ${topic}: ${n}`);
const unmatched=counts.get("market")||0;
if(unmatched)console.log(`\n검토 권장: 중립 시장 이미지로 분류된 기사 ${unmatched}개를 확인하고, articleTopic()의 ARTICLE_IMAGE_BY_ID 또는 x.image_topic을 지정하세요.`);
