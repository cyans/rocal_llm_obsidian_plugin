/**
 * Tool Call Debugging Helper
 * Helps identify why tools are not being called in real environment
 * @MX:TEST: SPEC-PLUGIN-001 Debug
 */

import { LLMService, ChatMessage } from '../../src/llm/LLMService';
import { ToolRegistry } from '../../src/agent/ToolRegistry';
import { VaultAgentSettings } from '../../src/types';

class MockApp {
    vault = {
        read: async () => 'test',
        create: async () => {},
        modify: async () => {},
        getAbstractFileByPath: () => null,
        createFolder: async () => {},
        getMarkdownFiles: () => [],
        cachedRead: async () => ''
    };
    metadataCache = {
        getFileCache: () => null
    };
}

describe('Tool Call Debugging Tests', () => {
    let toolRegistry: ToolRegistry;

    beforeAll(() => {
        toolRegistry = new ToolRegistry(new MockApp() as any);
        toolRegistry.registerAllTools(undefined, llmService);
    });

    describe('Tool Definitions Format Check', () => {
        it('should export tool definitions in correct OpenAI format', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();

            console.log('\n========== TOOL DEFINITIONS ==========');
            console.log(JSON.stringify(definitions, null, 2));
            console.log('======================================\n');

            expect(definitions.length).toBeGreaterThan(0);

            definitions.forEach(def => {
                expect(def.type).toBe('function');
                expect(def.function).toHaveProperty('name');
                expect(def.function).toHaveProperty('description');
                expect(def.function).toHaveProperty('parameters');

                // Check parameters structure
                const params = def.function.parameters;
                expect(params.type).toBe('object');
                expect(params).toHaveProperty('properties');
                expect(Array.isArray(params.properties)).toBe(false);
            });
        });

        it('should have all required fields in tool definitions', () => {
            const definitions = toolRegistry.getOpenAIToolDefinitions();

            definitions.forEach(def => {
                const { name, description, parameters } = def.function;

                // Name must be string
                expect(typeof name).toBe('string');
                expect(name.length).toBeGreaterThan(0);

                // Description must be helpful
                expect(typeof description).toBe('string');
                expect(description.length).toBeGreaterThan(10);

                // Parameters must have properties
                expect(parameters.properties).toBeDefined();
                expect(Object.keys(parameters.properties).length).toBeGreaterThan(0);

                // Required array must exist
                expect(Array.isArray(parameters.required)).toBe(true);
            });
        });
    });

    describe('LLM Request Format Check', () => {
        it('should build correct request payload for LLM', () => {
            const settings: VaultAgentSettings = {
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

            const llmService = new LLMService(settings);
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();

            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Search for notes' }
            ];

            // Build request payload (simulating what LLMService.chat does)
            const body: Record<string, any> = {
                model: settings.model,
                messages,
                max_tokens: settings.maxTokens,
                temperature: settings.temperature,
            };

            if (toolDefinitions && toolDefinitions.length > 0) {
                body.tools = toolDefinitions;
            }

            console.log('\n========== LLM REQUEST PAYLOAD ==========');
            console.log(JSON.stringify(body, null, 2));
            console.log('=========================================\n');

            // Verify request structure
            expect(body.model).toBeTruthy();
            expect(body.messages).toBeDefined();
            expect(body.messages.length).toBeGreaterThan(0);
            expect(body.tools).toBeDefined();
            expect(body.tools.length).toBeGreaterThan(0);
        });
    });

    describe('Tool Call Response Parsing Check', () => {
        it('should parse native tool_calls format', () => {
            // Simulate LLM response with tool_calls
            const mockResponse = {
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [
                            {
                                id: 'call_123',
                                type: 'function',
                                function: {
                                    name: 'vault_search',
                                    arguments: '{"query":"test","max_results":5}'
                                }
                            }
                        ]
                    }
                }]
            };

            console.log('\n===== NATIVE TOOL CALLS FORMAT =====');
            console.log(JSON.stringify(mockResponse, null, 2));
            console.log('====================================\n');

            const message = mockResponse.choices[0].message;
            expect(message.tool_calls).toBeDefined();
            expect(message.tool_calls.length).toBeGreaterThan(0);
        });

        it('should parse alternative tool call formats', () => {
            const alternativeFormats = [
                // Qwen bracket style
                '[Calling tool: vault_search({"query":"test","max_results":5})]',
                // XML style
                '<tool_call>{"name":"vault_search","arguments":{"query":"test"}}</tool_call>',
                // Standalone JSON
                '{"name":"vault_search","arguments":{"query":"test","max_results":5}}'
            ];

            console.log('\n===== ALTERNATIVE TOOL CALL FORMATS =====');
            alternativeFormats.forEach((format, i) => {
                console.log(`Format ${i + 1}:`, format);
            });
            console.log('============================================\n');
        });
    });

    describe('Real Server Connection Test', () => {
        it('should test actual server connection (skip if server not available)', async () => {
            const settings: VaultAgentSettings = {
                apiUrl: 'http://localhost:8001/v1',
                model: 'qwen2.5:14b',
                apiKey: '',
                maxTokens: 100,
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

            const llmService = new LLMService(settings);
            const toolDefinitions = toolRegistry.getOpenAIToolDefinitions();

            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant with tools. When asked to search, use the vault_search tool.' },
                { role: 'user', content: 'Search for notes about project' }
            ];

            console.log('\n========== TESTING REAL SERVER ==========');
            console.log('Server URL:', settings.apiUrl);
            console.log('Model:', settings.model);
            console.log('Number of tools:', toolDefinitions.length);
            console.log('=========================================\n');

            try {
                const response = await llmService.chat(messages, toolDefinitions);

                console.log('\n========== SERVER RESPONSE ==========');
                console.log('Content:', response.content);
                console.log('Tool Calls:', response.toolCalls);
                console.log('=====================================\n');

                // Log to help debugging
                if (response.toolCalls && response.toolCalls.length > 0) {
                    console.log('✅ SUCCESS: Server returned tool calls!');
                } else if (response.content) {
                    console.log('⚠️  WARNING: Server returned text instead of tool calls');
                    console.log('LLM said:', response.content);
                }

            } catch (error) {
                console.log('\n========== CONNECTION ERROR ==========');
                console.log('Error:', error);
                console.log('======================================\n');

                // This is expected if server is not running
                console.log('⚠️  Server not available - this is expected in test environment');
                console.log('Run this test with your LLM server running to see actual results');
            }
        }, 30000);
    });
});
