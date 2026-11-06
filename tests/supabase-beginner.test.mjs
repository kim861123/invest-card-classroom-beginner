import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { makeStorage } from "../storage.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function listen(server) {
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}
function close(server) { return new Promise(resolve => server.close(resolve)); }

test("Supabase 시뮬레이션: 무료 모드 DB 영구 저장, 새 비밀 키, 재시작 복원, 버전 충돌 탐지", async () => {
  let row = null, writes = 0, authRequests = 0, rejectWrites = false, conflictNextWrite = false;
  const dbServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (req.headers.apikey !== "sb_secret_test_for_server_only" || req.headers.authorization) {
      res.writeHead(401);return res.end(JSON.stringify({message:"wrong secret auth header"}));
    }
    authRequests++;
    if (url.pathname !== "/rest/v1/classroom_beginner_state") {
      res.writeHead(404);return res.end("{}");
    }
    if (req.method === "GET") {
      const result = row ? [{id:row.id,version:row.version,...(url.searchParams.get("select") === "id" ? {} : {snapshot:row.snapshot})}] : [];
      return res.end(JSON.stringify(result));
    }
    if (req.method === "POST") {
      if (!row) row = body[0];
      res.writeHead(201);return res.end("");
    }
    if (req.method === "PATCH") {
      if (rejectWrites) {res.writeHead(503);return res.end(JSON.stringify({message:"maintenance"}));}
      const expected = Number(url.searchParams.get("version")?.replace("eq.",""));
      if (conflictNextWrite) {
        conflictNextWrite = false;
        row = {...row,version:row.version+1,snapshot:{...row.snapshot,version:row.version+1}};
        return res.end("[]"); // 다른 프로세스가 먼저 저장한 상황을 시뮬레이션
      }
      if (!row || row.version !== expected) return res.end("[]");
      row = {...row,...body};
      writes++;
      return res.end(JSON.stringify([{version:row.version}]));
    }
    res.writeHead(405);res.end("{}");
  });
  const dbPort = await listen(dbServer);
  const gamePort = 42500 + Math.floor(Math.random()*18000);
  const gameUrl = `http://127.0.0.1:${gamePort}`;
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "invest-supabase-test-"));
  let child = null, err = "";
  async function launch() {
    child = spawn(process.execPath, ["server.mjs"], {
      cwd,
      env:{...process.env,
        TEACHER_PASSWORD:"TeacherSupabaseTest!2026",
        HOST:"127.0.0.1",PORT:String(gamePort),DATA_DIR:dataDir,
        STORAGE_BACKEND:"supabase",
        SUPABASE_URL:`http://127.0.0.1:${dbPort}`,
        SUPABASE_SECRET_KEY:"sb_secret_test_for_server_only"
      },
      stdio:["ignore","ignore","pipe"]
    });
    child.stderr.on("data", x => {err += x.toString();});
    for(let i=0;i<140;i++) {
      if (child.exitCode!==null) throw new Error("server exited: "+err);
      try { const r = await fetch(gameUrl+"/api/health"); if(r.ok)return; }catch {}
      await delay(50);
    }
    throw new Error("server could not launch: "+err);
  }
  async function halt() {
    if (!child || child.exitCode!==null) return;
    const current = child;
    const done = new Promise(resolve => current.once("exit", resolve));
    current.kill("SIGTERM");
    await Promise.race([done,delay(1500)]);
    if (current.exitCode===null)current.kill("SIGKILL");
  }
  async function request(url, payload, cookie) {
    const res = await fetch(gameUrl+url, {
      method:payload===undefined?"GET":"POST",
      headers: {...(cookie?{Cookie:cookie}:{}),...(payload===undefined?{}:{"content-type":"application/json"})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
    const data = await res.json();
    return {status:res.status,data,cookie:res.headers.get("set-cookie")?.split(";")[0]};
  }
  try {
    assert.throws(()=>makeStorage({backend:"supabase",env:{SUPABASE_URL:"https://example.supabase.co"}}), /SUPABASE_SECRET_KEY/);
    await launch();
    const login=await request("/api/login",{password:"TeacherSupabaseTest!2026"});
    assert.equal(login.status,200,JSON.stringify(login.data));
    assert.ok(login.cookie);
    const teacher=await request("/api/state",undefined,login.cookie);
    assert.equal(teacher.data.role,"teacher");
    const pin=teacher.data.room.pin;
    const a=await request("/api/join",{pin,name:"첫팀",members:["A"]});
    const b=await request("/api/join",{pin,name:"둘팀",members:["B"]});
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    assert.equal((await request("/api/team",{action:"draw",mode:"even"},a.cookie)).status,200);
    assert.equal((await request("/api/team",{action:"draw",mode:"even"},b.cookie)).status,200);
    assert.ok(writes >= 3);
    assert.ok(authRequests >= 4);
    assert.equal(existsSync(path.join(dataDir,"game-state.json")),false,"Supabase 모드에서는 로컬 저장 파일 사용 금지");
    await halt(); await launch();
    assert.equal((await request("/api/state",undefined,login.cookie)).data.role,"teacher");
    const afterRestart=await request("/api/state",undefined,a.cookie);
    assert.equal(afterRestart.data.role,"team");
    assert.equal(afterRestart.data.room.teamCount,2);
    const beforeVersion = afterRestart.data.version;

    // 다른 서버가 DB 버전을 먼저 변경한 상황을 흉내냅니다.
    row = {...row,version:row.version+1,snapshot:{...row.snapshot,version:row.version+1}};
    const stale=await request("/api/teacher",{action:"config",newsSeconds:45,tradeSeconds:91},login.cookie);
    assert.equal(stale.status,409,JSON.stringify(stale.data));
    const refreshed=await request("/api/state",undefined,login.cookie);
    assert.equal(refreshed.data.version,beforeVersion+1);
    const retry=await request("/api/teacher",{action:"config",newsSeconds:45,tradeSeconds:92},login.cookie);
    assert.equal(retry.status,200,JSON.stringify(retry.data));
    assert.equal(row.snapshot.config.tradeSeconds,92);
    assert.equal(row.snapshot.version,row.version);
    // 외부 DB 연결 실패 시 학생/강사 데이터를 메모리에서 확정하지 않아야 합니다.
    rejectWrites = true;
    const refused = await request("/api/teacher",{action:"config",newsSeconds:45,tradeSeconds:93},login.cookie);
    assert.equal(refused.status,503);
    const unchanged = await request("/api/state",undefined,login.cookie);
    assert.equal(unchanged.data.room.config.tradeSeconds,92);
    rejectWrites = false;
    assert.equal((await request("/api/teacher",{action:"config",newsSeconds:45,tradeSeconds:94},login.cookie)).status,200);
    assert.equal(row.snapshot.config.tradeSeconds,94);

    // Regression: a reset must preserve the optimistic-lock version and clear game
    // data without losing the teacher session, even after many prior DB writes.
    const enteredGame=await request("/api/teacher",{action:"start"},login.cookie);
    assert.equal(enteredGame.status,200);
    assert.equal(enteredGame.data.room.phase,"news");
    const versionBeforeReset=row.version;
    const wrongConfirmation=await request("/api/teacher",{action:"reset",confirm:"무효"},login.cookie);
    assert.equal(wrongConfirmation.status,400);
    assert.equal(row.snapshot.participants.length,2);
    conflictNextWrite=true;
    const reset=await request("/api/teacher",{action:"reset",confirm:"초기화"},login.cookie);
    assert.equal(reset.status,200,JSON.stringify(reset.data));
    assert.equal(reset.data.role,"teacher");
    assert.equal(reset.data.room.phase,"lobby");
    assert.equal(reset.data.room.year,2020);
    assert.equal(reset.data.room.teamCount,0);
    assert.equal(reset.data.scores.length,0);
    assert.equal(row.version,versionBeforeReset+2,"동시 저장 1회 후 정상 초기화 1회");
    assert.equal(row.snapshot.version,row.version);
    assert.equal(row.snapshot.participants.length,0);
    assert.equal(row.snapshot.completedTrades.length,0);
    assert.equal(row.snapshot.results.length,0);
    assert.equal((await request("/api/state",undefined,a.cookie)).data.role,"guest",
      "초기화 후 이전 학생 세션은 입장할 수 없어야 합니다.");
    assert.equal((await request("/api/state",undefined,login.cookie)).data.role,"teacher");

    // A second reset must not reintroduce the stale-version bug.
    const resetAgain=await request("/api/teacher",{action:"reset",confirm:"RESET"},login.cookie);
    assert.equal(resetAgain.status,200,JSON.stringify(resetAgain.data));
    assert.equal(row.version,versionBeforeReset+3);
    assert.ok(row.snapshot.lastResetAt);
    assert.equal(row.snapshot.prices["1"],10000);
    assert.equal(row.snapshot.phase,"lobby");
  } finally {
    await halt();
    await close(dbServer);
    rmSync(dataDir,{recursive:true,force:true});
  }
});
