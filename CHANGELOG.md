# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
