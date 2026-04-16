# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-04-16

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
