/**
 * AgentController Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 2
 */

import { AgentController } from '../../../src/agent/AgentController';
import { ToolRegistry } from '../../../src/agent/ToolRegistry';
import { LLMService, LLMChatResult } from '../../../src/llm/LLMService';
import { BaseTool, ToolDefinition } from '../../../src/tools/BaseTool';
import { VaultAgentSettings } from '../../../src/types';

// Mock App
class MockApp {
    vault: any = {};
    metadataCache: any = {};
}

class MockSearchTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'vault_search',
        description: 'Search vault notes',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' }
            },
            required: ['query']
        }
    };

    async execute(params: Record<string, any>): Promise<any> {
        return { results: [{ title: 'Note 1', content: 'Content 1' }] };
    }
}

// Helper to create LLMChatResult
function textResult(content: string): LLMChatResult {
    return { content, toolCalls: [] };
}

function toolCallResult(name: string, args: Record<string, any>): LLMChatResult {
    return {
        content: '',
        toolCalls: [{
            id: `call_test_${Date.now()}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) }
        }]
    };
}

describe('AgentController', () => {
    let agentController: AgentController;
    let toolRegistry: ToolRegistry;
    let llmService: LLMService;
    let mockSettings: VaultAgentSettings;
    let mockTool: MockSearchTool;

    beforeEach(() => {
        mockSettings = {
            apiUrl: 'http://localhost:11434/v1',
            model: 'qwen3.6:latest',
            apiKey: '',
            maxTokens: 4096,
            temperature: 0.7,
            agentMode: true,
            braveApiKey: '', // Brave Search API 키
            allowInsecureTls: false,
            autoApplyFileChanges: false,
            tools: {
                vaultSearch: true,
                webSearch: true,
                writeToFile: true,
                replaceInFile: true,
                youtubeTranscript: true,
                vaultReadContents: true,
                vaultSummarize: true,
            },
        };

        const mockApp = new MockApp() as any;
        toolRegistry = new ToolRegistry(mockApp);
        llmService = new LLMService(mockSettings);
        mockTool = new MockSearchTool();
        toolRegistry.register(mockTool);

        agentController = new AgentController(llmService, toolRegistry);
    });

    describe('processMessage', () => {
        it('should process user message and return text response', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat').mockResolvedValue(
                textResult('Hello! How can I help you today?')
            );

            const result = await agentController.processMessage('Hello');

            expect(result).toBeDefined();
            expect(result.type).toBe('text');
            expect(result.content).toBe('Hello! How can I help you today?');
            expect(chatSpy).toHaveBeenCalled();
        });

        it('should handle native tool calls from LLM', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'testing' }))
                .mockResolvedValueOnce(textResult('I found notes about testing.'));

            const result = await agentController.processMessage('Search for notes about testing');

            expect(result).toBeDefined();
            expect(result.type).toBe('tool_call');
            expect(result.toolCalls).toBeDefined();
            expect(result.toolCalls![0].function.name).toBe('vault_search');
        });

        it('should respect max iterations limit', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat')
                .mockResolvedValue(textResult('Here is the information.'));

            const result = await agentController.processMessage('Find information');

            expect(result).toBeDefined();
            expect(chatSpy).toHaveBeenCalled();
        });

        it('should handle LLM errors gracefully', async () => {
            jest.spyOn(llmService, 'chat').mockRejectedValue(
                new Error('LLM connection failed')
            );

            await expect(agentController.processMessage('Hello')).rejects.toThrow();
        });

        it('should handle tool execution errors', async () => {
            const failingTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'failing_tool',
                    description: 'A tool that fails',
                    parameters: { type: 'object', properties: {}, required: [] }
                };
                async execute(): Promise<any> {
                    throw new Error('Tool failed');
                }
            };
            toolRegistry.register(failingTool);

            const chatSpy = jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{
                        id: 'call_fail',
                        type: 'function',
                        function: { name: 'failing_tool', arguments: '{}' }
                    }]
                })
                .mockResolvedValueOnce(textResult('The tool failed, but I can still help.'));

            const result = await agentController.processMessage('Use failing tool');
            expect(result.content).toBe('The tool failed, but I can still help.');
        });

        it('should stop repeated identical tool calls before max iterations', async () => {
            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop' }))
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop' }))
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop' }));

            const result = await agentController.processMessage('Loop request');

            expect(result.type).toBe('tool_call');
            expect(result.content).toContain('반복된 도구 호출이 감지되어 중단했습니다');
            expect(agentController.getIterationCount()).toBe(3);
        });

        it('should fall back to tool results when the final assistant content is empty', async () => {
            const webSearchTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'web_search',
                    description: 'Search the web',
                    parameters: {
                        type: 'object',
                        properties: { query: { type: 'string' } },
                        required: ['query']
                    }
                };

                async execute(): Promise<any> {
                    return {
                        success: true,
                        provider: 'test-provider',
                        results: [
                            {
                                title: '서울 날씨',
                                snippet: '내일 서울은 대체로 맑고 최고 10도, 최저 2도 예상',
                                url: 'https://example.com/weather'
                            }
                        ]
                    };
                }
            };
            toolRegistry.register(webSearchTool);

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('web_search', { query: '내일 서울 날씨' }))
                .mockResolvedValueOnce(textResult(''));

            const result = await agentController.processMessage('내일 서울 날씨는?');

            expect(result.type).toBe('tool_call');
            expect(result.content).toContain('검색 결과를 바탕으로 바로 답변을 완성하지 못했습니다');
            expect(result.content).toContain('서울 날씨');
        });

        it('should return a friendly message when write_to_file succeeds but final content is empty', async () => {
            const writeTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'write_to_file',
                    description: 'Write a file',
                    parameters: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['file_path', 'content']
                    }
                };

                async execute(params: Record<string, any>): Promise<any> {
                    return { success: true, file_path: params.file_path };
                }
            };
            toolRegistry.register(writeTool);

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('write_to_file', {
                    file_path: 'note.md',
                    content: 'hello'
                }))
                .mockResolvedValueOnce(textResult(''));

            const result = await agentController.processMessage('글을 써서 저장해줘');

            expect(result.content).toContain('요청한 글을 작성해');
            expect(result.content).toContain('note.md');
        });

        it('should include selected file path in system prompt and user context', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat').mockResolvedValue(
                textResult('수정했습니다.')
            );

            agentController.setActiveFilePath('notes/current.md');
            agentController.setActiveFileContent('# Title\nbody');

            await agentController.processMessage('이 노트를 요약해줘');

            const [messages] = chatSpy.mock.calls[0];
            expect(messages[0].content).toContain('CURRENTLY SELECTED FILE');
            expect(messages[0].content).toContain('notes/current.md');
            expect(messages[messages.length - 1].content).toContain('[현재 선택된 파일 경로]');
            expect(messages[messages.length - 1].content).toContain('notes/current.md');
        });

        it('should directly write extracted keywords into the selected note', async () => {
            const writeTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'write_to_file',
                    description: 'Write a file',
                    parameters: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['file_path', 'content']
                    }
                };

                async execute(params: Record<string, any>): Promise<any> {
                    return { success: true, file_path: params.file_path, content: params.content };
                }
            };
            toolRegistry.register(writeTool);
            agentController.setActiveFilePath('notes/current.md');
            agentController.setActiveFileContent(`---
title: Test
---

본문 내용`);

            jest.spyOn(llmService, 'chat').mockResolvedValue(
                textResult('#키워드1 #키워드2 #키워드3 #키워드4 #키워드5 #키워드6 #키워드7')
            );

            const result = await agentController.processMessage('이 노트의 키워드를 작성해서 노트에 기재해줘');

            expect(result.content).toContain('notes/current.md 파일에 관련 키워드 7개를 기재했습니다');
        });

        it('should return a friendly message when replace_in_file succeeds but final content is empty', async () => {
            const replaceTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'replace_in_file',
                    description: 'Replace text in file',
                    parameters: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            replacements: { type: 'array' }
                        },
                        required: ['file_path', 'replacements']
                    }
                };

                async execute(): Promise<any> {
                    return { success: true, replacements_applied: 2 };
                }
            };
            toolRegistry.register(replaceTool);
            agentController.setActiveFilePath('notes/current.md');

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('replace_in_file', {
                    file_path: 'notes/current.md',
                    replacements: []
                }))
                .mockResolvedValueOnce(textResult(''));

            const result = await agentController.processMessage('키워드를 넣어줘');

            expect(result.content).toContain('notes/current.md 파일을 수정했습니다');
            expect(result.content).toContain('2개의 변경');
        });

        it('should prefer replace fallback when the model returns a confirmation question after editing', async () => {
            const replaceTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'replace_in_file',
                    description: 'Replace text in file',
                    parameters: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            replacements: { type: 'array' }
                        },
                        required: ['file_path', 'replacements']
                    }
                };

                async execute(): Promise<any> {
                    return { success: true, replacements_applied: 1 };
                }
            };
            toolRegistry.register(replaceTool);
            agentController.setActiveFilePath('notes/current.md');

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('replace_in_file', {
                    file_path: 'notes/current.md',
                    replacements: []
                }))
                .mockResolvedValueOnce(textResult('이 키워드들을 현재 파일에 추가할까요?'));

            const result = await agentController.processMessage('이 키워드들을 노트에 기재해줘');

            expect(result.content).toContain('notes/current.md 파일을 수정했습니다');
            expect(result.content).not.toContain('추가할까요');
        });

        it('should fall back when final response only contains raw tool call markup', async () => {
            jest.spyOn(mockTool, 'execute').mockResolvedValue({
                results: [
                    {
                        title: '인포그래픽 정리',
                        file_path: 'notes/infographic.md',
                        snippet: '인포그래픽의 구조, 정보 밀도, 시각적 위계에 대한 메모'
                    }
                ]
            });

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: '인포그래픽' }))
                .mockResolvedValueOnce(textResult('({"file_path":"notes/current.md","replacements":[]})'));

            const result = await agentController.processMessage('인포그래픽 글 찾아줘');

            expect(result.content).toContain('관련된 볼트 노트를 찾았습니다');
            expect(result.content).toContain('인포그래픽 정리');
        });

        it('should parse multiline replace_in_file tool calls embedded in text', async () => {
            const replaceTool = new class extends BaseTool {
                definition: ToolDefinition = {
                    name: 'replace_in_file',
                    description: 'Replace text in file',
                    parameters: {
                        type: 'object',
                        properties: {
                            file_path: { type: 'string' },
                            replacements: { type: 'array' }
                        },
                        required: ['file_path', 'replacements']
                    }
                };

                async execute(): Promise<any> {
                    return { success: true, replacements_applied: 1 };
                }
            };
            toolRegistry.register(replaceTool);

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(textResult(`이 키워드들을 노트에 기재해줘

[Calling tool: replace_in_file({
  "file_path": "notes/current.md",
  "replacements": [
    {
      "search": "## Tags",
      "replace": "## Tags\\n#AI음악 #프롬프트엔지니어링"
    }
  ]
})]`))
                .mockResolvedValueOnce(textResult(''));

            const result = await agentController.processMessage('이 키워드들을 노트에 기재해줘');

            expect(result.content).toContain('파일을 수정했습니다');
        });

        it('should retry when the model returns an incomplete tool_call marker', async () => {
            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(textResult('<tool_call>'))
                .mockResolvedValueOnce(textResult('정리한 내용을 현재 노트에 반영했습니다.'));

            const result = await agentController.processMessage('이 글 내용도 보기 좋게 정리해서 다시 이 노트에 작성해줘');

            expect(result.content).toBe('정리한 내용을 현재 노트에 반영했습니다.');
            expect(agentController.getIterationCount()).toBe(2);
        });

        it('should force a final text-only answer after too many tool rounds', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop-1' }))
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop-2' }))
                .mockResolvedValueOnce(toolCallResult('vault_search', { query: 'loop-3' }))
                .mockResolvedValueOnce(textResult('최종 답변입니다.'));

            const result = await agentController.processMessage('계속 찾아봐');

            expect(result.content).toBe('최종 답변입니다.');
            expect(chatSpy).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('이제 도구는 더 이상 사용하지 말고')
                    })
                ]),
                expect.any(Array),
                expect.objectContaining({ toolChoice: 'none' })
            );
        });
    });

    describe('setMaxIterations', () => {
        it('should set max iterations', () => {
            agentController.setMaxIterations(5);
            expect(agentController.getMaxIterations()).toBe(5);
        });

        it('should not allow negative iterations', () => {
            expect(() => agentController.setMaxIterations(-1)).toThrow();
        });

        it('should not allow zero iterations', () => {
            expect(() => agentController.setMaxIterations(0)).toThrow();
        });
    });

    describe('resetConversation', () => {
        it('should clear conversation history', () => {
            expect(() => agentController.resetConversation()).not.toThrow();
        });
    });

    describe('getConversationHistory', () => {
        it('should return conversation history', async () => {
            jest.spyOn(llmService, 'chat').mockResolvedValue(textResult('Response'));

            await agentController.processMessage('First message');
            const history = agentController.getConversationHistory();

            expect(Array.isArray(history)).toBe(true);
            expect(history).toEqual([
                { role: 'user', content: 'First message' },
                { role: 'assistant', content: 'Response' }
            ]);
        });

        it('should return empty array for new conversation', () => {
            const history = agentController.getConversationHistory();
            expect(history).toEqual([]);
        });
    });

    describe('tool argument parsing (Qwen3.6 regression)', () => {
        it('(a) string arguments are parsed as JSON and passed correctly to the tool', async () => {
            const receivedParams: Record<string, any>[] = [];
            jest.spyOn(mockTool, 'execute').mockImplementation(async (params) => {
                receivedParams.push(params);
                return { results: [] };
            });

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{
                        id: 'c1',
                        type: 'function',
                        function: { name: 'vault_search', arguments: '{"query":"x"}' }
                    }]
                })
                .mockResolvedValueOnce(textResult('done'));

            await agentController.processMessage('test');

            expect(receivedParams.length).toBe(1);
            expect(receivedParams[0]).toEqual({ query: 'x' });
            expect(receivedParams[0]).not.toHaveProperty('raw');
        });

        it('(b) object arguments (Qwen3.6 native) are passed as-is, NOT wrapped in {raw:}', async () => {
            const receivedParams: Record<string, any>[] = [];
            jest.spyOn(mockTool, 'execute').mockImplementation(async (params) => {
                receivedParams.push(params);
                return { results: [] };
            });

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{
                        id: 'c1',
                        type: 'function',
                        // Simulate Qwen3.6 returning already-parsed object instead of string
                        function: { name: 'vault_search', arguments: { query: 'x' } as any }
                    }]
                })
                .mockResolvedValueOnce(textResult('done'));

            await agentController.processMessage('test');

            expect(receivedParams.length).toBe(1);
            expect(receivedParams[0]).toEqual({ query: 'x' });
            expect(receivedParams[0]).not.toHaveProperty('raw');
        });

        it('(c) invalid JSON string arguments fall back to {raw: str}', async () => {
            const receivedParams: Record<string, any>[] = [];
            jest.spyOn(mockTool, 'execute').mockImplementation(async (params) => {
                receivedParams.push(params);
                return { results: [] };
            });

            jest.spyOn(llmService, 'chat')
                .mockResolvedValueOnce({
                    content: '',
                    toolCalls: [{
                        id: 'c1',
                        type: 'function',
                        function: { name: 'vault_search', arguments: 'not-json' }
                    }]
                })
                .mockResolvedValueOnce(textResult('done'));

            await agentController.processMessage('test');

            expect(receivedParams.length).toBe(1);
            expect(receivedParams[0]).toEqual({ raw: 'not-json' });
        });
    });

    describe('normalizeFinalContent — thinking leak defense', () => {
        // private 메서드에 접근하기 위해 타입 캐스트 사용
        let normalize: (content: string | undefined) => string;

        beforeEach(() => {
            normalize = (content) =>
                (agentController as any).normalizeFinalContent(content);
        });

        it('1. 회귀 — XML 태그 제거 (기존 동작)', () => {
            const input = '<think>internal reasoning</think>\n실제 답변입니다.';
            expect(normalize(input)).toBe('실제 답변입니다.');
        });

        it('2. 선행 메타 산문 제거 (한국어)', () => {
            const input =
                '좋아, 먼저 사용자가 무엇을 원하는지 보면 파일을 요약해 달라는 것이다.\n\n## 요약\n- 첫 번째 항목\n- 두 번째 항목';
            expect(normalize(input)).toBe('## 요약\n- 첫 번째 항목\n- 두 번째 항목');
        });

        it('3. 선행 메타 산문 제거 (영어)', () => {
            const input =
                'Let me think about this. The user is asking for a summary.\n\nHere is the summary:\n- Point one\n- Point two';
            expect(normalize(input)).toBe('Here is the summary:\n- Point one\n- Point two');
        });

        it('4. 최종 답변 마커 추출 (한국어)', () => {
            const input =
                '좋아, 추론 과정...\n중간 생각...\n\n최종 답변:\n파일 요약: 핵심 3가지';
            expect(normalize(input)).toBe('파일 요약: 핵심 3가지');
        });

        it('5. 최종 답변 마커 추출 (영어)', () => {
            const input =
                'Reasoning step 1...\nReasoning step 2...\n\nFinal answer:\nThe summary is X.';
            expect(normalize(input)).toBe('The summary is X.');
        });

        it('6. HR 구분자 마커 추출', () => {
            const input = 'first I think...\nthen I conclude...\n\n---\n\n실제 답변 본문';
            expect(normalize(input)).toBe('실제 답변 본문');
        });

        it('7. 오탐 방지 — 문장 중간의 "I think"는 제거하지 않음', () => {
            const input =
                '## 분석\n이 코드를 보면 I think the design is intentional. 그래서 다음 단계는...\n- 결정 1\n- 결정 2';
            expect(normalize(input)).toBe(
                '## 분석\n이 코드를 보면 I think the design is intentional. 그래서 다음 단계는...\n- 결정 1\n- 결정 2'
            );
        });

        it('8. 오탐 방지 — 짧은 정상 답변은 변경 없음', () => {
            const input = '네, 수정 완료했습니다.';
            expect(normalize(input)).toBe('네, 수정 완료했습니다.');
        });

        it('9. 빈 입력값 처리', () => {
            expect(normalize('')).toBe('');
            expect(normalize(undefined)).toBe('');
        });

        it('10. 추론만 있고 실제 답변이 없는 경우 — 빈 문자열 또는 최소화된 내용 반환', () => {
            const input =
                '좋아, 먼저 생각해봐야겠다.\n사용자가 원하는 건...';
            // 모든 단락이 메타 패턴에 해당하면 빈 문자열을 반환해야 함
            // (하위 fallback이 빈 콘텐츠를 처리함)
            const result = normalize(input);
            // 결과는 빈 문자열이거나 매우 짧은 내용이어야 함
            expect(result.length).toBeLessThan(input.length);
        });

        it('11. 트레일링 영문 메타 prose strip — 실제 0.2.5 누출 케이스', () => {
            const input = `### 💡 핵심 인사이트
> **"삶의 질은 내가 어떤 것을 추구하느냐에 달려 있다. 진정한 자유는 결과를 집착하지 않고, 오직 대의와 사랑, 지혜, 용기 안에서 살 수 있을 때 찾아온다."**

#키워드: #내면근력 #마인드셋 #자기중심성 #두려움 #자아실현 #뇌과학 #시각화 #자기확언 #성장마인드셋

The summary covers all the main points provided in the text. It is structured, easy to read, and captures the essence of the book notes.

I will output the response now.
The user's prompt is simply "이 노트 내용 요약해 봐".
I will use the markdown format for clarity.

Final check on language: Korean.
Final check on constraints: No internal monologue in output.

Ready.

Looks good.
Let's go.`;
            const expected = `### 💡 핵심 인사이트
> **"삶의 질은 내가 어떤 것을 추구하느냐에 달려 있다. 진정한 자유는 결과를 집착하지 않고, 오직 대의와 사랑, 지혜, 용기 안에서 살 수 있을 때 찾아온다."**

#키워드: #내면근력 #마인드셋 #자기중심성 #두려움 #자아실현 #뇌과학 #시각화 #자기확언 #성장마인드셋`;
            const result = normalize(input);
            expect(result).toBe(expected);
        });

        it('12. 트레일링 strip false positive 방지 — 정상 영문 마지막 단락 보존', () => {
            const input = `## English Summary

The book argues three main points:
- Point one
- Point two
- Point three

This is a clear and concise overview that the user requested.`;
            const result = normalize(input);
            // "This is a clear..." — TRAILING_META_PATTERNS 중 /^This\s+(looks|seems|is)\s+(good|perfect|complete|fine)/ 는
            // "clear"가 메타 키워드(good/perfect/complete/fine)에 없으므로 매칭 안 됨 → 보존되어야 함
            expect(result).toBe(input);
        });

        it('13. 단일 짧은 Ready. 트레일링 제거', () => {
            const input = `## 답변

여기 답변 본문입니다.

Ready.`;
            const expected = `## 답변

여기 답변 본문입니다.`;
            const result = normalize(input);
            expect(result).toBe(expected);
        });

        it('14. 트레일링 Looks good. 제거', () => {
            const input = `네, 처리 완료했습니다.

Looks good.`;
            const expected = `네, 처리 완료했습니다.`;
            const result = normalize(input);
            expect(result).toBe(expected);
        });

        it('15. 다중 트레일링 메타 단락 일괄 제거', () => {
            const input = `답변 본문입니다.

Final plan: First do A, then B.

I will write the response now.

Ready.`;
            const expected = `답변 본문입니다.`;
            const result = normalize(input);
            expect(result).toBe(expected);
        });

        it('16. 본문 중간 메타 패턴은 보존 — 첫 비-메타 단락에서 strip 중단', () => {
            const input = `답변 시작.

I will explain step by step.

답변 계속됩니다.

추가 정보입니다.`;
            // 마지막 단락 "추가 정보입니다."는 메타 아님 → 역방향 스캔 즉시 중단
            // 결과: 모든 단락 보존
            const result = normalize(input);
            expect(result).toBe(input);
        });
    });

    describe('agent mode', () => {
        it('should report agent mode enabled', () => {
            const controller = new AgentController(llmService, toolRegistry, true);
            expect(controller.isAgentModeEnabled()).toBe(true);
        });

        it('should report agent mode disabled', () => {
            const controller = new AgentController(llmService, toolRegistry, false);
            expect(controller.isAgentModeEnabled()).toBe(false);
        });

        it('should allow toggling agent mode', () => {
            agentController.setAgentMode(false);
            expect(agentController.isAgentModeEnabled()).toBe(false);
            agentController.setAgentMode(true);
            expect(agentController.isAgentModeEnabled()).toBe(true);
        });

        it('should not send tool definitions when agent mode is disabled', async () => {
            const chatSpy = jest.spyOn(llmService, 'chat').mockResolvedValue(
                textResult('Plain response')
            );

            agentController.setAgentMode(false);
            await agentController.processMessage('Hello');

            expect(chatSpy).toHaveBeenCalledWith(
                expect.any(Array),
                [],
                expect.objectContaining({ toolChoice: 'auto' })
            );
        });
    });
});
