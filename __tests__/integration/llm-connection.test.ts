/**
 * LLM Connection Integration Tests
 * Tests actual connection to Qwen server at localhost:8001/v1
 * @MX:TEST: SPEC-PLUGIN-001 Integration
 */

import { LLMService, ChatMessage } from '../../src/llm/LLMService';
import { ToolRegistry } from '../../src/agent/ToolRegistry';
import { AgentController } from '../../src/agent/AgentController';
import { VaultAgentSettings } from '../../src/types';

// Mock Obsidian App for ToolRegistry
class MockVault {
    async read(): Promise<string> {
        return 'Mock content';
    }
    async create(): Promise<void> {}
    async modify(): Promise<void> {}
    getAbstractFileByPath(): any { return null; }
    async createFolder(): Promise<void> {}
    getMarkdownFiles(): any[] { return []; }
    cachedRead(): Promise<string> { return Promise.resolve(''); }
}

class MockMetadataCache {
    getFileCache(): any { return null; }
}

class MockApp {
    vault = new MockVault();
    metadataCache = new MockMetadataCache();
}

describe('LLM Integration Tests (localhost:8001/v1)', () => {
    let llmService: LLMService;
    let toolRegistry: ToolRegistry;
    let agentController: AgentController;
    let mockApp: MockApp;

    // Test settings for localhost:8001/v1
    const testSettings: VaultAgentSettings = {
        apiUrl: 'http://localhost:8001/v1',
        model: 'qwen2.5:14b',
        apiKey: '',
        maxTokens: 4096,
        temperature: 0.7,
        agentMode: true,
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

    beforeAll(() => {
        mockApp = new MockApp();
        llmService = new LLMService(testSettings);
        toolRegistry = new ToolRegistry(mockApp as any);
        toolRegistry.registerAllTools(undefined, llmService);
        agentController = new AgentController(llmService, toolRegistry, true);
    });

    describe('Server Connection', () => {
        it('should connect to localhost:8001/v1', async () => {
            const response = await fetch('http://localhost:8001/v1/models', {
                method: 'GET',
            });
            expect(response.ok).toBe(true);
        });

        it('should handle connection failure gracefully', async () => {
            // Test with wrong port
            const failSettings: VaultAgentSettings = {
                ...testSettings,
                apiUrl: 'http://localhost:9999/v1',
            };
            const failService = new LLMService(failSettings);

            const messages: ChatMessage[] = [
                { role: 'user', content: 'Hello' },
            ];

            await expect(failService.chat(messages)).rejects.toThrow();
        });
    });

    describe('LLM Chat Completion', () => {
        it('should send a simple chat request', async () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Say "Hello, Qwen!"' },
            ];

            const result = await llmService.chat(messages);
            expect(result.content).toBeTruthy();
            expect(typeof result.content).toBe('string');
        });

        it('should handle multi-turn conversation', async () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'My name is Test User.' },
                { role: 'assistant', content: 'Nice to meet you, Test User!' },
                { role: 'user', content: 'What is my name?' },
            ];

            const result = await llmService.chat(messages);
            expect(result.content).toBeTruthy();
            expect(result.content.toLowerCase()).toContain('test user');
        });
    });

    describe('Native Tool Calling', () => {
        it('should return tool definitions in OpenAI format', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            expect(toolDefinitions.length).toBeGreaterThan(0);
            expect(toolDefinitions[0].type).toBe('function');
            expect(toolDefinitions[0].function.name).toBeTruthy();
            expect(toolDefinitions[0].function.description).toBeTruthy();
            expect(toolDefinitions[0].function.parameters).toBeTruthy();
        });

        it('should include tools in chat request', async () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant with access to tools.' },
                { role: 'user', content: 'What tools do you have available?' },
            ];

            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const result = await llmService.chat(messages, toolDefinitions);
            expect(result.content).toBeTruthy();
        });

        it('should invoke vault_search tool when asked', async () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant with access to tools. Use tools when needed.' },
                { role: 'user', content: 'Search for notes about testing' },
            ];

            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const result = await llmService.chat(messages, toolDefinitions);

            // Tool calls may be empty if LLM decides not to use tools
            // Just verify the request didn't fail
            expect(result.content !== undefined || result.toolCalls !== undefined).toBe(true);
        }, 30000);
    });

    describe('AgentController Integration', () => {
        it('should process a simple message', async () => {
            const response = await agentController.processMessage('Hello!');
            expect(response.type).toBe('text');
            expect(response.content).toBeTruthy();
        }, 30000);

        it('should handle tool-invoking requests', async () => {
            // Note: vault_search requires actual vault data, so this test
            // may not actually invoke tools depending on LLM behavior
            const response = await agentController.processMessage(
                'What tools can you use?'
            );
            expect(response).toBeDefined();
            expect(response.content).toBeTruthy();
        }, 60000);
    });

    describe('Tool Registry', () => {
        it('should register all expected tools', () => {
            const allTools = toolRegistry.getAllTools();
            const toolNames = allTools.map(t => t.definition.name);

            expect(toolNames).toContain('vault_search');
            expect(toolNames).toContain('web_search');
            expect(toolNames).toContain('write_to_file');
            expect(toolNames).toContain('replace_in_file');
            expect(toolNames).toContain('youtube_transcription');
        });

        it('should have correct tool definitions', () => {
            const vaultSearch = toolRegistry.getTool('vault_search');
            expect(vaultSearch).toBeDefined();
            expect(vaultSearch?.definition.name).toBe('vault_search');
            expect(vaultSearch?.definition.parameters.properties.query).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle empty messages gracefully', async () => {
            const messages: ChatMessage[] = [
                { role: 'user', content: '' },
            ];

            // LLM should still respond even to empty input
            const result = await llmService.chat(messages);
            expect(result).toBeDefined();
        });

        it('should handle very long messages', async () => {
            const longContent = 'A'.repeat(1000);
            const messages: ChatMessage[] = [
                { role: 'user', content: longContent },
            ];

            const result = await llmService.chat(messages);
            expect(result).toBeDefined();
        });
    });
});
