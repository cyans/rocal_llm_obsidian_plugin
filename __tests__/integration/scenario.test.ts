/**
 * Real-World Scenario Tests
 * Tests actual usage scenarios to identify tool execution issues
 * @MX:TEST: SPEC-PLUGIN-001 Scenario
 */

import { AgentController } from '../../src/agent/AgentController';
import { ToolRegistry } from '../../src/agent/ToolRegistry';
import { LLMService, ChatMessage } from '../../src/llm/LLMService';
import { VaultAgentSettings } from '../../src/types';

// Mock Obsidian components
class MockVault {
    private files: Map<string, string> = new Map();

    constructor() {
        this.files.set('project/notes.md', '# Project Notes\n\nAI agent development progress.');
        this.files.set('journal/2024-01-01.md', '# Daily Journal\n\nToday I worked on the plugin.');
        this.files.set('reference/qwen.md', '# Qwen Guide\n\nQwen is a large language model.');
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

    async createFolder(path: string): Promise<void> {}

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

class MockRequestUrl {
    async requestUrl(url: string, options?: any): Promise<any> {
        if (url.includes('search')) {
            return {
                status: 200,
                text: JSON.stringify({
                    results: [
                        {
                            title: 'Test Result',
                            url: 'https://example.com',
                            content: 'Sample content'
                        }
                    ]
                }),
                headers: {}
            };
        }
        return { status: 404, text: 'Not found', headers: {} };
    }
}

class MockModal {
    async confirm(message: string): Promise<boolean> {
        return true;
    }
}

class MockApp {
    vault = new MockVault();
    metadataCache = new MockMetadataCache();
}

// Mock LLM Service that simulates Qwen responses
class MockLLMService {
    private callCount = 0;
    private settings: VaultAgentSettings;

    constructor(settings: VaultAgentSettings) {
        this.settings = settings;
    }

    async chat(messages: ChatMessage[], tools?: any[]): Promise<any> {
        this.callCount++;
        const lastMessage = messages[messages.length - 1];

        // Check if previous message was a tool result
        const prevMessage = messages[messages.length - 2];
        const hasToolResult = prevMessage?.role === 'tool';

        // Scenario 1: User asks for vault search
        if (lastMessage.content.toLowerCase().includes('search') && !hasToolResult) {
            return {
                content: '',
                toolCalls: [{
                    id: `call_${this.callCount}`,
                    type: 'function',
                    function: {
                        name: 'vault_search',
                        arguments: JSON.stringify({ query: 'project', max_results: 5 })
                    }
                }]
            };
        }

        // Scenario 2: After tool execution, provide response
        if (hasToolResult) {
            return {
                content: '볼트에서 "project" 관련 노트를 찾았습니다:\n\n- project/notes.md: # Project Notes\n\nAI agent development progress.',
                toolCalls: []
            };
        }

        // Scenario 3: User asks to create a file
        if (lastMessage.content.toLowerCase().includes('create') || lastMessage.content.toLowerCase().includes('만들')) {
            return {
                content: '',
                toolCalls: [{
                    id: `call_${this.callCount}`,
                    type: 'function',
                    function: {
                        name: 'write_to_file',
                        arguments: JSON.stringify({
                            file_path: 'new-note.md',
                            content: '# New Note\n\nCreated by AI agent.'
                        })
                    }
                }]
            };
        }

        // Default: normal response
        return {
            content: '안녕하세요! 어떻게 도와드릴까요?',
            toolCalls: []
        };
    }

    updateSettings(settings: VaultAgentSettings): void {
        this.settings = settings;
    }

    getCallCount(): number {
        return this.callCount;
    }

    resetCallCount(): void {
        this.callCount = 0;
    }
}

describe('Real-World Scenario Tests', () => {
    let agentController: AgentController;
    let toolRegistry: ToolRegistry;
    let mockLLMService: MockLLMService;
    let mockApp: MockApp;

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

    beforeEach(() => {
        mockApp = new MockApp();
        mockLLMService = new MockLLMService(testSettings);
        toolRegistry = new ToolRegistry(mockApp as any);

        // Register all tools
        const modal = new MockModal();
        const mockRequestUrl = new MockRequestUrl();

        const { VaultSearchTool } = require('../../src/tools/VaultSearchTool');
        const { WriteToFileTool } = require('../../src/tools/WriteToFileTool');
        const { ReplaceInFileTool } = require('../../src/tools/ReplaceInFileTool');
        const { WebSearchTool } = require('../../src/tools/WebSearchTool');
        const { YouTubeTranscriptTool } = require('../../src/tools/YouTubeTranscriptTool');

        const vaultSearch = new VaultSearchTool(mockApp.vault, mockApp.metadataCache);
        toolRegistry.register(vaultSearch);

        const writeToFile = new WriteToFileTool(mockApp.vault, modal as any);
        writeToFile.setAutoConfirm(true);
        toolRegistry.register(writeToFile);

        const replaceInFile = new ReplaceInFileTool(mockApp.vault, modal as any);
        replaceInFile.setAutoConfirm(true);
        toolRegistry.register(replaceInFile);

        const webSearch = new WebSearchTool(mockRequestUrl as any);
        toolRegistry.register(webSearch);

        const ytTranscript = new YouTubeTranscriptTool(mockRequestUrl as any, mockApp.vault);
        toolRegistry.register(ytTranscript);

        // Create agent controller with mock LLM
        agentController = new AgentController(
            mockLLMService as any,
            toolRegistry,
            true
        );
    });

    describe('Scenario 1: Vault Search', () => {
        it('should complete vault search workflow', async () => {
            const response = await agentController.processMessage('프로젝트 관련 노트를 찾아줘');

            console.log('[TEST] Response:', response);

            expect(response).toBeDefined();
            expect(response.type).toBe('tool_call');
            expect(response.content).toBeTruthy();
            expect(response.toolCalls).toBeDefined();
            expect(response.toolCalls?.length).toBeGreaterThan(0);

            // Verify vault_search was called
            const toolCall = response.toolCalls?.[0];
            expect(toolCall?.function.name).toBe('vault_search');
        });
    });

    describe('Scenario 2: Create File', () => {
        it('should create a new file', async () => {
            const response = await agentController.processMessage('새로운 노트를 만들어줘');

            console.log('[TEST] Response:', response);

            expect(response).toBeDefined();
            expect(response.toolCalls).toBeDefined();
            expect(response.toolCalls?.length).toBeGreaterThan(0);

            const toolCall = response.toolCalls?.[0];
            expect(toolCall?.function.name).toBe('write_to_file');
        });
    });

    describe('Scenario 3: Multi-turn conversation', () => {
        it('should handle conversation with tool use', async () => {
            // First message
            const response1 = await agentController.processMessage('프로젝트 노트 검색');
            console.log('[TEST] Response 1:', response1);

            expect(response1.toolCalls).toBeDefined();
            expect(response1.toolCalls?.length).toBeGreaterThan(0);

            // Second message (should continue conversation)
            agentController.resetConversation();
            const response2 = await agentController.processMessage('또 다른 노트를 찾아줘');
            console.log('[TEST] Response 2:', response2);

            expect(response2).toBeDefined();
        });
    });

    describe('Tool Registry Integration', () => {
        it('should have all required tools registered', () => {
            const allTools = toolRegistry.getAllTools();
            const toolNames = allTools.map(t => t.definition.name);

            console.log('[TEST] Registered tools:', toolNames);

            expect(toolNames).toContain('vault_search');
            expect(toolNames).toContain('write_to_file');
            expect(toolNames).toContain('replace_in_file');
            expect(toolNames).toContain('web_search');
            expect(toolNames).toContain('youtube_transcription');
        });
    });

    describe('OpenAI Tool Format', () => {
        it('should produce correct OpenAI tool definitions', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();

            console.log('[TEST] Tool definitions:', JSON.stringify(definitions, null, 2));

            definitions.forEach(def => {
                expect(def.type).toBe('function');
                expect(def.function.name).toBeTruthy();
                expect(def.function.description).toBeTruthy();
                expect(def.function.parameters).toBeDefined();
                expect(def.function.parameters.type).toBe('object');
                expect(def.function.parameters.properties).toBeDefined();
            });
        });
    });

    describe('Agent Controller State', () => {
        it('should track iteration count', () => {
            agentController.setMaxIterations(5);

            expect(agentController.getMaxIterations()).toBe(5);
        });

        it('should reset conversation', () => {
            agentController.resetConversation();
            const history = agentController.getConversationHistory();

            expect(history).toEqual([]);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle empty message gracefully', async () => {
            const response = await agentController.processMessage('');

            expect(response).toBeDefined();
        });

        it('should handle very long message', async () => {
            const longMessage = 'A'.repeat(1000);
            const response = await agentController.processMessage(longMessage);

            expect(response).toBeDefined();
        });
    });

    describe('Tool Execution Flow', () => {
        it('should execute tool and return result', async () => {
            // This test simulates the actual flow:
            // 1. User message
            // 2. LLM returns tool call
            // 3. Tool is executed
            // 4. Result is returned to LLM
            // 5. LLM returns final response

            const response = await agentController.processMessage('프로젝트 검색');

            console.log('[TEST] Full flow response:', response);
            console.log('[TEST] Tool calls:', response.toolCalls);
            console.log('[TEST] Content:', response.content);

            expect(response.type).toBe('tool_call');
            expect(response.toolCalls?.length).toBeGreaterThan(0);
        });
    });
});
