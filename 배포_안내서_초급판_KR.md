# INVEST PLAY EASY · 왕초보판 인터넷 배포 안내서

## 먼저 알아둘 점
기존 고급판 `https://invest-card-classroom-free.onrender.com/`은 그대로 두고,
**다른 주소의 입문용 게임**을 개설하는 방법입니다.

기존 게임이 저장된 Supabase 프로젝트를 그대로 사용해도 좋지만,
새 테이블 `classroom_beginner_state`를 생성해야 합니다.
**기존 `classroom_game_state` 테이블을 지우거나 초기화하지 마세요.**

## 1. ZIP 압축 해제
`invest-card-classroom-beginner` 폴더를 열어 내부의 `package.json`, `render.yaml`,
`public/`, `supabase/`, `data/`, `server.mjs`, `storage.mjs` 등이 보이는지 확인합니다.
압축파일 자체를 GitHub에 올리지 않습니다.

## 2. Supabase에 입문편 테이블 만들기
1. https://supabase.com/dashboard 접속
2. 기존 Supabase 프로젝트 선택
3. 좌측 **SQL Editor → New query**
4. 새 ZIP에 포함된 **`supabase/schema.sql` 파일의 전체 내용을 복사·붙여넣기**
5. **Run** 실행
6. 왼쪽 Table Editor에서 `classroom_beginner_state` 확인

주의: 기존 고급판의 `classroom_game_state`는 그대로 둡니다.
Supabase 프로젝트의 URL과 Secret key는 Render 설정 때 필요하지만,
**비밀 키를 이 채팅이나 GitHub 파일에 적지 마세요.**

## 3. 새 GitHub 저장소 만들기
1. https://github.com/new 에서 `invest-card-classroom-beginner`라는 새 **Private** 저장소 생성
2. 압축 해제한 `invest-card-classroom-beginner` **폴더 안의 파일·하위폴더**를 저장소 루트에 업로드
3. `package.json`과 `render.yaml`이 GitHub 첫 화면에 바로 보여야 합니다.
4. `.env` 파일(비밀번호·비밀 키)을 절대 올리지 마세요.

**기존 `classtoom-invest-game` 저장소에 덮어쓰지 않습니다.**

## 4. Render 무료 서비스 만들기
1. https://dashboard.render.com 접속 → `New → Blueprint`
2. 새 GitHub 저장소 `invest-card-classroom-beginner` 연결
3. Blueprint가 읽는 `render.yaml`의 서비스 이름은 `invest-card-classroom-beginner`
4. Free 플랜 선택 가능한지 확인하고, 결제정보·리소스 한도 표시를 먼저 확인합니다.
5. 다음 환경변수를 설정합니다:
   - `TEACHER_PASSWORD`: 직접 정한 12자 이상 비밀번호
   - `SUPABASE_URL`: Supabase Project URL
   - `SUPABASE_SECRET_KEY`: Supabase 서버 전용 Secret key
   - `STORAGE_BACKEND`: `supabase` (`render.yaml`에 기본 설정)
   - `SECURE_COOKIES`: `true` (`render.yaml`에 기본 설정)
6. 배포 성공(`Live`) 후 새 `.onrender.com` 주소를 확인합니다.

Render 서비스가 여러 개일 때 무료 사용량 한도·휴면 동작이 발생할 수 있습니다.
무료 계정 조건에서 추가 서비스 생성이 불가능하면 **기존 서비스에 덮어쓰지 말고** 로컬 실행 또는 대체 호스팅을 검토하세요.

## 5. 테스트
- 새 입문편 주소 `/api/health`에서 `build`가
  `classroom-beginner-v1-2020-2023`인지 확인
- `/teacher`에서 강사 로그인, `/join`에서 스마트폰 학생팀 2개 등록
- 각 팀에서 **공평하게 110장 받기**를 눌러 배분
- 강사가 게임 시작 → 2020년 뉴스 2건 공개 → 카드 교환 → 가격 발표
- 초급 뉴스에 쉬운 한 줄 요약·용어 풀이가 보이는지 확인
- 강사용 비공개 해설은 학생 화면에서 안 보여야 함
- 8단계 종료 후 팀별 최종 성과 확인
- 수업 전 강사용 **전체 초기화**로 테스트 팀 삭제

## 6. 업데이트
새 입문편 GitHub 저장소를 수정하고 Commit/Push한 뒤 Render에서 Auto Deploy를 `On Commit`으로 설정했다면 자동 반영됩니다.
기존 고급판 저장소 및 Render 서비스에는 영향이 없습니다.

## 수업 진행 예시
- 5분: 게임 규칙, 산업 카드 읽기
- 3분: QR 입장·두 팀 이상 등록·공평하게 110장 받기
- 22분: 8개 뉴스 단계 진행(75초 뉴스 + 90초 교환)
- 10분: 중간 해설·최종 순위·거래 성과 토론
→ 약 40분(교사 설명과 수업 상황에 따라 달라짐)

## 오류 대처
- **서버에 접속되지 않음**: Render가 Free 휴면 상태인지, Deploy 로그에서 Live인지 확인
- **Supabase 상태 없음**: `supabase/schema.sql` 실행 여부 및 Secret key 확인
- **입장 PIN 오류**: 강사용 화면에 있는 최신 PIN 확인
- **학생이 재접속 시 등록 안 됨**: 동일 브라우저의 쿠키가 살아 있는지 확인
- **카드가 SVG로 보임**: `public/app.js`의 `cardPath`가 `.png`인지, GitHub 이미지 파일이 루트의 `public/cards`에 있는지 확인
- **입문판인데 고급판 게임이 나옴**: 기존 GitHub 저장소나 기존 Render 서비스를 연결한 것은 아닌지 확인

---
교육용 가상 가격은 특정 뉴스 직후 실제 가격과 동일하지 않습니다. 투자 권유용이 아닌 수업용 시뮬레이션입니다.
