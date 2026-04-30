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
            // @MX:REASON: Caddy tls internal 사용 시 SNI 불일치로 TLSV1_ALERT_INTERNAL_ERROR 발생.
            //   allowInsecureTls 모드에서는 SNI를 항상 'localhost'로 고정.
            //   이유: DDNS 도메인(eeum.iptime.org 등)으로 접속해도 Caddy는 localhost 인증서를 발급하므로,
            //   도메인명 그대로 SNI를 보내면 서버가 인증서를 찾지 못해 internal_error(alert 80)를 반환.
            //   rejectUnauthorized: false이므로 인증서 검증은 비활성화되어 SNI 값 자체는 무관.
            const hostname = parsedUrl.hostname;

            // @MX:NOTE: Phase 2 수정 - body를 Buffer로 사전 변환하여 정확한 Content-Length 산출.
            //   Node.js https.request에 Content-Length 미지정 시 Transfer-Encoding: chunked 사용.
            //   일부 외부 NAT/라우터가 chunked 업로드를 잘못 처리하여 Caddy가 빈 body를 수신,
            //   vLLM에 empty POST 전달 → 200 응답(혹은 hang) 발생 가능성.
            let bodyBuffer: Buffer | null = null;
            if (init?.body) {
                if (typeof init.body === 'string') {
                    bodyBuffer = Buffer.from(init.body, 'utf-8');
                } else if (Buffer.isBuffer(init.body)) {
                    bodyBuffer = init.body;
                }
            }

            // 사용자가 넘긴 헤더 복사 + Content-Length/Connection 자동 세팅
            const mergedHeaders: Record<string, string> = {
                ...(init?.headers as Record<string, string> | undefined),
            };
            if (bodyBuffer) {
                // 명시적 Content-Length → chunked 전송 회피
                mergedHeaders['Content-Length'] = String(bodyBuffer.length);
            }
            // Keep-alive 연결 재사용이 일부 NAT에서 불안정. 단일 요청으로 단순화.
            if (!mergedHeaders['Connection']) {
                mergedHeaders['Connection'] = 'close';
            }

            const options: https.RequestOptions = {
                hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: (init?.method ?? 'GET').toUpperCase(),
                headers: mergedHeaders,
                rejectUnauthorized: false,          // 인증서 체인 검증 비활성화
                checkServerIdentity: () => undefined, // 호스트명 검증도 비활성화
                // allowInsecureTls 모드에서는 SNI를 항상 'localhost'로 고정.
                // IP/DDNS 도메인 모두 Caddy의 localhost 인증서를 사용하도록 통일.
                servername: 'localhost',
                // TLS 1.2로 고정: BoringSSL TLS 1.3 협상 시 일부 서버에서 internal_error 발생.
                maxVersion: 'TLSv1.2',
                // @MX:WARN: Agent false로 연결 풀링 완전 비활성화.
                // @MX:REASON: 기본 globalAgent가 keepalive 소켓을 재사용하는데,
                //   외부 NAT/라우터가 idle 연결을 RST로 종료한 뒤 재사용 시 ECONNRESET 발생.
                //   매 요청마다 새 TCP+TLS 핸드셰이크 수행하여 안정성 확보 (성능 손실 < 300ms).
                agent: false,
            };

            // @MX:NOTE: Phase 1 진단 로깅 - 외부 접속 시 빈 body 반환 원인 추적용
            const reqStart = Date.now();
            const logPrefix = `[LLM][fetchInsecure] ${options.method} ${url}`;
            console.log(
                `${logPrefix} request start bodyBytes=${bodyBuffer?.length ?? 0} ` +
                `contentLength=${mergedHeaders['Content-Length'] ?? '(none)'} ` +
                `connection=${mergedHeaders['Connection']}`
            );

            const req = transport.request(options, (res) => {
                const chunks: Buffer[] = [];
                let receivedBytes = 0;

                // 응답 헤더 수신 시점 로깅 (status, headers, content-length 확인)
                console.log(
                    `${logPrefix} response received status=${res.statusCode} statusText=${res.statusMessage} ` +
                    `headers=${JSON.stringify(res.headers)} elapsedMs=${Date.now() - reqStart}`
                );

                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                    receivedBytes += chunk.length;
                });

                // NAT/프록시/서버 측에서 연결을 끊은 경우 (일반적인 'end'가 아닌 강제 종료)
                res.on('aborted', () => {
                    console.warn(
                        `${logPrefix} response ABORTED after ${receivedBytes} bytes, elapsedMs=${Date.now() - reqStart}`
                    );
                });

                // 소켓이 닫힐 때 호출 (정상 종료와 비정상 종료 모두 포함)
                res.on('close', () => {
                    console.log(
                        `${logPrefix} response closed bytes=${receivedBytes} elapsedMs=${Date.now() - reqStart}`
                    );
                });

                res.on('end', () => {
                    const bodyBuffer = Buffer.concat(chunks);
                    const bodyText = bodyBuffer.toString('utf-8');

                    // Response-compatible 객체 반환
                    const status = res.statusCode ?? 0;
                    const statusText = res.statusMessage ?? '';
                    const ok = status >= 200 && status < 300;

                    // 빈 body 또는 짧은 body 진단용 로깅
                    const preview = bodyText.length > 500 ? bodyText.slice(0, 500) + '…' : bodyText;
                    console.log(
                        `${logPrefix} body end length=${bodyText.length} preview=${JSON.stringify(preview)} ` +
                        `elapsedMs=${Date.now() - reqStart}`
                    );

                    resolve({
                        ok,
                        status,
                        statusText,
                        text: () => Promise.resolve(bodyText),
                        json: () => {
                            // 빈 body에 대한 명시적 에러 메시지 (진단용)
                            if (!bodyText || bodyText.trim() === '') {
                                return Promise.reject(
                                    new Error(
                                        `Empty response body (status=${status}, headers=${JSON.stringify(res.headers)})`
                                    )
                                );
                            }
                            try {
                                return Promise.resolve(JSON.parse(bodyText));
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : String(e);
                                return Promise.reject(
                                    new Error(`JSON parse failed: ${msg}, raw body (first 500 chars)=${preview}`)
                                );
                            }
                        },
                    });
                });

                res.on('error', (err) => {
                    console.error(
                        `${logPrefix} response error after ${receivedBytes} bytes, elapsedMs=${Date.now() - reqStart}`,
                        err
                    );
                    reject(err);
                });
            });

            // 요청 타임아웃: LLM 추론이 길 수 있으므로 10분으로 설정 (기본값은 무제한)
            req.setTimeout(600000, () => {
                console.error(`${logPrefix} request TIMEOUT after 600s, elapsedMs=${Date.now() - reqStart}`);
                req.destroy(new Error('Request timeout (600s)'));
            });

            req.on('error', (err) => {
                console.error(`${logPrefix} request error elapsedMs=${Date.now() - reqStart}`, err);
                reject(err);
            });

            // 소켓 레벨 이벤트 진단 (외부 NAT/라우터 문제 추적)
            req.on('socket', (socket) => {
                socket.on('connect', () => {
                    console.log(`${logPrefix} socket connected elapsedMs=${Date.now() - reqStart}`);
                });
                socket.on('secureConnect', () => {
                    console.log(
                        `${logPrefix} TLS handshake done ` +
                        `protocol=${(socket as any).getProtocol?.()} ` +
                        `authorized=${(socket as any).authorized} ` +
                        `elapsedMs=${Date.now() - reqStart}`
                    );
                });
                socket.on('close', (hadError: boolean) => {
                    console.log(
                        `${logPrefix} socket closed hadError=${hadError} elapsedMs=${Date.now() - reqStart}`
                    );
                });
                socket.on('error', (err) => {
                    console.error(
                        `${logPrefix} socket error elapsedMs=${Date.now() - reqStart}`,
                        err
                    );
                });
            });

            // 요청 body 전송 (Buffer로 통일, Content-Length 일치 보장)
            if (bodyBuffer) {
                req.write(bodyBuffer);
                console.log(
                    `${logPrefix} request body written bytes=${bodyBuffer.length} ` +
                    `elapsedMs=${Date.now() - reqStart}`
                );
            }

            req.end(() => {
                console.log(`${logPrefix} request end() called elapsedMs=${Date.now() - reqStart}`);
            });
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

        // Disable Qwen-family thinking/reasoning mode (vLLM, SGLang, Ollama-compat).
        // Unknown fields are ignored by non-supporting servers, so this is safe.
        body.chat_template_kwargs = {
            ...(body.chat_template_kwargs ?? {}),
            enable_thinking: false,
        };

        // @MX:NOTE: Phase 1 진단 로깅 - chat 요청 자체 추적
        const chatStart = Date.now();
        const chatEndpoint = `${apiUrl}/chat/completions`;
        console.log(
            `[LLM][chat] POST ${chatEndpoint} model=${model} ` +
            `messages=${messages.length} tools=${tools?.length ?? 0} ` +
            `maxTokens=${body.max_tokens} temperature=${body.temperature}`
        );

        try {
            // doFetch: allowInsecureTls 설정에 따라 TLS 우회 여부 결정
            const response = await this.doFetch(chatEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[LLM][chat] API error status=${response.status} statusText=${response.statusText} ` +
                    `body=${errorText}`
                );
                throw new Error(`LLM API error: ${response.status} ${response.statusText} body=${errorText}`);
            }

            // raw text를 먼저 읽어 빈 body 여부를 확인 후 JSON 파싱
            const rawText = await response.text();
            console.log(
                `[LLM][chat] response ok=true length=${rawText.length} ` +
                `elapsedMs=${Date.now() - chatStart}`
            );

            if (!rawText || rawText.trim() === '') {
                throw new Error(
                    `LLM returned empty body despite status ${response.status}. ` +
                    `This usually indicates a proxy/NAT timeout, response buffering issue, ` +
                    `or the server closed the connection before sending data.`
                );
            }

            let data: any;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                const preview = rawText.length > 500 ? rawText.slice(0, 500) + '…' : rawText;
                throw new Error(
                    `LLM response JSON parse failed: ${msg}. Raw body (first 500 chars): ${preview}`
                );
            }

            console.log('[LLM][chat] parsed response:', JSON.stringify(data, null, 2));

            const message = data.choices?.[0]?.message;

            // vLLM reasoning_content 진단 로그 — 추론 파서 활성화 여부 확인용
            const reasoningContent = message?.reasoning_content;
            if (reasoningContent && typeof reasoningContent === 'string' && reasoningContent.length > 0) {
                console.log(
                    `[LLM][chat] reasoning_content present (length=${reasoningContent.length}); ` +
                    `using only message.content. vLLM reasoning parser appears active.`
                );
            }

            const content = message?.content ?? '';

            // reasoning_content만 있고 content가 비어 있는 경우 경고 (파서 오설정 가능성)
            if (!content && reasoningContent) {
                console.warn(
                    `[LLM][chat] message.content is empty but reasoning_content has ${reasoningContent.length} chars. ` +
                    `vLLM reasoning parser may be misconfigured or the model emitted only reasoning. ` +
                    `Returning empty content; downstream will trigger fallback.`
                );
            }

            const toolCalls: ToolCallResponse[] = message?.tool_calls ?? [];

            return { content, toolCalls };
        } catch (error) {
            console.error(`[LLM][chat] FAILED elapsedMs=${Date.now() - chatStart}`, error);
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
