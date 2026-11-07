import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import {fileURLToPath} from "node:url";

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const css=fs.readFileSync(path.join(dir,"public/style.css"),"utf8");
const app=fs.readFileSync(path.join(dir,"public/app.js"),"utf8");

test("EASY V2.2: 퀴즈 라디오 입력이 일반 입력란의 100% 폭을 상속하지 않음",()=>{
  // 기존 전역 규칙은 input,select에 width:100%를 적용하므로
  // radio 선택지에 반드시 타입별 고정 폭을 덮어써야 합니다.
  assert.match(css,/\.easy-quiz-choice input\[type="radio"\]/);
  assert.match(css,/width:20px !important/);
  assert.match(css,/grid-template-columns:20px minmax\(0,1fr\)/);
  assert.match(css,/\.easy-quiz-choice>span\{/);
  assert.match(css,/overflow-wrap:break-word/);
  assert.match(fs.readFileSync(path.join(dir,"public/index.html"),"utf8"),/beginner-v3.3-audio-layout/);
});

test("EASY V2.2: 미응답 학생은 발표 전 비공개, 발표 후 정답과 해설 표시",()=>{
  // 실제 브라우저에 사용되는 렌더러 함수를 테스트합니다.
  const start=app.indexOf("function beginnerQuiz(g){");
  const end=app.indexOf("function beginnerQuizReview(g){",start);
  assert.ok(start>=0&&end>start);
  const script=app.slice(start,end)+"\nglobalThis.renderBeginnerQuiz = beginnerQuiz;";
  const ctx={
    quizDraftByStage:Object.create(null),
    ico:()=>"✓",
    h:x=>String(x??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))
  };
  vm.createContext(ctx);
  vm.runInContext(script,ctx);
  const lesson={
    year:2020,stage:1,submission:null,
    quiz:{
      sourceNews:{id:"EVT-2020-02",date:"2020-03-15",title:"기준금리 인하",summary:"금리가 낮아졌습니다."},
      question:"기준금리 인하가 대출 금리에 미치는 영향은?",
      options:[{value:"A",label:"대출 금리 상승"},{value:"B",label:"대출 금리 하락 가능"},{value:"C",label:"상환 면제"},{value:"D",label:"대출 금액 자동 증가"}]
    }
  };
  const before=ctx.renderBeginnerQuiz({room:{phase:"news"},team:{drawMode:"even"},beginnerLesson:lesson});
  assert.match(before,/easy-quiz-choice/);
  assert.doesNotMatch(before,/정답:/);
  assert.doesNotMatch(before,/미응답자도 정답 확인/);
  const after=ctx.renderBeginnerQuiz({room:{phase:"result"},team:{drawMode:"even"},
    beginnerLesson:{...lesson,quiz:{...lesson.quiz,solution:{
      correctOption:"B",correctLabel:"대출 금리 하락 가능",
      explanation:"금리 인하 시 대출 이자 부담이 낮아질 수 있습니다."
    }}}});
  assert.match(after,/미응답자도 정답 확인/);
  assert.match(after,/정답: 대출 금리 하락 가능/);
  assert.match(after,/금리 인하 시 대출 이자 부담이 낮아질 수 있습니다/);
  assert.doesNotMatch(after,/<form id="beginner-quiz-form"/);
});
