/**
 * PromptBuilder Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 2
 */

import { PromptBuilder } from '../../../src/agent/PromptBuilder';
import { ToolRegistry } from '../../../src/agent/ToolRegistry';
import { BaseTool, ToolDefinition } from '../../../src/tools/BaseTool';

// Mock App
class MockApp {
    vault: any = {};
    metadataCache: any = {};
}

class MockTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
        }
    };

    async execute(params: Record<string, any>): Promise<any> {
        return { result: 'ok' };
    }
}

describe('PromptBuilder', () => {
    let promptBuilder: PromptBuilder;
    let toolRegistry: ToolRegistry;
    let mockTool: MockTool;

    beforeEach(() => {
        promptBuilder = new PromptBuilder();
        const mockApp = new MockApp() as any;
        toolRegistry = new ToolRegistry(mockApp);
        mockTool = new MockTool();
        toolRegistry.register(mockTool);
    });

    describe('buildSystemPrompt', () => {
        it('should build system prompt with tool definitions', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const systemPrompt = promptBuilder.buildSystemPrompt(toolDefinitions);

            expect(systemPrompt).toBeDefined();
            expect(typeof systemPrompt).toBe('string');
            expect(systemPrompt.length).toBeGreaterThan(0);
        });

        it('should include tool information in system prompt', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const systemPrompt = promptBuilder.buildSystemPrompt(toolDefinitions);

            expect(systemPrompt).toContain('test_tool');
            expect(systemPrompt).toContain('A test tool');
        });

        it('should include vault summary workflow guidance', () => {
            const systemPrompt = promptBuilder.buildSystemPrompt([]);

            expect(systemPrompt).toContain('vault_read_contents');
            expect(systemPrompt).toContain('vault_summarize');
            expect(systemPrompt).toContain('do NOT call vault_search again');
        });

        it('should describe knowledge-base assistant mission', () => {
            const systemPrompt = promptBuilder.buildSystemPrompt([]);

            expect(systemPrompt).toContain('personal knowledge repository');
            expect(systemPrompt).toContain('#키워드');
            expect(systemPrompt).toContain('Do not only connect identical keywords');
        });

        it('should include selected file editing guidance when active file exists', () => {
            const systemPrompt = promptBuilder.buildSystemPrompt([], undefined, {
                activeFilePath: 'notes/current.md'
            });

            expect(systemPrompt).toContain('CURRENTLY SELECTED FILE');
            expect(systemPrompt).toContain('notes/current.md');
            expect(systemPrompt).toContain('modify that same file with replace_in_file');
            expect(systemPrompt).toContain('Do NOT insert underscores into generated titles or filenames');
        });

        it('should build system prompt with custom instructions', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const customInstructions = 'You are a helpful assistant.';
            const systemPrompt = promptBuilder.buildSystemPrompt(toolDefinitions, customInstructions);

            expect(systemPrompt).toContain(customInstructions);
        });

        it('should handle empty tool definitions', () => {
            const systemPrompt = promptBuilder.buildSystemPrompt([]);

            expect(systemPrompt).toBeDefined();
            expect(typeof systemPrompt).toBe('string');
        });
    });

    describe('buildSystemPromptMinimal', () => {
        it('should return minimal system prompt without tool definitions', () => {
            const prompt = promptBuilder.buildSystemPromptMinimal();
            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('string');
            expect(prompt.length).toBeGreaterThan(0);
        });

        it('should use custom instructions when provided', () => {
            const custom = 'Custom minimal prompt';
            const prompt = promptBuilder.buildSystemPromptMinimal(custom);
            expect(prompt).toBe(custom);
        });
    });

    describe('formatToolDefinitions', () => {
        it('should format tool definitions as text', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const formatted = promptBuilder.formatToolDefinitions(toolDefinitions);

            expect(formatted).toBeDefined();
            expect(typeof formatted).toBe('string');
            expect(formatted).toContain('test_tool');
        });

        it('should include tool parameters in formatted output', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const formatted = promptBuilder.formatToolDefinitions(toolDefinitions);

            expect(formatted).toContain('query');
        });
    });

    describe('buildConversationMessages', () => {
        it('should build conversation messages array', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const userMessage = 'Search for something';
            const history: any[] = [];

            const messages = promptBuilder.buildConversationMessages(
                toolDefinitions,
                userMessage,
                history
            );

            expect(Array.isArray(messages)).toBe(true);
            expect(messages.length).toBeGreaterThan(0);
        });

        it('should include system message as first message', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const userMessage = 'Search for something';
            const history: any[] = [];

            const messages = promptBuilder.buildConversationMessages(
                toolDefinitions,
                userMessage,
                history
            );

            expect(messages[0].role).toBe('system');
        });

        it('should include user message', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const userMessage = 'Search for something';
            const history: any[] = [];

            const messages = promptBuilder.buildConversationMessages(
                toolDefinitions,
                userMessage,
                history
            );

            const userMsg = messages.find(m => m.role === 'user');
            expect(userMsg).toBeDefined();
            expect(userMsg?.content).toContain('Search for something');
        });

        it('should include conversation history', () => {
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();
            const userMessage = 'New message';
            const history = [
                { role: 'user' as const, content: 'Previous message' },
                { role: 'assistant' as const, content: 'Previous response' }
            ];

            const messages = promptBuilder.buildConversationMessages(
                toolDefinitions,
                userMessage,
                history
            );

            expect(messages).toContainEqual({ role: 'user', content: 'Previous message' });
            expect(messages).toContainEqual({ role: 'assistant', content: 'Previous response' });
        });
    });
});
