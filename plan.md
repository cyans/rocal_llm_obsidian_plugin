# Obsidian AI Agent Plugin 개발 계획서

## 플러그인명: **Obsidian Vault Agent** (가칭)

> Qwen 3.5 기반 자율형 AI 에이전트 플러그인  
> Obsidian Copilot Plus의 유료 Agent Tools를 직접 구현

---

## 1. 프로젝트 개요

### 1.1 목표
Obsidian Copilot의 유료(Plus) 기능인 **Agent Accessible Tools**를 오픈소스로 직접 구현한다.
Qwen 3.5를 LLM 백엔드로 사용하여, 외부 유료 서비스 의존 없이 5가지 에이전트 도구를 제공한다.

### 1.2 구현 대상 도구 (5종)

| # | 도구명 | 설명 |
|---|--------|------|
| 1 | **Vault Search** | 볼트 내 노트를 의미 기반으로 검색 |
| 2 | **Web Search** | 사용자 요청 시 인터넷에서 실시간 정보 검색 |
| 3 | **Write to File** | 볼트 내 파일 생성 또는 전체 수정 |
| 4 | **Replace in File** | SEARCH/REPLACE 블록으로 기존 파일 부분 수정 |
| 5 | **YouTube Transcription** | YouTube 동영상의 자막/스크립트 추출 |

### 1.3 기술 스택

- **언어**: TypeScript
- **빌드**: esbuild (Obsidian 공식 sample-plugin 기반)
- **LLM**: Qwen 3.5 (OpenAI-compatible API via Ollama / vLLM / LM Studio 등)
- **Obsidian API**: obsidian.d.ts (공식 Plugin API)
- **패턴**: Tool-calling Agent Loop (ReAct 패턴)

---

## 2. 아키텍처 설계

### 2.1 전체 구조

```
┌─────────────────────────────────────────────┐
│                Obsidian UI                   │
│  ┌─────────────────────────────────────┐    │
│  │         Chat View (ItemView)        │    │
│  │   - 메시지 입력/출력                  │    │
│  │   - 도구 실행 상태 배너               │    │
│  │   - 도구 토글 버튼                    │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│  ┌──────────────▼──────────────────────┐    │
│  │        Agent Controller             │    │
│  │   - ReAct Loop 관리                  │    │
│  │   - Tool Dispatch                   │    │
│  │   - 대화 히스토리 관리                │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│  ┌──────────────▼──────────────────────┐    │
│  │          LLM Service                │    │
│  │   - Qwen 3.5 API 호출               │    │
│  │   - OpenAI-compatible endpoint      │    │
│  │   - Tool-calling 프롬프트 포맷팅      │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│  ┌──────────────▼──────────────────────┐    │
│  │          Tool Registry              │    │
│  │  ┌──────┐ ┌──────┐ ┌──────────┐   │    │
│  │  │Vault │ │ Web  │ │  Write   │   │    │
│  │  │Search│ │Search│ │ to File  │   │    │
│  │  └──────┘ └──────┘ └──────────┘   │    │
│  │  ┌──────────┐ ┌──────────────┐    │    │
│  │  │ Replace  │ │   YouTube    │    │    │
│  │  │ in File  │ │Transcription │    │    │
│  │  └──────────┘ └──────────────┘    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 2.2 모듈 구성

```
src/
├── main.ts                    # 플러그인 엔트리포인트
├── settings.ts                # 설정 탭 (API URL, 모델명, 도구 토글 등)
├── types.ts                   # 공통 타입 정의
│
├── ui/
│   ├── ChatView.ts            # 채팅 UI (ItemView 확장)
│   ├── ChatInput.ts           # 입력 컴포넌트 (도구 토글 포함)
│   ├── MessageRenderer.ts     # 메시지 렌더링 (마크다운, 도구 배너)
│   └── ToolStatusBanner.ts    # 도구 실행 상태 표시 배너
│
├── agent/
│   ├── AgentController.ts     # ReAct 루프 메인 컨트롤러
│   ├── ToolRegistry.ts        # 도구 등록/관리/디스패치
│   ├── PromptBuilder.ts       # 시스템 프롬프트 + 도구 정의 구성
│   └── ConversationManager.ts # 대화 히스토리 관리
│
├── llm/
│   ├── LLMService.ts          # LLM API 호출 추상화
│   ├── QwenAdapter.ts         # Qwen 3.5 전용 어댑터
│   └── StreamHandler.ts       # SSE 스트리밍 응답 처리
│
├── tools/
│   ├── BaseTool.ts            # 도구 인터페이스/추상 클래스
│   ├── VaultSearchTool.ts     # 볼트 검색 도구
│   ├── WebSearchTool.ts       # 웹 검색 도구
│   ├── WriteToFileTool.ts     # 파일 생성/수정 도구
│   ├── ReplaceInFileTool.ts   # 파일 부분 수정 도구
│   └── YouTubeTranscriptTool.ts # YouTube 자막 추출 도구
│
├── utils/
│   ├── vaultHelper.ts         # 볼트 파일 접근 유틸
│   ├── markdownParser.ts      # 마크다운 파싱 유틸
│   └── logger.ts              # 디버그 로깅
│
└── styles.css                 # 플러그인 스타일
```

---

## 3. 도구별 상세 설계

### 3.1 Vault Search (볼트 검색)

**목적**: 사용자 질문과 관련된 볼트 내 노트를 검색하여 컨텍스트로 제공

**구현 전략**: 2단계 검색 (키워드 → 유사도 랭킹)

```
[사용자 질문] → [LLM이 검색 키워드 추출] → [Obsidian MetadataCache 검색]
                                            → [파일 내용 TF-IDF 스코어링]
                                            → [상위 N개 결과 반환]
