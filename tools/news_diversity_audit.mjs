#!/usr/bin/env node
/**
 * INVEST PLAY V3.5.3: 뉴스 주제 중복 진단
 * 읽기 전용. 기존 뉴스 데이터와 게임 가격·퀴즈를 절대 수정하지 않습니다.
 * Usage: node tools/news_diversity_audit.mjs [data/historical_news_2019_2026.json] [--json]
 */
import fs from "node:fs";
import path from "node:path";

export function topic(title=""){
  const s=String(title);
  if(/소비자물가|물가상승|인플레이션|CPI|물가 둔화|물가 급등/.test(s))return "물가";
  if(/기준금리|금리 (인상|인하|동결)|연준|FOMC|통화정책|테이퍼링|자산매입|중앙은행|금리 전망/.test(s))return "기준금리·통화정책";
  if(/반도체|AI|인공지능|빅테크|데이터센터|생성형/.test(s))return "기술·AI";
  if(/관세|무역|수입품|수출|공급망|항만|물류|해운/.test(s))return "무역·공급망";
  if(/고용|실업|일자리|임금/.test(s))return "고용";
  if(/원유|유가|석유|WTI|에너지|천연가스/.test(s))return "에너지";
  if(/전쟁|우크라이나|러시아|지정학|중동|침공/.test(s))return "지정학";
  if(/은행|SVB|금융위기|파산|예금/.test(s))return "금융·은행";
  if(/주택|부동산|모기지|상업용 부동산/.test(s))return "부동산";
  if(/WHO|코로나|팬데믹|비상사태|보건|바이오/.test(s))return "보건";
  if(/환율|달러|엔화|원화|외환/.test(s))return "환율";
  if(/소비|소매판매|경기 침체|성장률|GDP/.test(s))return "소비·경기";
  return "기타";
}
export function analyze(events){
  const years=new Map();
  for(const ev of events){
    const year=Number(ev.year);
    if(!Number.isFinite(year))continue;
    if(!years.has(year))years.set(year,[]);
    years.get(year).push({...ev,topic:topic(ev.title)});
  }
  return [...years].sort((a,b)=>a[0]-b[0]).map(([year,rows])=>{
    const ordered=rows.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const nRate=ordered.filter(x=>x.topic==="기준금리·통화정책").length;
    const categories=[...new Set(ordered.map(x=>x.topic))];
    const consecutive=ordered.some((x,i)=>i>0 && x.topic==="기준금리·통화정책" && ordered[i-1].topic===x.topic);
    return {year,count:rows.length,rateCount:nRate,rateShare:rows.length?Math.round(nRate*100/rows.length):0,
      categories,consecutive,needsReview:nRate>Math.max(1,Math.floor(rows.length/4)) || categories.length<Math.min(3,rows.length),
      rows:ordered.map(x=>({id:x.id,date:x.date,title:x.title,topic:x.topic}))};
  });
}
function markdown(rows){
  const lines=["# 연도별 뉴스 주제 균형 진단","",
    "원본 데이터 수정 없이 제목만 분류한 진단입니다. 기사 교체 전 사건 날짜·퀴즈·시장 가격 모델 관계를 반드시 검토하세요.",
    "","| 연도 | 기사 수 | 금리 기사 | 금리 비중 | 주제 수 | 검토 |",
    "|---|---:|---:|---:|---:|---|"];
  for(const x of rows) lines.push(`| ${x.year} | ${x.count} | ${x.rateCount} | ${x.rateShare}% | ${x.categories.length} | ${x.needsReview?"검토 필요":"양호"} |`);
  for(const x of rows){
    lines.push("",`## ${x.year}년 기사 목록`);
    for(const r of x.rows) lines.push(`- ${r.id} · ${r.date||"날짜 미상"} · [${r.topic}] ${r.title}`);
    if(x.needsReview)lines.push("","**권장:** 중복된 금리 뉴스 중 하나를 같은 시점의 고용·물가·기업·에너지·무역 관련 실제 사건으로 대체할지 검토하세요. 변경 시 뉴스 퀴즈, 교과 개념, 사건의 공개일, 산업별 결과 모델까지 함께 검증해야 합니다.");
  }
  return lines.join("\n")+"\n";
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const file=process.argv.slice(2).find(x=>!x.startsWith("--"))||"data/historical_news_2019_2026.json";
  if(!fs.existsSync(file)){
    console.error(`뉴스 원본 파일을 찾을 수 없습니다: ${file}\n원본 프로젝트에서 실행하세요.`);
    process.exitCode=2;
  }else{
    const raw=JSON.parse(fs.readFileSync(file,"utf8"));
    const events=Array.isArray(raw)?raw:raw.events;
    if(!Array.isArray(events))throw Error("events 배열이 없습니다.");
    const rows=analyze(events);
    process.stdout.write(process.argv.includes("--json")?JSON.stringify(rows,null,2)+"\n":markdown(rows));
  }
}
