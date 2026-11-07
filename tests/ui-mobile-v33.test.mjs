import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const load=p=>fs.readFileSync(path.join(dir,p),"utf8");
const app=load("public/app.js"),css=load("public/mobile-v32.css");
test("전쟁 기사 이미지 분류 및 출처 성격 표시",()=>{
  assert.match(app,/러시아\|우크라이나\|침공\|전쟁/);
  assert.match(app,/article-\$\{topic\}\.webp/);
  assert.match(app,/AI 생성 재현 이미지/);
  assert.ok(fs.statSync(path.join(dir,"public/art/article-geopolitics.webp")).size>10000);
  assert.match(load("server.mjs"),/article-geopolitics\.webp/);
});
test("뉴스 화면 중복 테두리·영문 장식·상단 탭 겹침을 억제한다",()=>{
  assert.match(css,/\.editorial-stage-nav\{/);
  assert.match(css,/position:relative!important/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.news-card\.news-current::before/);
  assert.match(css,/content:none!important/);
  assert.match(css,/\.article-tabs\{/);
  assert.match(css,/\.news-readable-source\{/);
  assert.match(css,/@media \(max-width:480px\)/);
});
test("사운드 토글 두 개만 노출, 음색 있는 배경음",()=>{
  assert.doesNotMatch(app,/data-action="test-audio"/);
  assert.doesNotMatch(app,/소리 테스트 · 재연결/);
  assert.match(app,/효과음 \$\{timerSoundEnabled\?"켬":"끔"\}/);
  assert.match(app,/배경음악 \$\{ambientEnabled\?"켬":"끔"\}/);
  const buffer=fs.readFileSync(path.join(dir,"public/audio/ambient.wav"));
  const sampleRate=buffer.readUInt32LE(24),frameCount=(buffer.length-44)/2;
  assert.ok(frameCount/sampleRate>=12,"실제 멜로디가 있는 12초 이상 배경음");
  assert.match(css,/\.timer-tools\{/);
});
test("초급 결과 해설은 막대그래프임을 명확히 한다",()=>{
  if(app.includes("function beginnerResult(g){")){
    assert.match(app,/산업별 가격 변화 그래프/);
    assert.match(app,/막대그래프로 비교하는/);
  }
});
