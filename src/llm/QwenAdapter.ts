/**
 * Qwen 3.5 Adapter
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: Qwen 3.5 전용 어댑터, tool-calling 지원
 */

import { ChatMessage } from './LLMService';

export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: Record<string, any>;
            required: string[];
        };
    };
}

export class QwenAdapter {
    /**
     * tool definitions를 OpenAI 호환 포맷으로 변환
     */
    formatToolDefinitions(tools: Array<{ name: string; description: string; parameters: any }>): ToolDefinition[] {
        // 단순화된 스키마 - description 제거, type 필수만 유지
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: tool.parameters.properties || {},
                    required: tool.parameters.required || []
                }
            }
        }));
    }

    /**
     * 메시지를 OpenAI 호환 포맷으로 변환
     */
    formatMessages(messages: ChatMessage[]): ChatMessage[] {
        return messages;
    }

    /**
     * 응답에서 tool call 추출
     */
    extractToolCall(response: string): ToolCall | null {
        try {
            const parsed = JSON.parse(response);

            // OpenAI tool call format
            if (parsed.choices?.[0]?.message?.tool_calls) {
                const toolCall = parsed.choices[0].message.tool_calls[0];
                return {
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments),
                };
            }
        } catch {
            // JSON 파싱 실패 시 null 반환
        }

        return null;
    }
}
