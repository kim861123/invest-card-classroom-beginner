import fs from "node:fs";
import path from "node:path";

/**
 * Render Free는 파일시스템이 휘발되므로 Supabase PostgREST의 JSONB 단일 행에
 * 게임 상태를 저장합니다. 업데이트 시 version 조건을 검사해 동시 쓰기를 탐지합니다.
 * 민감한 서비스 키는 서버 환경변수로만 읽으며 공개 파일에 노출하지 않습니다.
 */
export function makeStorage({ backend = "local", directory = "runtime", env = process.env }) {
  if (backend === "local") return localStorage(directory);
  if (backend !== "supabase") throw new Error("STORAGE_BACKEND는 local 또는 supabase만 가능합니다.");

  const rawUrl = env.SUPABASE_URL || "";
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!rawUrl || !key) {
    throw new Error("Supabase 모드에는 SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.");
  }
  const base = new URL(rawUrl);
  const isLoopback = ["127.0.0.1", "localhost"].includes(base.hostname);
  if (base.protocol !== "https:" && !(isLoopback && base.protocol === "http:")) {
    throw new Error("Supabase URL은 HTTPS 주소여야 합니다.");
  }
  const endpoint = new URL("/rest/v1/classroom_beginner_state", base);
  const request = async (method, query = "", payload = undefined, prefer = "") => {
    const url = endpoint.toString() + query;
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          apikey: key,
          ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {})
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      throw new Error(`Supabase 연결 실패: ${e.message}`);
    }
    const result = await response.text();
    if (!response.ok) {
      let detail = result.slice(0, 350);
      try {
        const parsed = JSON.parse(result);
        detail = String(parsed.message || parsed.hint || parsed.code || detail).slice(0, 350);
      } catch {}
      throw new Error(`Supabase 요청 실패 (HTTP ${response.status}): ${detail}. supabase/schema.sql 실행 여부와 키를 확인하세요.`);
    }
    return result ? JSON.parse(result) : null;
  };
  async function reload() {
    const rows = await request("GET", "?id=eq.beginner-main&select=id,version,snapshot");
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Supabase에 게임 상태가 없습니다.");
    const snapshot = rows[0].snapshot;
    if (!snapshot || !Number.isInteger(snapshot.version) || rows[0].version !== snapshot.version) {
      throw new Error("Supabase 상태 버전 불일치: 데이터를 검사해 주세요.");
    }
    return snapshot;
  }
  return {
    kind: "supabase",
    async initialize(createState) {
      const rows = await request("GET", "?id=eq.beginner-main&select=id");
      if (!rows?.length) {
        const fresh = createState();
        await request("POST", "?on_conflict=id",
          [{ id: "beginner-main", version: fresh.version, snapshot: fresh }],
          "resolution=ignore-duplicates,return=minimal");
      }
      return reload();
    },
    async persist(snapshot, expectedVersion) {
      const rows = await request("PATCH",
        `?id=eq.beginner-main&version=eq.${expectedVersion}&select=version`,
        { version: snapshot.version, snapshot, updated_at: new Date().toISOString() },
        "return=representation");
      if (!Array.isArray(rows) || rows.length !== 1) {
        const e = new Error("다른 서버가 먼저 게임 데이터를 수정했습니다. 화면을 새로고침한 뒤 다시 시도하세요.");
        e.code = "CONCURRENT_UPDATE";
        e.status = 409;
        throw e;
      }
    },
    reload
  };
}

function localStorage(directory) {
  const file = path.join(directory, "game-state.json");
  return {
    kind: "local",
    async initialize(createState) {
      fs.mkdirSync(directory, { recursive: true });
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
      const snapshot = createState();
      const temp = file + "." + process.pid + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 });
      fs.renameSync(temp, file);
      return snapshot;
    },
    async persist(snapshot) {
      const temp = file + "." + process.pid + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 });
      fs.renameSync(temp, file);
    },
    async reload() { return JSON.parse(fs.readFileSync(file, "utf8")); }
  };
}
