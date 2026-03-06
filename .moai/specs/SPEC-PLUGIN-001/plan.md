---
id: SPEC-PLUGIN-001
title: Obsidian Vault Agent Plugin - Implementation Plan
version: 1.0.0
status: Planned
created: 2026-03-05
updated: 2026-03-05
author: cyan91
priority: High
---

# Implementation Plan: Obsidian Vault Agent Plugin

## TAG Block
```
TAG: SPEC-PLUGIN-001
PHASE: Implementation Planning
METHODOLOGY: TDD (Test-Driven Development)
ESTIMATED_DURATION: 10-16 days
```

---

## 1. Technology Stack

### 1.1 Core Technologies
- **Language**: TypeScript 5.0+
- **Runtime**: Obsidian Desktop App (Electron)
- **Build Tool**: esbuild
- **LLM Backend**: Qwen 3.5 (OpenAI-compatible API)
- **API Integration**: Obsidian Plugin API >= 1.5.0

### 1.2 Dependencies
```json
{
  "dependencies": {
    "obsidian": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "esbuild": "^0.20.0",
    "@types/node": "^20.0.0",
    "builtin-modules": "^3.3.0"
  }
}
```

### 1.3 Architecture Pattern
- **Agent Pattern**: ReAct (Reasoning + Acting) Loop
- **Tool System**: Plugin Architecture (BaseTool 추상화)
- **State Management**: Event-driven + Local State
- **Streaming**: Server-Sent Events (SSE)

---

## 2. File Structure

```
src/
├── main.ts                    # Plugin entry point
├── settings.ts                # Settings tab
├── types.ts                   # Type definitions
│
├── ui/
│   ├── ChatView.ts            # Chat UI (ItemView)
│   ├── ChatInput.ts           # Input component
│   ├── MessageRenderer.ts     # Message rendering
│   └── ToolStatusBanner.ts    # Tool execution status
│
├── agent/
│   ├── AgentController.ts     # ReAct loop controller
│   ├── ToolRegistry.ts        # Tool registration/dispatch
│   ├── PromptBuilder.ts       # System prompt builder
│   └── ConversationManager.ts # Conversation history
│
├── llm/
│   ├── LLMService.ts          # LLM API abstraction
│   ├── QwenAdapter.ts         # Qwen 3.5 adapter
│   └── StreamHandler.ts       # SSE streaming handler
│
├── tools/
│   ├── BaseTool.ts            # Tool interface/abstract class
│   ├── VaultSearchTool.ts     # Vault search tool
│   ├── WebSearchTool.ts       # Web search tool
│   ├── WriteToFileTool.ts     # File creation tool
│   ├── ReplaceInFileTool.ts   # Partial file edit tool
│   └── YouTubeTranscriptTool.ts # YouTube transcription tool
│
├── utils/
│   ├── vaultHelper.ts         # Vault file utilities
│   ├── markdownParser.ts      # Markdown parsing
│   └── logger.ts              # Debug logging
│
└── styles.css                 # Plugin styles
```

---

## 3. Implementation Phases

### Phase 1: Project Initialization + Basic Chat (1-2 days)

**Goals**:
- Plugin scaffolding
- Qwen 3.5 integration
- Basic chat functionality

**Tasks**:
- [ ] Initialize project from obsidian-sample-plugin
- [ ] Configure manifest.json, package.json, tsconfig.json
- [ ] Implement basic Settings tab (LLM API URL, model name)
- [ ] Create LLMService (OpenAI-compatible API calls)
- [ ] Implement StreamHandler (SSE streaming)
- [ ] Build ChatView (basic chat UI)
- [ ] Implement conversation history management

**Deliverables**:
- Working plugin with Qwen 3.5 chat
- Streaming responses
- Settings UI

**Verification**:
- Can send message and receive streaming response
- Settings persist across restarts

---

### Phase 2: Agent Controller + Tool Infrastructure (2-3 days)

**Goals**:
- ReAct agent loop
- Tool registration system
- Tool-calling infrastructure

**Tasks**:
- [ ] Define BaseTool interface/abstract class
- [ ] Implement ToolRegistry (register/lookup/dispatch)
- [ ] Build AgentController (ReAct loop)
- [ ] Create PromptBuilder (system prompt + tool definitions)
- [ ] Implement tool call result parsing
- [ ] Build ToolStatusBanner UI component
- [ ] Add max iteration safeguard (10 calls default)

