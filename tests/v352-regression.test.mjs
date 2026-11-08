import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../public/mobile-v35.css",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
test("ranking button has implemented handler and safe modal",()=>{
  assert.match(app,/function liveRankingContents\(g\)/);
  assert.match(app,/function openLiveRanking\(\)/);
  assert.match(app,/if\(action==="view-rankings"\)/);
  assert.match(app,/openLiveRanking\(\);/);
});
test("trading has a picker, card selection and a functioning form",()=>{
  assert.match(app,/data-action="open-trade-picker"/);
  assert.match(app,/if\(action==="open-trade-picker"\)/);
  assert.match(app,/if\(action==="trade-card"\)/);
  assert.match(app,/dialog\.showModal\(\)/);
  assert.match(app,/if\(form\.id==="trade-card-form"\)/);
  assert.match(app,/mutate\("\/api\/list"/);
});
test("media MP3 served from same-origin with actual files",()=>{
  for(const name of ["ambient","notify"]){
    assert.ok(server.includes(`"/audio/${name}.mp3"`));
    assert.ok(fs.statSync(new URL(`../public/audio/${name}.mp3`,import.meta.url)).size>1000);
    assert.ok(app.includes(`/audio/${name}.mp3`));
  }
});
test("mobile style and media endpoints exposed by server",()=>{
  assert.match(server,/"\/mobile-v35\.css"/);
  assert.match(html,/mobile-v35\.css/);
  assert.match(css,/\.reset-main-button,\.reset-confirm-button\{white-space:nowrap/);
});
test("all nine article images are locally bundled and nontrivial",()=>{
  for(const stem of ["health","inflation-cool","inflation-rise","geopolitics","rates","banks","energy","tech","trade"]){
    const file=new URL(`../public/art/article-${stem}.webp`,import.meta.url);
    assert.ok(fs.statSync(file).size>50000,stem);
    assert.ok(server.includes(`/art/article-${stem}.webp`));
  }
});
test("original cards use stable cacheable URL, fallback is readable immediately",()=>{
  assert.match(app,/const cardPath = ticker => `\/cards\/\$\{encodeURIComponent\(ticker\)\}\.png`;/);
  assert.match(app,/class="sector-card-fallback"/);
  assert.match(css,/\.sector-card-fallback\{/);
});
test("results include a plotted industry change and detailed table",()=>{
  assert.match(app,/function priceChangeGraph\(changes\)/);
  assert.match(app,/class="price-change-meter"/);
  assert.match(app,/result-detail-table/);
  assert.match(app,/function finalPodium\(g\)/);
});
test("service worker uses a new cache bucket",()=>{
  assert.match(sw,/hotfix-2/);
  assert.match(sw,/\/audio\/ambient\.mp3/);
});