```

**핵심 구현 사항**:
- `app.vault.getMarkdownFiles()` 로 전체 마크다운 파일 목록 획득
- `app.metadataCache.getFileCache(file)` 로 제목, 태그, 링크 메타데이터 활용
- `app.vault.cachedRead(file)` 로 파일 내용 읽기
- 키워드 기반 검색 + 간단한 TF-IDF 스코어링으로 관련도 순위 매기기
- (선택) 향후 임베딩 기반 시맨틱 검색으로 업그레이드 가능

**Tool Definition (LLM에 전달할 도구 스키마)**:
```json
{
  "name": "vault_search",
  "description": "Search through the user's Obsidian vault notes to find relevant information. Use this when the user asks about their notes, references past writings, or needs information from their knowledge base.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query to find relevant notes"
      },
      "max_results": {
        "type": "number",
        "description": "Maximum number of results to return (default: 5)"
      }
    },
    "required": ["query"]
  }
}
```

**반환 포맷**:
```json
{
  "results": [
    {
      "file_path": "Projects/AI Automation.md",
      "title": "AI Automation",
      "snippet": "노트 내용 일부 (최대 500자)...",
      "score": 0.85,
      "tags": ["#AI", "#automation"],
      "last_modified": "2025-03-01"
    }
  ]
}
```

---

### 3.2 Web Search (웹 검색)

**목적**: 사용자가 웹/인터넷 검색을 요청할 때 실시간 정보를 가져옴

**구현 전략**: 무료 검색 API 활용

**옵션 (우선순위 순)**:
1. **SearXNG** (셀프호스팅) - 가장 추천. 메타 검색 엔진, 무료, API 제공
2. **DuckDuckGo Instant Answer API** - 무료, 제한적
3. **Brave Search API** - 무료 티어 제공 (월 2000회)
4. **Tavily API** - AI 검색 특화, 무료 티어 제공

**핵심 구현 사항**:
- `requestUrl()` (Obsidian API) 사용하여 CORS 문제 회피
- 검색 결과를 구조화된 텍스트로 변환하여 LLM에 컨텍스트로 제공
- 검색 결과 캐싱 (동일 쿼리 반복 방지)

**Tool Definition**:
```json
{
  "name": "web_search",
  "description": "Search the internet for current information. Use this ONLY when the user explicitly asks for web/online information or when the question requires up-to-date information not found in the vault.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "num_results": {
        "type": "number",
        "description": "Number of results (default: 5)"
      }
    },
    "required": ["query"]
  }
}
```

---

### 3.3 Write to File (파일 생성/수정)

**목적**: 볼트 내 새 파일을 생성하거나 기존 파일의 전체 내용을 교체

**핵심 구현 사항**:
- `app.vault.create(path, content)` - 새 파일 생성
- `app.vault.modify(file, content)` - 기존 파일 전체 수정
- `app.vault.getAbstractFileByPath(path)` - 파일 존재 여부 확인
- 생성 전 사용자 확인(confirm) 다이얼로그 표시
- 디렉토리 자동 생성: `app.vault.createFolder(path)`

**Tool Definition**:
```json
{
  "name": "write_to_file",
  "description": "Create a new file or overwrite an existing file in the vault. Use this when the user asks to create notes, save content, or write documents.",
  "parameters": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Path for the file (e.g., 'Notes/meeting-notes.md')"
      },
      "content": {
        "type": "string",
        "description": "Full content to write to the file (Markdown format)"
      }
    },
    "required": ["file_path", "content"]
  }
}
```

**안전장치**:
- 기존 파일 덮어쓰기 시 사용자 확인 필수
- 실행 전 diff 미리보기 표시
- 실행 취소(undo) 지원을 위한 원본 백업

---

### 3.4 Replace in File (부분 수정)

**목적**: 기존 파일에서 특정 부분만 SEARCH/REPLACE 블록으로 정밀 수정

**핵심 구현 사항**:
- 파일 내용을 읽어서 SEARCH 패턴과 매칭
- 매칭된 부분만 REPLACE 내용으로 교체
- 다중 SEARCH/REPLACE 블록 지원

**Tool Definition**:
```json
{
  "name": "replace_in_file",
  "description": "Make targeted changes to an existing file using SEARCH/REPLACE blocks. Each block specifies exact text to find and replace. Use this for precise edits like fixing typos, updating sections, or modifying specific content.",
  "parameters": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Path to the file to modify"
      },
      "replacements": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "search": {
              "type": "string",
              "description": "Exact text to find in the file"
            },
            "replace": {
              "type": "string",
              "description": "Text to replace the found text with"
            }
          },
          "required": ["search", "replace"]
        },
        "description": "List of search/replace operations"
      }
    },
    "required": ["file_path", "replacements"]
  }
}
```

**안전장치**:
- SEARCH 텍스트가 파일에 존재하지 않으면 에러 반환
- 변경 사항 diff 미리보기 표시
- 다중 매칭 시 모든 위치 표시 후 선택 가능

---

### 3.5 YouTube Transcription (YouTube 자막 추출)

**목적**: YouTube 동영상 URL에서 자막/스크립트를 추출하여 컨텍스트로 활용

**구현 전략**: YouTube 자막 API 직접 호출 (라이브러리 없이)

**핵심 구현 사항**:
- YouTube 비디오 ID 파싱 (다양한 URL 형식 지원)
- YouTube의 `timedtext` API를 통해 자막 XML 직접 가져오기
- 대안: 영상 페이지에서 `ytInitialPlayerResponse`를 파싱하여 자막 URL 추출
- `requestUrl()` 사용 (CORS 우회)
- XML → 텍스트 변환 및 타임스탬프 포맷팅

**Tool Definition**:
```json
{
  "name": "youtube_transcription",
  "description": "Get the transcript/subtitles from a YouTube video. Use this when the user shares a YouTube URL and wants to discuss, summarize, or extract information from the video.",
  "parameters": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "YouTube video URL"
      },
      "language": {
        "type": "string",
        "description": "Preferred language code (default: 'ko', fallback: 'en')"
      },
      "save_to_vault": {
        "type": "boolean",
        "description": "Whether to save the transcript as a markdown file in the vault"
      }
    },
    "required": ["url"]
  }
}
```

**자막 추출 프로세스**:
```
1. URL에서 video_id 추출
2. YouTube 페이지 fetch → ytInitialPlayerResponse JSON 파싱
3. captionTracks에서 자막 URL 추출
4. 자막 XML fetch → 텍스트 파싱
5. 타임스탬프 포맷팅 → 결과 반환
```

---

## 4. Agent Controller (ReAct 루프) 설계

### 4.1 동작 흐름

```
사용자 메시지 입력
    │
    ▼
