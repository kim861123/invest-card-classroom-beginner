import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeStorage } from "./storage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const QRCode = require("./vendor/QRCode");
const QRErrorCorrectLevel = require("./vendor/QRCode/QRErrorCorrectLevel");
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
const PASSWORD = process.env.TEACHER_PASSWORD || "";
if (PASSWORD.length < 12 || PASSWORD.includes("여기에_") || PASSWORD === "change-me-please") {
  console.error("설치 오류: .env 파일에 안전한 TEACHER_PASSWORD(12자 이상)를 설정하세요.");
  process.exit(1);
}
// Render provides an HTTPS origin automatically; an explicit custom domain takes precedence.
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
if (PUBLIC_BASE_URL && !/^https?:\/\//i.test(PUBLIC_BASE_URL)) {
  console.error("PUBLIC_BASE_URL은 http(s) 주소여야 합니다.");
  process.exit(1);
}
function joinUrl(req) {
  const base = PUBLIC_BASE_URL ||
    `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
  return base + "/join";
}
const PORT = Number(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "runtime");
const storage = makeStorage({backend: process.env.STORAGE_BACKEND || "local",directory:DATA_DIR});
const newsSource = JSON.parse(fs.readFileSync(path.join(__dirname, "data/historical_news_2019_2026.json"), "utf8"));
const lessonConcepts = JSON.parse(fs.readFileSync(path.join(__dirname,"data/news_concepts_2019_2026.json"),"utf8"));
// EASY V2 lesson content is server-only: quiz answer and reveal are never sent before allowed.
const beginnerLessons = JSON.parse(fs.readFileSync(path.join(__dirname, "data/beginner_lessons.json"), "utf8")).lessons;
const lessonMap = new Map(beginnerLessons.map(x=>[`${x.year}:${x.stage}`,x]));
function currentLesson() { return lessonMap.get(`${currentYear()}:${state.stageIndex+1}`) || null; }
function lessonKey() { return `${currentYear()}-${state.stageIndex+1}`; }
const actualSource = JSON.parse(fs.readFileSync(path.join(__dirname, "data/sector_returns_2019_2026.json"), "utf8"));
const stagesSource = JSON.parse(fs.readFileSync(path.join(__dirname, "data/sector_game_stage_returns_2019_2026.json"), "utf8")).records;
// 초급 모드는 경제 흐름이 뚜렷한 4개 연도만 사용합니다.
const YEARS = [2020, 2021, 2022, 2023];
const sectors = actualSource.filter(r => r.year === YEARS[0]).map(r => ({
  id: r.sector_id, name: r.sector_name_ko, ticker: r.ticker
})).sort((a,b) => a.id - b.id);
const actualMap = new Map(actualSource.map(r => [`${r.year}:${r.sector_id}`, r]));
const stageMap = new Map(stagesSource.map(r => [`${r.year}:${r.sector_id}`, r]));
const sessionTTL = 1000 * 60 * 60 * 12;
const authVersion = crypto.createHash("sha256").update(PASSWORD).digest("hex").slice(0,24);
const sockets = new Set();
const attempts = new Map();
// 11개 산업 × 10장 = 110장/팀, 초기 평가는 모든 산업 10,000원
const START_CARDS_PER_SECTOR = 10;
const TOTAL_START_CARDS = sectors.length * START_CARDS_PER_SECTOR;
const BASE_PRICE = 10000;
const INITIAL_ASSET = TOTAL_START_CARDS * BASE_PRICE;
const LEGACY_INITIAL_ASSET = sectors.length * 2 * BASE_PRICE;
const DRAW_MODES = Object.freeze(["even"]);
function evenHoldings() {
  return Object.fromEntries(sectors.map(sector=>[sector.id, START_CARDS_PER_SECTOR]));
}
function randomHoldings() {
  // 산업별 최소 1장을 먼저 배부한 뒤 나머지 99장을 균등 확률로 독립 추첨합니다.
  // 임의 생성은 서버에서만 하며, 추첨 결과는 팀에 영구 저장되어 다시 뽑을 수 없습니다.
  const counts=Array(sectors.length).fill(1);
  for(let i=sectors.length;i<TOTAL_START_CARDS;i++)counts[crypto.randomInt(0,sectors.length)]++;
  return Object.fromEntries(sectors.map((sector,i)=>[sector.id,counts[i]]));
}
function holdingCount(team) {
  return Object.values(team.holdings||{}).reduce((sum,num)=>sum+Number(num||0),0);
}
function initialAsset(team) {
  // 기존 V3.2 진행 중인 팀(22장)은 업데이트 이후에도 수익률 기준을 유지합니다.
  return Number(team.initialAsset)|| (team.drawMode ? INITIAL_ASSET : LEGACY_INITIAL_ASSET);
}

function randomPin() { return String(crypto.randomInt(100000, 1000000)); }
function newState() {
  return {
    version: 1, phase: "lobby", pausedFrom: null, secondsRemaining: null,
    yearIndex: 0, stageIndex: 0, deadline: null, pin: randomPin(),
    config: { newsSeconds: 75, tradeSeconds: 90 },
    prices: Object.fromEntries(sectors.map(x => [x.id, BASE_PRICE])),
    participants: [], listings: [], completedTrades: [], priceHistory: [],
    lastMoves: [], results: [], stageStartSnapshots: null, sessions: {}, createdAt: new Date().toISOString()
  };
}
let state;
let savedState;
let serialized = Promise.resolve();
function serial(work) {
  const next = serialized.then(async () => {
    try { return await work(); }
    catch (e) {
      // 실패한 변경은 직전 DB에 정상 기록된 상태로 되돌립니다.
      state = structuredClone(savedState);
      throw e;
    }
  });
  serialized = next.catch(() => {});
  return next;
}
function push() { 
  for (const res of sockets) {
    try { res.write(`event: update\ndata: ${Date.now()}\n\n`); }
    catch { sockets.delete(res); }
  }
}
async function commit() {
  const expected = state.version;
  state.version++;
  try {
    await storage.persist(state, expected);
    savedState = structuredClone(state);
    push();
  } catch (e) {
    state = structuredClone(savedState);
    if (e.code === "CONCURRENT_UPDATE") {
      try { state = await storage.reload(); savedState = structuredClone(state); }
      catch (reloadError) { console.error("상태 재동기화 실패:", reloadError); }
    }
    throw e;
  }
}
function hash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function cleanSessions() {
  const now = Date.now();
  let changed = false;
  for (const [k,v] of Object.entries(state.sessions)) {
    if (v.expiry < now || (v.role === "teacher" && v.authVersion !== authVersion) ||
        (v.role === "team" && !state.participants.some(p => p.id === v.teamId))) {
      delete state.sessions[k]; changed = true;
    }
  }
  if (changed) await commit();
}
function sessionFor(req) {
  const raw = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("invest_session="));
  const token = raw?.slice("invest_session=".length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sess = state.sessions[hash(token)];
  return sess?.expiry > Date.now() && (sess.role!=="teacher" || sess.authVersion===authVersion) ? sess : null;
}
async function setSession(res, role, teamId) {
  const token = crypto.randomBytes(32).toString("hex");
  state.sessions[hash(token)] = { role, teamId: teamId || null, expiry: Date.now() + sessionTTL,
    ...(role==="teacher"?{authVersion}:{}) };
  const secure = process.env.SECURE_COOKIES === "true" ||
    PUBLIC_BASE_URL.startsWith("https://");
  await commit();
  res.setHeader("Set-Cookie", `invest_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTTL/1000}${secure ? "; Secure" : ""}`);
}
async function clearSession(req, res) {
  const raw = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("invest_session="));
  if (raw) delete state.sessions[hash(raw.slice("invest_session=".length))];
  await commit();
  res.setHeader("Set-Cookie", "invest_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}
function send(res, status, obj, extra={}) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extra});
  res.end(JSON.stringify(obj));
}
function error(res, code, message) { return send(res, code, {error:message}); }
function bad(condition, message) { if (condition) throw Object.assign(new Error(message), {status:400}); }
function restricted(condition, message="접근 권한이 없습니다.") {
  if (condition) throw Object.assign(new Error(message), {status:403});
}
function limit(req, key, maximum=9) {
  const ip = String(req.socket.remoteAddress || "local"); // do not trust X-Forwarded-For
  const k = `${key}:${ip}`;
  const now=Date.now(), old=attempts.get(k) || {count:0,reset:now+600000};
  const value = old.reset < now ? {count:1,reset:now+600000} : {count:old.count+1,reset:old.reset};
  attempts.set(k,value);
  if (value.count > maximum) throw Object.assign(new Error("시도 횟수가 많습니다. 잠시 후 다시 시도하세요."),{status:429});
}
function safeStr(v,max) { return String(v || "").trim().replace(/[<>\u0000-\u001f]/g,"").slice(0,max); }
function nameKey(value) {
  // NFKC normalizes mixed fullwidth/halfwidth characters; collapse whitespace, case fold.
  return String(value || "").normalize("NFKC").replace(/\s+/gu,"").toLocaleLowerCase("ko-KR");
}
function isTakenName(name, exceptId=null) {
  return state.participants.some(p => p.id!==exceptId && nameKey(p.name) === nameKey(name));
}
function currentYear() { return YEARS[state.yearIndex] || YEARS[0]; }
function currentStageReturn(id) {
  const row=stageMap.get(`${currentYear()}:${id}`);
  return state.stageIndex === 0 ? row?.news_1_and_2_model_pct : row?.news_3_and_4_model_pct;
}
function currentlyVisibleNews(role) {
  if (state.phase==="lobby" && role!=="teacher") return [];
  if (state.phase==="finished") return newsSource.events.filter(ev => YEARS.includes(ev.year)).map(ev => eventView(ev,role==="teacher"));
  const nowYear = currentYear();
  const upto = state.stageIndex === 0 ? 2 : 4;
  const allowed = newsSource.events.filter(ev => YEARS.includes(ev.year) && (ev.year < nowYear ||
    (ev.year === nowYear && Number(ev.id.split("-").at(-1)) <= upto)));
  // 학생에게는 발표 이후에도 강사 전용 해설을 절대 전달하지 않습니다.
  return allowed.map(ev => eventView(ev,role==="teacher"));
}
function eventView(ev, revealAnalysis) {
  return { id:ev.id,year:ev.year,date:ev.date,title:ev.title,fact:ev.fact,
    discussion_question:ev.discussion_question,source:ev.source,source_ko:ev.source_ko||null,source_ko_search:ev.source_ko_search||null,
    learning_concept:lessonConcepts[ev.id]||null,
    easy_summary: ev.easy_summary || "", easy_term: ev.easy_term || "", easy_question: ev.easy_question || "",
    ...(revealAnalysis ? {analysis:ev.analysis} : {}) };
}
function valuation(p) {
  return Object.entries(p.holdings).reduce((sum,[sector,qty])=>sum+Number(qty)*(state.prices[sector]||0),0);
}
function scores() {
  return state.participants.map(p=>({
    id:p.id,name:p.name,total:valuation(p),
    returnPct:(valuation(p)/initialAsset(p)-1)*100
  })) .sort((a,b)=>b.returnPct-a.returnPct || b.total-a.total || a.name.localeCompare(b.name,"ko"))
    .map((x,i)=>({...x,rank:i+1}));
}

// During news reading / card exchange, rankings and displayed team returns must
// reflect the LAST ANNOUNCED market price snapshot, not interim card swaps.
// Trades still mutate holdings in the server immediately for quantity validation.
function announcedScores() {
  const current = scores();
  if (state.phase==="lobby" ||
      (["news","trade","paused"].includes(state.phase) && !state.results.length)) {
    return current.map(row=>({...row,
      total:initialAsset(state.participants.find(p=>p.id===row.id)),returnPct:0}))
      .sort((a,b)=>a.name.localeCompare(b.name,"ko")).map((row,i)=>({...row,rank:i+1}));
  }
  if (!["news","trade","paused"].includes(state.phase)) return current;
  const last = new Map((state.results.at(-1)?.scores||[]).map(row=>[row.id,row]));
  return current.map(row=>{
    const old=last.get(row.id);
    return old ? {...row,total:old.total,returnPct:old.returnPct} : {...row,total:initialAsset(state.participants.find(p=>p.id===row.id)),returnPct:0};
  }).sort((a,b)=>b.returnPct-a.returnPct||b.total-a.total||a.name.localeCompare(b.name,"ko"))
    .map((row,i)=>({...row,rank:i+1}));
}

// 결산 시에만 반환하는 '교환하지 않았다면' 비교: 최초 카드 구성을 그대로 보유한 가상 포트폴리오.
// 신뢰할 수 있는 최초 스냅샷이 없는 기존 진행 기록은 임의 추정하지 않습니다.
function finalTradeReport(team) {
  if (state.phase!=="finished") return null;
  const finalTotal=valuation(team),base=initialAsset(team);
  const ownedTrades=state.completedTrades.filter(t=>
    t.sellerId===team.id||t.buyerId===team.id);
  const hasAnyLegacyTrades=state.completedTrades.some(t=>
    !t.sellerId&&!t.buyerId&&(t.sellerName===team.name||t.buyerName===team.name));
  // 이전 랜덤 추첨 데이터의 최초 카드는 신뢰할 수 없어 과거 수익률을 임의 추정하지 않습니다.
  const start=(team.drawMode==="random"&&!team.initialHoldingsCapturedAtStart)
    ?null:(team.initialHoldings||(!state.completedTrades.length?team.holdings:null));
  if (!start) return {ready:false,reason:"기존 게임의 최초 랜덤 카드 구성은 검증할 수 없습니다. 새 게임부터 최종 교환 성과를 정확히 비교합니다."};
  const untouchedValue=Object.entries(start).reduce((sum,[id,qty])=>
    sum+Number(qty||0)*Number(state.prices[id]||0),0);
  const difference=finalTotal-untouchedValue;
  const contributions=ownedTrades.map(t=>{
    const received=t.sellerId===team.id?
      {id:t.wantId,qty:t.wantQty}:{id:t.offerId,qty:t.offerQty};
    const given=t.sellerId===team.id?
      {id:t.offerId,qty:t.offerQty}:{id:t.wantId,qty:t.wantQty};
    const amount=received.qty*Number(state.prices[received.id]||0)-
      given.qty*Number(state.prices[given.id]||0);
    return {id:t.id,year:t.year,stage:t.stage,at:t.at,
      givenId:given.id,givenQty:given.qty,
      receivedId:received.id,receivedQty:received.qty,
      difference:amount};
  });
  // 처음 카드가 기록된 채 거래 한 건이라도 거래자 ID가 없는 과거 기록이면
  // 상세 기여도를 완전하게 제시할 수 없으므로 총 차이만 제공.
  return {
    ready:true, initialAsset:base,finalTotal,untouchedValue,
    actualReturnPct:(finalTotal/base-1)*100,
    untouchedReturnPct:(untouchedValue/base-1)*100,
    difference,differencePctPoint:difference/base*100,
    executedCount:contributions.length,
    contributions:hasAnyLegacyTrades?[]:contributions,
    hasLegacyTrades:hasAnyLegacyTrades
  };
}
// 단계 시작 당시의 카드와 가격을 기억해 실제 교환 효과를 비교합니다.
// 기준 가격은 뉴스 단계 시작 시점; 두 포트폴리오는 동일한 발표 가격으로 평가합니다.
function captureStageBaseline() {
  state.stageStartSnapshots={
    year:currentYear(),stageIndex:state.stageIndex,
    prices:structuredClone(state.prices),
    holdings:Object.fromEntries(state.participants.map(p=>[p.id,structuredClone(p.holdings)]))
  };
}
function valueHoldings(holdings,prices) {
  return Object.entries(holdings).reduce((sum,[id,qty])=>sum+Number(qty||0)*Number(prices[id]||0),0);
}
function stageTradeReports() {
  const snapshot=state.stageStartSnapshots;
  if(!snapshot||snapshot.year!==currentYear()||snapshot.stageIndex!==state.stageIndex) {
    return state.participants.map(p=>({teamId:p.id,teamName:p.name,
      report:{ready:false,reason:"이 뉴스 단계의 시작 카드 기록이 없습니다. 다음 뉴스부터 비교가 가능합니다."}}));
  }
  return state.participants.map(team=>{
    const holdings=snapshot.holdings[team.id];
    if(!holdings)return {teamId:team.id,teamName:team.name,
      report:{ready:false,reason:"팀의 단계 시작 카드를 확인할 수 없습니다."}};
    const initialValue=valueHoldings(holdings,snapshot.prices);
    const untouchedValue=valueHoldings(holdings,state.prices);
    const actualValue=valuation(team);
    const difference=actualValue-untouchedValue;
    const ownedTrades=state.completedTrades.filter(t=>t.year===currentYear()&&
      t.stage===state.stageIndex+1&&(t.sellerId===team.id||t.buyerId===team.id));
    return {teamId:team.id,teamName:team.name,report:{
      ready:true,year:currentYear(),stage:state.stageIndex+1,
      initialValue,untouchedValue,actualValue,difference,
      untouchedReturnPct:initialValue?(untouchedValue/initialValue-1)*100:0,
      actualReturnPct:initialValue?(actualValue/initialValue-1)*100:0,
      differencePctPoint:initialValue?difference/initialValue*100:0,
      executedCount:ownedTrades.length
    }};
  });
}
function publicResult(result) {
  if(!result)return null;
  const {year,stageIndex,changes,at,scores,endingYear,returnKind}=result;
  return {year,stageIndex,changes,at,scores,endingYear,returnKind};
}
// 각 퀴즈가 참조하는 기사는 현재 뉴스 단계에서 실제 공개된 기사여야 합니다.
function quizSourceNews(lesson) {
  const event=newsSource.events.find(ev=>ev.id===lesson.quiz.newsId);
  const articleNumber=Number(event?.id.split("-").at(-1));
  if(!event || event.year!==lesson.year ||
      !((lesson.stage===1 && articleNumber>=1 && articleNumber<=2) ||
        (lesson.stage===2 && articleNumber>=3 && articleNumber<=4))) {
    throw new Error(`초급 퀴즈와 뉴스 연결 오류: ${lesson.year}-${lesson.stage}`);
  }
  return {id:event.id,title:event.title,date:event.date,
    summary:event.easy_summary||event.fact};
}
for(const lesson of beginnerLessons)quizSourceNews(lesson);

function quizAnswerView(lesson) {
  const correctOption=lesson.quiz.correct;
  return {correctOption,
    correctLabel:lesson.quiz.options.find(x=>x.value===correctOption)?.label||"",
    explanation:lesson.quiz.explanation};
}
function lessonView(role,team) {
  if (state.phase==="lobby") return null;
  const lesson=currentLesson();
  if(!lesson) return null;
  const showReveal=["result","finished"].includes(state.phase) || (state.phase==="paused" && state.pausedFrom==="result");
  return {
    year:lesson.year,stage:lesson.stage,topic:lesson.topic,
    coach:lesson.coach,
    quiz:{question:lesson.quiz.question,options:lesson.quiz.options,
      sourceNews:quizSourceNews(lesson),
      // 미응답자도 가격 발표 시 정답을 볼 수 있지만, 발표 이전에는 비공개입니다.
      ...(showReveal||role==="teacher"?{solution:quizAnswerView(lesson)}:{})},
    ...(showReveal||role==="teacher"?{reveal:lesson.reveal}:{}),
    ...(team?{submission:team.quizAnswers?.[lessonKey()]||null}:{})
  };
}
// 완료된 뉴스 단계만 제공하여 미응답 학생도 나중에 정답을 복습할 수 있습니다.
function quizReviewHistory(team) {
  return state.results.map(result=>{
    const year=result.year,stage=result.stageIndex+1;
    const lesson=lessonMap.get(`${year}:${stage}`);
    if(!lesson)return null;
    const response=team.quizAnswers?.[`${year}-${stage}`]||null;
    return {year,stage,topic:lesson.topic,
      question:lesson.quiz.question,sourceNews:quizSourceNews(lesson),
      solution:quizAnswerView(lesson),
      answered:Boolean(response),correct:response?.correct??null,
      selectedLabel:response?lesson.quiz.options.find(x=>x.value===response.answer)?.label||"":""};
  }).filter(Boolean).reverse();
}
function quizStats(){
  const key=lessonKey();
  return {total:state.participants.length,
    answered:state.participants.filter(p=>Boolean(p.quizAnswers?.[key])).length,
    correct:state.participants.filter(p=>p.quizAnswers?.[key]?.correct).length};
}
function view(req) {
  const s=sessionFor(req), role = s?.role || "guest";
  const team = role==="team" ? state.participants.find(p=>p.id===s.teamId) : null;
  const currentListings = state.listings.filter(l=>l.status==="open" && 
    l.year===currentYear() && l.stageIndex===state.stageIndex);
  const latestResult=state.results.at(-1);
  const canTrade=state.phase==="trade";
  return {
    version:state.version, role:role==="team" && !team ? "guest" : role,
    team:team ? {id:team.id,name:team.name,members:team.members,drawMode:team.drawMode||null,
      drawComplete: Boolean(team.drawMode)||state.phase!=="lobby",
      holdings:team.holdings,cash:0,cardCount:holdingCount(team),initialAsset:initialAsset(team),
      total:announcedScores().find(row=>row.id===team.id)?.total ?? valuation(team),returnPct:announcedScores().find(row=>row.id===team.id)?.returnPct ?? (valuation(team)/initialAsset(team)-1)*100,
      practiceDone:Boolean(team.practiceDone),
      practiceReceipt:team.practiceReceipt||null} : null,
    room: {phase:state.phase,pausedFrom:state.pausedFrom,
      year:currentYear(),stage:state.stageIndex+1,round:state.yearIndex+1,totalRounds:YEARS.length,
      deadline:state.deadline,secondsRemaining:state.secondsRemaining,
      teamCount:state.participants.length,undrawnTeams:state.phase==="lobby"?state.participants.filter(p=>!p.drawMode).length:0,config:state.config,
      ...(role==="teacher"?{pin:state.pin,
        joinUrl:joinUrl(req)}:{}),canTrade},
    sectors:sectors.map(x=>({...x,price:state.prices[x.id]})),
    ...(team?{tradeAvailability:Object.fromEntries(sectors.map(x=>[x.id,{
      mineAvailable:availableFor(team,x.id),
      maxOtherAvailable:maxCounterpartyAvailable(team.id,x.id)
    }]))}:{}),
    scores:announcedScores(), news:currentlyVisibleNews(role),
    ...(team?{myPrediction:team.predictions?.[classroomPredictionKey()]||null,
     predictionHistory:Object.entries(team.predictions||{}).map(([key,entry])=>({key,...entry}))}:{}),
    ...(role==="teacher"?{predictionBoard:classroomPredictions()}:{}),
    ...(role!=="guest"?{beginnerLesson:lessonView(role,team)}:{}),
    ...(team?{quizReviews:quizReviewHistory(team)}:{}),
    ...(team && state.phase==="finished"?{tradeReport:finalTradeReport(team)}:{}),
    ...(team?{
      stageTradeHistory:state.results.map(result=>({
        year:result.year,stage:result.stageIndex+1,at:result.at,
        report:result.teamTradeReports?.find(x=>x.teamId===team.id)?.report ||
          {ready:false,reason:"해당 단계의 교환 분석 기록이 없습니다."}
      })),
      ...(state.phase==="result"?{stageTradeReport:
        latestResult?.teamTradeReports?.find(x=>x.teamId===team.id)?.report ||
          {ready:false,reason:"이번 단계의 교환 분석을 확인할 수 없습니다."}}:{})
    }:{}),
    listings:role!=="guest"?currentListings.map(l=>({
      id:l.id,sellerId:l.sellerId,sellerName:l.sellerName,
      offerId:l.offerId,offerQty:l.offerQty,wantId:l.wantId,wantQty:l.wantQty,createdAt:l.createdAt
    })):[],
    lastResult:latestResult && (state.phase === "result" || state.phase === "finished") ? publicResult(latestResult) : null,
    ...(role==="teacher"?{
      quizStats:quizStats(),
      practiceStats:{total:state.participants.length,completed:state.participants.filter(p=>p.practiceDone).length},
      resultHistory:state.results.slice().reverse(),
      lastResetAt:state.lastResetAt||null,
      ...(state.phase==="result"?{stageTeamReports:latestResult?.teamTradeReports||[]}:{}),
       ...(state.phase==="finished"?{teamTradeReports:state.participants.map(p=>({
        teamId:p.id,teamName:p.name,report:finalTradeReport(p)
      }))}:{}),
      teacherBrief: newsSource.events.filter(ev=>ev.year===currentYear() &&
        (state.stageIndex===0?Number(ev.id.slice(-2))<=2:Number(ev.id.slice(-2))>2)).map(ev=>eventView(ev,true))
    }:{}),
    priceHistory:state.priceHistory,
    recentTrades:role!=="guest" ? state.completedTrades.slice(-15).reverse() : [],
    ...(role==="teacher"?{teacherMembers:state.participants.map(p=>({id:p.id,name:p.name,members:p.members,
        drawMode:p.drawMode||null,cardCount:holdingCount(p),holdings:p.holdings}))}:{}),
    course:{edition:"beginner",years:YEARS,newsCount:16},
    explanation:"가격 변화는 실측 '사건 직후' 수익률이 아니라, ETF 연간 수익률을 두 단계로 배분한 교육용 모델입니다."
  };
}

function classroomPredictionKey(){return `${currentYear()}-${state.stageIndex+1}`;}
function classroomPredictions(){
 const key=classroomPredictionKey();
 const entries=state.participants.filter(p=>p.predictions?.[key]).map(p=>({
  teamId:p.id,teamName:p.name,...p.predictions[key]
 }));
 return {total:state.participants.length,answered:entries.length,entries};
}
function reportData(){
 return {
  generatedAt:new Date().toISOString(),finished:state.phase==="finished",
  scores:scores(),sectors,
  rounds:state.results.map(r=>({year:r.year,stage:r.stageIndex+1,at:r.at,
    scores:r.scores,changes:r.changes})),
  trades:state.completedTrades.map(t=>({year:t.year,stage:t.stage,
    sellerName:t.sellerName,buyerName:t.buyerName,offerId:t.offerId,
    offerQty:t.offerQty,wantId:t.wantId,wantQty:t.wantQty})),
  predictions:state.participants.map(p=>({team:p.name,
    entries:Object.entries(p.predictions||{}).map(([stage,x])=>({stage,...x}))})),
  quizzes:state.participants.map(p=>({team:p.name,
    answered:Object.keys(p.quizAnswers||{}).length,
    correct:Object.values(p.quizAnswers||{}).filter(q=>q.correct).length}))
 };
}
function projectorData(){
 const latest=state.results.at(-1);
 return {
  room:{phase:state.phase,year:currentYear(),stage:state.stageIndex+1,
    teamCount:state.participants.length,deadline:state.deadline,totalRounds:YEARS.length},
  news:currentlyVisibleNews("team").filter(x=>x.year===currentYear() &&
    Number(x.id.split("-").at(-1))>(state.stageIndex===0?0:2)),
  scores:scores(),
  lastResult:latest && ["result","finished"].includes(state.phase)?publicResult(latest):null,
  predictions:{total:state.participants.length,answered:classroomPredictions().answered,
    counts:Object.entries(classroomPredictions().entries.reduce((memo,p)=>{
     memo[p.sectorId]=(memo[p.sectorId]||0)+1;return memo;},{}))
      .map(([id,count])=>({sector:sectors.find(s=>s.id===Number(id))?.name||"기타",count}))}
 };
}
function expireListings() {
  for (const l of state.listings) if (l.status==="open") l.status="expired";
}
function settle() {
  const year = currentYear(), step=state.stageIndex;
  const changes = [];
  for (const x of sectors) {
    const old=state.prices[x.id], pct=currentStageReturn(x.id);
    if (pct===undefined) throw new Error("가격 데이터 누락");
    const next=Math.max(1,Math.round(old*(1+pct/100)));
    state.prices[x.id]=next;
    changes.push({id:x.id,name:x.name,previous:old,price:next,gameModelPct:pct,
      ...(step===1?{observedAnnualPct:actualMap.get(`${year}:${x.id}`)?.total_return_pct}:{} )});
  }
  expireListings();
  const result={year,stageIndex:step,changes,at:new Date().toISOString(),
    scores:scores(),endingYear:step===1,returnKind:year===2026?"2026-11-04 기준 YTD":"연간"};
  result.teamTradeReports=stageTradeReports();
  state.results.push(result);
  state.lastMoves=changes;
  state.priceHistory.push({year,stageIndex:step,prices:{...state.prices}});
  state.phase="result";state.deadline=null;state.secondsRemaining=null;state.pausedFrom=null;
}
async function processTimer() {
  if (!state.deadline || Date.now() < state.deadline) return;
  if (state.phase==="news") {
    state.phase="trade";state.deadline=Date.now()+state.config.tradeSeconds*1000;await commit();
  } else if (state.phase==="trade") {settle();await commit();}
}
function beginNews() {
  captureStageBaseline();
  state.phase="news";state.deadline=Date.now()+state.config.newsSeconds*1000;
  state.secondsRemaining=null;state.pausedFrom=null;
}
function start() {
  bad(state.phase!=="lobby","대기실 상태에서만 시작할 수 있습니다.");
  bad(state.participants.length<2,"게임 시작에는 두 팀 이상이 필요합니다. 카드 교환을 연습할 두 팀을 등록해 주세요.");
  bad(state.participants.some(team=>!team.drawMode),"아직 카드를 뽑지 않은 팀이 있습니다. 모든 팀의 카드 뽑기가 끝난 뒤 시작하세요.");
  for(const p of state.participants) {
    p.initialHoldings=structuredClone(p.holdings);
    p.initialHoldingsCapturedAtStart=true;
  }
  beginNews();
}
function next() {
  bad(state.phase!=="result","결과 해설 화면에서만 다음 단계로 진행할 수 있습니다.");
  if (state.stageIndex===0) state.stageIndex=1;
  else {state.stageIndex=0;state.yearIndex++; }
  if (state.yearIndex>=YEARS.length) {
    state.phase="finished";state.deadline=null;
  } else beginNews();
}
function pause() {
  bad(!["news","trade"].includes(state.phase),"진행 중에만 일시정지할 수 있습니다.");
  state.secondsRemaining=Math.max(1,Math.ceil((state.deadline-Date.now())/1000));
  state.pausedFrom=state.phase;state.phase="paused";state.deadline=null;
}
function resume() {
  bad(state.phase!=="paused","일시정지 중이 아닙니다.");
  state.phase=state.pausedFrom;
  state.pausedFrom=null;
  state.deadline=Date.now()+Math.max(1,state.secondsRemaining)*1000;
  state.secondsRemaining=null;
}
function ensureTrade(role) {
  restricted(role!=="team","참가팀만 거래할 수 있습니다.");
  restricted(state.phase!=="trade","거래 가능 시간이 아닙니다.");
}
// 공개 주문은 아직 체결되지 않은 카드도 잠시 배정한 것으로 간주합니다.
function reservedFor(teamId, sectorId) {
  return state.listings.filter(l => l.status === "open" && l.sellerId === teamId &&
    l.offerId === Number(sectorId)).reduce((total,l)=>total+l.offerQty,0);
}
function availableFor(team, sectorId) {
  return Math.max(0,Number(team.holdings[sectorId] || 0)-reservedFor(team.id,sectorId));
}
function maxCounterpartyAvailable(teamId, sectorId) {
  return state.participants.filter(p=>p.id!==teamId)
    .reduce((max,p)=>Math.max(max,availableFor(p,sectorId)),0);
}
function postTrade(sess, body) {
  ensureTrade(sess.role);
  const offerId=Number(body.offerId),wantId=Number(body.wantId),offerQty=Number(body.offerQty),wantQty=Number(body.wantQty);
  bad(![offerId,wantId].every(id=>sectors.some(x=>x.id===id)),"카드 종류가 잘못되었습니다.");
  bad(!Number.isSafeInteger(offerQty)||!Number.isSafeInteger(wantQty)||offerQty<1||wantQty<1||offerQty>30||wantQty>30,"수량은 1~30장입니다.");
  bad(offerId===wantId,"같은 종류의 카드는 교환할 수 없습니다.");
  const seller=state.participants.find(p=>p.id===sess.teamId);
  restricted(!seller);
  bad(availableFor(seller,offerId)<offerQty,"이미 등록한 제안을 제외하면 제공할 카드가 부족합니다.");
  bad(maxCounterpartyAvailable(seller.id,wantId)<wantQty,
    "다른 팀이 교환 가능한 요구 카드 수량을 초과했습니다. 원하는 카드 수량을 줄여 주세요.");
  bad(state.listings.filter(x=>x.sellerId===seller.id&&x.status==="open").length>=5,"팀당 동시에 최대 5개까지 제안할 수 있습니다.");
  state.listings.push({id:crypto.randomUUID(),sellerId:seller.id,sellerName:seller.name,
    offerId,offerQty,wantId,wantQty,year:currentYear(),stageIndex:state.stageIndex,
    status:"open",createdAt:new Date().toISOString()});
}
function acceptTrade(sess, id) {
  ensureTrade(sess.role);
  const listing=state.listings.find(x=>x.id===id);
  bad(!listing||listing.status!=="open"||listing.year!==currentYear()||listing.stageIndex!==state.stageIndex,"이미 마감된 제안입니다.");
  restricted(listing.sellerId===sess.teamId,"자기 팀의 제안은 수락할 수 없습니다.");
  const seller=state.participants.find(p=>p.id===listing.sellerId);
  const buyer=state.participants.find(p=>p.id===sess.teamId);
  restricted(!seller||!buyer);
  bad((seller.holdings[listing.offerId]||0)<listing.offerQty,"판매팀의 카드가 부족합니다.");
  bad(availableFor(buyer,listing.wantId)<listing.wantQty,
    "다른 교환 제안에 등록한 카드를 제외하면 수락할 카드가 부족합니다.");
  // All validation and both portfolio mutations occur synchronously (one Node process).
  seller.holdings[listing.offerId]-=listing.offerQty;
  seller.holdings[listing.wantId]=(seller.holdings[listing.wantId]||0)+listing.wantQty;
  buyer.holdings[listing.wantId]-=listing.wantQty;
  buyer.holdings[listing.offerId]=(buyer.holdings[listing.offerId]||0)+listing.offerQty;
  listing.status="matched";listing.buyerId=buyer.id;
  state.completedTrades.push({id:listing.id,at:new Date().toISOString(),year:currentYear(),
    stage:state.stageIndex+1,sellerId:seller.id,buyerId:buyer.id,
    sellerName:seller.name,buyerName:buyer.name,
    offerId:listing.offerId,offerQty:listing.offerQty,wantId:listing.wantId,wantQty:listing.wantQty});
}
/**
 * 강의 전체 초기화:
 * - Supabase에 실제로 저장된 최신 버전을 먼저 읽습니다.
 * - 누적된 참가팀, 카드, 거래, 발표 기록, 학생 세션을 초기화합니다.
 * - 강사 세션은 유지하고 PIN은 재발급합니다.
 * - 동시 업데이트가 발생하면 최신 스냅샷으로 재시도합니다.
 * - commit() 실패 시 확정되지 않은 초기화는 기존 저장 상태로 복원됩니다.
 *
 * 강사가 입력한 확인 문구와 강사 인증은 이 서버에서 검사합니다.
 */
async function resetGame(req, body) {
  bad(!["초기화","RESET"].includes(String(body.confirm||"").trim()),
    "초기화 확인란에 '초기화'를 정확하게 입력하세요.");
  for (let attempt=0; attempt<3; attempt++) {
    const latest=await storage.reload();
    state=structuredClone(latest);
    savedState=structuredClone(latest);
    restricted(sessionFor(req)?.role!=="teacher", "강사 로그인이 만료되었습니다. 다시 로그인해 주세요.");
    const teachers=Object.fromEntries(
      Object.entries(latest.sessions).filter(([,session])=>
        session.role==="teacher" && session.expiry>Date.now() && session.authVersion===authVersion)
    );
    const clean=newState();
    while (clean.pin===latest.pin) clean.pin=randomPin();
    clean.version=latest.version; // commit() advances optimistic-lock version.
    clean.sessions=teachers; // 기존 학생 로그인 토큰은 모두 무효화합니다.
    clean.lastResetAt=new Date().toISOString();
    clean.resetId=crypto.randomUUID();
    const resetVersion=latest.version+1;
    state=clean;
    try {
      await commit();
      // DB에 실제 기록됐는지 다시 읽어 확인한 뒤에만 '초기화 완료'를 반환합니다.
      const stored=await storage.reload();
      if (stored.resetId!==clean.resetId ||
          stored.version!==resetVersion ||
          stored.participants.length!==0 || stored.results.length!==0) {
        throw new Error("초기화 저장 결과를 확인할 수 없습니다. 서버 상태를 확인해 주세요.");
      }
      state=structuredClone(stored);
      savedState=structuredClone(stored);
      console.info(`[classroom] reset committed; version=${state.version}; at=${state.lastResetAt}`);
      return;
    } catch (error) {
      // commit() detects a stale Supabase version and reloads the latest state.
      if (error.code==="CONCURRENT_UPDATE" && attempt<2) continue;
      throw error;
    }
  }
}
function applyAction(body) {
  switch (body.action) {
    case "start":start();break;
    case "next":next();break;
    case "pause":pause();break;
    case "resume":resume();break;
    case "pin": {
      bad(state.phase!=="lobby","PIN은 대기실에서만 재발급할 수 있습니다.");
      state.pin=randomPin();break;
    }
    case "config": {
      bad(state.phase!=="lobby","설정은 대기실에서만 변경할 수 있습니다.");
      const n=Number(body.newsSeconds),t=Number(body.tradeSeconds);
      bad(!Number.isInteger(n)||n<15||n>300||!Number.isInteger(t)||t<20||t>600,
        "뉴스 시간은 15~300초, 거래 시간은 20~600초입니다.");
      state.config={newsSeconds:n,tradeSeconds:t};break;
    }
    case "kick": {
      bad(state.phase!=="lobby","참가팀 제거는 시작 전에만 가능합니다.");
      const id=String(body.teamId||"");
      bad(!state.participants.some(p=>p.id===id),"팀이 없습니다.");
      state.participants=state.participants.filter(p=>p.id!==id);
      for (const [k,v] of Object.entries(state.sessions)) if(v.teamId===id) delete state.sessions[k];
      break;
    }
    default:bad(true,"알 수 없는 명령입니다.");
  }
}
function secureHeaders(res) {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
function checkOrigin(req) {
  if (!["POST","PUT","DELETE","PATCH"].includes(req.method)) return;
  const origin=req.headers.origin;
  if (!origin) return; // Non-browser clients have no Origin; cookies alone are CSRF-protected by SameSite.
  let provided;
  try {provided=new URL(origin).host;} catch { throw Object.assign(new Error("잘못된 요청 출처"),{status:403}); }
  const allowed = [req.headers.host];
  if (PUBLIC_BASE_URL) allowed.push(new URL(PUBLIC_BASE_URL).host);
  restricted(!allowed.includes(provided),"다른 출처의 요청은 차단됩니다.");
}
async function readBody(req) {
  let content=""; 
  for await (const chunk of req) {
    content+=chunk.toString("utf8");
    if (Buffer.byteLength(content)>20000) throw Object.assign(new Error("요청 본문이 너무 큽니다."),{status:413});
  }
  try { return JSON.parse(content||"{}"); }
  catch { throw Object.assign(new Error("JSON 형식이 잘못되었습니다."),{status:400}); }
}
function svgQR(text) {
  const qr=new QRCode(-1,QRErrorCorrectLevel.M);qr.addData(text);qr.make();
  const n=qr.getModuleCount(),margin=4,scale=6;
  const size=(n+margin*2)*scale;
  let lines=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`];
  for(let y=0;y<n;y++) for(let x=0;x<n;x++)
    if(qr.isDark(y,x)) lines.push(`<rect x="${(x+margin)*scale}" y="${(y+margin)*scale}" width="${scale}" height="${scale}" fill="#161d32"/>`);
  lines.push("</svg>");
  return lines.join("");
}
function staticFile(req,res,pathname) {
  // 카드 리소스만 공개하고 DB/환경변수 경로 접근은 허용하지 않습니다.
  if (/^\/cards\/(XLE|XLB|XLI|XLF|XLY|XLP|XLV|XLK|XLC|XLU|XLRE)\.(svg|png)$/i.test(pathname)) {
    const file = path.join(__dirname,"public",pathname.slice(1));
    if (fs.existsSync(file)) {
      res.writeHead(200,{"Content-Type":pathname.endsWith(".svg")?"image/svg+xml":"image/png",
        "Cache-Control":"public, max-age=604800"});
      res.end(fs.readFileSync(file));return true;
    }
  }
  // V3.5.3: responsive news images; exact whitelist prevents arbitrary file access.
  if (/^\/art\/article-(rates|geopolitics|energy|trade|health|tech|inflation-rise|inflation-cool|banks)-(640|1200)\.webp$/.test(pathname)) {
    const file=path.join(__dirname,"public",pathname.slice(1));
    if(!fs.existsSync(file)) return false;
    res.writeHead(200,{"Content-Type":"image/webp","Cache-Control":"public, max-age=86400"});
    res.end(fs.readFileSync(file));
    return true;
  }
  const map = {
    "/": ["index.html","text/html; charset=utf-8"],
    "/join": ["index.html","text/html; charset=utf-8"],
    "/teacher": ["index.html","text/html; charset=utf-8"],
    "/present": ["present.html","text/html; charset=utf-8"],
    "/report": ["report.html","text/html; charset=utf-8"],
    "/present.js":["present.js","text/javascript; charset=utf-8"],
    "/report.js":["report.js","text/javascript; charset=utf-8"],
    "/editorial.css":["editorial.css","text/css; charset=utf-8"],
    "/mobile-v32.css":["mobile-v32.css","text/css; charset=utf-8"],
    "/mobile-v35.css":["mobile-v35.css","text/css; charset=utf-8"],
    "/art/article-rates.webp":["art/article-rates.webp","image/webp"],
    "/art/article-geopolitics.webp":["art/article-geopolitics.webp","image/webp"],
    "/art/article-energy.svg":["art/article-energy.svg","image/svg+xml"],
    "/art/article-trade.svg":["art/article-trade.svg","image/svg+xml"],
    "/art/article-health.svg":["art/article-health.svg","image/svg+xml"],
    "/art/article-tech.svg":["art/article-tech.svg","image/svg+xml"],
    "/art/article-banks.svg":["art/article-banks.svg","image/svg+xml"],
    "/art/article-health.webp":["art/article-health.webp","image/webp"],
    "/art/article-energy.webp":["art/article-energy.webp","image/webp"],
    "/art/article-trade.webp":["art/article-trade.webp","image/webp"],
    "/art/article-tech.webp":["art/article-tech.webp","image/webp"],
    "/art/article-inflation-rise.webp":["art/article-inflation-rise.webp","image/webp"],
    "/art/article-inflation-cool.webp":["art/article-inflation-cool.webp","image/webp"],
    "/art/article-banks.webp":["art/article-banks.webp","image/webp"],
    "/app.js":["app.js","text/javascript; charset=utf-8"],
    "/style.css":["style.css","text/css; charset=utf-8"],
    "/manifest.webmanifest":["manifest.webmanifest","application/manifest+json"],
    "/sw.js":["sw.js","text/javascript; charset=utf-8"],
    "/audio/notify.wav":["audio/notify.wav","audio/wav"],
    "/audio/notify.mp3":["audio/notify.mp3","audio/mpeg"],
    "/audio/ambient.wav":["audio/ambient.wav","audio/wav"],
    "/audio/ambient.mp3":["audio/ambient.mp3","audio/mpeg"],
    "/icon-192.png":["icon-192.png","image/png"],
    "/icon-512.png":["icon-512.png","image/png"],
    "/art/market-horizon.webp":["art/market-horizon.webp","image/webp"],
    "/art/exchange-handshake.webp":["art/exchange-handshake.webp","image/webp"],
    "/art/news-signal.webp":["art/news-signal.webp","image/webp"],
    "/art/victory-market.webp":["art/victory-market.webp","image/webp"]
  };
  if (!map[pathname]) return false;
  const [file,type]=map[pathname];
  // UI 및 코드 파일은 업데이트 직후 반영되도록 캐시하지 않습니다.
  const cache=pathname.startsWith("/art/article-")?"public, max-age=604800":(pathname.startsWith("/icon-")?"public, max-age=3600":"no-store");
  res.writeHead(200,{"Content-Type":type,"Cache-Control":cache});
  res.end(fs.readFileSync(path.join(__dirname,"public",file)));
  return true;
}
const server=http.createServer((req,res)=>{
  secureHeaders(res);
  serial(async () => {
    await processTimer();
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    const pathname=url.pathname;
    if (req.method==="GET" && staticFile(req,res,pathname)) return;
    if (pathname==="/api/health" && req.method==="GET") return send(res,200,{ok:true,year:currentYear(),build:"invest-play-easy-v3.5.3-newsimages"});
    if (pathname==="/api/state" && req.method==="GET") return send(res,200,view(req));
    if(pathname==="/api/presentation" && req.method==="GET"){
      restricted(sessionFor(req)?.role!=="teacher","발표 화면은 강사 로그인 후 이용하세요.");
      return send(res,200,projectorData());
    }
    if(pathname==="/api/report" && req.method==="GET"){
      restricted(sessionFor(req)?.role!=="teacher","강사만 보고서를 볼 수 있습니다.");
      return send(res,200,reportData());
    }

    if (pathname==="/api/events" && req.method==="GET") {
      const s=sessionFor(req);
      restricted(!s,"로그인 후에 연결할 수 있습니다.");
      res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8",
        "Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"});
      res.write(": connected\n\n");
      sockets.add(res);
      req.on("close",()=>sockets.delete(res));
      return;
    }
    if (pathname==="/api/qr.svg" && req.method==="GET") {
      restricted(sessionFor(req)?.role!=="teacher");
      const urlStr=joinUrl(req);
      res.writeHead(200,{"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"no-store"});
      return res.end(svgQR(urlStr));
    }
    if (pathname==="/api/export.csv" && req.method==="GET") {
      restricted(sessionFor(req)?.role!=="teacher");
      const header=["순위","팀","평가자산","수익률(%)",...sectors.map(x=>x.name)];
      const rows=scores().map(x=>{
        const p=state.participants.find(v=>v.id===x.id);
        return [x.rank,x.name,x.total,x.returnPct.toFixed(2),...sectors.map(z=>p.holdings[z.id]||0)];
      });
      const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
      res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8",
        "Content-Disposition":"attachment; filename=classroom-results.csv","Cache-Control":"no-store"});
      return res.end("\ufeff"+csv);
    }
    if (req.method!=="POST") return error(res,404,"해당 경로가 없습니다.");
    checkOrigin(req);
    restricted(!String(req.headers["content-type"]||"").startsWith("application/json"),"JSON 요청만 허용됩니다.");
    const body=await readBody(req);
    const sess=sessionFor(req);
    if (pathname==="/api/login") {
      limit(req,"login",8);
      bad(typeof body.password!=="string","비밀번호를 입력하세요.");
      const expected=crypto.createHash("sha256").update(PASSWORD).digest();
      const got=crypto.createHash("sha256").update(body.password).digest();
      restricted(!crypto.timingSafeEqual(expected,got),"비밀번호가 올바르지 않습니다.");
      await setSession(res,"teacher");
      return send(res,200,{ok:true});
    }
    if (pathname==="/api/join") {
      limit(req,"join",120); // 같은 공유 IP에서 여러 팀 접속 허용
      bad(state.phase!=="lobby","게임 시작 후에는 새 팀이 참가할 수 없습니다.");
      bad(String(body.pin||"")!==state.pin,"참가 PIN이 올바르지 않습니다.");
      if (sess?.role==="team" && state.participants.some(p=>p.id===sess.teamId)) {
        const old = state.participants.find(p=>p.id===sess.teamId);
        throw Object.assign(new Error(`이미 '${old.name}' 팀으로 참가 중입니다. 팀명을 바꾸려면 학생 화면의 '팀명 변경'을 이용하세요.`),{status:409});
      }
      restricted(sess?.role==="teacher","강사 로그인 상태에서는 새 학생팀을 만들 수 없습니다. 다른 브라우저나 시크릿 창을 이용하세요.");
      const name=safeStr(body.name,18);
      bad(name.length<2,"팀명은 2자 이상 입력하세요.");
      const members=Array.isArray(body.members)?body.members.map(x=>safeStr(x,22)).filter(Boolean).slice(0,10):[];
      bad(members.length<1,"구성원 이름을 1명 이상 입력하세요.");
      bad(isTakenName(name),"이미 등록된 팀명입니다. 강사 화면의 '입장 팀 관리'를 확인하거나 다른 팀명을 사용하세요.");
      bad(state.participants.length>=50,"최대 50개 팀까지 참가할 수 있습니다.");
      const holdings=evenHoldings();
      const team={id:crypto.randomUUID(),name,members,drawMode:null,holdings,
   initialAsset:INITIAL_ASSET,initialHoldings:structuredClone(holdings),joinedAt:new Date().toISOString()};
      state.participants.push(team);
      await setSession(res,"team",team.id);
      return send(res,200,{ok:true});
    }
    if (pathname==="/api/team") {
      restricted(sess?.role!=="team","참가팀만 팀 정보를 수정할 수 있습니다.");
      bad(state.phase!=="lobby","팀 정보는 게임 시작 전 대기실에서만 수정할 수 있습니다.");
      const team=state.participants.find(p=>p.id===sess.teamId);
      restricted(!team,"참가한 팀을 찾지 못했습니다.");
      if(body.action==="rename") {
        const name=safeStr(body.name,18);
        bad(name.length<2,"팀명은 2자 이상 입력하세요.");
        bad(isTakenName(name,team.id),"이미 등록된 팀명입니다. 다른 이름을 입력하세요.");
        team.name=name;
        for(const listing of state.listings)if(listing.sellerId===team.id)listing.sellerName=name;
      } else if(body.action==="draw") {
        const mode=String(body.mode||"");
        bad(!DRAW_MODES.includes(mode),"초급 버전은 균등 배분만 사용할 수 있습니다.");
        bad(Boolean(team.drawMode),"카드 뽑기는 팀당 한 번만 가능합니다.");
        team.holdings=mode==="even"?evenHoldings():randomHoldings();
        team.drawMode=mode;
        team.initialHoldings=structuredClone(team.holdings);
        team.drawnAt=new Date().toISOString();
        team.initialAsset=INITIAL_ASSET;
        bad(holdingCount(team)!==TOTAL_START_CARDS,"카드 배분 합계가 110장이 아닙니다.");
        bad(Object.values(team.holdings).some(v=>v<1),"모든 산업을 최소 한 장 보유해야 합니다.");
      } else if(body.action==="practice") {
        bad(!team.drawMode,"카드를 먼저 배분받은 다음 연습할 수 있습니다.");
        bad(Boolean(team.practiceDone),"연습 교환은 팀당 한 번 완료할 수 있습니다.");
        const offerId=Number(body.offerId),wantId=Number(body.wantId);
        bad(!Number.isSafeInteger(offerId)||!Number.isSafeInteger(wantId)||
          !sectors.some(x=>x.id===offerId)||!sectors.some(x=>x.id===wantId)||
          offerId===wantId,"서로 다른 산업 카드 2종을 선택하세요.");
        bad(Number(team.holdings[offerId]||0)<1,"연습에 사용할 카드가 없습니다.");
        // 이 동작은 샌드박스 예시이며 실제 카드/거래/평가금액은 변경하지 않습니다.
        team.practiceDone=true;
        team.practiceReceipt={offerId,wantId,qty:1,at:new Date().toISOString(),simulated:true};
      } else if(body.action==="strategy") {
        bad(true,"기존 투자 성향 선택은 종료되었습니다. 카드 뽑기 팝업에서 선택하세요.");
      } else bad(true,"알 수 없는 팀 관리 명령입니다.");
      await commit();
      return send(res,200,view(req));
    }
    if (pathname==="/api/quiz") {
      restricted(sess?.role!=="team","학생팀만 퀴즈에 응답할 수 있습니다.");
      bad(!["news","trade"].includes(state.phase),"퀴즈 응답은 현재 뉴스 분석·거래 단계에서만 가능합니다.");
      const team=state.participants.find(p=>p.id===sess.teamId);
      restricted(!team,"참가팀 정보가 없습니다.");
      bad(!team.drawMode,"카드 배분을 완료한 뒤 응답하세요.");
      const lesson=currentLesson(),key=lessonKey();
      bad(!lesson,"현재 뉴스의 퀴즈를 찾을 수 없습니다.");
      bad(Boolean(team.quizAnswers?.[key]),"이 뉴스 단계의 퀴즈는 이미 제출했습니다.");
      const answer=safeStr(body.answer,1);
      bad(!lesson.quiz.options.some(x=>x.value===answer),"제시된 답안 중 하나를 선택하세요.");
      const correct=answer===lesson.quiz.correct;
      team.quizAnswers??={};
      team.quizAnswers[key]={answer,correct,correctOption:lesson.quiz.correct,
        explanation:lesson.quiz.explanation,submittedAt:new Date().toISOString()};
      await commit();
      return send(res,200,view(req));
    }
    if(pathname==="/api/predict"){
      restricted(sess?.role!=="team","학생팀만 제출할 수 있습니다.");
      bad(!["news","trade"].includes(state.phase),"뉴스 읽기·카드 교환 중에만 제출할 수 있습니다.");
      const team=state.participants.find(p=>p.id===sess.teamId);
      restricted(!team,"참가팀 정보가 없습니다.");
      bad(!team.drawMode,"시작 카드를 먼저 받으세요.");
      const sectorId=Number(body.sectorId);
      bad(!Number.isSafeInteger(sectorId)||!sectors.some(s=>s.id===sectorId),"올바른 산업을 고르세요.");
      const reason=safeStr(body.reason,160);
      bad(reason.length<4,"판단 근거를 네 글자 이상 입력하세요.");
      team.predictions??={};
      const key=classroomPredictionKey();
      bad(Boolean(team.predictions[key]),"이번 단계의 예측은 이미 제출했습니다.");
      team.predictions[key]={sectorId,reason,at:new Date().toISOString()};
      await commit();return send(res,200,view(req));
    }
    if (pathname==="/api/logout") {
      await clearSession(req,res);
      return send(res,200,{ok:true});
    }
    if (pathname==="/api/teacher") {
      restricted(sess?.role!=="teacher");
      if(body.action==="reset") {
        await resetGame(req,body);
        return send(res,200,view(req));
      }
      applyAction(body);await commit();return send(res,200,view(req));
    }
    if (pathname==="/api/list") {
      restricted(!sess);
      postTrade(sess,body);await commit();return send(res,200,view(req));
    }
    if (pathname==="/api/accept") {
      restricted(!sess);
      acceptTrade(sess,String(body.id||""));await commit();return send(res,200,view(req));
    }
    if (pathname==="/api/cancel") {
      restricted(!sess);
      ensureTrade(sess.role);
      const l=state.listings.find(x=>x.id===String(body.id||""));
      restricted(!l || l.sellerId!==sess.teamId || l.status!=="open","취소 가능한 제안이 아닙니다.");
      l.status="cancelled";await commit();return send(res,200,view(req));
    }
    return error(res,404,"해당 경로가 없습니다.");
  }).catch(e => {
    console.error(e.status ? "요청 거절: " + e.message : e);
    if (!res.headersSent) error(res, e.status || 503, e.status ? e.message : "저장소 연결 또는 서버 처리 오류입니다. 잠시 후 다시 시도하세요.");
  });
});
setInterval(() => {
  serial(async () => { await processTimer(); await cleanSessions(); })
    .catch(e => console.error("timer", e));
}, 1000).unref();
setInterval(()=>{ for(const res of sockets) { try {res.write(": heartbeat\n\n");} catch{sockets.delete(res);} } },20000).unref();
async function boot() {
  state = await storage.initialize(newState);
  savedState = structuredClone(state);
  server.listen(PORT, HOST, () =>
    console.log(`투자 카드 교환게임 실행: http://localhost:${PORT} / 저장소: ${storage.kind}`));
}
boot().catch(e => {
  console.error("게임 상태 로딩 실패. Supabase URL, 서비스 역할 키, 테이블 SQL을 확인하세요.", e.message);
  process.exit(1);
});
