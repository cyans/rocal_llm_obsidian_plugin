/**
 * LLM Service Tests
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { LLMService } from '../../../src/llm/LLMService';
import { VaultAgentSettings } from '../../../src/types';

describe('LLMService', () => {
    let service: LLMService;
    let mockSettings: VaultAgentSettings;

    beforeEach(() => {
        // localStorage mock for Node.js/Jest environment
        const localStorageData: Record<string, string> = {};
        global.localStorage = {
            getItem: (key: string) => localStorageData[key] ?? null,
            setItem: (key: string, value: string) => { localStorageData[key] = value; },
            removeItem: (key: string) => { delete localStorageData[key]; },
            clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
            length: 0,
            key: () => null,
        } as unknown as Storage;

        mockSettings = {
            apiUrl: 'http://localhost:11434/v1',
            model: 'qwen3.5:latest',
            apiKey: '',
            maxTokens: 4096,
            temperature: 0.7,
            agentMode: true,
            braveApiKey: '', // Brave Search API 키
            allowInsecureTls: false,
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
        service = new LLMService(mockSettings);
    });

    describe('chat', () => {
        it('should send message to LLM API', async () => {
            const messages = [{ role: 'user' as const, content: 'Hello' }];

            // Mock fetch for testing
            // @MX:NOTE: LLMService는 raw body 검증을 위해 response.text()를 먼저 호출 후 JSON.parse 수행
            const mockBody = JSON.stringify({
                choices: [{ message: { content: 'Response' } }],
            });
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: () => Promise.resolve(mockBody),
                    json: () => Promise.resolve(JSON.parse(mockBody)),
                } as Response)
            ) as jest.Mock;

            const response = await service.chat(messages);
            expect(response).toBeDefined();
            expect(response.content).toBe('Response');
            expect(response.toolCalls).toEqual([]);
        });

        it('should handle connection errors gracefully', async () => {
            const messages = [{ role: 'user' as const, content: 'Hello' }];

            global.fetch = jest.fn(() =>
                Promise.reject(new Error('Network error'))
            ) as jest.Mock;

            await expect(service.chat(messages)).rejects.toThrow('LLM connection failed');
        });

        it('should pass tool_choice none when requested', async () => {
            const messages = [{ role: 'user' as const, content: 'Hello' }];
            const tools = [{
                type: 'function' as const,
                function: {
                    name: 'test_tool',
                    description: 'test',
                    parameters: { type: 'object', properties: {}, required: [] }
                }
            }];

            const mockBody = JSON.stringify({
                choices: [{ message: { content: 'Response' } }],
            });
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: () => Promise.resolve(mockBody),
                    json: () => Promise.resolve(JSON.parse(mockBody)),
                } as Response)
            ) as jest.Mock;

            await service.chat(messages, tools, { toolChoice: 'none' });

            const [, request] = (global.fetch as jest.Mock).mock.calls[0];
            expect(JSON.parse(request.body)).toMatchObject({
                tool_choice: 'none'
            });
        });
    });
});
