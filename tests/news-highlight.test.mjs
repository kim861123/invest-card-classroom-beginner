import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
test("현재 뉴스만 밝은 기사 카드로 강조하고 지난 뉴스는 기존 어두운 스타일 유지",()=>{
  const css=fs.readFileSync(path.join(root,"public/style.css"),"utf8");
  const js=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
  assert.match(css,/V2\/V8 NEWS FOCUS/);
  assert.match(css,/\.newsroom \.current-news-stack \.news-card\.news-current/);
  assert.match(css,/\.archive-news \.news-card\.news-past/);
  assert.match(css,/#fffdf8/);
  assert.match(js,/news-current/);
  assert.match(js,/archive-news/);
});
