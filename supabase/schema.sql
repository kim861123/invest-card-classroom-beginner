-- Supabase SQL Editor에서 한 번 실행합니다.
-- 한 게임방의 현재 상태를 한 JSONB 문서에 저장하고 버전 조건으로 충돌을 감지합니다.
-- 서비스 비밀 키는 Render의 비밀 환경변수에만 저장하세요.

create table if not exists public.classroom_beginner_state (
  id text primary key constraint classroom_beginner_one_room check (id = 'beginner-main'),
  version bigint not null check (version >= 1),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.classroom_beginner_state enable row level security;

-- 참가자 브라우저가 Supabase에 직접 읽기/쓰기 하지 못하도록 차단합니다.
revoke all privileges on public.classroom_beginner_state from anon, authenticated;
grant select, insert, update on public.classroom_beginner_state to service_role;

-- 정책을 생성하지 않습니다. RLS를 우회할 수 있는 서버 전용 비밀 키만 접근합니다.
-- 기존에 같은 이름으로 만든 정책이 있다면 관리자 계정으로 확인하세요.
-- 다음 구문은 기존 실습 정책이 남아 있는지 점검할 때만 사용하세요.
-- select * from pg_policies where schemaname='public' and tablename='classroom_beginner_state';
