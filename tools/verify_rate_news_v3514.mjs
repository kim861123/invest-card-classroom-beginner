/**
 * 원본 뉴스 데이터를 읽어 금리 관련 기사와 교체 결과를 실제로 검증하는 실행 도구.
 * 사용법: node tools/verify_rate_news_v3514.mjs
 *       node tools/verify_rate_news_v3514.mjs --json
 * 서버 데이터는 수정하지 않고 시뮬레이션만 합니다.
 */
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {rebalanceRateNews} from "../news_rate_balancer.mjs";
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const load=p=>JSON.parse(fs.readFileSync(path.join(base,p),"utf8"));
try{
  const source=load("data/historical_news_2019_2026.json");
  const candidates=load("data/news_rate_alternatives_v359.json").candidates;
  const easyPath=path.join(base,"data/beginner_lessons.json");
  const easy=fs.existsSync(easyPath);
  const lessons=easy?load("data/beginner_lessons.json").lessons:[];
  const settings=easy
    ? {allowedYears:[2020,2021,2022,2023],
       protectedIds:lessons.map(x=>x.quiz?.newsId).filter(Boolean),
       targetTotalRates:3}
    : {targetTotalRates:6};
  const report=rebalanceRateNews(source,{
    ...settings,maxRatesPerYear:1,candidates,dryRun:true
  });
  const data={
    version:"3.5.14",
    mode:easy?"비기너":"일반",
    // dryRun으로 원본 배열과 파일은 수정하지 않음
    before:report.before,after:report.after,
    beforeTotal:report.originalRateTotal,
    afterTotal:report.finalRateTotal,
    target:report.targetTotalRates,
    achieved:report.targetReached,
    changes:report.changed,
    skipped:report.skipped,
    warning:report.reason||null
  };
  if(process.argv.includes("--json")){
    console.log(JSON.stringify(data,null,2));
  }else{
    console.log(`[${data.mode} 금리 뉴스 검증] ${data.beforeTotal}건 → ${data.afterTotal}건 / 목표 ${data.target}건`);
    for(const a of data.before){
      const b=data.after.find(x=>x.year===a.year);
      console.log(`${a.year}: 전체 ${a.total}개 기사 중 금리 ${a.rate} → ${b?.rate??a.rate}개`);
    }
    for(const c of data.changes)
      console.log(`교체: ${c.year}년 ${c.originalTitle} => ${c.title} (${c.date})`);
    for(const skip of data.skipped)
      console.log(`보존: ${skip.year}년 ${skip.reason}`);
    if(data.warning)console.warn(`주의: ${data.warning}`);
  }
  if(!report.targetReached)process.exitCode=2;
}catch(error){
  console.error("검증 실패: 뉴스 또는 퀴즈 원본 데이터 파일이 필요합니다.",error.message);
  process.exitCode=1;
}
