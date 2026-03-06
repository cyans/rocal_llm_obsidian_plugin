---
id: SPEC-PLUGIN-001
title: Obsidian Vault Agent Plugin
version: 1.0.0
status: Planned
created: 2026-03-05
updated: 2026-03-05
author: cyan91
priority: High
---

# SPEC-PLUGIN-001: Obsidian Vault Agent Plugin

## HISTORY

### 2026-03-05 - 초기 작성
- Obsidian Copilot Plus의 Agent Tools를 대체하는 오픈소스 플러그인 SPEC 작성
- Qwen 3.5 기반 ReAct 에이전트 아키텍처 정의
- 5가지 핵심 도구 요구사항 명시

---

## 1. ENVIRONMENT (환경)

### 1.1 기술 환경
- **런타임**: Obsidian Desktop App (Electron 기반)
- **언어**: TypeScript 5.0+
- **빌드 시스템**: esbuild
- **LLM 백엔드**: Qwen 3.5 (OpenAI-compatible API)
- **지원 플랫폼**: Windows, macOS, Linux (Desktop only)

### 1.2 통합 환경
- Obsidian Plugin API (obsidian.d.ts)
- Obsidian Vault 파일 시스템
- Obsidian MetadataCache
- 외부 HTTP API (Web Search, YouTube)

### 1.3 제약 사항
- Obsidian API 버전 >= 1.5.0
- 로컬 LLM 서버 필요 (Ollama / vLLM / LM Studio)
- 인터넷 연결 필수 (Web Search, YouTube Transcription)

---

## 2. ASSUMPTIONS (가정)

### 2.1 기술 가정
- Qwen 3.5가 OpenAI-compatible tool-calling을 지원함
- 로컬 LLM 서버가 http://localhost:11434/v1 엔드포인트 제공
- Obsidian Vault의 파일 수가 10,000개 이하임 (성능 기준)

### 2.2 사용자 가정
- 사용자가 로컬 LLM 서버 설정 방법을 숙지함
- 사용자가 Obsidian 플러그인 설치 방법을 이해함
- 사용자가 5가지 도구의 목적과 용도를 구분할 수 있음

### 2.3 데이터 가정
- 볼트 내 파일이 UTF-8 인코딩됨
- YouTube 동영상에 자막(수동 또는 자동 생성)이 존재함
- 웹 검색 API가 무료 티어 내에서 동작함

---

## 3. REQUIREMENTS (요구사항)

### 3.1 Ubiquitous Requirements (시스템 전체 적용)

**REQ-001**: 시스템은 **항상** 사용자의 개인정보를 보호해야 한다.
- 로컬 LLM 사용으로 데이터가 외부 전송되지 않음
- API 키 및 민감 정보를 안전하게 저장

**REQ-002**: 시스템은 **항상** Obsidian의 기본 기능과 충돌하지 않아야 한다.
- 플러그인 비활성화 시 모든 상태가 정리됨
- 다른 플러그인과의 호환성 유지

### 3.2 Event-Driven Requirements (이벤트 기반)

**REQ-003**: **WHEN** 사용자가 채팅 메시지를 입력하면 **THEN** 시스템은 LLM에 메시지를 전송하고 응답을 표시해야 한다.

**REQ-004**: **WHEN** LLM이 도구 호출을 요청하면 **THEN** 시스템은 해당 도구를 실행하고 결과를 LLM에 반환해야 한다.

**REQ-005**: **WHEN** 사용자가 파일 수정 도구(Write/Replace)를 승인하면 **THEN** 시스템은 변경 사항을 적용하고 백업을 생성해야 한다.

**REQ-006**: **WHEN** YouTube URL이 감지되면 **THEN** 시스템은 자막을 추출하여 컨텍스트로 제공해야 한다.

**REQ-007**: **WHEN** 웹 검색이 요청되면 **THEN** 시스템은 실시간 인터넷 정보를 검색해야 한다.

### 3.3 State-Driven Requirements (상태 기반)

**REQ-008**: **IF** 에이전트 모드가 활성화되어 있으면 **THEN** 시스템은 도구 호출을 자동으로 수행해야 한다.

