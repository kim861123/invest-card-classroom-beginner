import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
const CSS=fs.readFileSync(new URL("../public/mobile-v35.css",import.meta.url),"utf8");
const helpers=app.slice(app.indexOf("function availableMine("),app.indexOf("function tradeCardModal("));
const getHelpers = new Function("game",helpers+"\nreturn {availableMine, availableOther, syncTradePreview};");
test("card exchange functions present exactly once",()=>{
  for(const name of ["availableMine","availableOther","syncTradePreview"])
    assert.equal((app.match(new RegExp("function "+name+"\\(", "g"))||[]).length,1,name);
});
test("our unreserved card count agrees with server",()=>{
  const g={team:{id:"t1",holdings:{1:7}},listings:[{sellerId:"t1",offerId:1,offerQty:2}]};
  const {availableMine}=getHelpers(g);
  assert.equal(availableMine(g,1),5);
  g.tradeAvailability={1:{mineAvailable:3,maxOtherAvailable:4}};
  assert.equal(availableMine(g,1),3);
});
test("other team available cards use server summary",()=>{
  const g={tradeAvailability:{8:{mineAvailable:3,maxOtherAvailable:5}}};
  const {availableOther}=getHelpers(g);
  assert.equal(availableOther(g,8),5);
  assert.equal(availableOther(g,77),0);
});
test("exchange preview limits requested cards and updates label",()=>{
  const g={tradeAvailability:{8:{maxOtherAvailable:2}}};
  const {syncTradePreview}=getHelpers(g);
  const qty={value:"6",max:"30"};
  const select={value:"8"}, label={textContent:""}, button={disabled:false};
  const form={
    elements:{namedItem:name=>name==="wantId"?select:name==="wantQty"?qty:null},
    querySelector:sel=>sel.includes("data-counterparty-max")?label:sel.includes("submit")?button:null
  };
  syncTradePreview(form);
  assert.equal(qty.max,"2");
  assert.equal(qty.value,"2");
  assert.match(label.textContent,/2장/);
  assert.equal(button.disabled,false);
});
test("trade click errors are visible and offer form posts to /api/list",()=>{
  assert.match(app,/if\(action==="trade-card"\)\{\s*try\{/);
  assert.match(app,/toast\("교환 제안창을 열지 못했습니다/);
  assert.match(app,/mutate\("\/api\/list",payload/);
});
test("card assets are cacheable and Safari collection requests become eager",()=>{
  assert.match(server,/Cache-Control":"public, max-age=604800"/);
  assert.match(app,/function prioritizeCollectionImages\(details\)/);
  assert.match(app,/img\.loading="eager"/);
  assert.match(app,/image\.fetchPriority="low"/); assert.match(app,/fetchpriority="auto"/);
  assert.match(CSS,/sector-image\.is-loaded::after/);
});
test("new version is used for script, css, and service worker",()=>{
  assert.match(html,/EASY V4\.2/);
  assert.match(sw,/easy-v420-classroom-review/);
});
