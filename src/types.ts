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
    allowInsecureTls: boolean; // 자가 서명 인증서 허용 (외부 네트워크 접근용)
    autoApplyFileChanges: boolean; // 파일 수정/추가 시 승인 다이얼로그 건너뛰기
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
    model: 'qwen3.6:35b',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.7,
    agentMode: true,
    braveApiKey: '', // Brave Search API 키 (없으면 SearXNG 사용)
    allowInsecureTls: false, // 기본값: TLS 검증 활성화
    autoApplyFileChanges: false, // 기본값: 승인 필요 (안전)
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
