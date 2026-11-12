
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const js=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
const server=fs.readFileSync(path.join(root,"server.mjs"),"utf8");
function waveFile(name){
  const bytes=fs.readFileSync(path.join(root,"public/audio",name));
  assert.equal(bytes.toString("ascii",0,4),"RIFF");
  assert.equal(bytes.toString("ascii",8,12),"WAVE");
  assert.ok(bytes.length>1000);
}
test("휴대기기용 효과음·배경음 WAV가 실제로 존재하고 서버가 공개한다",()=>{
  waveFile("notify.wav");waveFile("ambient.wav");
  assert.match(server,/\/audio\/notify\.wav/);
  assert.match(server,/\/audio\/ambient\.wav/);
  assert.match(server,/audio\/wav/);
});
test("효과음 버튼에서 즉시 확인음을 재생하고 별도 재연결 버튼은 없다",()=>{
  assert.match(js,/if\(action==="toggle-timer-sound"\)[\s\S]*?testAudioByTap\(\)/);
  assert.doesNotMatch(js,/data-action="test-audio"/);
  assert.match(js,/data-action="toggle-ambient"/);
  assert.match(js,/function playNotificationSound/);
});
test("휴대기기 터치 시 오디오 시작과 시험 재생이 실행된다",()=>{
  let playCount=0, resumeCount=0;
  class FakeAudio {
    constructor(src){this.src=src;this.paused=true;this.currentTime=0;}
    pause(){this.paused=true;}
    play(){playCount+=1;this.paused=false;return Promise.resolve();}
  }
  class FakeCtx{
    constructor(){this.state="suspended";this.currentTime=0;this.destination={};}
    resume(){this.state="running";resumeCount++;return Promise.resolve();}
    createOscillator(){return {connect(){},start(){},stop(){}};}
    createGain(){return {gain:{value:0},connect(){}};}
  }
  const start=js.indexOf("// Mobile Safari/Android require media playback");
  const end=js.indexOf("function tickCountdown(){",start);
  assert.ok(start>=0&&end>start);
  const controller=js.slice(start,end);
  const sandbox={
    window:{AudioContext:FakeCtx},
    Audio:FakeAudio,
    document:{hidden:false,addEventListener(){},querySelector(){return null;},createElement(tag){assert.equal(tag,"audio");const el=new FakeAudio();el.style={};el.setAttribute=()=>{};return el;},body:{appendChild(){}}},
    audioContext:null,timerSoundEnabled:true,ambientEnabled:false,ambientTimer:null,
    ico(){return"";},toast(){},
    setInterval(){return 123;},clearInterval(){},
  };
  vm.runInNewContext(controller+';testAudioByTap();',sandbox);
  assert.equal(playCount,1);
  assert.equal(resumeCount,1);
  vm.runInNewContext('playTimerSound();',sandbox);
  assert.equal(playCount,2);
  vm.runInNewContext('setAmbient(true);',sandbox);
  assert.equal(playCount,3);
});