**REQ-009**: **IF** 파일이 이미 존재하면 **THEN** 시스템은 덮어쓰기 전 사용자 확인을 요청해야 한다.

**REQ-010**: **IF** 도구 호출 횟수가 maxToolCalls에 도달하면 **THEN** 시스템은 추가 호출을 중단하고 사용자에게 알려야 한다.

**REQ-011**: **IF** LLM 서버 연결이 실패하면 **THEN** 시스템은 에러 메시지를 표시하고 재시도 옵션을 제공해야 한다.

### 3.4 Unwanted Behavior Requirements (금지 사항)

**REQ-012**: 시스템은 사용자 동의 없이 파일을 수정 **하지 않아야 한다**.

**REQ-013**: 시스템은 설정된 제외 폴더 내 파일을 검색 **하지 않아야 한다**.

**REQ-014**: 시스템은 민감한 정보(암호, 토큰)를 로그에 기록 **하지 않아야 한다**.

### 3.5 Optional Requirements (선택 사항)

**REQ-015**: **가능하면** 임베딩 기반 시맨틱 검색을 제공한다.
- 향후 업그레이드 경로 제공

**REQ-016**: **가능하면** 다국어 자막을 지원한다.
- 한국어 우선, 영어 fallback

---

## 4. SPECIFICATIONS (상세 명세)

### 4.1 Tool 1: Vault Search (볼트 검색)

**목적**: 사용자 질문과 관련된 볼트 내 노트를 검색

**파라미터**:
- `query` (string, required): 검색 쿼리
- `max_results` (number, optional): 최대 결과 수 (기본값: 5)

**구현 방식**:
1. 키워드 기반 MetadataCache 검색
2. 파일 내용 TF-IDF 스코어링
3. 관련도 순 상위 N개 결과 반환

**반환 형식**:
```json
{
  "results": [
    {
      "file_path": "path/to/note.md",
      "title": "Note Title",
      "snippet": "내용 일부...",
      "score": 0.85,
      "tags": ["#tag"],
      "last_modified": "2026-03-05"
    }
  ]
}
```

### 4.2 Tool 2: Web Search (웹 검색)

**목적**: 실시간 인터넷 정보 검색

**파라미터**:
- `query` (string, required): 검색 쿼리
- `num_results` (number, optional): 결과 수 (기본값: 5)

**지원 Provider**:
1. SearXNG (셀프호스팅, 권장)
2. Brave Search API (무료 티어)
3. DuckDuckGo Instant Answer
4. Tavily API (AI 특화)

**구현 방식**:
- `requestUrl()` 사용 (CORS 우회)
- 검색 결과 캐싱 (5분 TTL)

### 4.3 Tool 3: Write to File (파일 생성/전체 수정)

**목적**: 볼트 내 파일 생성 또는 전체 내용 교체

**파라미터**:
- `file_path` (string, required): 파일 경로
- `content` (string, required): 파일 내용 (Markdown)

**안전장치**:
- 덮어쓰기 전 사용자 확인 다이얼로그
- diff 미리보기 표시
- 원본 백업 (undo 지원)

### 4.4 Tool 4: Replace in File (파일 부분 수정)

**목적**: SEARCH/REPLACE 블록으로 정밀 수정

**파라미터**:
- `file_path` (string, required): 파일 경로
- `replacements` (array, required): SEARCH/REPLACE 작업 목록

**안전장치**:
- SEARCH 텍스트 미발견 시 에러 반환
- 다중 매칭 시 사용자 선택
- 변경 사항 diff 미리보기

### 4.5 Tool 5: YouTube Transcription (YouTube 자막 추출)

**목적**: YouTube 동영상 자막/스크립트 추출

**파라미터**:
- `url` (string, required): YouTube URL
- `language` (string, optional): 언어 코드 (기본값: "ko")
- `save_to_vault` (boolean, optional): 볼트 저장 여부

**지원 URL 형식**:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

**구현 방식**:
1. URL에서 video_id 추출
2. YouTube 페이지 fetch → ytInitialPlayerResponse 파싱
3. captionTracks에서 자막 URL 추출
4. XML → 텍스트 변환 및 타임스탬프 포맷팅

