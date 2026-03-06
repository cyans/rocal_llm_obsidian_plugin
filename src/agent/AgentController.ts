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
        const toolDefinitions = this.agentModeEnabled
            ? this.toolRegistry.getOpenAIToolDefinitions()
            : [];
        const allToolCalls: ToolCall[] = [];
        const toolCallCounts = new Map<string, number>();
        const executedToolResults: ExecutedToolResult[] = [];

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
                // No tool calls - model produced final answer
                const normalizedContent = this.normalizeFinalContent(result.content);
                const finalContent = normalizedContent
                    || this.buildToolResultFallback(userMessage, executedToolResults);
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

    private normalizeFinalContent(content: string | undefined): string {
        if (!content) {
            return '';
        }

        let normalized = content.replace(/\r\n/g, '\n').trim();
        normalized = normalized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
        normalized = normalized.replace(/<tool>[\s\S]*?<\/tool>/gi, '').trim();
        normalized = normalized.replace(/<invoke>[\s\S]*?<\/invoke>/gi, '').trim();
        normalized = normalized.replace(/\[Calling tool:[\s\S]*?\]/gi, '').trim();
        normalized = normalized.replace(/\[Calling tool:[\s\S]*$/gi, '').trim();
        normalized = normalized.replace(/<function=[\s\S]*$/gi, '').trim();
        normalized = normalized.replace(/\n{3,}/g, '\n\n');
        normalized = normalized.replace(/[ \t]+\n/g, '\n');

        return normalized;
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

        // Strategy 1: Parse Qwen bracket style
        const bracketPattern = /\[Calling tool:\s*(\w+)\s*\((\{[\s\S]*?\})\)\]/g;
        let match: RegExpExecArray | null;
        while ((match = bracketPattern.exec(response)) !== null) {
            try {
                const toolName = match[1];
                const args = JSON.parse(match[2]);
                toolCalls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'function',
                    function: { name: toolName, arguments: args }
                });
            } catch (e) {
                console.warn('Failed to parse bracket style tool call:', match[0]);
            }
        }

        if (toolCalls.length > 0) return toolCalls;

        // Strategy 2: Parse Qwen XML style (tool_call, tool, invoke)
        const xmlPattern = /<(?:tool_call|tool|invoke)>\s*([\s\S]*?)\s*<\/(?:tool_call|tool|invoke)>/g;
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