**Deliverables**:
- ReAct loop operational
- Tool registration system
- Tool status UI

**Verification**:
- Dummy tool can be registered
- LLM can call dummy tool
- Results feed back to LLM

---

### Phase 3: Vault Search Implementation (1-2 days)

**Goals**:
- Keyword-based vault search
- TF-IDF relevance scoring
- Snippet generation

**Tasks**:
- [ ] Implement keyword search via MetadataCache
- [ ] Build full-text search (file content matching)
- [ ] Create TF-IDF scoring algorithm
- [ ] Generate search result snippets
- [ ] Add folder exclusion filters
- [ ] Implement file extension filtering
- [ ] Register VaultSearchTool in ToolRegistry

**Deliverables**:
- Working vault search tool
- Ranked search results
- Context snippets

**Verification**:
- "Find notes about n8n" returns relevant results
- Results ranked by relevance
- Snippets show matched context

---

### Phase 4: Write to File + Replace in File (1-2 days)

**Goals**:
- File creation/overwrite
- Partial file editing
- User confirmation dialogs

**Tasks**:
- [ ] Implement WriteToFileTool (create + overwrite)
- [ ] Build ReplaceInFileTool (SEARCH/REPLACE pattern)
- [ ] Create user confirmation Modal
- [ ] Implement diff preview UI
- [ ] Add automatic directory creation
- [ ] Implement error handling (file not found, search text not found)
- [ ] Add undo support via backup

**Deliverables**:
- File creation/editing tools
- Confirmation dialogs
- Diff preview

**Verification**:
- "Create a new note with today's meeting" works
- "Update the date in existing note" works
- User sees preview before changes

---

### Phase 5: Web Search Implementation (1-2 days)

**Goals**:
- Internet search capability
- Multiple provider support
- Result caching

**Tasks**:
- [ ] Build search provider abstraction layer
- [ ] Implement SearXNG adapter (primary)
- [ ] Implement Brave Search adapter (fallback)
- [ ] Convert search results to structured text
- [ ] Add result caching (5-minute TTL)
- [ ] Use requestUrl for HTTP calls (CORS bypass)

**Deliverables**:
- Working web search tool
- Multiple provider support
- Cached results

**Verification**:
- "Search for latest Qwen 3.5 benchmarks" works
- Results are structured and readable
- Cache prevents duplicate API calls

---

### Phase 6: YouTube Transcription Implementation (1-2 days)

**Goals**:
- YouTube subtitle extraction
- Multi-language support
- Optional vault saving

**Tasks**:
- [ ] Parse YouTube URLs (multiple formats)
- [ ] Extract caption info from YouTube page
- [ ] Parse subtitle XML to text
- [ ] Support multi-language subtitles (Korean priority)
- [ ] Handle auto-generated captions (ASR)
- [ ] Add optional vault saving as markdown

**Deliverables**:
- YouTube transcription tool
- Multi-language support
- Markdown export

**Verification**:
- YouTube URL sharing works
- "Summarize this video" uses transcript
- Timestamps included (optional)

---

### Phase 7: UI Polish + Finalization (2-3 days)

**Goals**:
- Usability improvements
- Error handling
- Documentation

**Tasks**:
- [ ] Add tool toggle buttons (below chat input)
- [ ] Improve tool status banner (collapse/expand)
- [ ] Enhance markdown rendering (code blocks, links)
- [ ] Integrate error handling (network, API, filesystem)
- [ ] Complete settings UI
- [ ] Optimize performance for large vaults
- [ ] Write README.md
- [ ] Implement debug logging system

**Deliverables**:
- Polished UI
- Comprehensive error handling
- Complete documentation

**Verification**:
- Full workflow integration test
- All 5 tools working together
- User-friendly error messages

---

## 4. Technical Approach

### 4.1 ReAct Loop Implementation

```typescript
// Pseudocode for AgentController
async function processMessage(userMessage: string): Promise<void> {
  let iteration = 0;
  let messages = buildInitialMessages(userMessage);

  while (iteration < MAX_ITERATIONS) {
    const response = await llmService.chat(messages);
    const parsed = parseResponse(response);

    if (parsed.type === 'text') {
      displayToUser(parsed.content);
      return;
    }

    if (parsed.type === 'tool_call') {
      const result = await toolRegistry.execute(
        parsed.toolCall.name,
        parsed.toolCall.arguments
      );
      messages.push(createToolResultMessage(result));
      iteration++;
      continue;
    }
  }

  displayToUser("최대 도구 호출 횟수에 도달했습니다.");
}
```

