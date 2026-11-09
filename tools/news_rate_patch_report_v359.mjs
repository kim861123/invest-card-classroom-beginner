#!/usr/bin/env node
/** 원본 뉴스 JSON을 수정하지 않는 금리 뉴스 균형 적용 시뮬레이션 */
import fs from "node:fs";
import path from "node:path";
import {rebalanceRateNews} from "../news_rate_balancer.mjs";
const input=process.argv.slice(2).find(x=>!x.startsWith("--"))||"data/historical_news_2019_2026.json";
const jsonFlag=process.argv.includes("--json");
if(!fs.existsSync(input)){
 console.error(`원본 뉴스 파일이 없습니다: ${input}\n원본 GitHub 프로젝트에 덮어쓴 후 실행하세요.`);
 process.exit(2);
}
const root=path.dirname(path.dirname(new URL(import.meta.url).pathname));
const candidates=JSON.parse(fs.readFileSync(path.join(root,"data/news_rate_alternatives_v359.json"),"utf8")).candidates;
const original=JSON.parse(fs.readFileSync(input,"utf8"));
const copy=JSON.parse(JSON.stringify(original));
const lessonPath=path.join(path.dirname(input),"beginner_lessons.json");
const lessons=fs.existsSync(lessonPath)?JSON.parse(fs.readFileSync(lessonPath,"utf8")).lessons:[];
const protectedIds=lessons.map(x=>x.quiz?.newsId).filter(Boolean);
const allowedYears=protectedIds.length?[2020,2021,2022,2023]:null;
const report=rebalanceRateNews(copy,{candidates,protectedIds,allowedYears});
if(jsonFlag){console.log(JSON.stringify(report,null,2));process.exit(0);}
console.log("연도 | 전체 기사 | 금리 전 | 금리 후");
for(const row of report.before){
 const aft=report.after.find(x=>x.year===row.year)||row;
 console.log(`${row.year} | ${row.total} | ${row.rate} | ${aft.rate}`);
}
console.log(`\n실제 대체 가능한 기사 ${report.changed.length}건`);
for(const x of report.changed)console.log(`- ${x.id}: ${x.originalTitle} → ${x.title} [${x.date}]`);
if(report.skipped.length){
 console.log(`\n보존·보류 ${report.skipped.length}건`);
 for(const x of report.skipped)console.log(`- ${x.year}/${x.id||"연도"}: ${x.reason}`);
}
console.log("\n※ 이 명령은 원본 파일을 수정하지 않습니다. 실제 게임은 서버 시작 시 같은 기준으로 메모리에서만 적용됩니다.");
