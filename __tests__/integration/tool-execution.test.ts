/**
 * Tool Execution Integration Tests (Mock-based)
 * Tests tool behavior without requiring live LLM server
 * @MX:TEST: SPEC-PLUGIN-001 Integration
 */

import { ToolRegistry } from '../../src/agent/ToolRegistry';
import { VaultSearchTool } from '../../src/tools/VaultSearchTool';
import { WriteToFileTool } from '../../src/tools/WriteToFileTool';
import { ReplaceInFileTool } from '../../src/tools/ReplaceInFileTool';
import { YouTubeTranscriptTool } from '../../src/tools/YouTubeTranscriptTool';
import { WebSearchTool } from '../../src/tools/WebSearchTool';
import { OpenAIToolDefinition } from '../../src/agent/ToolRegistry';

// Mock Obsidian requestUrl for HTTP tools
class MockRequestUrl {
    private responses: Map<string, { status: number; content: string; headers: HeadersInit }> = new Map();

    setResponse(url: string, response: { status: number; content: string; headers?: HeadersInit }) {
        this.responses.set(url, {
            status: response.status,
            content: response.content,
            headers: response.headers || {}
        });
    }

    async requestUrl(url: string, options?: RequestInit): Promise<{ status: number; text: string; headers: HeadersInit }> {
        const response = this.responses.get(url);

        if (!response) {
            return {
                status: 404,
                text: 'Not Found',
                headers: {}
            };
        }

        return {
            status: response.status,
            text: response.content,
            headers: response.headers
        };
    }
}

// Mock Obsidian App
class MockVault {
    private files: Map<string, string> = new Map();

    constructor() {
        // Add some test files
        this.files.set('test.md', '# Test Note\n\nThis is a test note with some content.');
        this.files.set('project/AI.md', '# AI Project\n\nMachine learning notes.');
    }

    async read(file: any): Promise<string> {
        const path = file.path;
        const content = this.files.get(path);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }

    async create(path: string, content: string): Promise<void> {
        if (this.files.has(path)) {
            throw new Error(`File already exists: ${path}`);
        }
        this.files.set(path, content);
    }

    async modify(file: any, content: string): Promise<void> {
        const path = file.path;
        if (!this.files.has(path)) {
            throw new Error(`File not found: ${path}`);
        }
        this.files.set(path, content);
    }

    getAbstractFileByPath(path: string): any {
        return this.files.has(path) ? { path } : null;
    }

    async createFolder(path: string): Promise<void> {
        // Mock folder creation
    }

    getMarkdownFiles(): any[] {
        return Array.from(this.files.keys()).map(path => ({ path }));
    }

    cachedRead(file: any): Promise<string> {
        return this.read(file);
    }
}

class MockMetadataCache {
    getFileCache(file: any): any {
        return {
            tags: [],
            frontmatter: {},
            links: []
        };
    }
}

class MockApp {
    vault = new MockVault();
    metadataCache = new MockMetadataCache();
}

// Mock modal adapter
class MockModalAdapter {
    async confirm(message: string): Promise<boolean> {
        return true;
    }
}

