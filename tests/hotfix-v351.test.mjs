import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
test("student join never synchronously depends on optional image preloading",()=>{
  assert.match(app,/render\(\);\s*\/\/ Preloading is optional/);
  assert.match(app,/try \{ scheduleCardWarmup\(game\); \}/);
  assert.match(app,/function scheduleCardWarmup\(g\)/);
  assert.doesNotMatch(app,/queueMicrotask\(autoOpenImpact\)/);
});
test("result tab function exists for every student render",()=>{
  assert.match(app,/function results\(g\)\{/);
  assert.match(app,/function studentView\(g\)/); assert.match(app,/가격과 팀 순위는 강사 화면에서/);
});
test("trade image is high-resolution, distinct and cache-busted",()=>{
  assert.match(app,/imageBase=`\/art\/article-\$\{topic\}`/); assert.match(app,/photo-v3515/);
  const asset=fs.readFileSync(new URL("../public/art/article-trade.webp",import.meta.url));
  assert.ok(asset.byteLength>300000);
  assert.ok(asset.subarray(0,4).toString()==="RIFF");
});
test("new app and service worker cache versions are deployed",()=>{
  assert.match(html,/EASY V4\.2/);
  assert.match(sw,/easy-v420-classroom-review/);
});
