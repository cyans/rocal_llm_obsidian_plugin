# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-04-17

### Fixed (Qwen 3.6 업그레이드 후 tool 호출 즉시 실패 수정)

- **`src/agent/AgentController.ts` `safeParseJSON` 타입 가드 추가**
  - Qwen 3.6이 일부 응답에서 `tool_calls[].function.arguments`를 이미 파싱된 **객체**로 반환하는 회귀 대응.
  - 기존 로직은 `JSON.parse(object)` → `"[object Object]"` 파싱 실패 → `{ raw: "[object Object]" }` 폴백으로 전달되어 도구가 빈 인자로 호출되고 즉시 실패하던 문제 해결.
  - `typeof str !== 'string'`이면 입력을 그대로 반환하는 가드 한 줄. 문자열 경로는 기존 `JSON.parse` 동작 유지.
- **도구 인자 진단 로그 2곳 추가** (`AgentController.ts`)
  - `[Agent] tool_call arguments type:` — native `tool_calls` 응답의 arguments 타입/값을 런타임 확인.
  - `[Agent] executing tool:` — 도구 실행 직전 최종 args(JSON)를 확인.
- **회귀 테스트 3개 추가** (`__tests__/unit/agent/AgentController.test.ts`)
  - (a) string JSON argument 경로 / (b) object argument 경로(Qwen 3.6 시뮬레이션) / (c) 비JSON string → `{ raw }` 폴백 경로 각각 검증.
  - 결과: 29 passed / 0 failed, `tsc --noEmit` 무오류, esbuild 번들 성공.

### Changed (채팅 답변 UI 줄간격 최적화)

- **1차 튜닝** (`src/styles.css`, `src/ui/ChatView.ts`):
  - `.message-content`의 `white-space: pre-wrap` → `normal` — 마크다운이 생성한 블록 사이의 원본 줄바꿈이 가시적 공백으로 노출되던 문제 제거.
  - 문단 여백 `margin-bottom: 0.28em` → `0.2em`, `line-height: 1.5` → `1.4`.
  - `p:empty { display: none }` 안전망 + `h1~h6` 커스텀 여백 + 리스트/항목 간격 축소 추가.
  - `sanitizeDisplayContent`에 NBSP 정리(`\u00A0` → space) 및 공백만 있는 라인 제거 2줄 추가.
- **2차 튜닝 (ChatGPT/Copilot 수준 타이트니스)**:
  - `line-height: 1.4` → `1.35` 전역 통일.
  - 문단 여백 `0 !important` + `p + p { margin-top: 0.5em !important }` combinator로 재구성 — 첫 문단 위/마지막 문단 아래 덤 여백을 원천 차단.
  - 헤딩 `:first-child { margin-top: 0 }`으로 메시지 최상단 헤딩 공백 해소.
  - `li > p { margin: 0 }`으로 Obsidian이 리스트 항목 내부에 중첩 생성하는 `<p>` 여백 방지.
  - `p + ul / p + ol / ul + p / ol + p` 전환 간격 `0.35em`으로 균일화.

### Other (이번 커밋에 함께 포함된 보류 작업)

- **채팅 액션 영역 재설계** (`src/ui/ChatView.ts`, `src/agent/PromptBuilder.ts`): 초기화/디버그 버튼 → 단일 "더보기" 메뉴 + 디버그 인디케이터 배지로 전환, placeholder·rows 조정.
- **파일 수정/추가 도구 자동 승인 모드** (`src/agent/ToolRegistry.ts`): 설정에서 `autoApplyFileChanges` 즉시 반영을 위한 `setAutoApplyFileChanges` 추가.
- **`versions.json`**에 `0.2.2: 1.5.0` 엔트리 등록.

---

## [Unreleased - 이전] - 2026-04-16

### Fixed (외부 접속 빈 응답 / ECONNRESET 완전 수정 — v0.2.2 → v0.2.4)

