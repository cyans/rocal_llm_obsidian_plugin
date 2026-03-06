/**
 * Agent Controller - ReAct Loop with native tool calling
 * @MX:ANCHOR: ReAct 에이전트 루프 컨트롤러
 * @MX:REASON: 모든 도구 호출 실행의 중심 진입점
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 2
 */

import { LLMService, ChatMessage, ToolCallResponse } from '../llm/LLMService';
import { ToolRegistry } from './ToolRegistry';
import { PromptBuilder } from './PromptBuilder';

export interface AgentResponse {
    type: 'text' | 'tool_call';
    content: string;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: any;
    };
}

export interface ToolCallResult {
    toolCallId: string;
    result: any;
}

interface ExecutedToolResult {
    toolName: string;
    args: any;
    result: any;
}

/**
 * AgentController implements the ReAct (Reasoning + Acting) loop.
 * Uses native OpenAI tool calling API for reliable tool execution.
 * Falls back to text-based parsing when native tool calls aren't available.
 */
export type StatusCallback = (status: string) => void;

export class AgentController {
    private static readonly MAX_REPEAT_TOOL_CALLS = 2;
    private static readonly MAX_INCOMPLETE_TOOL_RETRIES = 2;
    private llmService: LLMService;
    private toolRegistry: ToolRegistry;
    private promptBuilder: PromptBuilder;
    private conversationHistory: ChatMessage[] = [];
    private maxIterations: number = 30;  // 10 → 30으로 증가
    private agentModeEnabled: boolean = true;
    private iterationCount: number = 0;
    private onStatus: StatusCallback | null = null;
    private activeFileContent: string | null = null;
    private activeFilePath: string | null = null;

    constructor(
        llmService: LLMService,
        toolRegistry: ToolRegistry,
        agentMode: boolean = true
    ) {
        this.llmService = llmService;
        this.toolRegistry = toolRegistry;
        this.promptBuilder = new PromptBuilder();
        this.agentModeEnabled = agentMode;
    }

    /**
     * Set active file content for context
     */
    setActiveFileContent(content: string | null): void {
        this.activeFileContent = content;
    }

    setActiveFilePath(path: string | null): void {
        this.activeFilePath = path;
    }

    /**
     * Set a callback for status updates during processing.
     */
    setStatusCallback(callback: StatusCallback | null): void {
        this.onStatus = callback;
    }

    private emitStatus(status: string): void {
        if (this.onStatus) {
            this.onStatus(status);
        }
    }

    /**
     * Process a user message through the ReAct loop.
     * Uses native tool calling API for reliable tool execution.
     */
    async processMessage(userMessage: string): Promise<AgentResponse> {
        this.iterationCount = 0;
        const keywordTagEditResponse = await this.tryHandleKeywordTagEdit(userMessage);
        if (keywordTagEditResponse) {
            return keywordTagEditResponse;
        }

        const toolDefinitions = this.agentModeEnabled
            ? this.toolRegistry.getOpenAIToolDefinitions()
            : [];
        const allToolCalls: ToolCall[] = [];
        const toolCallCounts = new Map<string, number>();
        const executedToolResults: ExecutedToolResult[] = [];
        let incompleteToolRetryCount = 0;

        // Build system prompt with tool definitions for better tool usage guidance
        const systemPrompt = this.promptBuilder.buildSystemPrompt(
            toolDefinitions,
            undefined,
            this.activeFilePath ? { activeFilePath: this.activeFilePath } : undefined
        );

        // Build initial messages with file context
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory
        ];

        // Add file context if available
        let finalMessage = userMessage;
        if (this.activeFileContent) {
            finalMessage = this.activeFilePath
                ? `[현재 선택된 파일 경로]\n${this.activeFilePath}\n\n[참고 파일 내용]\n\n${this.activeFileContent}\n\n---\n\n사용자 질문: ${userMessage}`
                : `[참고 파일 내용]\n\n${this.activeFileContent}\n\n---\n\n사용자 질문: ${userMessage}`;
        }

        messages.push({ role: 'user', content: finalMessage });

