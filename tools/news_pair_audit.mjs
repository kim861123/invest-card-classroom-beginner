#!/usr/bin/env node
// 기존 프로젝트 data/historical_news_2019_2026.json을 읽어 기사 조합을 검토하는 보조도구.
// 기사 데이터를 수정하거나 학생에게 미래 데이터를 공개하지 않습니다.
import fs from "node:fs";
import path from "node:path";
const file=process.argv[2]||path.join("data","historical_news_2019_2026.json");
if(!fs.existsSync(file)){
 console.error("뉴스 원본 파일 없음:",file);
 console.error("이 패치는 원본 data/ 파일을 포함하지 않습니다. GitHub 프로젝트 루트에서 실행하세요.");
 process.exitCode=2;
}else{
 const data=JSON.parse(fs.readFileSync(file,"utf8"));
 const events=Array.isArray(data)?data:Array.isArray(data.events)?data.events:[];
 const years=[...new Set(events.map(x=>Number(x.year)).filter(Number.isFinite))].sort((a,b)=>a-b);
 let flags=0;
 for(const year of years){
  const group=events.filter(x=>Number(x.year)===year);
  for(const [stage,start] of [[1,1],[2,3]]){
   const pair=group.filter(x=>[start,start+1].includes(Number(String(x.id||"").split("-").at(-1))));
   if(pair.length!==2){
    console.log(`[확인 필요] ${year}년 ${stage}차: ${pair.length}개 기사 (예상 2개)`);
    flags++;continue;
   }
   const a=pair[0],b=pair[1];
   const da=Date.parse(String(a.date)+"T00:00:00Z"),db=Date.parse(String(b.date)+"T00:00:00Z");
   const gap=Number.isFinite(da)&&Number.isFinite(db)?Math.abs(Math.round((db-da)/86400000)):null;
   const issues=[];
   if(gap===null)issues.push("날짜 형식 확인");
   else if(gap>45)issues.push(`${gap}일 시차: 후속 관계 또는 독립 이슈임을 명시`);
   if(da>db)issues.push("기사 번호와 날짜 순서 역전");
   const joined=[a.title,b.title].join(" / ");
   if(year===2022&&/소비자물가|인플레이션|CPI|물가/.test(joined))issues.push("CPI '상승률 둔화'와 '물가 수준 하락' 혼동 여부 확인");
   for(const x of pair){
    const t=String(x.title||"");
    const d=String(x.date||"");
    if(year===2022&&/6월.*CPI|CPI.*6월/.test(t)&&d<"2022-07-13")issues.push("6월 CPI 통계(7월 13일 발표) 선공개 가능성: 원문 확인");
    if(year===2022&&/10월.*CPI|CPI.*10월/.test(t)&&d<"2022-11-10")issues.push("10월 CPI 통계(11월 10일 발표) 선공개 가능성: 원문 확인");
   }
   console.log(`${year}년 ${stage}차: ${a.date} ${a.title} | ${b.date} ${b.title}`);
   if(issues.length){flags++;for(const issue of issues)console.log("  ⚠",issue);}
  }
 }
 console.log(`점검 완료: 기사 조합 ${years.length*2}개, 추가 확인 권고 ${flags}개`);
}
