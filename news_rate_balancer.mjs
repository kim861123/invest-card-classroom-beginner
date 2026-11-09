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
  const {protectedIds=[],allowedYears=null, maxRatesPerYear=1, candidates=[],dryRun=false}=options;
  const events=newsSource?.events;
  const report={version:"3.5.9",changed:[],skipped:[],before:[],after:[],reason:""};
  if(!Array.isArray(events)) {report.reason="events 배열이 없어 적용하지 않음";return report;}
  const allowed=Array.isArray(allowedYears)?allowedYears:null;
  const protectedSet=new Set(protectedIds.map(String));
  const backups=events.map(e=>({...e}));
  const records=Array.isArray(candidates)?candidates:[];
  report.before=countPolicyByYear(events,allowed);
  const byYear=new Map();
  events.forEach((e,idx)=>{
    const y=yearOf(e);
    if(!Number.isInteger(y)|| (allowed&&!allowed.includes(y)))return;
    if(!byYear.has(y))byYear.set(y,[]);
    byYear.get(y).push({e,idx});
  });
  for(const [year,slots] of byYear) {
    if(slots.length!==4) {
      report.skipped.push({year,reason:`기사 수 ${slots.length}건: 예상 4건이 아니므로 보존`});
      continue;
    }
    slots.sort((a,b)=>a.idx-b.idx);
    const rateSlots=slots.filter(x=>isPolicy(x.e));
    if(rateSlots.length<=maxRatesPerYear)continue;
    const protectedRate=rateSlots.filter(x=>protectedSet.has(String(x.e.id)));
    const remainingAllowed=Math.max(0,maxRatesPerYear-protectedRate.length);
    const keepUnprotected=rateSlots.filter(x=>!protectedSet.has(String(x.e.id)))
      .sort((a,b)=>importance(b.e)-importance(a.e) || a.idx-b.idx).slice(0,remainingAllowed);
    const retained=new Set([...protectedRate,...keepUnprotected].map(x=>x.idx));
    const replaceable=rateSlots.filter(x=>!retained.has(x.idx)).sort((a,b)=>a.idx-b.idx);
    for(const slot of replaceable) {
      const date=isoDate(slot.e.date);
      if(!Number.isFinite(date)) {
        report.skipped.push({year,id:slot.e.id,reason:"기존 기사 날짜가 정확한 YYYY-MM-DD 형식이 아님"});
        continue;
      }
      const slotPosition=slots.findIndex(x=>x.idx===slot.idx);
      const prev=slotPosition>0?slots[slotPosition-1].e:null;
      const prevDate=prev?isoDate(prev.date):NaN;
      const next=slotPosition<slots.length-1?slots[slotPosition+1].e:null;
      const nextDate=next?isoDate(next.date):NaN;
      const existingNews=slots.filter(x=>x.idx!==slot.idx).map(x=>x.e);
      const priorTopics=new Set(existingNews.filter(e=>!isPolicy(e)).map(e=>e._newsTopic||topicFromTitle(e.title)).filter(Boolean));
      const optionsFor=records.filter(c=>{
        const when=isoDate(c.date);
        if(Number(c.year)!==year || !Number.isFinite(when) || when>date || date-when>MAX_LOOKBACK_DAYS*DAY)return false;
        if(Number.isFinite(prevDate)&&when<prevDate)return false;
        if(Number.isFinite(nextDate)&&when>nextDate)return false;
        if(existingNews.some(e=>e._replacementId===c.id || (e.source?.url&&e.source.url===c.source?.url)))return false;
        if(existingNews.some(e=>FINGERPRINT[c.id]?.test(String(e.title||""))))return false;
        if(normalizeTitle(c.title)===normalizeTitle(slot.e.title))return false;
        return true;
      }).sort((a,b)=>{
        const categoryA=priorTopics.has(a.topic)?1:0,categoryB=priorTopics.has(b.topic)?1:0;
        return categoryA-categoryB || Math.abs(date-isoDate(a.date))-Math.abs(date-isoDate(b.date)) || a.id.localeCompare(b.id);
      });
      const choice=optionsFor[0];
      if(!choice) {
        report.skipped.push({year,id:slot.e.id,reason:"시점·출처·중복 검사에 맞는 대체 사건이 없음"});
        continue;
      }
      const originalTitle=slot.e.title;
      const fields=["date","title","fact","discussion_question","source","easy_summary","easy_term","easy_question","analysis"];
      for(const key of fields)slot.e[key]=choice[key];
      slot.e.source_ko=null;slot.e.source_ko_search=null;
      slot.e._replacementId=choice.id;
      slot.e._newsTopic=choice.topic;
      slot.e._editorialConcept=choice.concept;
      slot.e._editorialImageTopic= choice.topic==="보건"?"health":
        choice.topic==="물가"?(/둔화|낮아|완화/.test(choice.title)?"inflation-cool":"inflation-rise"):
        choice.topic==="기술·AI"?"tech":
        choice.topic==="에너지"?"energy":
        choice.topic==="금융·은행"?"banks":
        choice.topic==="무역·공급망"?"trade":
        choice.topic==="지정학"?"geopolitics":"market";
      // event ID / year는 원본 유지: 1·2차 뉴스, 퀴즈 인덱스, 산업 가격 단계 보호
      report.changed.push({year,id:slot.e.id,originalTitle,title:choice.title,date:choice.date,
        source:choice.source?.url,topic:choice.topic});
    }
  }
  report.after=countPolicyByYear(events,allowed);
  if(dryRun)events.forEach((e,i)=>{
    for(const key of Object.keys(e))if(!(key in backups[i]))delete e[key];
    Object.assign(e,backups[i]);
  });
  return report;
}
export function applyNewsRatePatch(newsSource,options={}) {
  if(process.env.DISABLE_RATE_NEWS_PATCH==="1") {
    console.info("[뉴스 균형] 환경변수로 비활성화됨");
    return {changed:[],skipped:[],reason:"disabled"};
  }
  let candidates;
  try{
    candidates=JSON.parse(fs.readFileSync(CANDIDATE_URL,"utf8")).candidates;
    if(!Array.isArray(candidates))throw Error("candidates 배열 없음");
  } catch(err) {
    console.warn("[뉴스 균형] 후보 자료 파일을 불러올 수 없어 기존 기사 유지:",err.message);
    return {changed:[],skipped:[],reason:"missing candidates"};
  }
  const report=rebalanceRateNews(newsSource,{...options,candidates});
  console.info(`[뉴스 균형 V3.5.9] 교체 ${report.changed.length}건, 미교체 ${report.skipped.length}건`);
  for(const row of report.before) {
    const aft=report.after.find(x=>x.year===row.year);
    console.info(`[뉴스 균형] ${row.year}: 금리·통화정책 ${row.rate}건 → ${aft?.rate??row.rate}건 / 총 ${row.total}건`);
  }
  for(const row of report.changed)console.info(`[뉴스 균형] ${row.id}: ${row.originalTitle} → ${row.title}`);
  return report;
}