- **외부 DDNS 접속 시 `LLM returned empty body despite status 200` 근본 원인 수정**
  - **진짜 원인** (`proxy/Caddyfile`): site block이 `localhost:8443`만 등록되어 있어 외부에서 `eeum.iptime.org:8443` Host 헤더로 접속 시 매칭 실패. Caddy가 디폴트 핸들러로 빠져 빈 200 응답을 반환했음.
  - **수정**: `localhost:8443` → `localhost:8443, eeum.iptime.org:8443`로 두 호스트명 명시 등록.
  - **검증 방법**: 응답 헤더에 `via: 1.1 Caddy` 존재 = reverse_proxy 실행됨. 부재 = site block 매칭 실패.
  - **시도했지만 효과 없던 가설들** (Caddy 사이드):
    - `flush_interval -1` 추가 (SSE/장시간 응답 버퍼링 방지) — 영향 없었음
    - `transport http` 타임아웃 600s로 확장 — 영향 없었음
    - `keepalive 60s`, `keepalive_idle_conns 10` — 영향 없었음
    - `health_uri /v1/models`, `health_interval 30s` — 헬스체크는 동작했으나 라우팅 자체가 안되어 무의미
  - **부수적 클라이언트 보강** (`src/llm/LLMService.ts`):
    - `body`를 `Buffer`로 사전 변환하여 정확한 `Content-Length` 명시 (chunked transfer 회피)
    - `Connection: close` 헤더 추가 + `agent: false` 설정으로 Node.js globalAgent 풀링 비활성화
    - **이유**: NAT idle timeout으로 RST된 keepalive 소켓 재사용 시 발생한 ECONNRESET 방지
    - 소켓 레벨 진단 로그 추가 (`socket connect`, `secureConnect`, `close hadError`, `request body written`, `request end()`) — 디버깅 자산으로 보존
  - **버전 표기**: `manifest.json` / `package.json` `0.2.1` → `0.2.4`

### Fixed (이전 단계 — Caddy TLS `internal_error` (alert 80) 완전 수정)
- **Caddy TLS `internal_error` (alert 80) 완전 수정**: Windows 등 외부 기기에서 HTTPS 접속 시 `TLSV1_ALERT_INTERNAL_ERROR` 오류 해결
  - **원인 1** (`proxy/Caddyfile`): `:8443` → `localhost:8443` 변경. 호스트 없이 `:포트`만 지정하면 Caddy가 TLS 인증서를 자동 발급하지 않아 모든 연결에 `internal_error` 반환하던 문제 수정
  - **원인 2** (`proxy/Caddyfile`): `health_uri /` → `health_uri /v1/models` 변경. vLLM 서버가 `/` 경로에 404 반환 → Caddy가 백엔드 비정상 판단 → 모든 요청에 503 반환하던 문제 수정
  - **원인 3** (`src/llm/LLMService.ts`): `minVersion: 'TLSv1.2'` / `maxVersion: 'TLSv1.2'` 제거. TLS 버전 제한이 Caddy/Go TLS와 충돌. 자연 협상에 맡기도록 변경
  - **원인 4** (`src/llm/LLMService.ts`): IP 주소로 접속 시 SNI를 `'localhost'`로 오버라이드 추가. Caddy `tls internal` 인증서가 `localhost` 기준으로 발급되므로 IP 접속 시 SNI 불일치 방지
  - **원인 5** (`src/main.ts`): `allowInsecureTls` 활성 시 `NODE_TLS_REJECT_UNAUTHORIZED=0` 전역 설정 추가. Node.js TLS 레이어에서도 인증서 검증 비활성화

### Added
- **로컬 URL 오버라이드 기능**: 기기별 독립 API URL 설정 지원
  - `LOCAL_URL_STORAGE_KEY` 상수 추가 (`vault-agent-local-url`)
  - `effectiveApiUrl` getter: localStorage 오버라이드 우선, 없으면 설정 URL 사용
  - Obsidian Sync에서 제외되는 localStorage 기반 저장으로 기기별 독립 설정
  - 설정 UI에 "Local Override (This Device Only)" 섹션 추가
- **Caddy HTTPS 역방향 프록시 설정** (`proxy/` 디렉토리)
  - `Caddyfile`: API 키 인증 + 자가 서명 인증서 지원
  - `setup.sh`: 자동 설치 스크립트 (Caddy 설치, LaunchAgent 등록)
  - `com.qwen-proxy.plist`: macOS 부팅 시 자동 시작용 LaunchAgent
  - `README.md`: 외부 접근 설정 가이드
- **TLS 검증 우회 (`Allow Insecure TLS`)**: 자가 서명 인증서 환경 지원
  - iPhone, Windows 등 CA 미설치 기기에서 HTTPS 연결 가능
  - Node.js `https` 모듈 기반 `fetchInsecure()` 구현
  - `doFetch()` 헬퍼로 모든 외부 요청 일원화

