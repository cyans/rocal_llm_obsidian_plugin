/**
 * LLM Service - API abstraction with native tool calling
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: vLLM-MLX 서버 호환 tool calling 지원
 */

import { VaultAgentSettings } from '../types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCallResponse[];
    tool_call_id?: string;
}

export interface ToolCallResponse {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface OpenAIToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface LLMChatResult {
    content: string;
    toolCalls: ToolCallResponse[];
}

export interface LLMChatOptions {
    maxTokens?: number;
    temperature?: number;
}

/**
 * vLLM-MLX MCP tool definition from server
 */
export interface MCPToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

export class LLMService {
    private settings: VaultAgentSettings;

    constructor(settings: VaultAgentSettings) {
        this.settings = settings;
    }

    /**
     * Fetch available tools from vLLM-MLX MCP server
     * Returns tools in OpenAI-compatible format
     */
    async fetchMCPTools(): Promise<OpenAIToolDef[]> {
        const { apiUrl } = this.settings;

        try {
            const response = await fetch(`${apiUrl}/mcp/tools`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.warn('Failed to fetch MCP tools:', response.status);
                return [];
            }

            const data: any = await response.json();
            const mcpTools: MCPToolDefinition[] = data.tools || [];

            console.log('[LLM] Fetched MCP tools:', mcpTools.length);

            return mcpTools.map(tool => ({
                type: 'function' as const,
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema || {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                }
            }));
        } catch (error) {
            console.warn('Error fetching MCP tools:', error);
            return [];
        }
    }

    /**
     * Execute a tool via vLLM-MLX MCP server
     */
    async executeMCPTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
        const { apiUrl } = this.settings;

        const response = await fetch(`${apiUrl}/mcp/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tool_name: toolName,
                arguments: toolArgs
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MCP tool execution failed: ${response.status} ${errorText}`);
        }

        const data: any = await response.json();
        return data.result;
    }

    /**
     * Send chat completion request to LLM API with native tool calling.
     * vLLM-MLX 호환: tool_choice="auto" 필수
     */
    async chat(
        messages: ChatMessage[],
        tools?: OpenAIToolDef[],
        options?: LLMChatOptions
    ): Promise<LLMChatResult> {
        const { apiUrl, model, maxTokens, temperature, apiKey } = this.settings;

        const body: Record<string, any> = {
            model,
            messages,
            max_tokens: options?.maxTokens ?? maxTokens,
            temperature: options?.temperature ?? temperature,
        };

        // vLLM-MLX 필수: tools가 있으면 항상 tool_choice="auto" 포함
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        try {
            const response = await fetch(`${apiUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('LLM API Error Response:', errorText);
                throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
            }

            const data: any = await response.json();
            console.log('LLM API Response:', JSON.stringify(data, null, 2));

            const message = data.choices?.[0]?.message;
            const content = message?.content ?? '';
            const toolCalls: ToolCallResponse[] = message?.tool_calls ?? [];

            return { content, toolCalls };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`LLM connection failed: ${error.message}`);
            }
            throw new Error('Unknown LLM error');
        }
    }

    /**
     * Update settings
     */
    updateSettings(settings: VaultAgentSettings): void {
        this.settings = settings;
    }
}