[1] 시스템 프롬프트 + 도구 정의 + 대화 히스토리 + 사용자 메시지 → LLM 호출
    │
    ▼
[2] LLM 응답 파싱
    │
    ├── 일반 텍스트 응답 → 사용자에게 표시 (종료)
    │
    └── 도구 호출 요청 → [3] 도구 실행
                              │
                              ▼
                         [4] 도구 실행 결과를 대화에 추가
                              │
                              ▼
                         [5] LLM 재호출 → [2]로 돌아감
                              (최대 반복 횟수 제한: 기본 10회)
```

### 4.2 Tool-Calling 프롬프트 전략

Qwen 3.5는 OpenAI-compatible tool-calling을 지원하므로, 표준 `tools` 파라미터를 사용한다.

**만약 tool-calling을 네이티브로 지원하지 않는 경우**, 프롬프트 기반 대안:

```
You are an AI assistant with access to the following tools:

## Available Tools
- vault_search(query, max_results): Search vault notes
- web_search(query, num_results): Search the internet
- write_to_file(file_path, content): Create/overwrite a file
- replace_in_file(file_path, replacements): Modify parts of a file
- youtube_transcription(url, language, save_to_vault): Get YouTube transcript

## How to use tools
When you need to use a tool, respond with a JSON block:
```tool_call
{"name": "tool_name", "arguments": {...}}
```