---

## 5. AGENT CONTROLLER (에이전트 컨트롤러)

### 5.1 ReAct Loop Architecture

```
[사용자 메시지]
    ↓
[시스템 프롬프트 + 도구 정의 + 히스토리] → LLM 호출
    ↓
[LLM 응답 파싱]
    ├─ 일반 텍스트 → 사용자 표시 (종료)
    └─ 도구 호출 → 도구 실행 → 결과를 대화에 추가 → LLM 재호출
                   ↑___________________|
                   (최대 10회 반복)
```

### 5.2 안전 장치
- 최대 도구 호출 횟수: 10회 (설정 가능)
- 단일 응답 토큰 제한: 4096
- 파일 수정 작업: 항상 사용자 승인 필요
- 도구 실행 실패: 에러 메시지를 LLM에 전달하여 대안 행동 유도

### 5.3 Tool-Calling 전략
- OpenAI-compatible `tools` 파라미터 사용
- 네이티브 미지원 시 프롬프트 기반 JSON 파싱 대안 구현

---

## 6. INTERFACE (인터페이스)

### 6.1 Settings UI

**LLM 설정**:
- API URL (기본값: http://localhost:11434/v1)
- 모델명 (기본값: qwen3.5:latest)
- API 키 (선택)
- Max Tokens (기본값: 4096)
- Temperature (기본값: 0.7)

**에이전트 설정**:
- 에이전트 모드 on/off
- 최대 도구 호출 횟수
- 파일 수정 전 확인 필요 여부

**도구별 토글**:
- Vault Search on/off
- Web Search on/off
- Write to File on/off
- Replace in File on/off
- YouTube Transcription on/off

### 6.2 Chat UI

**ChatView (ItemView 확장)**:
- 메시지 입력/출력 영역
- 마크다운 렌더링
- 도구 실행 상태 배너
- 도구 토글 버튼

**ToolStatusBanner**:
- 실행 중인 도구 이름 표시
- 실행 상태 (진행 중/완료/실패)
- 결과 미리보기 (접기/펼치기)

---

## 7. TRACEABILITY (추적성)

### 7.1 TAG Block
```
TAG: SPEC-PLUGIN-001
TYPE: Feature
SCOPE: Obsidian Plugin
PRIORITY: High
DEPENDENCIES:
  - Qwen 3.5 LLM Backend
  - Obsidian API >= 1.5.0
RISKS:
  - Tool-calling 호환성
  - YouTube API 변경
  - 대형 볼트 성능
```

### 7.2 Cross-References
- **plan.md**: 7단계 구현 계획
- **acceptance.md**: 도구별 테스트 시나리오

---

## 8. COMPLIANCE (준수 사항)

### 8.1 TRUST 5 Framework
- **Tested**: 각 도구별 최소 85% 테스트 커버리지
- **Readable**: TypeScript strict mode, 명확한 네이밍
- **Unified**: Obsidian 스타일 가이드 준수
- **Secured**: API 키 안전 저장, 사용자 승인 필수
- **Trackable**: 명확한 버전 관리, CHANGELOG 유지

### 8.2 Constitution Alignment
- TypeScript 5.0+ 사용
- esbuild 빌드 시스템
- Obsidian 공식 API만 사용
- 외부 라이브러리 최소화

---

## 9. NON-FUNCTIONAL REQUIREMENTS (비기능 요구사항)

### 9.1 성능
- 볼트 검색: 1,000개 파일 기준 2초 이내
- 채팅 응답: 스트리밍 모드로 지연 최소화
- 메모리 사용: 200MB 이하 (대형 볼트 기준)

### 9.2 신뢰성
- 도구 실행 실패 시 graceful degradation
- 네트워크 오류 시 재시도 메커니즘
- 파일 수정 전 백업 생성

### 9.3 사용성
- 직관적인 설정 UI
- 명확한 에러 메시지
- 도구 실행 상태 실시간 표시

---

**SPEC 작성 완료**
- 작성자: cyan91
- 검토 필요: LLM 백엔드 호환성, YouTube API 안정성
