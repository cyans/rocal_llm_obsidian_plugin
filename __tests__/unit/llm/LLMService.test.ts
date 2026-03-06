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
        mockSettings = {
            apiUrl: 'http://localhost:11434/v1',
            model: 'qwen3.5:latest',
            apiKey: '',
            maxTokens: 4096,
            temperature: 0.7,
            agentMode: true,
            braveApiKey: '', // Brave Search API 키
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
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        choices: [{ message: { content: 'Response' } }],
                    }),
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
    });
});