After receiving tool results, continue your response.
If no tool is needed, respond directly to the user.
```

### 4.3 최대 반복 횟수 / 안전 장치

- 최대 도구 호출 10회 (설정 가능)
- 단일 응답 토큰 제한: 4096 (설정 가능)
- 파일 수정 작업은 항상 사용자 승인 필요
- 도구 실행 실패 시 에러 메시지를 LLM에 전달하여 대안 행동 유도

---

## 5. 설정 (Settings) 구조

```typescript
interface VaultAgentSettings {
  // LLM 설정
  llm: {
    apiUrl: string;          // "http://localhost:11434/v1" (Ollama 기본)
    model: string;           // "qwen3.5:latest"
    apiKey: string;          // 필요 시 (대부분 로컬은 불필요)
    maxTokens: number;       // 4096
    temperature: number;     // 0.7
    streaming: boolean;      // true
  };
  
  // 에이전트 설정
  agent: {
    enabled: boolean;        // 에이전트 모드 on/off
    maxToolCalls: number;    // 최대 도구 호출 횟수 (기본 10)
    requireConfirmation: boolean; // 파일 수정 전 확인 필요 여부
  };
  
  // 도구별 토글
  tools: {
    vaultSearch: boolean;    // 기본 true
    webSearch: boolean;      // 기본 true
    writeToFile: boolean;    // 기본 true
    replaceInFile: boolean;  // 기본 true
    youtubeTranscript: boolean; // 기본 true
  };
  
  // 웹 검색 설정
  webSearch: {
    provider: 'searxng' | 'brave' | 'duckduckgo' | 'tavily';
    apiUrl: string;          // SearXNG 인스턴스 URL 등
    apiKey: string;          // Brave, Tavily 등 API 키
  };
  
  // Vault 검색 설정
  vaultSearch: {
    maxResults: number;      // 기본 5
    excludeFolders: string[];// 제외할 폴더 목록
    includeExtensions: string[]; // 포함할 파일 확장자
  };
  
  // YouTube 설정
  youtube: {
    preferredLanguage: string; // 기본 "ko"
    savePath: string;         // 자막 저장 경로 (기본 "YouTube/")
    includeTimestamps: boolean; // 타임스탬프 포함 여부
  };
  
