/**
 * Tool Registry - Tool registration and dispatch
 * @MX:ANCHOR: Tool registration and dispatch center for all agent tools
 * @MX:REASON: All tool executions flow through this registry
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 2
 */

import { App, requestUrl } from 'obsidian';
import { BaseTool } from '../tools/BaseTool';
import { VaultSearchTool } from '../tools/VaultSearchTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WriteToFileTool } from '../tools/WriteToFileTool';
import { ReplaceInFileTool } from '../tools/ReplaceInFileTool';
import { YouTubeTranscriptTool } from '../tools/YouTubeTranscriptTool';
import { VaultReadContentsTool } from '../tools/VaultReadContentsTool';
import { VaultSummarizeTool } from '../tools/VaultSummarizeTool';
import { LLMService } from '../llm/LLMService';
import { VaultAgentSettings } from '../types';

/**
 * OpenAI-compatible tool definition format
 */
export interface OpenAIToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

/**
 * Simple modal adapter for file operations
 */
class SimpleModalAdapter {
    async confirm(message: string): Promise<boolean> {
        if (typeof globalThis.confirm === 'function') {
            return globalThis.confirm(message);
        }

        return false;
    }
}

/**
 * Create a request adapter using Obsidian's requestUrl with timeout.
 * Falls back to fetch with AbortController timeout.
 */
function createRequestAdapter(timeoutMs: number = 10000) {
    return {
        requestUrl: async (url: string, options: any = {}) => {
            try {
                // Use Obsidian's requestUrl (handles CORS, better for plugins)
                const response = await requestUrl({
                    url,
                    method: options.method || 'GET',
                    headers: options.headers,
                    body: options.body,
                    throw: false,
                });
                return {
                    status: response.status,
                    text: response.text,
                    headers: response.headers
                };
            } catch (error) {
                // Fallback: use fetch with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    return {
                        status: response.status,
                        text: await response.text(),
                        headers: response.headers
                    };
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        }
    };
}

/**
 * ToolRegistry manages tool registration, lookup, and execution.
 * Acts as the central dispatch point for all agent tool calls.
 */
export class ToolRegistry {
    private tools: Map<string, BaseTool> = new Map();
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Register a tool in the registry.
     * @throws Error if a tool with the same name already exists
     */
    register(tool: BaseTool): void {
        const toolName = tool.definition.name;

        if (this.tools.has(toolName)) {
            throw new Error(`Tool "${toolName}" is already registered`);
        }

        this.tools.set(toolName, tool);
    }

    /**
     * Unregister a tool from the registry.
     * Silently ignores non-existent tools.
     */
    unregister(toolName: string): void {
        this.tools.delete(toolName);
    }

    /**
     * Remove all registered tools.
     */
    clear(): void {
        this.tools.clear();
    }

    /**
     * Get a tool by name.
     * @returns The tool instance or undefined if not found
     */
    getTool(toolName: string): BaseTool | undefined {
        return this.tools.get(toolName);
    }

    /**
     * Check if a tool is registered.
     */
    hasTool(toolName: string): boolean {
        return this.tools.has(toolName);
    }

    /**
     * Execute a tool by name with given parameters.
     * Returns the tool execution result directly.
     * @throws Error if tool is not found
     * @throws Error from tool execution if tool fails
     */
    async execute(toolName: string, params: Record<string, any>): Promise<any> {
        const tool = this.getTool(toolName);

        if (!tool) {
            throw new Error(`Tool "${toolName}" not found in registry`);
        }

        return await tool.execute(params);
    }

    /**
     * Get all registered tools.
     */
    getAllTools(): BaseTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get OpenAI-compatible tool definitions for all registered tools.
     * Used for LLM tool-calling API.
     */
    getOpenAIToolDefinitions(): OpenAIToolDefinition[] {
        return this.getAllTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.definition.name,
                description: tool.definition.description,
                parameters: tool.definition.parameters
            }
        }));
    }

    /**
     * Register all available tools.
     * @param settings 플러그인 설정 (선택적)
     * @param llmService LLM 서비스 인스턴스 (선택적, VaultSummarizeTool용)
     */
    registerAllTools(settings?: VaultAgentSettings, llmService?: LLMService): void {
        this.clear();

        const modal = new SimpleModalAdapter();
        const httpAdapter = createRequestAdapter(10000); // 10 second timeout

        if (settings?.tools.vaultSearch ?? true) {
            const vaultSearch = new VaultSearchTool(
                this.app.vault,
                this.app.metadataCache
            );
            this.register(vaultSearch);
        }

        if (settings?.tools.webSearch ?? true) {
            const webSearch = new WebSearchTool(httpAdapter);
            if (settings?.braveApiKey) {
                webSearch.setBraveAPIKey(settings.braveApiKey);
            }
            this.register(webSearch);
        }

        if (settings?.tools.writeToFile ?? true) {
            const writeToFile = new WriteToFileTool(
                this.app.vault,
                modal
            );
            this.register(writeToFile);
        }

        if (settings?.tools.replaceInFile ?? true) {
            const replaceInFile = new ReplaceInFileTool(
                this.app.vault,
                modal
            );
            this.register(replaceInFile);
        }

        if (settings?.tools.youtubeTranscript ?? true) {
            const ytTranscript = new YouTubeTranscriptTool(
                httpAdapter,
                this.app.vault
            );
            this.register(ytTranscript);
        }

        if (settings?.tools.vaultReadContents ?? true) {
            const vaultReadContents = new VaultReadContentsTool(
                this.app.vault,
                this.app.metadataCache
            );
            this.register(vaultReadContents);
        }

        if (settings?.tools.vaultSummarize ?? true) {
            if (llmService) {
                const vaultSummarize = new VaultSummarizeTool(llmService);
                this.register(vaultSummarize);
            } else {
                console.warn('VaultSummarizeTool requires LLMService instance, skipping registration');
            }
        }
    }

    /**
     * Brave Search API 키 업데이트
     * 설정 변경 시 호출하여 실시간으로 API 키 반영
     */
    setBraveAPIKey(apiKey: string): void {
        const webSearch = this.getTool('web_search') as WebSearchTool;
        if (webSearch) {
            webSearch.setBraveAPIKey(apiKey);
        }
    }
}
