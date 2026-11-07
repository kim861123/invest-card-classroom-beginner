# INVEST PLAY EASY — 완전 초급 투자 카드 교환게임

**기존 고급판(V8)과 독립적인 별도 웹앱입니다.** 기존 운영 사이트나 기존 Supabase 게임 상태를 덮어쓰지 않습니다.

## 누구에게 맞나요?
경제뉴스, 금리, 수익률이라는 단어가 낯선 성인 수강생이나 재무강의 첫 참여자.

## 초급판의 규칙
- **2020~2023년 4개 연도, 8개 뉴스 단계(연도별 2단계)**. 각 단계에서 해당 연도의 실제 사건 뉴스 2건 제공
- **11개 산업 카드, 팀당 110장**(산업별 10장)으로 모든 팀이 같은 포트폴리오에서 출발
- 시작 금액 **1,100,000원/팀**, 카드 한 장 초기 가격 10,000원
- **카드 ↔ 카드 교환**, 현금 매매나 차입·공매도 없음
- **뉴스 75초 + 교환 90초 × 8단계 = 기본 22분**. 발표·수업 설명 시간을 포함하면 약 35~45분 수업용
- 뉴스는 **한 줄 요약 → 어려운 말 풀이 → 생각해 보기** 순서. 기사 전문 설명은 펼쳐서 확인
- 카드 이미지를 눌러 원본 상세 보기, 보유 카드에서 교환 제안, 순위·거래 기록·턴별 성과 확인
- 뉴스 발표 시 강사는 원본 해설 확인, 학생 API에는 강사용 해설 미전송

## 실행
Node.js 20+ 설치 후:

```sh
cp .env.example .env
# .env 안에 TEACHER_PASSWORD를 12자 이상으로 설정
npm start
```

Windows에서는 `.env.example` 파일을 복사하여 이름을 `.env`로 바꾸고 텍스트 편집기로 강사 비밀번호를 입력합니다.

- 강사: http://localhost:3000/teacher
- 학생: http://localhost:3000/join
- 서버 상태: http://localhost:3000/api/health
- 검사: `npm test`

## 무료 인터넷 배포
[초급판 전용 한국어 배포 안내서](배포_안내서_초급판_KR.md)를 먼저 읽어주세요.

**매우 중요:** 기존 `classtoom-invest-game` GitHub 저장소에 이 입문편을 덮어쓰지 마세요.
새 GitHub 저장소와 **별도의 Render Web Service**를 생성하는 것이 안전합니다.

같은 Supabase 프로젝트를 사용해도 DB 테이블은 `public.classroom_beginner_state`로 분리되고,
저장 행 키는 `beginner-main`이라 고급판 게임 결과에 영향을 주지 않습니다.
단, Supabase SQL Editor에서 `supabase/schema.sql`을 별도로 실행해야 합니다.

## 데이터 안내
- 실제 사건·원문 출처: `data/historical_news_2019_2026.json` 중 초급판은 2020~2023년 16건만 서버에서 공개
- 단계별 가격: `data/sector_game_stage_returns_2019_2026.json`의 **교육용 모델**
- **개별 뉴스 직후 실측 수익률이 아닙니다.** 연간 산업 ETF 성과를 단계별로 배분한 게임용 가격입니다.
- 뉴스 발생 후 실제 자산 가격은 다양한 요인이 동시에 영향을 주므로 특정 한 뉴스의 인과적 수익률을 보장하지 않습니다.

## 프로젝트 파일
`server.mjs`: 게임 상태·역사 뉴스 공개·거래 검증 / `storage.mjs`: 별도 Supabase 저장소 /
`public/app.js`: 초급 안내·뉴스·카드 UI / `public/style.css`: 반응형 스타일 /
`supabase/schema.sql`: 초급 전용 DB 테이블 / `render.yaml`: 새 무료 Render 서비스 설정 /
`tests/beginner.test.mjs`: 8단계 전체 진행과 권한/초기화 테스트.

## 주의
실제 다수 기기 동시 접속, Render 휴면에서 깨어나는 지연, 휴대전화별 브라우저 UI는 배포 후 별도로 확인해야 합니다.
비밀번호와 Supabase 비밀 키를 GitHub에 올리지 마세요.


## 최신 UX 개선 버전
EASY V3.1 · classroom-beginner-v3.1-lesson-presentation
자세한 배포 및 변경 내용은 `UPGRADE_EASY_V3_1_KR.md` 참고.
