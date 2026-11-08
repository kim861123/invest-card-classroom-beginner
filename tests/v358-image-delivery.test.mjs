import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const app = fs.readFileSync(path.join('public','app.js'),'utf8');
const start = app.indexOf('const ARTICLE_IMAGE_KEYS=');
const end = app.indexOf('function articleMainTopic(');
assert(start!==-1 && end!==-1 && end>start,'기사 이미지 매핑 함수가 있어야 합니다');
const code = app.slice(start,end);
const ctx=vm.createContext({});
vm.runInContext(code,ctx);

test('미국 중간선거 후 증시 기사에서 과거 무역 분류보다 사건 매칭을 우선',()=>{
  const result=vm.runInContext('articleTopic({title:"미국 중간선거 이후 미국 증시 반등", image_topic:"trade"})',ctx);
  assert.equal(result,'midterm-stocks');
});
test('美 중간선거도 증시 이미지로 분류',()=>{
  const result=vm.runInContext('articleTopic({title:"美 중간선거 후 뉴욕증시 반등",image_topic:"trade"})',ctx);
  assert.equal(result,'midterm-stocks');
});
test('정말 무역 관세 뉴스는 무역 이미지',()=>{
  const result=vm.runInContext('articleTopic({title:"미국, 중국산 수입품 관세 인상"})',ctx);
  assert.equal(result,'trade');
});
test('WHO, 인플레이션, AI 반도체 뉴스 구분',()=>{
  assert.equal(vm.runInContext('articleTopic({title:"WHO, 코로나19 국제공중보건 비상사태 종료"})',ctx),'health');
  assert.equal(vm.runInContext('articleTopic({title:"미국 소비자물가 급등"})',ctx),'inflation-rise');
  assert.equal(vm.runInContext('articleTopic({title:"미국 소비자물가 상승률 둔화"})',ctx),'inflation-cool');
  assert.equal(vm.runInContext('articleTopic({title:"AI 반도체 투자 증가"})',ctx),'tech');
});
test('모든 대표 이미지 11종이 1600px 원본과 모바일 소형 파일 보유',()=>{
  const keys=['rates','banks','trade','energy','geopolitics','health','inflation-rise','inflation-cool','tech','midterm-stocks','market'];
  for(const key of keys){
    const files=['.webp','-1200.webp','-640.webp'];
    for(const suf of files){
      const filepath=path.join('public','art',`article-${key}${suf}`);
      assert(fs.existsSync(filepath),`누락: ${filepath}`);
      assert(fs.statSync(filepath).size>20_000,`빈 파일: ${filepath}`);
    }
  }
});
test('실제 뉴스 카드가 수정된 이미지 캐시 버전을 호출',()=>{
  assert(app.includes('photo-v358'));
  assert(app.includes('article-${topic}'));
});
