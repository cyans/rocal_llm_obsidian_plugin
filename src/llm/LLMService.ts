/**
 * LLM Service - API abstraction with native tool calling
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: vLLM-MLX 서버 호환 tool calling 지원, 외부 네트워크 TLS 우회 지원
 */

import { VaultAgentSettings } from '../types';
// Node.js/Electron 환경에서 제공되는 http/https 모듈
import * as http from 'http';
import * as https from 'https';

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
    toolChoice?: 'auto' | 'none';
}

/**
 * vLLM-MLX MCP tool definition from server
 */
export interface MCPToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

/**
 * testConnection() 반환 타입
 */
export interface ConnectionTestResult {
    ok: boolean;
    latencyMs: number;
    error?: string;
}

/**
 * fetch 호환 최소 인터페이스 (fetchInsecure / doFetch 반환 타입)
 * Response 전체 구현 대신 실제 사용하는 메서드만 정의
 */
interface FetchLike {
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

// 기기별 로컬 URL 오버라이드 키 (localStorage에 저장, Obsidian Sync 제외)
export const LOCAL_URL_STORAGE_KEY = 'vault-agent-local-url';

export class LLMService {
    private settings: VaultAgentSettings;

    constructor(settings: VaultAgentSettings) {
        this.settings = settings;
    }

    /**
     * 실제 사용할 API URL 반환
     * localStorage의 로컬 오버라이드 URL이 있으면 우선 사용 (Sync 제외)
     */
    private get effectiveApiUrl(): string {
        const localOverride = localStorage.getItem(LOCAL_URL_STORAGE_KEY);
        return (localOverride && localOverride.trim()) ? localOverride.trim() : this.settings.apiUrl;
    }

    /**
     * Node.js https/http 모듈을 사용해 TLS 검증을 우회하는 fetch
     * Electron/Obsidian 환경에서 자가 서명 인증서 허용 시 사용
     * @MX:WARN: rejectUnauthorized=false는 보안 위험이 있음. 신뢰된 로컬/사설 네트워크에서만 사용
     * @MX:REASON: 자가 서명 인증서 환경(iPhone, Windows 외부 접근)에서 CA 설치 없이 연결하기 위함
     */
    private fetchInsecure(
        url: string,
        init?: RequestInit
    ): Promise<FetchLike> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const transport = isHttps ? https : http;

            // TLS 검증 비활성화 옵션
            // @MX:WARN: rejectUnauthorized=false는 보안 위험. 신뢰된 로컬/사설 네트워크에서만 사용
            // @MX:REASON: Caddy tls internal 사용 시 IP 접속에서 TLSV1_ALERT_INTERNAL_ERROR 발생.
            //   minVersion/maxVersion 제거 후 TLS 버전을 자연 협상에 맡기고, 인증서 검증만 비활성화.
            //   IP 주소 접속 시 Caddy의 SNI 불일치를 우회하기 위해 servername을 'localhost'로 고정.
            const hostname = parsedUrl.hostname;
            const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/.test(hostname);
            const options: https.RequestOptions = {
                hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: (init?.method ?? 'GET').toUpperCase(),
                headers: init?.headers as Record<string, string> | undefined,
                rejectUnauthorized: false,          // 인증서 체인 검증 비활성화
                checkServerIdentity: () => undefined, // 호스트명 검증도 비활성화
                // IP 주소로 접속 시 Caddy의 tls internal 인증서(localhost 기준) 매칭을 위해
                // SNI를 'localhost'로 오버라이드. 도메인 접속 시에는 원래 호스트명 사용.
                servername: isIpAddress ? 'localhost' : hostname,
            };

            const req = transport.request(options, (res) => {
                const chunks: Buffer[] = [];

                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    const bodyBuffer = Buffer.concat(chunks);
                    const bodyText = bodyBuffer.toString('utf-8');

                    // Response-compatible 객체 반환
                    const status = res.statusCode ?? 0;
                    const statusText = res.statusMessage ?? '';
                    const ok = status >= 200 && status < 300;

                    resolve({
                        ok,
                        status,
                        statusText,
                        text: () => Promise.resolve(bodyText),
                        json: () => Promise.resolve(JSON.parse(bodyText)),
                    });
                });