### 4.2 Tool Definition Strategy

```typescript
// OpenAI-compatible tool definition format
const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "vault_search",
      description: "Search through vault notes...",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "..." },
          max_results: { type: "number", description: "..." }
        },
        required: ["query"]
      }
    }
  },
  // ... other tools
];
```

### 4.3 Streaming Response Handling

```typescript
// SSE streaming with tool call detection
async function* streamChat(messages: Message[]): AsyncGenerator<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ messages, stream: true })
  });

  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield data.choices[0]?.delta?.content || '';
      }
    }
  }
}
```

---

## 5. Risk Analysis & Mitigation

### 5.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Qwen 3.5 tool-calling 미지원 | High | Medium | 프롬프트 기반 JSON 파싱 대안 구현 |
| YouTube API 변경 | Medium | Medium | 다중 추출 방식 구현 (API + 페이지 파싱) |
| 대형 볼트 검색 성능 저하 | High | High | 인덱싱 캐시 + 증분 업데이트 |
| 스트리밍 중 도구 호출 감지 어려움 | Medium | Medium | 비스트리밍 모드로 도구 호출 분리 |
| 웹 검색 API 제한 | Medium | High | 다중 Provider 지원 + fallback |

### 5.2 Performance Risks

| Risk | Mitigation |
|------|------------|
| 1,000+ 파일 볼트 검색 지연 | 캐싱, 인덱싱, 검색 범위 제한 |
| 메모리 사용량 증가 | 스트리밍 모드, 청킹, 가비지 컬렉션 최적화 |
| 동시 도구 호출 충돌 | 순차 실행, 락 메커니즘 |

### 5.3 Security Risks

| Risk | Mitigation |
|------|------------|
| API 키 노출 | 안전한 저장소 사용 (Obsidian API) |
| 악성 파일 경로 | 경로 검증, 샌드박싱 |
| 사용자 데이터 유출 | 로컬 LLM만 사용, 외부 전송 금지 |

---

## 6. Testing Strategy

### 6.1 Unit Tests (per tool)
- 각 도구의 독립적 기능 테스트
- Mock LLM API 응답
- 에러 케이스 처리

### 6.2 Integration Tests
- ReAct 루프 전체 흐름
- 도구 호출 → 결과 반환 → 후속 처리
- UI ↔ Agent ↔ LLM 통합

### 6.3 E2E Tests
- 사용자 시나리오별 전체 워크플로우
- "볼트에서 n8n 관련 노트 찾아서 요약해줘"
- "이 YouTube 영상 요약해서 새 노트로 만들어줘"

---

## 7. Dependencies & Prerequisites

### 7.1 External Dependencies
- Qwen 3.5 LLM server (Ollama/vLLM/LM Studio)
- SearXNG instance (for web search)
- Obsidian Desktop App >= 1.5.0

### 7.2 Development Environment
- Node.js >= 18.0.0
- npm or yarn
- TypeScript 5.0+
- Git

### 7.3 Knowledge Prerequisites
- Obsidian Plugin API
- OpenAI API format
- TypeScript async/await patterns
- Electron app development

---

## 8. Milestone Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| 1 | 1-2 days | Basic chat with Qwen 3.5 |
| 2 | 2-3 days | Agent loop + tool infrastructure |
| 3 | 1-2 days | Vault search tool |
| 4 | 1-2 days | File editing tools |
| 5 | 1-2 days | Web search tool |
| 6 | 1-2 days | YouTube transcription tool |
| 7 | 2-3 days | UI polish + documentation |

**Total Estimated Duration**: 10-16 days

---

## 9. Success Criteria

### 9.1 Functional Criteria
- ✅ All 5 tools operational
- ✅ ReAct loop with max 10 iterations
- ✅ Streaming responses working
- ✅ User confirmation for file modifications
- ✅ Settings persist across sessions

### 9.2 Performance Criteria
- ✅ Vault search < 2s for 1,000 files
- ✅ Memory usage < 200MB
- ✅ Streaming latency < 100ms

### 9.3 Quality Criteria
- ✅ 85%+ test coverage per tool
- ✅ Zero critical security issues
- ✅ Clear error messages
- ✅ Comprehensive README

---

**Plan 작성 완료**
- 작성자: cyan91
- 검토 필요: LLM 백엔드 호환성, 성능 최적화 전략
