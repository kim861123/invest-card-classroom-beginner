/**
 * INVEST PLAY V3.5.9 · 뉴스 주제 자동 균형 패치
 * 원본 JSON / 학습 평가 / 산업 가격 / 카드 데이터는 변경하지 않음.
 * 노출 직전 서버 메모리에서만 금리 뉴스 중복을 안전하게 조정.
 * 원본 시간축과 초급 퀴즈 뉴스 ID를 보존하며, 조건 미충족 시 원본 유지.
 */
import fs from "node:fs";
const CANDIDATE_URL = new URL("./data/news_rate_alternatives_v359.json", import.meta.url);
const MAX_LOOKBACK_DAYS = 190;
const DAY = 86400000;
const POLICY_RE = /(?:기준\s*금리|정책\s*금리|금리\s*(?:인상|인하|동결)|(?:연준|Fed|FOMC|중앙은행).*(?:인상|인하|동결|긴축|완화|테이퍼링|자산\s*매입)|테이퍼링|양적\s*(?:완화|긴축))/i;
function isPolicy(item) {
  const title=String(item?.title||"");
  if(/^(?:미국\s*)?(?:소비자물가|CPI|물가|고용|실업|주택)/.test(title))return false;
  return POLICY_RE.test(title);
}
function topicFromTitle(title="") {
  const s=String(title);
  if(/CPI|물가|인플레이션/.test(s))return "물가";
  if(/고용|실업|일자리/.test(s))return "고용";
  if(/유가|원유|WTI|석유/.test(s))return "에너지";
  if(/AI|인공지능|반도체|엔비디아/.test(s))return "기술·AI";
  if(/은행|금융위기|SVB/.test(s))return "금융·은행";
  if(/WHO|코로나|보건|백신|팬데믹/.test(s))return "보건";
  if(/관세|무역|수출|수에즈|물류/.test(s))return "무역·공급망";
  if(/전쟁|우크라이나|러시아/.test(s))return "지정학";
  return "기타";
}
const normalizeTitle = x=>String(x||"").replace(/[^가-힣A-Za-z0-9]/g,"").toLowerCase();
const isoDate=x => /^\d{4}-\d{2}-\d{2}$/.test(String(x||"")) ? Date.parse(x+"T00:00:00Z") : NaN;
const yearOf=x=>Number(x?.year);
function importance(e) {
  const t=String(e?.title||"");
  let n=0;
  if(/처음|첫\s|최초|긴급|전격|제로\s*금리|0\.75|75\s*bp|빅스텝/i.test(t))n+=8;
  if(/연준|FOMC|기준금리/.test(t))n+=2;
  if(/전망|예상|가능성|시사|기대|관측|동결|유지/i.test(t))n-=5;
  return n;
}
const FINGERPRINT = {
  "2019-us-china-tariff": /중국산.*관세|관세.*중국산|미중.*관세|무역분쟁/i,
  "2020-who-pandemic": /팬데믹.*선언|WHO.*대유행|세계적\s*대유행/i,
  "2020-wti-negative": /WTI.*(?:마이너스|음수)|원유.*마이너스|유가.*마이너스/i,
  "2020-vaccine": /화이자.*(?:백신|효과)|바이오엔테크.*백신/i,
  "2021-suez": /수에즈|에버기븐/i,
  "2021-cpi-may": /5월.*(?:CPI|소비자물가)|(?:CPI|소비자물가).*5월/i,
  "2021-cpi-oct": /10월.*(?:CPI|소비자물가)|(?:CPI|소비자물가).*10월/i,
  "2022-cpi-june": /6월.*(?:CPI|소비자물가)|(?:CPI|소비자물가).*6월|9\.1%/i,
  "2022-cpi-oct": /10월.*(?:CPI|소비자물가)|(?:CPI|소비자물가).*10월|7\.7%/i,
  "2022-ukraine": /우크라이나.*(?:침공|전면전)|러시아.*침공/i,
  "2022-cpi-april": /4월.*(?:CPI|소비자물가)|(?:CPI|소비자물가).*4월|8\.3%/i,
  "2022-jobs-may": /5월.*고용|고용.*5월|비농업.*39만/i,
  "2022-chip-controls": /반도체.*수출\s*통제|첨단\s*반도체.*(?:중국|규제)/i,
  "2023-svb": /SVB|실리콘밸리은행/i,
  "2023-who-end": /WHO.*비상사태.*종료|코로나.*비상사태.*종료/i,
  "2023-nvidia": /엔비디아.*(?:매출|실적)|AI.*(?:데이터센터|투자)/i,
  "2024-ai-act": /AI\s*법|인공지능법|EU.*인공지능/i,
  "2024-nvidia": /엔비디아.*(?:매출|실적)|AI.*데이터센터/i,
  "2024-it-outage": /크라우드스트라이크|IT.*대규모.*장애/i,
  "2025-deepseek": /딥시크|DeepSeek/i,
  "2025-tariffs": /상호관세|트럼프.*관세/i
};
export function countPolicyByYear(events, years=null) {
  const result = new Map();
  for(const e of events||[]) {
    const y=yearOf(e);
    if(!Number.isInteger(y)|| (years && !years.includes(y)))continue;
    if(!result.has(y))result.set(y,{year:y,total:0,rate:0});
    const r=result.get(y);r.total++;if(isPolicy(e))r.rate++;
  }
  return [...result.values()].sort((a,b)=>a.year-b.year);
}
export function rebalanceRateNews(newsSource, options={}) {
  const {
    protectedIds=[],allowedYears=null,maxRatesPerYear=1,
    targetTotalRates=null,candidates=[],dryRun=false
  }=options;
  const events=newsSource?.events;
  const report={
    version:"3.5.14",changed:[],skipped:[],before:[],after:[],
    originalRateTotal:0,finalRateTotal:0,targetTotalRates,
    targetReached:false,reason:""
  };
  if(!Array.isArray(events)){
    report.reason="newsSource.events 배열을 읽지 못해 변경하지 않음";
    return report;
  }
  const allowed=Array.isArray(allowedYears)?allowedYears:null;
  const relevant=e=>Number.isInteger(yearOf(e))&&(!allowed||allowed.includes(yearOf(e)));
  const protectedSet=new Set(protectedIds.filter(Boolean).map(String));
  const original=events.map(e=>({...e}));
  const records=Array.isArray(candidates)?candidates.filter(c=>
    Number.isInteger(Number(c?.year)) && Number.isFinite(isoDate(c.date)) &&
    !isPolicy(c) && c.title && c.fact && c.source?.url && /^https?:\/\//.test(c.source.url)
  ):[];
  const byYear=new Map();
  events.forEach((e,idx)=>{
    if(!relevant(e))return;
    const y=yearOf(e);
    if(!byYear.has(y))byYear.set(y,[]);
    byYear.get(y).push({e,idx});
  });
  const validYears=[...byYear].filter(([year,slots])=>{
    if(slots.length===4)return true;
    report.skipped.push({year,reason:`기사 수가 ${slots.length}개여서 안전을 위해 보존`});
    return false;
  });
  report.before=countPolicyByYear(events,allowed);
  report.originalRateTotal=report.before.reduce((sum,r)=>sum+r.rate,0);
  const target=Number.isInteger(targetTotalRates)&&targetTotalRates>=0
    ?targetTotalRates:null;
  const usedReplacementIds=new Set(events.map(x=>x._replacementId).filter(Boolean));
  const changedIds=new Set();
  function countRate() {return events.filter(e=>relevant(e)&&isPolicy(e)).length;}
  function findReplacement(year,slots,slot) {
    const origDate=isoDate(slot.e.date);
    if(!Number.isFinite(origDate))return null;
    const pos=slots.findIndex(x=>x.idx===slot.idx);
    const prev=pos>0?slots[pos-1].e:null;
    const next=pos+1<slots.length?slots[pos+1].e:null;
    const prevDate=prev?isoDate(prev.date):NaN;
    const nextDate=next?isoDate(next.date):NaN;
    const others=slots.filter(x=>x.idx!==slot.idx).map(x=>x.e);
    const topics=new Set(others.filter(e=>!isPolicy(e))
      .map(e=>e._newsTopic||topicFromTitle(e.title)).filter(Boolean));
    return records.filter(c=>{
      const cd=isoDate(c.date);
      if(Number(c.year)!==year||cd>origDate||origDate-cd>MAX_LOOKBACK_DAYS*DAY)return false;
      if(Number.isFinite(prevDate)&&cd<prevDate)return false;
      if(Number.isFinite(nextDate)&&cd>nextDate)return false;
      if(usedReplacementIds.has(c.id))return false;
      if(others.some(e=>e._replacementId===c.id || 
        (e.source?.url&&e.source.url===c.source?.url) ||
        normalizeTitle(e.title)===normalizeTitle(c.title)))return false;
      if(others.some(e=>FINGERPRINT[c.id]?.test(String(e.title||""))))return false;
      return normalizeTitle(c.title)!==normalizeTitle(slot.e.title);
    }).sort((a,b)=>{
      const dupA=topics.has(a.topic)?1:0,dupB=topics.has(b.topic)?1:0;
      return dupA-dupB || Math.abs(origDate-isoDate(a.date))-Math.abs(origDate-isoDate(b.date)) ||
        a.id.localeCompare(b.id);
    })[0]||null;
  }
  function chooseSlot(strictAnnual) {
    const choices=[];
    for(const [year,slots] of validYears) {
      const rateSlots=slots.filter(x=>isPolicy(x.e));
      if(strictAnnual && rateSlots.length<=maxRatesPerYear)continue;
      for(const slot of rateSlots){
        if(protectedSet.has(String(slot.e.id))||changedIds.has(String(slot.e.id)))continue;
        const alternative=findReplacement(year,slots,slot);
        if(!alternative)continue;
        choices.push({year,slots,slot,alternative,rateCount:rateSlots.length});
      }
    }
    choices.sort((a,b)=>{
      // 연도별 중복부터 줄이고, 이후에는 상대적으로 중요도가 낮은 금리 뉴스부터 정리.
      return b.rateCount-a.rateCount || importance(a.slot.e)-importance(b.slot.e) ||
        a.year-b.year || a.slot.idx-b.slot.idx;
    });
    return choices[0]||null;
  }
  function replaceOne(choice) {
    const {year,slot,alternative:c}=choice;
    const oldTitle=slot.e.title;
    for(const key of ["date","title","fact","discussion_question","source",
                      "easy_summary","easy_term","easy_question","analysis"]) {
      if(Object.hasOwn(c,key))slot.e[key]=c[key];
    }
    slot.e.source_ko=null;
    slot.e.source_ko_search=null;
    slot.e._replacementId=c.id;
    slot.e._newsTopic=c.topic;
    slot.e._editorialConcept=c.concept;
    slot.e._editorialImageTopic=c.topic==="보건"?"health":
      c.topic==="물가"?(/둔화|낮아|완화/.test(c.title)?"inflation-cool":"inflation-rise"):
      c.topic==="기술·AI"?"tech":c.topic==="에너지"?"energy":
      c.topic==="금융·은행"?"banks":
      c.topic==="무역·공급망"?"trade":
      c.topic==="지정학"?"geopolitics":"market";
    changedIds.add(String(slot.e.id));
    usedReplacementIds.add(c.id);
    report.changed.push({year,id:slot.e.id,originalTitle:oldTitle,
      title:c.title,date:c.date,topic:c.topic,source:c.source.url});
  }
  // 1차: 연도별 2개 이상의 금리 기사 중 안전하게 대체 가능한 기사부터 교체.
  // 전체 목표를 이미 달성했으면 더 줄이지 않음.
  let safetyCounter=events.length+1;
  while(safetyCounter-->0 && (target===null||countRate()>target)) {
    const choice=chooseSlot(true);
    if(!choice)break;
    replaceOne(choice);
  }
  // 2차: 남은 전체 금리 뉴스 수를 목표(일반 6개, 비기너 3개)까지 낮춤.
  // 주요 기사 및 퀴즈 뉴스는 보호하고, 대체 뉴스가 없으면 원본 유지.
  safetyCounter=events.length+1;
  while(target!==null&&countRate()>target&&safetyCounter-->0) {
    const choice=chooseSlot(false);
    if(!choice)break;
    replaceOne(choice);
  }
  report.after=countPolicyByYear(events,allowed);
  report.finalRateTotal=report.after.reduce((sum,r)=>sum+r.rate,0);
  report.targetReached=target===null || report.finalRateTotal<=target;
  for(const [year,slots] of byYear) {
    const left=slots.filter(x=>isPolicy(x.e));
    const protectedRate=left.filter(x=>protectedSet.has(String(x.e.id)));
    const remainingOther=left.filter(x=>!protectedSet.has(String(x.e.id)));
    if(protectedRate.length)report.skipped.push({
      year,reason:`퀴즈 연결 기사 등 ${protectedRate.length}개는 변경하지 않음`});
    if(remainingOther.length && (left.length>maxRatesPerYear||!report.targetReached))
      report.skipped.push({
        year,reason:`교체 후보 부족 또는 공개 시점 불일치로 금리 ${remainingOther.length}개 유지`});
  }
  if(!report.targetReached)report.reason=
    `전체 목표 ${target}개에 미달: 안전하게 교체할 수 없는 뉴스 ${report.finalRateTotal}개 유지`;
  // 사전 검사용: 보고서를 계산한 뒤 원본의 모든 필드를 원상복구.
  if(dryRun)events.forEach((e,i)=>{
    for(const key of Object.keys(e))if(!(key in original[i]))delete e[key];
    Object.assign(e,original[i]);
  });
  return report;
}
export function applyNewsRatePatch(newsSource,options={}) {
  if(process.env.DISABLE_RATE_NEWS_PATCH==="1"){
    console.info("[금리 뉴스 조정] 환경변수로 비활성화됨");
    return {changed:[],skipped:[],reason:"disabled"};
  }
  let candidates;
  try {
    candidates=JSON.parse(fs.readFileSync(CANDIDATE_URL,"utf8")).candidates;
    if(!Array.isArray(candidates))throw Error("candidates 배열 없음");
  } catch(err) {
    console.warn("[금리 뉴스 조정] 대체 기사 파일 없음; 원본 유지:",err.message);
    return {changed:[],skipped:[],reason:"missing candidates"};
  }
  const report=rebalanceRateNews(newsSource,{...options,candidates});
  console.info(`[금리 뉴스 조정 3.5.14] 변경 전 ${report.originalRateTotal}건 → 변경 후 ${report.finalRateTotal}건`+
    (report.targetTotalRates!==null?` / 목표 ${report.targetTotalRates}건`:""));
  for(const row of report.before){
    const after=report.after.find(x=>x.year===row.year);
    console.info(`[금리 뉴스 조정] ${row.year}년 ${row.rate} → ${after?.rate??row.rate}건 (전체 기사 ${row.total}건)`);
  }
  for(const x of report.changed)
    console.info(`[금리 뉴스 교체] ${x.year} ${x.id}: ${x.originalTitle} → ${x.title}`);
  if(!report.targetReached)console.warn("[금리 뉴스 조정] 목표 미달:",report.reason);
  return report;
}
