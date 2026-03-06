# 도구 실행 문제 진단 보고서

## 문제 요약

실제 실행 환경에서 도구가 작동하지 않는 가능한 원인들을 분석했습니다.

## 발견된 문제들

### 1. 도구 정의가 LLM에 전달되지 않음 ⚠️

**위치**: `src/agent/AgentController.ts:79-95`

```typescript
// 도구 정의는 생성되지만...
const toolDefinitions = this.toolRegistry.getOpenAIToolDefinitions();

// LLM에 전달되지 않을 수 있음
const result = await this.llmService.chat(messages, toolDefinitions);
```

**증상**: LLM이 도구를 전혀 호출하지 않음

**원인**:
- `llmService.chat()` 호출 시 `tools` 파라미터가 undefined일 수 있음
- LLM 서버가 도구 정의를 지원하지 않는 포맷일 수 있음

### 2. LLM 응답 파싱 실패

**위치**: `src/agent/AgentController.ts:98-114`

```typescript
// 네이티브 tool_calls 확인
if (result.toolCalls && result.toolCalls.length > 0) {
    // 파싱...
} else if (result.content) {
    // 폴백: 텍스트 기반 파싱
    toolCalls = this.parseToolCalls(result.content);
}
```

**증상**: LLM이 도구를 호출하려고 했지만 파싱되지 않음

**원인**:
- LLM 응답 형식이 예상과 다름
- `parseToolCalls` 메서드의 정규식 패턴이 실제 LLM 출력과 매칭되지 않음

### 3. 도구 실행 결과 누락

**위치**: `src/agent/AgentController.ts:138-158`

```typescript
for (const toolCall of toolCalls) {
    let toolResult: any;
    try {
        toolResult = await this.toolRegistry.execute(...);
    } catch (error) {
        toolResult = { error: errorMessage };
    }

    // 결과를 메시지에 추가
    messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
        tool_call_id: toolCall.id
    });
}
```

**증상**: 도구 실행 후 LLM이 결과를 받지 못함

**원인**:
- `tool_call_id`가 일치하지 않음
- 결과 JSON 직렬화 실패

### 4. 시스템 프롬프트 문제

**위치**: `src/agent/PromptBuilder.ts:20-21`

```typescript
const DEFAULT_SYSTEM_INSTRUCTIONS_MINIMAL =
    `You are a helpful AI assistant for Obsidian vault management.
    Use your available tools actively when needed. Respond in the user's language.`;
```

**증상**: LLM이 도구 사용을 인지하지 못함

**원인**:
- 도구 사용 지시가 명확하지 않음
- OpenAI 네이티브 tool calling 모드에서는 프롬프트에 도구 정의를 포함하지 않아야 함

## 진단 방법

### 1. 디버그 모드 활성화

ChatView에서 디버그 모드를 활성화하면 LLM 원본 응답을 볼 수 있습니다:

```typescript
// ChatView.ts:88-94
const debugButton = leftButtons.createEl('button', {
    text: '🔍 디버그'
});
debugButton.onclick = () => {
    this.debugMode = !this.debugMode;
    // ...
};
```

### 2. LLM 응답 로그 확인

콘솔에서 다음 로그를 확인하세요:

```javascript
console.log('[ChatView] Agent response:', response);
console.log('LLM API Response:', data);
```

### 3. 도구 정의 검증

다음 테스트로 도구 정의가 올바른지 확인:

```bash
npx jest --config=jest.integration.config.js --testNamePattern="OpenAI Tool Format"
```

## 해결 방안

### 솔루션 1: 도구 정의 강제 전달

```typescript
// AgentController에서
async processMessage(userMessage: string): Promise<AgentResponse> {
    const toolDefinitions = this.toolRegistry.getOpenAIToolDefinitions();

    // 도구 정의가 있는지 확인
    console.log('[DEBUG] Tool definitions:', JSON.stringify(toolDefinitions, null, 2));

    const result = await this.llmService.chat(messages, toolDefinitions);
    // ...
}
```

### 솔루션 2: LLM 응답 로깅 강화

```typescript
// LLMService에서
async chat(messages: ChatMessage[], tools?: OpenAIToolDef[]): Promise<LLMChatResult> {
    // ...
    const data: any = await response.json();

    // 상세 로그
    console.log('[LLM] Request:', {
        messages: messages.length,
        tools: tools?.length || 0
    });
    console.log('[LLM] Response:', JSON.stringify(data, null, 2));

    return { content, toolCalls };
}
```

### 솔루션 3: 도구 호출 파싱 개선

```typescript
// AgentController의 parseToolCalls에 더 많은 패턴 추가
private parseToolCalls(response: string): ToolCall[] {
    // 기존 패턴들...

    // 추가: Markdow code block 내 JSON
    const codeBlockPattern = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    // ...
}
```

## 체크리스트

실제 실행 환경에서 다음을 확인하세요:

- [ ] LLM 서버가 실행 중인가? (`curl http://localhost:8001/v1/models`)
- [ ] API URL이 올바른가? (설정에서 확인)
- [ ] 모델명이 올바른가? (예: `qwen2.5:14b`)
- [ ] 도구가 활성화되어 있는가? (설정 → 도구 토글)
- [ ] 디버그 모드에서 LLM 응답을 볼 수 있는가?
- [ ] 콘솔에 에러 메시지가 있는가?

## 테스트 명령어

```bash
# 전체 통합 테스트
npm run test:integration

# 시나리오 테스트만
npx jest --config=jest.integration.config.js --testNamePattern="Scenario"

# 도구 실행 테스트만
npx jest --config=jest.integration.config.js --testNamePattern="Tool Execution"
```

## 다음 단계

1. 실제 Obsidian 환경에서 디버그 모드 활성화
2. LLM 원본 응답 확인
3. 위 원인 중 어느 것에 해당하는지 파악
4. 해당 솔루션 적용