describe('Tool Execution Integration Tests (Mock)', () => {
    let toolRegistry: ToolRegistry;
    let mockApp: MockApp;
    let mockRequestUrl: MockRequestUrl;

    beforeAll(() => {
        mockApp = new MockApp();
        mockRequestUrl = new MockRequestUrl();
        toolRegistry = new ToolRegistry(mockApp as any);
    });

    beforeEach(() => {
        // Re-register tools before each test
        toolRegistry = new ToolRegistry(mockApp as any);

        const modal = new MockModalAdapter();

        // Vault Search
        const vaultSearch = new VaultSearchTool(mockApp.vault, mockApp.metadataCache);
        toolRegistry.register(vaultSearch);

        // Write to File
        const writeToFile = new WriteToFileTool(mockApp.vault, modal as any);
        writeToFile.setAutoConfirm(true);
        toolRegistry.register(writeToFile);

        // Replace in File
        const replaceInFile = new ReplaceInFileTool(mockApp.vault, modal as any);
        replaceInFile.setAutoConfirm(true);
        toolRegistry.register(replaceInFile);

        // Web Search
        const webSearch = new WebSearchTool(mockRequestUrl as any);
        toolRegistry.register(webSearch);

        // YouTube Transcript
        const ytTranscript = new YouTubeTranscriptTool(mockRequestUrl as any, mockApp.vault);
        toolRegistry.register(ytTranscript);
    });

    describe('Tool Definitions', () => {
        it('should export all tools in OpenAI format', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();

            expect(definitions).toHaveLength(5);
            definitions.forEach(def => {
                expect(def.type).toBe('function');
                expect(def.function.name).toBeTruthy();
                expect(def.function.description).toBeTruthy();
                expect(def.function.parameters).toBeDefined();
            });
        });

        it('should have valid JSON Schema parameters', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();

            definitions.forEach(def => {
                const params = def.function.parameters;
                expect(params.type).toBe('object');
                expect(params.properties).toBeDefined();
            });
        });
    });

    describe('VaultSearchTool Execution', () => {
        it('should search vault for query', async () => {
            const result = await toolRegistry.execute('vault_search', {
                query: 'test',
                max_results: 5
            });

            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
            expect(Array.isArray(result.results)).toBe(true);
        });

        it('should handle empty query gracefully', async () => {
            const result = await toolRegistry.execute('vault_search', {
                query: '',
                max_results: 5
            });

            expect(result).toBeDefined();
        });
    });

    describe('WriteToFileTool Execution', () => {
        it('should create a new file', async () => {
            const result = await toolRegistry.execute('write_to_file', {
                file_path: 'new-note.md',
                content: '# New Note\n\nCreated by tool.'
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('created');
        });

        it('should overwrite existing file', async () => {
            const result = await toolRegistry.execute('write_to_file', {
                file_path: 'test.md',
                content: '# Updated Content'
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('overwritten');
        });
    });

    describe('ReplaceInFileTool Execution', () => {
        it('should replace text in existing file', async () => {
            const result = await toolRegistry.execute('replace_in_file', {
                file_path: 'test.md',
                replacements: [
                    {
                        search: 'This is a test note',
                        replace: 'This is an updated note'
                    }
                ]
            });

            expect(result.success).toBe(true);
        });

        it('should handle multiple replacements', async () => {
            const result = await toolRegistry.execute('replace_in_file', {
                file_path: 'test.md',
                replacements: [
                    {
                        search: 'test',
                        replace: 'TEST'
                    },
                    {
                        search: 'content',
                        replace: 'CONTENT'
                    }
                ]
            });

            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
        });

        it('should fail gracefully when search text not found', async () => {
            const result = await toolRegistry.execute('replace_in_file', {
                file_path: 'test.md',
                replacements: [
                    {
                        search: 'nonexistent text',
                        replace: 'replacement'
                    }
                ]
            });

            expect(result.success).toBe(false);
        });
    });

    describe('WebSearchTool Execution', () => {
        beforeEach(() => {
            // Setup mock responses for web search
            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', {
                status: 200,
                content: JSON.stringify({
                    results: [
                        {
                            title: 'Test Result',
                            url: 'https://example.com',
                            content: 'Test content snippet'
                        }
                    ]
                })
            });
        });

        it('should perform web search', async () => {
            const result = await toolRegistry.execute('web_search', {
                query: 'test',
                num_results: 5
            });

            expect(result).toBeDefined();
        });

        it('should handle search errors gracefully', async () => {
            // Clear mock responses to simulate error
            const emptyMock = new MockRequestUrl();
            const errorTool = new WebSearchTool(emptyMock as any);
            toolRegistry.register(errorTool);

            const result = await toolRegistry.execute('web_search', {
                query: 'test',
                num_results: 5
            });

            expect(result).toBeDefined();
        });
    });

    describe('YouTubeTranscriptTool Execution', () => {
        it('should handle YouTube URL', async () => {
            // Setup mock response
            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=test123', {
                status: 200,
                content: JSON.stringify({ captions: [] })
            });

            const result = await toolRegistry.execute('youtube_transcription', {
                url: 'https://www.youtube.com/watch?v=test123'
            });

            expect(result).toBeDefined();
        });
    });

    describe('Tool Registry', () => {
        it('should retrieve tool by name', () => {
            const tool = toolRegistry.getTool('vault_search');
            expect(tool).toBeDefined();
            expect(tool?.definition.name).toBe('vault_search');
        });

        it('should check tool existence', () => {
            expect(toolRegistry.hasTool('vault_search')).toBe(true);
            expect(toolRegistry.hasTool('nonexistent_tool')).toBe(false);
        });

        it('should unregister tools', () => {
            toolRegistry.unregister('vault_search');
            expect(toolRegistry.hasTool('vault_search')).toBe(false);
        });

        it('should prevent duplicate registration', () => {
            const duplicateTool = new VaultSearchTool(mockApp.vault, mockApp.metadataCache);

            expect(() => {
                toolRegistry.register(duplicateTool);
            }).toThrow();
        });
    });

    describe('Tool Error Handling', () => {
        it('should handle missing parameters gracefully', async () => {
            const result = await toolRegistry.execute('vault_search', {});
            expect(result).toBeDefined();
        });

        it('should return error for unknown tool', async () => {
            await expect(
                toolRegistry.execute('unknown_tool', {})
            ).rejects.toThrow();
        });
    });

    describe('Tool Call Format', () => {
        it('should produce OpenAI-compatible tool definitions', () => {
            const definitions: OpenAIToolDefinition[] = toolRegistry.getOpenAIToolDefinitions();

            definitions.forEach(def => {
                // Verify required OpenAI format fields
                expect(def).toHaveProperty('type', 'function');
                expect(def.function).toHaveProperty('name');
                expect(def.function).toHaveProperty('description');
                expect(def.function).toHaveProperty('parameters');
                expect(def.function.parameters).toHaveProperty('type', 'object');
                expect(def.function.parameters).toHaveProperty('properties');
            });
        });

        it('should have required fields in tool definitions', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();
            const vaultSearchDef = definitions.find(d => d.function.name === 'vault_search');

            expect(vaultSearchDef).toBeDefined();
            expect(vaultSearchDef!.function.parameters.properties.query).toBeDefined();
            expect(vaultSearchDef!.function.parameters.required).toContain('query');
        });
    });
});
