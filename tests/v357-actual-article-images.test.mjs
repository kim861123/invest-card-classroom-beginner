import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
const root=path.resolve(import.meta.dirname, "..");
const source=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
const begin=source.indexOf("const ARTICLE_IMAGE_KEYS=");
const end=source.indexOf("function articleMainTopic",begin);
assert(begin>=0&&end>begin, "image classifier section present");
const snippet=source.slice(begin,end);
const sandbox={};
vm.createContext(sandbox);
vm.runInContext(snippet,sandbox);
const cases=[
 ["미국 중간선거 이후 미국 증시 반등",{image_topic:"trade"},"midterm-stocks"],
 ["중간 선거 이후 뉴욕 증시 상승",{image_topic:"trade"},"midterm-stocks"],
 ["WHO, 코로나19 국제공중보건 비상사태 종료",{image_topic:"trade"},"health"],
 ["미국 소비자물가(CPI) 급등",{image_topic:"trade"},"inflation-rise"],
 ["미국 CPI 상승세 둔화",{image_topic:"trade"},"inflation-cool"],
 ["생성형 AI 열풍, 반도체 투자 확대",{image_topic:"trade"},"tech"],
 ["미국 중국산 수입품 관세 25% 인상",{image_topic:"trade"},"trade"],
 ["미 연준 자산매입 축소(테이퍼링) 발표",{},"rates"],
 ["관련 이미지 분류가 없는 기사",{},"market"],
];
for(const [title,extra,expected] of cases){
  const actual=sandbox.articleTopic({title,...extra});
  assert.equal(actual,expected,`'${title}' should have ${expected}; got ${actual}`);
}
for(const file of ["rates","banks","trade","energy","geopolitics","health","inflation-rise","inflation-cool","tech","midterm-stocks","market"]){
 for(const suffix of ["-640","-1200",""]){
  const f=path.join(root,"public/art",`article-${file}${suffix}.webp`);
  assert(fs.existsSync(f),`missing image ${f}`);
 }
}
console.log(`PASS ${cases.length} article matching cases + 33 image variants`);