                res.on('error', reject);
            });

            req.on('error', reject);

            // 요청 body 전송
            if (init?.body) {
                if (typeof init.body === 'string') {
                    req.write(init.body);
                } else if (Buffer.isBuffer(init.body)) {
                    req.write(init.body);
                }
            }

            req.end();
        });
    }

    /**
     * 설정에 따라 일반 fetch 또는 TLS 우회 fetch를 선택하는 헬퍼
     * @MX:ANCHOR: 모든 외부 HTTP 요청의 단일 진입점
     * @MX:REASON: allowInsecureTls 설정을 중앙화하여 fetch 분기를 일관되게 관리
     */
    private doFetch(url: string, init?: RequestInit): Promise<FetchLike> {
        if (this.settings.allowInsecureTls) {
            return this.fetchInsecure(url, init);
        }
        return fetch(url, init);
    }

    /**
     * LLM 서버 연결 상태를 테스트하는 메서드
     * GET {apiUrl}/models (또는 /v1/models) 엔드포인트로 헬스체크
     */
    async testConnection(): Promise<ConnectionTestResult> {
        const apiUrl = this.effectiveApiUrl;
        const start = Date.now();

        // 시도할 엔드포인트 목록 (순서대로 시도)
        const endpoints = [`${apiUrl}/models`, `${apiUrl}/v1/models`];

        for (const endpoint of endpoints) {
            try {
                const response = await this.doFetch(endpoint, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.settings.apiKey
                            ? { 'Authorization': `Bearer ${this.settings.apiKey}` }
                            : {}),
                    },
                });

                const latencyMs = Date.now() - start;

                if (response.ok) {
                    return { ok: true, latencyMs };
                }

                // 404는 다음 엔드포인트 시도, 그 외 오류는 즉시 반환
                if (response.status !== 404) {
                    return {
                        ok: false,
                        latencyMs,
                        error: `HTTP ${response.status} ${response.statusText}`,
                    };
                }
            } catch (err) {
                // 마지막 엔드포인트에서 오류가 나면 반환
                if (endpoint === endpoints[endpoints.length - 1]) {
                    const latencyMs = Date.now() - start;
                    const message = err instanceof Error ? err.message : String(err);
                    return { ok: false, latencyMs, error: message };
                }
            }
        }

        // 모든 엔드포인트 실패
        return { ok: false, latencyMs: Date.now() - start, error: '연결 가능한 엔드포인트를 찾지 못했습니다' };
    }

    /**
     * Fetch available tools from vLLM-MLX MCP server
     * Returns tools in OpenAI-compatible format
     */
    async fetchMCPTools(): Promise<OpenAIToolDef[]> {
        const apiUrl = this.effectiveApiUrl;

        try {
            // doFetch: allowInsecureTls 설정에 따라 TLS 우회 여부 결정
            const response = await this.doFetch(`${apiUrl}/mcp/tools`, {
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
        const apiUrl = this.effectiveApiUrl;

        // doFetch: allowInsecureTls 설정에 따라 TLS 우회 여부 결정
        const response = await this.doFetch(`${apiUrl}/mcp/execute`, {
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
        const apiUrl = this.effectiveApiUrl;
        const { model, maxTokens, temperature, apiKey } = this.settings;

        const body: Record<string, any> = {
            model,
            messages,
            max_tokens: options?.maxTokens ?? maxTokens,
            temperature: options?.temperature ?? temperature,
        };

        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = options?.toolChoice ?? 'auto';
        }

        try {
            // doFetch: allowInsecureTls 설정에 따라 TLS 우회 여부 결정
            const response = await this.doFetch(`${apiUrl}/chat/completions`, {
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