### Changed
- **`LLMService`**: 모든 API 요청이 `effectiveApiUrl`을 통해 localhost 오버라이드 지원
- **`proxy/Caddyfile`**: 백엔드 포트 11434 → 8001로 수정 (vLLM 서버 포트)
- **`proxy/README.md`**: 포트 번호 및 아키텍처 설명 업데이트

### Fixed
- **`Caddyfile` 문법 오류**: `respond` 블록 내 `header` 서브디렉티브 위치 수정
  - `respond` 블록 밖으로 `header Content-Type application/json` 이동

## [0.2.1] - 2026-03-06

### Changed
- GitHub/BRAT beta distribution metadata 정리
- 저장소 URL과 배포 문서 정합성 수정
- 버전 매핑 파일(`versions.json`) 추가
- 선택된 노트의 키워드 기재 요청을 전용 안정 경로로 처리하도록 개선
- 파일 수정 도구의 기본 백업 생성 동작을 비활성화

### Fixed
- 빈 최종 응답 또는 raw tool-call 출력이 사용자 화면에 노출되던 문제 완화
- 선택된 파일이 있을 때 새 파일 생성보다 기존 파일 수정 흐름을 우선하도록 유도 강화
- 한글 IME 입력 후 Enter 전송 시 마지막 글자가 입력창에 남던 문제 수정
- 불완전한 `<tool_call>` 응답이 오면 한 번 더 재시도하도록 보완
- 키워드 태그 추출 후 `#\`.` 같은 잘못된 태그가 저장되던 문제 수정

## [0.2.0] - 2026-03-06

### Added
- **VaultReadContentsTool**: 볼트 내 여러 파일 내용을 읽는 도구
  - `file_paths`: 읽을 파일 경로 배열
  - `max_chars_per_file`: 파일당 최대 문자 수 (0-50000)
  - 파일별 단어 수, 문자 수, 잘림 상태 메타데이터 제공
  - 누락된 파일에 대한 오류 처리 및 계속 진행

- **VaultSummarizeTool**: LLM 기반 볼트 파일 요약 도구
  - `inputs`: 요약할 파일 배열 (file_path, content)
  - `style`: 요약 스타일 (bullets, paragraph, outline)
  - `max_output_tokens`: 최대 출력 토큰 수
  - `combine`: 여러 파일 통합 요약 여부
  - 핵심 포인트 자동 추출 (불렛/숫자 형식)
  - 대형 콘텐츠 청킹 처리 (20,000자 단위)
  - 청크별 요약 후 병합 기능

- **설정 UI**: 새로운 도구 토글 추가
  - Vault Read Contents 토글
  - Vault Summarize 토글

### Changed
- **ToolRegistry**: `registerAllTools` 메서드에 `llmService` 선택적 매개변수 추가
- **main.ts**: `registerAllTools` 호출 시 `llmService` 전달
- **types.ts**: `vaultReadContents`, `vaultSummarize` 도구 설정 추가
- **settings.ts**: 새로운 도구 설정 UI 추가

### Fixed
- **VaultSummarizeTool**: `trim is not defined` 버그 수정 (line 168)
- **테스트**: 문자 수/단어 수 기대값 수정

### Test Coverage
- VaultReadContentsTool: 7개 테스트 통과
- VaultSummarizeTool: 8개 테스트 통과
- 전체 테스트: 227개 통과

## [0.1.1] - 2026-03-06

### Fixed
- 채팅 메시지 줄 간격 조정 (line-height: 1.6 → 1.3)
  - `.message-content` 스타일 최적화
  - `.message-bubble` 스타일 최적화
  - 가독성 개선

### Changed
- `styles.css` line 60: `.message-content` line-height 수정
- `styles.css` line 151: `.message-bubble` line-height 수정
- `src/styles.css` line 201: `.message-bubble` line-height 수정

## [0.1.0] - 2026-03-05

### Added
- 초기 릴리스
- ReAct 에이전트 기반 AI 어시스턴트
- 볼트 검색 기능 (키워드 + TF-IDF)
- 웹 검색 통합 (SearXNG, Brave Search)
- 파일 생성/수정 도구
- YouTube 자막 추출
- 채팅 UI (ChatView, MessageRenderer)
- LLM 서버 연결 (Ollama, vLLM, LM Studio)
