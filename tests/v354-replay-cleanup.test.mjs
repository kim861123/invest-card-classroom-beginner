import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const js = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function getReplay() {
  const start = js.indexOf("function replayPanel(g){");
  const end = js.indexOf("\nfunction relationMap(g){", start);
  assert.ok(start !== -1 && end > start, "replayPanel function exists");
  const source = js.slice(start, end);
  const sandbox = {
    h: value => String(value),
    impactLaunch: () => '<div data-impact="available">교환 분석</div>',
  };
  return { render: vm.runInNewContext("(" + source + ")", sandbox), source };
}

test("replay panel title is trade-only, not price replay", () => {
  const {source} = getReplay();
  assert.match(source, /턴별 카드 교환 성과/);
  assert.doesNotMatch(source, /턴별 가격 발표 · 교환 성과/);
  assert.doesNotMatch(source, /replay-movers|replay-mover/);
  assert.doesNotMatch(source, /g\.lastResult\.changes/);
});

test("trade history and impact details survive without duplicating sector returns", () => {
  const {render} = getReplay();
  const output = render({
    lastResult: {changes: [{name:"중복되면안되는산업",gameModelPct:55.55}]},
    stageTradeHistory: [
      {year:2025,stage:1,report:{ready:true,differencePctPoint:1.75}},
      {year:2024,stage:2,report:{ready:false}}
    ]
  });
  assert.match(output,/턴별 카드 교환 성과/);
  assert.match(output,/2025년 1차/);
  assert.match(output,/교환 효과 \+1\.75%p/);
  assert.match(output,/2024년 2차/);
  assert.match(output,/data-impact="available"/);
  assert.doesNotMatch(output,/중복되면안되는산업|55\.55/);
});

test("price-only results have explanatory empty trade message instead of redundant listing", () => {
  const {render} = getReplay();
  const output = render({
    lastResult: {changes:[{name:"에너지",gameModelPct:2.44}]},
    stageTradeHistory:[]
  });
  assert.match(output,/기록된 카드 교환 내역이 없습니다/);
  assert.doesNotMatch(output,/에너지|2\.44%/);
  assert.match(output,/data-impact="available"/);
});

test("replay panel still handles stage before first announcement", () => {
  const {render} = getReplay();
  const output = render({lastResult:null,stageTradeHistory:[]});
  assert.match(output,/아직 가격 발표 전입니다/);
});

test("main industry price chart and expandable detail table remain", () => {
  assert.match(js,/산업별 가격 변화 그래프/);
  assert.match(js,/산업별 상세 수치 표 보기/);
  assert.match(js,/function resultTable\(r\)/);
});

test("cache-busted script and service worker versions match the release", () => {
  assert.match(html,/EASY V4\.2/);
  assert.match(sw,/easy-v420-classroom-review/);
  assert.doesNotMatch(html, /app\.js\?v=(beginner-v3\.5\.3|general-v9\.5\.3)/);
});