  // UI 설정
  ui: {
    chatPosition: 'left' | 'right'; // 채팅 패널 위치
    showToolBanners: boolean;       // 도구 실행 배너 표시
  };
}
```

---

## 6. 개발 단계 (Phase)

### Phase 1: 프로젝트 초기화 + 기본 채팅 (1~2일)

**목표**: 플러그인 뼈대 + Qwen 3.5 연동 + 기본 채팅 가능

- [ ] obsidian-sample-plugin 템플릿 기반 프로젝트 생성
- [ ] `manifest.json`, `package.json` 설정
- [ ] 기본 Settings 탭 구현 (LLM API URL, 모델명)
- [ ] LLMService 구현 (OpenAI-compatible API 호출)
- [ ] StreamHandler 구현 (SSE 스트리밍 응답)
- [ ] ChatView (기본 채팅 UI) 구현
- [ ] 대화 히스토리 관리

**검증**: Qwen 3.5와 기본 대화가 되는지 확인

---

### Phase 2: Agent Controller + Tool 인프라 (2~3일)

**목표**: ReAct 에이전트 루프 + 도구 등록 시스템

- [ ] BaseTool 인터페이스 정의
- [ ] ToolRegistry 구현 (도구 등록/조회/디스패치)
- [ ] AgentController 구현 (ReAct 루프)
- [ ] PromptBuilder 구현 (시스템 프롬프트 + 도구 정의 동적 구성)
- [ ] 도구 호출 결과 파싱 (JSON 추출)
- [ ] ToolStatusBanner UI 컴포넌트

**검증**: 더미 도구를 등록하고 LLM이 도구를 호출하는지 확인

---

### Phase 3: Vault Search 구현 (1~2일)

**목표**: 볼트 내 노트 검색 기능

- [ ] 키워드 기반 파일 검색 (MetadataCache 활용)
- [ ] 파일 내용 검색 (전문 텍스트 매칭)
- [ ] TF-IDF 기반 관련도 스코어링
- [ ] 검색 결과 스니펫 생성 (매칭 부분 하이라이트)
- [ ] 제외 폴더, 파일 확장자 필터링
- [ ] VaultSearchTool → ToolRegistry 등록

**검증**: "내 볼트에서 n8n 관련 노트를 찾아줘" 같은 질문에 응답

---

### Phase 4: Write to File + Replace in File (1~2일)

**목표**: 파일 생성/수정 도구

- [ ] WriteToFileTool 구현 (파일 생성 + 덮어쓰기)
- [ ] ReplaceInFileTool 구현 (SEARCH/REPLACE 패턴)
- [ ] 사용자 확인 다이얼로그 (Modal)
- [ ] 변경 사항 diff 미리보기
- [ ] 디렉토리 자동 생성
- [ ] 에러 핸들링 (파일 없음, 검색 텍스트 없음 등)

**검증**: "새 노트를 만들어서 오늘 회의 내용을 정리해줘", "기존 노트에서 날짜를 수정해줘"

---

### Phase 5: Web Search 구현 (1~2일)

**목표**: 인터넷 검색 도구

- [ ] 검색 Provider 추상화 레이어 구현
- [ ] SearXNG 어댑터 구현 (기본 옵션)
- [ ] Brave Search 어댑터 구현 (대안)
- [ ] 검색 결과 → 구조화된 텍스트 변환
- [ ] 결과 캐싱 (동일 쿼리 5분 캐시)
- [ ] requestUrl 기반 HTTP 호출

**검증**: "최신 Qwen 3.5 모델 성능 비교를 웹에서 찾아줘"

---

### Phase 6: YouTube Transcription 구현 (1~2일)

**목표**: YouTube 자막 추출 도구

- [ ] YouTube URL 파싱 (다양한 포맷 지원)
- [ ] YouTube 페이지에서 자막 정보 추출
- [ ] 자막 XML 파싱 → 텍스트 변환
- [ ] 다국어 자막 지원 (한국어 우선)
- [ ] 자동 생성 자막(ASR) 지원
- [ ] (선택) 볼트에 마크다운으로 저장

**검증**: YouTube URL 공유 후 "이 영상의 핵심 내용을 요약해줘"

---

### Phase 7: UI 고도화 + 마무리 (2~3일)

**목표**: 사용성 개선 + 안정화

- [ ] 도구 토글 버튼 (채팅 입력 하단)
- [ ] 도구 실행 배너 UI (접기/펼치기)
- [ ] 마크다운 렌더링 개선 (코드 블록, 링크 등)
- [ ] 에러 핸들링 통합 (네트워크, API, 파일 시스템)
- [ ] 설정 UI 전체 완성
- [ ] 성능 최적화 (대형 볼트 대응)
- [ ] README.md 작성
- [ ] 디버그 로깅 시스템

**검증**: 전체 워크플로우 통합 테스트

---

## 7. 프로젝트 초기화 가이드

### 7.1 프로젝트 생성

```bash
# 1. 프로젝트 디렉토리 생성
mkdir obsidian-vault-agent
cd obsidian-vault-agent

