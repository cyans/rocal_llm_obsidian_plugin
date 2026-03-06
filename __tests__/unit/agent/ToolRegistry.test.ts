/**
 * ToolRegistry Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 2
 */

import { ToolRegistry } from '../../../src/agent/ToolRegistry';
import { BaseTool, ToolDefinition } from '../../../src/tools/BaseTool';
import { DEFAULT_SETTINGS } from '../../../src/types';

const mockLLMService = {
    chat: jest.fn(),
    updateSettings: jest.fn(),
};

// Mock App
class MockApp {
    vault: any = {};
    metadataCache: any = {};
}

// Mock tools for testing
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
        return { results: [] };
    }
}

class MockWriteTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'write_file',
        description: 'Write to file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                content: { type: 'string' }
            },
            required: ['path', 'content']
        }
    };

    async execute(params: Record<string, any>): Promise<any> {
        return { success: true };
    }
}

describe('ToolRegistry', () => {
    let registry: ToolRegistry;
    let mockSearchTool: MockSearchTool;
    let mockWriteTool: MockWriteTool;

    beforeEach(() => {
        const mockApp = new MockApp() as any;
        registry = new ToolRegistry(mockApp);
        mockSearchTool = new MockSearchTool();
        mockWriteTool = new MockWriteTool();
    });

    describe('register', () => {
        it('should register a tool', () => {
            registry.register(mockSearchTool);

            const tools = registry.getAllTools();
            expect(tools).toHaveLength(1);
            expect(tools[0].definition.name).toBe('vault_search');
        });

        it('should register multiple tools', () => {
            registry.register(mockSearchTool);
            registry.register(mockWriteTool);

            const tools = registry.getAllTools();
            expect(tools).toHaveLength(2);
        });

        it('should throw error when registering duplicate tool name', () => {
            registry.register(mockSearchTool);

            expect(() => {
                registry.register(mockSearchTool);
            }).toThrow();
        });
    });

    describe('getTool', () => {
        it('should return registered tool by name', () => {
            registry.register(mockSearchTool);

            const tool = registry.getTool('vault_search');
            expect(tool).toBe(mockSearchTool);
        });

        it('should return undefined for non-existent tool', () => {
            const tool = registry.getTool('non_existent');
            expect(tool).toBeUndefined();
        });

        it('should return correct tool when multiple tools registered', () => {
            registry.register(mockSearchTool);
            registry.register(mockWriteTool);

            const searchTool = registry.getTool('vault_search');
            const writeTool = registry.getTool('write_file');

            expect(searchTool).toBe(mockSearchTool);
            expect(writeTool).toBe(mockWriteTool);
        });
    });

    describe('execute', () => {
        it('should execute tool by name', async () => {
            registry.register(mockSearchTool);

            const result = await registry.execute('vault_search', { query: 'test' });
            expect(result).toEqual({ results: [] });
        });

        it('should throw error for non-existent tool execution', async () => {
            await expect(
                registry.execute('non_existent', {})
            ).rejects.toThrow();
        });

        it('should pass parameters to tool execute method', async () => {
            const executeSpy = jest.spyOn(mockSearchTool, 'execute');
            registry.register(mockSearchTool);

            await registry.execute('vault_search', { query: 'test query' });

            expect(executeSpy).toHaveBeenCalledWith({ query: 'test query' });
        });
    });

    describe('hasTool', () => {
        it('should return true for registered tool', () => {
            registry.register(mockSearchTool);

            expect(registry.hasTool('vault_search')).toBe(true);
        });

        it('should return false for non-existent tool', () => {
            expect(registry.hasTool('non_existent')).toBe(false);
        });
    });

    describe('getOpenAIToolDefinitions', () => {
        it('should return OpenAI-compatible tool definitions', () => {
            registry.register(mockSearchTool);
            registry.register(mockWriteTool);

            const definitions = registry.getOpenAIToolDefinitions();

            expect(definitions).toHaveLength(2);
            expect(definitions[0]).toHaveProperty('type', 'function');
            expect(definitions[0].function).toHaveProperty('name');
            expect(definitions[0].function).toHaveProperty('description');
            expect(definitions[0].function).toHaveProperty('parameters');
        });

        it('should return empty array when no tools registered', () => {
            const definitions = registry.getOpenAIToolDefinitions();

            expect(definitions).toEqual([]);
        });
    });

    describe('unregister', () => {
        it('should remove registered tool', () => {
            registry.register(mockSearchTool);
            expect(registry.hasTool('vault_search')).toBe(true);

            registry.unregister('vault_search');
            expect(registry.hasTool('vault_search')).toBe(false);
        });

        it('should not throw when unregistering non-existent tool', () => {
            expect(() => {
                registry.unregister('non_existent');
            }).not.toThrow();
        });
    });

    describe('getAllTools', () => {
        it('should return all registered tools', () => {
            registry.register(mockSearchTool);
            registry.register(mockWriteTool);

            const tools = registry.getAllTools();
            expect(tools).toHaveLength(2);
            expect(tools).toContain(mockSearchTool);
            expect(tools).toContain(mockWriteTool);
        });

        it('should return empty array when no tools registered', () => {
            const tools = registry.getAllTools();
            expect(tools).toEqual([]);
        });
    });

    describe('registerAllTools', () => {
        it('should only register enabled tools from settings', () => {
            registry.registerAllTools({
                ...DEFAULT_SETTINGS,
                tools: {
                    vaultSearch: true,
                    webSearch: false,
                    writeToFile: false,
                    replaceInFile: false,
                    youtubeTranscript: false,
                    vaultReadContents: true,
                    vaultSummarize: true,
                }
            }, mockLLMService as any);

            expect(registry.hasTool('vault_search')).toBe(true);
            expect(registry.hasTool('web_search')).toBe(false);
            expect(registry.hasTool('write_to_file')).toBe(false);
            expect(registry.hasTool('replace_in_file')).toBe(false);
            expect(registry.hasTool('youtube_transcription')).toBe(false);
            expect(registry.hasTool('vault_read_contents')).toBe(true);
            expect(registry.hasTool('vault_summarize')).toBe(true);
        });

        it('should replace previously registered tools when settings change', () => {
            registry.registerAllTools(DEFAULT_SETTINGS, mockLLMService as any);
            expect(registry.hasTool('web_search')).toBe(true);

            registry.registerAllTools({
                ...DEFAULT_SETTINGS,
                tools: {
                    ...DEFAULT_SETTINGS.tools,
                    webSearch: false
                }
            }, mockLLMService as any);

            expect(registry.hasTool('web_search')).toBe(false);
        });
    });
});
