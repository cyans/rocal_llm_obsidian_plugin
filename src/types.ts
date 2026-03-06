/**
 * Type definitions for Vault Agent Plugin
 * @MX:SPEC: SPEC-PLUGIN-001
 */

export interface VaultAgentSettings {
    apiUrl: string;
    model: string;
    apiKey: string;
    maxTokens: number;
    temperature: number;
    agentMode: boolean;
    braveApiKey: string; // Brave Search API 키 (https://api.search.brave.com)
    tools: {
        vaultSearch: boolean;
        webSearch: boolean;
        writeToFile: boolean;
        replaceInFile: boolean;
        youtubeTranscript: boolean;
        vaultReadContents: boolean;
        vaultSummarize: boolean;
    };
}

export const DEFAULT_SETTINGS: VaultAgentSettings = {
    apiUrl: 'http://localhost:11434/v1',
    model: 'qwen3.5:35b',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.7,
    agentMode: true,
    braveApiKey: '', // Brave Search API 키 (없으면 SearXNG 사용)
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