# 2. Obsidian sample plugin 기반 초기화
git init
npm init -y

# 3. 의존성 설치
npm install obsidian@latest
npm install -D typescript esbuild @types/node builtin-modules

# 4. TypeScript 설정
# tsconfig.json 생성 (아래 참조)
```

### 7.2 필수 파일 구조

```
obsidian-vault-agent/
├── manifest.json          # 플러그인 메타데이터
├── package.json
├── tsconfig.json
├── esbuild.config.mjs     # 빌드 설정
├── src/
│   └── main.ts            # 엔트리포인트
├── styles.css
└── versions.json
```

### 7.3 manifest.json

```json
{
  "id": "vault-agent",
  "name": "Vault Agent",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "AI agent for Obsidian with vault search, web search, file editing, and YouTube transcription powered by local LLMs",
  "author": "DongHyuk",
  "isDesktopOnly": false
}
```

---

## 8. 핵심 인터페이스 정의 (미리보기)

```typescript
// === BaseTool 인터페이스 ===
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

abstract class BaseTool {
  abstract definition: ToolDefinition;
  abstract execute(params: Record<string, any>): Promise<ToolResult>;
  abstract isEnabled(): boolean;
}

// === Agent 메시지 타입 ===
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  toolResult?: ToolResult;
  timestamp: number;
}

// === LLM 응답 파싱 결과 ===
interface ParsedResponse {
  type: 'text' | 'tool_call';
  content?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, any>;
  };
}
```

---

## 9. 리스크 및 대응 방안

| 리스크 | 영향 | 대응 방안 |
|--------|------|-----------|
| Qwen 3.5 Tool-calling 미지원 | 도구 호출 불가 | 프롬프트 기반 JSON 파싱 대안 구현 |
| YouTube 자막 API 변경 | 자막 추출 실패 | 다중 추출 방식 구현 (API / 페이지 파싱) |
| 대형 볼트 검색 성능 | 검색 느림 | 인덱싱 캐시 + 증분 업데이트 |
| 스트리밍 응답 중 도구 호출 | 파싱 복잡 | 비스트리밍 모드 도구 호출 분리 |
| 웹 검색 API 제한 | 검색 불가 | 다중 Provider 지원 + fallback |

---

## 10. 향후 확장 계획

- **임베딩 기반 시맨틱 검색**: Vault Search를 벡터 임베딩 기반으로 업그레이드
- **Long-term Memory**: 대화 기록을 .md 파일로 저장하고 에이전트가 참조
- **커스텀 도구 추가**: 사용자가 마크다운으로 도구를 정의하는 확장 시스템
- **멀티 LLM 지원**: Ollama, LM Studio, vLLM 등 다양한 백엔드 전환
- **자동 완성 (Autocomplete)**: 노트 작성 중 AI 자동완성 지원

---

## 총 예상 기간: 약 10~16일

| Phase | 내용 | 기간 |
|-------|------|------|
| 1 | 프로젝트 초기화 + 기본 채팅 | 1~2일 |
| 2 | Agent Controller + Tool 인프라 | 2~3일 |
| 3 | Vault Search | 1~2일 |
| 4 | Write/Replace in File | 1~2일 |
| 5 | Web Search | 1~2일 |
| 6 | YouTube Transcription | 1~2일 |
| 7 | UI 고도화 + 마무리 | 2~3일 |