        // ReAct loop
        while (this.iterationCount < this.maxIterations) {
            this.emitStatus('LLM 응답 대기 중...');
            const result = await this.llmService.chat(messages, toolDefinitions);
            this.iterationCount++;

            // Check for native tool calls first, then fall back to text parsing
            let toolCalls: ToolCall[] = [];

            if (this.agentModeEnabled && result.toolCalls && result.toolCalls.length > 0) {
                // Native tool calling response
                toolCalls = result.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: {
                        name: tc.function.name,
                        arguments: this.safeParseJSON(tc.function.arguments)
                    }
                }));
            } else if (this.agentModeEnabled && result.content) {
                // Fallback: parse text-based tool calls
                toolCalls = this.parseToolCalls(result.content);
            }

            if (toolCalls.length === 0) {
                if (this.hasIncompleteToolCallMarker(result.content)
                    && incompleteToolRetryCount < AgentController.MAX_INCOMPLETE_TOOL_RETRIES) {
                    incompleteToolRetryCount++;
                    messages.push({
                        role: 'system',
                        content: 'Your previous reply contained an incomplete tool call marker. Respond again with either a complete tool call or a normal user-facing answer. Do not output partial tags like <tool_call>.'
                    });
                    continue;
                }

                // No tool calls - model produced final answer
                const normalizedContent = this.normalizeFinalContent(result.content);
                const shouldPreferFallback = this.shouldPreferToolFallback(
                    normalizedContent,
                    executedToolResults
                );
                const finalContent = !shouldPreferFallback && normalizedContent
                    ? normalizedContent
                    : this.buildToolResultFallback(userMessage, executedToolResults);
                this.addToHistory('user', userMessage);
                this.addToHistory('assistant', finalContent);
                return {
                    type: allToolCalls.length > 0 ? 'tool_call' : 'text',
                    content: finalContent,
                    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                };
            }

            const repeatedToolCall = this.findRepeatedToolCall(toolCalls, toolCallCounts);
            if (repeatedToolCall) {
                const repeatedMessage =
                    `반복된 도구 호출이 감지되어 중단했습니다: ${repeatedToolCall.function.name}. ` +
                    '같은 요청을 계속 반복하고 있어 최종 답변을 생성하지 못했습니다.';
                this.addToHistory('user', userMessage);
                this.addToHistory('assistant', repeatedMessage);
                return {
                    type: 'tool_call',
                    content: repeatedMessage,
                    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                };
            }

            allToolCalls.push(...toolCalls);

            // Add assistant message with tool_calls to conversation
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: result.content || '',
                tool_calls: result.toolCalls && result.toolCalls.length > 0
                    ? result.toolCalls
                    : undefined
            };
            messages.push(assistantMsg);

            // Execute all tool calls and add results
            for (const toolCall of toolCalls) {
                this.emitStatus(`도구 실행 중: ${toolCall.function.name}`);
                let toolResult: any;
                try {
                    toolResult = await this.toolRegistry.execute(
                        toolCall.function.name,
                        toolCall.function.arguments
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    toolResult = { error: errorMessage };
                }

                // Add tool result message with matching tool_call_id
                messages.push({
                    role: 'tool',
                    content: JSON.stringify(toolResult),
                    tool_call_id: toolCall.id
                });
                executedToolResults.push({
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments,
                    result: toolResult
                });
            }

            // Loop continues: next iteration gets model's response to tool results
        }

        // Max iterations reached
        return {
            type: 'text',
            content: '최대 도구 호출 횟수에 도달했습니다.'
        };
    }

    private async tryHandleKeywordTagEdit(userMessage: string): Promise<AgentResponse | null> {
        if (!this.activeFilePath || !this.activeFileContent) {
            return null;
        }

        const isKeywordRequest = /키워드|태그/.test(userMessage);
        const isEditRequest = /기재해줘|추가해줘|넣어줘|적용해줘|수정해줘|적어줘|써줘|작성해줘/.test(userMessage);

        if (!isKeywordRequest || !isEditRequest) {
            return null;
        }

        this.emitStatus('키워드 추출 중...');
        const keywords = await this.extractKeywordsFromContent(this.activeFileContent);

        if (keywords.length === 0) {
            const content = '키워드를 추출하지 못해 노트를 수정하지 않았습니다.';
            this.addToHistory('user', userMessage);
            this.addToHistory('assistant', content);
            return { type: 'text', content };
        }

        const updatedContent = this.applyKeywordsToContent(this.activeFileContent, keywords);
        if (updatedContent === this.activeFileContent) {
            const content = `${this.activeFilePath} 파일에는 이미 해당 키워드가 반영되어 있습니다.`;
            this.addToHistory('user', userMessage);
            this.addToHistory('assistant', content);
            return { type: 'text', content };
        }

        this.emitStatus('파일 수정 중...');
        const result = await this.toolRegistry.execute('write_to_file', {
            file_path: this.activeFilePath,
            content: updatedContent
        });

        if (result?.success) {
            this.activeFileContent = updatedContent;
            const content = `${this.activeFilePath} 파일에 관련 키워드 ${keywords.length}개를 기재했습니다.`;
            this.addToHistory('user', userMessage);
            this.addToHistory('assistant', content);
            return { type: 'tool_call', content };
        }

        const error = result?.error || result?.reason || '파일 수정에 실패했습니다.';
        this.addToHistory('user', userMessage);
        this.addToHistory('assistant', error);
        return { type: 'text', content: error };
    }

    /**
     * Safely parse JSON string, returning the object or the original string.
     */
    private safeParseJSON(str: string): any {
        try {
            return JSON.parse(str);
        } catch {
            return { raw: str };
        }
    }

    private findRepeatedToolCall(
        toolCalls: ToolCall[],
        toolCallCounts: Map<string, number>
    ): ToolCall | null {
        for (const toolCall of toolCalls) {
            const signature = this.getToolCallSignature(toolCall);
            const nextCount = (toolCallCounts.get(signature) || 0) + 1;
            toolCallCounts.set(signature, nextCount);

            if (nextCount > AgentController.MAX_REPEAT_TOOL_CALLS) {
                return toolCall;
            }
        }

        return null;
    }

    private getToolCallSignature(toolCall: ToolCall): string {
        return `${toolCall.function.name}:${this.stableStringify(toolCall.function.arguments)}`;
    }

    private stableStringify(value: any): string {
        if (value === null || value === undefined) {
            return String(value);
        }

        if (typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
        }

        const keys = Object.keys(value).sort();
        const entries = keys.map(key => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`);
        return `{${entries.join(',')}}`;
    }

    private async extractKeywordsFromContent(content: string): Promise<string[]> {
        const prompt = `다음 노트에서 검색과 연결에 유용한 핵심 키워드만 추출하세요.

규칙:
- 반드시 한 줄 또는 여러 줄의 해시태그만 출력하세요.
- 설명, 제목, 문장, 번호를 쓰지 마세요.
- 7개 이상 15개 이하로 작성하세요.
- 한국어가 자연스러우면 한국어 태그를 우선하세요.
- 각 태그는 #으로 시작하세요.

        노트 내용:
${content}`;

        const response = await this.llmService.chat([{ role: 'user', content: prompt }], []);
        const matches = response.content.match(/#[^\s#]+/g) || [];
        const normalized = matches
            .map(tag => this.normalizeKeywordTag(tag))
            .filter((tag): tag is string => Boolean(tag));
        return Array.from(new Set(normalized)).slice(0, 15);
    }

    private normalizeKeywordTag(tag: string): string | null {
        if (!tag.startsWith('#')) {
            return null;
        }

        const cleaned = `#${tag
            .slice(1)
            .replace(/[`"'.,:;!?()[\]{}<>/\\|]+/g, '')
            .replace(/^[^0-9A-Za-z가-힣]+/, '')
            .replace(/[^0-9A-Za-z가-힣&+_-]/g, '')}`;

        if (cleaned === '#' || cleaned.length < 3) {
            return null;
        }

        if (!/^#[0-9A-Za-z가-힣]/.test(cleaned)) {
            return null;
        }

        return cleaned;
    }

    private applyKeywordsToContent(content: string, keywords: string[]): string {
        if (keywords.length === 0) {
            return content;
        }

        const existingTags = new Set(content.match(/#[^\s#]+/g) || []);
        const newKeywords = keywords.filter(keyword => !existingTags.has(keyword));

        if (newKeywords.length === 0) {
            return content;
        }

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (frontmatterMatch) {
            const frontmatterBody = frontmatterMatch[1];
            const tagBlockMatch = frontmatterBody.match(/(^tags:\n(?:[ \t]*-[ \t].*\n?)*)/m);

            if (tagBlockMatch) {
                const tagBlock = tagBlockMatch[1];
                const appended = `${tagBlock}${newKeywords.map(tag => `  - ${tag}`).join('\n')}\n`;
                const updatedFrontmatter = frontmatterBody.replace(tagBlock, appended);
                return content.replace(frontmatterBody, updatedFrontmatter);
            }

            const updatedFrontmatter = `${frontmatterBody}\ntags:\n${newKeywords.map(tag => `  - ${tag}`).join('\n')}`;
            return content.replace(frontmatterBody, updatedFrontmatter);
        }

        return `${content.trimEnd()}\n\n## 키워드\n${newKeywords.join(' ')}\n`;
    }

    private normalizeFinalContent(content: string | undefined): string {
        if (!content) {
            return '';
        }

        let normalized = content.replace(/\r\n/g, '\n').trim();
        normalized = normalized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
        normalized = normalized.replace(/<tool>[\s\S]*?<\/tool>/gi, '').trim();
        normalized = normalized.replace(/<invoke>[\s\S]*?<\/invoke>/gi, '').trim();
        normalized = normalized.replace(/<\/?(?:tool_call|tool|invoke)\s*>/gi, '').trim();
        normalized = normalized.replace(/\[Calling tool:[\s\S]*?\]/gi, '').trim();
        normalized = normalized.replace(/\[Calling tool:[\s\S]*$/gi, '').trim();
        normalized = normalized.replace(/\(?\{\s*"file_path"\s*:[\s\S]*$/gi, '').trim();
        normalized = normalized.replace(/<function=[\s\S]*$/gi, '').trim();
        normalized = normalized.replace(/\n{3,}/g, '\n\n');
        normalized = normalized.replace(/[ \t]+\n/g, '\n');

        return normalized;
    }

    private hasIncompleteToolCallMarker(content: string | undefined): boolean {
        if (!content) {
            return false;
        }

        const normalized = content.toLowerCase();
        return /<(tool_call|tool|invoke)>/.test(normalized)
            || /<(tool_call|tool|invoke)\b(?![\s\S]*<\/(?:tool_call|tool|invoke)>)/.test(normalized);
    }

    private shouldPreferToolFallback(
        normalizedContent: string,
        executedToolResults: ExecutedToolResult[]
    ): boolean {
        if (executedToolResults.length === 0) {
            return false;
        }

        if (!normalizedContent) {
            return true;
        }

        const confirmationLikePattern = /추가할까요|적용할까요|수정할까요|기재할까요|원하시나요|필요하신가요/;
        const rawArgsPattern = /"file_path"\s*:|"replacements"\s*:|\[Calling tool:|<function=/;

        return confirmationLikePattern.test(normalizedContent) || rawArgsPattern.test(normalizedContent);
    }

    private buildToolResultFallback(
        userMessage: string,
        executedToolResults: ExecutedToolResult[]
    ): string {
        if (executedToolResults.length === 0) {
            return '응답을 생성하지 못했습니다.';
        }

        const lastResult = executedToolResults[executedToolResults.length - 1];

        if (lastResult.result?.error) {
            return `도구 실행 중 문제가 발생했습니다: ${lastResult.result.error}`;
        }

        if (lastResult.toolName === 'web_search') {
            const provider = lastResult.result?.provider ? ` (${lastResult.result.provider})` : '';
            const results = Array.isArray(lastResult.result?.results)
                ? lastResult.result.results.slice(0, 5)
                : [];

            if (results.length > 0) {
                const lines = results.map((item: any, index: number) => {
                    const title = item.title || `결과 ${index + 1}`;
                    const snippet = item.snippet ? ` - ${item.snippet}` : '';
                    return `${index + 1}. ${title}${snippet}`;
                });
                return [
                    `검색 결과를 바탕으로 바로 답변을 완성하지 못했습니다. 아래는 "${userMessage}" 관련 검색 결과${provider}입니다.`,
                    '',
                    ...lines
                ].join('\n');
            }

            return `웹 검색을 실행했지만 "${userMessage}"에 대한 유의미한 결과를 찾지 못했습니다.`;
        }

        if (lastResult.toolName === 'vault_search') {
            const results = Array.isArray(lastResult.result?.results)
                ? lastResult.result.results.slice(0, 5)
                : [];

            if (results.length > 0) {
                return [
                    `"${userMessage}"와 관련된 볼트 노트를 찾았습니다.`,
                    '',
                    ...results.map((item: any, index: number) => {
                        const title = item.title || item.file_path || `노트 ${index + 1}`;
                        const snippet = item.snippet ? ` - ${item.snippet}` : '';
                        return `${index + 1}. ${title}${snippet}`;
                    })
                ].join('\n');
            }

            return `볼트에서 "${userMessage}"와 관련된 노트를 찾지 못했습니다.`;
        }

        if (lastResult.toolName === 'vault_read_contents') {
            const files = Array.isArray(lastResult.result?.files) ? lastResult.result.files : [];
            if (files.length > 0) {
                return [
                    '노트 내용을 읽어왔지만 최종 요약 문장을 생성하지 못했습니다.',
                    '',
                    ...files.slice(0, 3).map((file: any) => `- ${file.file_path || 'unknown'} (${(file.content || '').length}자)`)
                ].join('\n');
            }
        }

        if (lastResult.toolName === 'vault_summarize' && typeof lastResult.result?.summary === 'string') {
            return lastResult.result.summary;
        }

        if (lastResult.toolName === 'write_to_file') {
            if (lastResult.result?.success && lastResult.result?.file_path) {
                return `요청한 글을 작성해 [${lastResult.result.file_path}] 파일로 저장했습니다.`;
            }

            if (lastResult.result?.reason) {
                return `파일 저장이 완료되지 않았습니다: ${lastResult.result.reason}`;
            }
        }

        if (lastResult.toolName === 'replace_in_file') {
            if (lastResult.result?.success) {
                const applied = lastResult.result?.replacements_applied ?? 0;
                const target = lastResult.args?.file_path || this.activeFilePath || '선택한 파일';
                return `${target} 파일을 수정했습니다. ${applied}개의 변경을 적용했습니다.`;
            }

            if (lastResult.result?.reason) {
                return `파일 수정이 완료되지 않았습니다: ${lastResult.result.reason}`;
            }
        }

        try {
            return [
                '도구를 실행했지만 최종 답변을 완성하지 못했습니다. 도구 결과는 다음과 같습니다.',
                '',
                '```json',
                JSON.stringify(lastResult.result, null, 2),
                '```'
            ].join('\n');
        } catch {
            return '도구를 실행했지만 최종 답변을 완성하지 못했습니다.';
        }
    }

    /**
     * Parse tool calls from LLM text response (fallback).
     * Supports multiple formats:
     * 1. Qwen bracket style: [Calling tool: func_name({...})]
     * 2. Qwen XML style: <tool_call>, <tool>, or <invoke>
     * 3. Standalone JSON: {"name": "...", "arguments": {...}}
     */
    private parseToolCalls(response: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];

        toolCalls.push(...this.extractInlineToolCalls(response));

        if (toolCalls.length > 0) return toolCalls;

        // Strategy 2: Parse Qwen XML style (tool_call, tool, invoke)
        const xmlPattern = /<(?:tool_call|tool|invoke)>\s*([\s\S]*?)\s*<\/(?:tool_call|tool|invoke)>/g;
        let match: RegExpExecArray | null;
        while ((match = xmlPattern.exec(response)) !== null) {
            try {
                const cleanContent = match[1].trim().replace(/<\/?[a-z_]+>/gi, '').trim();
                const parsed = JSON.parse(cleanContent);
                if (parsed.name && parsed.arguments) {
                    toolCalls.push({
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'function',
                        function: { name: parsed.name, arguments: parsed.arguments }
                    });
                }
            } catch (e) {
                console.warn('Failed to parse XML style tool call:', match[0]);
            }
        }

        if (toolCalls.length > 0) return toolCalls;

        // Strategy 3: Standalone JSON with name/arguments
        const jsonPattern = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]*\}|\[[^\]]*\])\s*\}/g;
        while ((match = jsonPattern.exec(response)) !== null) {
            try {
                const parsed = JSON.parse(match[0]);
                if (parsed.name && parsed.arguments) {
                    toolCalls.push({
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'function',
                        function: { name: parsed.name, arguments: parsed.arguments }
                    });
                }
            } catch {
                // Invalid JSON, skip
            }
        }

        return toolCalls;
    }

    private extractInlineToolCalls(response: string): ToolCall[] {
        const prefixes = [
            '[Calling tool:',
            '<function='
        ];
        const toolCalls: ToolCall[] = [];

        for (const prefix of prefixes) {
            let startIndex = 0;

            while (startIndex < response.length) {
                const prefixIndex = response.indexOf(prefix, startIndex);
                if (prefixIndex === -1) {
                    break;
                }

                const nameStart = prefixIndex + prefix.length;
                const openParenIndex = response.indexOf('(', nameStart);
                if (openParenIndex === -1) {
                    break;
                }

                const toolName = response.slice(nameStart, openParenIndex).trim();
                const extraction = this.extractBalancedJsonArgument(response, openParenIndex + 1);

                if (toolName && extraction) {
                    try {
                        toolCalls.push({
                            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            type: 'function',
                            function: {
                                name: toolName,
                                arguments: JSON.parse(extraction.jsonText)
                            }
                        });
                    } catch {
                        console.warn('Failed to parse inline tool call:', response.slice(prefixIndex, extraction.endIndex));
                    }

                    startIndex = extraction.endIndex;
                    continue;
                }

                startIndex = openParenIndex + 1;
            }
        }

        return toolCalls;
    }

    private extractBalancedJsonArgument(
        input: string,
        startIndex: number
    ): { jsonText: string; endIndex: number } | null {
        let depth = 0;
        let inString = false;
        let escaped = false;
        let jsonStart = -1;

        for (let index = startIndex; index < input.length; index++) {
            const char = input[index];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue;
            }

            if ((char === '{' || char === '[') && jsonStart === -1) {
                jsonStart = index;
            }

            if (char === '{' || char === '[') {
                depth++;
                continue;
            }

            if (char === '}' || char === ']') {
                depth--;

                if (depth === 0 && jsonStart !== -1) {
                    return {
                        jsonText: input.slice(jsonStart, index + 1),
                        endIndex: index + 1
                    };
                }
            }
        }

        return null;
    }

    /**
     * Set maximum iterations for the ReAct loop.
     */
    setMaxIterations(iterations: number): void {
        if (iterations < 1) {
            throw new Error('Max iterations must be at least 1');
        }
        this.maxIterations = iterations;
    }

    /**
     * Get current max iterations.
     */
    getMaxIterations(): number {
        return this.maxIterations;
    }

    /**
     * Reset conversation history.
     */
    resetConversation(): void {
        this.conversationHistory = [];
        this.iterationCount = 0;
        this.activeFileContent = null;
        this.activeFilePath = null;
    }

    /**
     * Get conversation history.
     */
    getConversationHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * Add message to conversation history.
     */
    private addToHistory(role: 'system' | 'user' | 'assistant', content: string): void {
        this.conversationHistory.push({ role, content });
    }

    /**
     * Check if agent mode is enabled.
     */
    isAgentModeEnabled(): boolean {
        return this.agentModeEnabled;
    }

    /**
     * Enable or disable agent mode.
     */
    setAgentMode(enabled: boolean): void {
        this.agentModeEnabled = enabled;
    }

    /**
     * Get current iteration count.
     */
    getIterationCount(): number {
        return this.iterationCount;
    }

    /**
     * Get tool registry reference.
     */
    getToolRegistry(): ToolRegistry {
        return this.toolRegistry;
    }

    /**
     * Get prompt builder reference.
     */
    getPromptBuilder(): PromptBuilder {
        return this.promptBuilder;
    }
}
