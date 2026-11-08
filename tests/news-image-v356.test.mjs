
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=fs.readFileSync(path.join(project,"public/app.js"),"utf8");
const server=fs.readFileSync(path.join(project,"server.mjs"),"utf8");
const begin=app.indexOf("const ARTICLE_IMAGE_KEYS=");
const end=app.indexOf("function articleMainTopic(",begin);
assert.ok(begin>=0&&end>begin,"기사 이미지 함수 존재");
const ctx=vm.createContext({});
vm.runInContext(app.slice(begin,end),ctx);
function topic(article){
  ctx.articleInput=article;
  return vm.runInContext("articleTopic(articleInput)",ctx);
}
test("중간선거 이후 증시 반등은 주식시장 전용 이미지",()=>{
  for(const title of [
    "미국 중간선거 이후 미국 증시 반등",
    "미국 중간선거 이후 증시 반등",
    "美 중간선거 후 증시 반등"
  ]) assert.equal(topic({title,learning_concept:{theme:"관세와 무역"}}),"midterm-stocks");
});
test("WHO/물가 급등/둔화/AI 반도체는 각 기사 의미에 맞게 매칭",()=>{
  assert.equal(topic({title:"WHO, 코로나19 국제공중보건 비상사태 종료"}),"health");
  assert.equal(topic({title:"미국 CPI 소비자물가 급등"}),"inflation-rise");
  assert.equal(topic({title:"미국 CPI 상승세 둔화, 인플레이션 완화"}),"inflation-cool");
  assert.equal(topic({title:"생성형 AI 열풍…반도체 투자 경쟁 가속"}),"tech");
});
test("실제 무역·관세 기사는 무역 이미지 유지",()=>{
  assert.equal(topic({title:"미국, 중국산 수입품 관세를 25%로 인상"}),"trade");
});
test("알 수 없는 기사를 무역 사진으로 임의 매칭하지 않음",()=>{
  assert.equal(topic({title:"복합 경제 지표 공개"}),"market");
});
test("고유 기사 ID·기사 메타데이터를 통한 명시적 오버라이드 지원",()=>{
  assert.equal(topic({id:"unknown-id",title:"미국 경제 현황",image_topic:"health"}),"health");
  assert.equal(topic({title:"미국 경제 현황",image_topic:"../../secret"}),"market");
});
test("새 이미지 5개 분야 + 일반 대체 이미지의 3종 해상도 모두 WebP",()=>{
  for(const key of ["health","inflation-rise","inflation-cool","tech","midterm-stocks","market"]){
    for(const suffix of ["","-640","-1200"]){
      const p=path.join(project,"public","art",`article-${key}${suffix}.webp`);
      const data=fs.readFileSync(p);
      assert.ok(data.length>20000,p);
      assert.equal(data.toString("ascii",0,4),"RIFF");
      assert.equal(data.toString("ascii",8,12),"WEBP");
    }
  }
});
test("서버가 새로운 이미지의 실제 파일 경로를 제공",()=>{
  assert.match(server,/midterm-stocks\|market/);
  assert.match(server,/\/art\/article-midterm-stocks\.webp/);
  assert.match(server,/\/art\/article-market\.webp/);
});
test("브라우저 캐시 갱신·이미지별 표시·교육용 출처 표기",()=>{
  assert.match(app,/photo-v356/);
  assert.match(app,/data-image-topic/);
  assert.match(app,/AI 생성 재현 이미지/);
  assert.ok(!app.includes('return "trade";\n}\nfunction articleMainTopic'));
});
