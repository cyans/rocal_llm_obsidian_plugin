/**
 * Settings Tab for Vault Agent Plugin
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { VaultAgentSettings } from './types';
import VaultAgentPlugin from './main';
import { ConnectionTestResult, LOCAL_URL_STORAGE_KEY } from './llm/LLMService';

export class VaultAgentSettingTab extends PluginSettingTab {
    plugin: VaultAgentPlugin;

    constructor(app: App, plugin: VaultAgentPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // API URL 설정
        new Setting(containerEl)
            .setName('API URL')
            .setDesc('Qwen 3.5 API endpoint URL')
            .addText(text => text.setPlaceholder('http://localhost:11434/v1')
                .setValue(this.plugin.settings.apiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiUrl = value;
                    await this.persistSettings();
                }));

        // Model 설정
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Model name for Qwen 3.6')
            .addText(text => text.setPlaceholder('qwen3.6:latest')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.persistSettings();
                }));

        // API Key 설정 (선택)
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('API key (optional)')
            .addText(text => text.setPlaceholder('Enter API key if required')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.persistSettings();
                }));

        // Max Tokens 설정
        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Maximum response tokens (1-32000)')
            .addText(text => text.setPlaceholder('4096')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (numValue >= 1 && numValue <= 32000) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.persistSettings();
                    }
                }));

        // Temperature 설정
        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Sampling temperature (0-2)')
            .addText(text => text.setPlaceholder('0.7')
                .setValue(String(this.plugin.settings.temperature))
                .onChange(async (value) => {
                    const numValue = parseFloat(value);
                    if (numValue >= 0 && numValue <= 2) {
                        this.plugin.settings.temperature = numValue;
                        await this.persistSettings();
                    }
                }));

        // Agent Mode 토글
        new Setting(containerEl)
            .setName('Agent Mode')
            .setDesc('Enable automatic tool execution')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.agentMode)
                .onChange(async (value) => {
                    this.plugin.settings.agentMode = value;
                    await this.persistSettings();
                }));

        // Auto-Apply File Changes 토글
        // 활성화 시 write_to_file / replace_in_file 도구가 승인 다이얼로그 없이 바로 적용
        new Setting(containerEl)
            .setName('Auto-Apply File Changes')
            .setDesc(
                'Skip the confirmation dialog when the agent creates, overwrites, or edits notes. ' +
                'WARNING: The agent will modify your vault without asking. Keep off unless you trust the agent.'
            )
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoApplyFileChanges)
                .onChange(async (value) => {
                    this.plugin.settings.autoApplyFileChanges = value;
                    await this.persistSettings();
                    // 재등록 없이 활성 도구 인스턴스에 즉시 반영
                    this.plugin.toolRegistry?.setAutoApplyFileChanges(value);
                })
            );

        // Tools 토글 섹션
        containerEl.createEl('h3', { text: 'Tool Toggles' });

        // Vault Search 토글
        new Setting(containerEl)
            .setName('Vault Search')
            .setDesc('Search vault for relevant notes')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.vaultSearch)
                .onChange(async (value) => {
                    this.plugin.settings.tools.vaultSearch = value;
                    await this.persistSettings();
                }));

        // Web Search 토글
        new Setting(containerEl)
            .setName('Web Search')
            .setDesc('Search the web for real-time information')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.webSearch)
                .onChange(async (value) => {
                    this.plugin.settings.tools.webSearch = value;
                    await this.persistSettings();
                }));

        new Setting(containerEl)
            .setName('Write To File')
            .setDesc('Create or overwrite notes in the vault')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.writeToFile)
                .onChange(async (value) => {
                    this.plugin.settings.tools.writeToFile = value;
                    await this.persistSettings();
                }));

        new Setting(containerEl)
            .setName('Replace In File')
            .setDesc('Edit existing notes using exact search and replace')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.replaceInFile)
                .onChange(async (value) => {
                    this.plugin.settings.tools.replaceInFile = value;
                    await this.persistSettings();
                }));

        new Setting(containerEl)
            .setName('YouTube Transcript')
            .setDesc('Fetch transcripts from YouTube videos')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.youtubeTranscript)
                .onChange(async (value) => {
                    this.plugin.settings.tools.youtubeTranscript = value;
                    await this.persistSettings();
                }));

        new Setting(containerEl)
            .setName('Vault Read Contents')
            .setDesc('Read contents of multiple vault files')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.vaultReadContents)
                .onChange(async (value) => {
                    this.plugin.settings.tools.vaultReadContents = value;
                    await this.persistSettings();
                }));

        new Setting(containerEl)
            .setName('Vault Summarize')
            .setDesc('Summarize vault file contents using LLM')
            .addToggle(toggle => toggle.setValue(this.plugin.settings.tools.vaultSummarize)
                .onChange(async (value) => {
                    this.plugin.settings.tools.vaultSummarize = value;
                    await this.persistSettings();
                }));

        // Brave Search API Key 설정
        new Setting(containerEl)
            .setName('Brave Search API Key')
            .setDesc('Brave Search API key for enhanced web search (optional, fallback to SearXNG)')
            .addText(text => text.setPlaceholder('Enter Brave API key')
                .setValue(this.plugin.settings.braveApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.braveApiKey = value;
                    await this.persistSettings();
                }));

        // ── 로컬 URL 오버라이드 섹션 ────────────────────────────────
        containerEl.createEl('h3', { text: 'Local Override (This Device Only)' });

        // localStorage에 저장 → Obsidian Sync 제외, 기기별 독립 설정
        new Setting(containerEl)
            .setName('Local API URL Override')
            .setDesc(
                'Device-specific URL (not synced). Overrides the API URL above for this device only. ' +
                'Use for local access (e.g. http://localhost:8001/v1) when other devices use an external URL.'
            )
            .addText(text => text
                .setPlaceholder('http://localhost:8001/v1  (leave blank to use API URL above)')
                .setValue(localStorage.getItem(LOCAL_URL_STORAGE_KEY) ?? '')
                .onChange((value) => {
                    if (value.trim()) {
                        localStorage.setItem(LOCAL_URL_STORAGE_KEY, value.trim());
                    } else {
                        localStorage.removeItem(LOCAL_URL_STORAGE_KEY);
                    }
                })
            );

        // ── 외부 접근 섹션 ──────────────────────────────────────────
        containerEl.createEl('h3', { text: 'External Access' });

        // TLS 검증 우회 토글 (자가 서명 인증서 환경)
        new Setting(containerEl)
            .setName('Allow Insecure TLS')
            .setDesc(
                'Enable for self-signed certificates (external network / HTTPS with custom CA). ' +
                'Required for iPhone and Windows without CA installation.'
            )
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowInsecureTls)
                .onChange(async (value) => {
                    this.plugin.settings.allowInsecureTls = value;
                    await this.persistSettings();
                })
            );

        // 연결 테스트 버튼
        // 마지막 테스트 결과를 동적으로 표시하기 위해 Setting 레퍼런스를 저장
        let lastTestResult = '테스트를 실행하면 결과가 여기에 표시됩니다';
        const testSetting = new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(lastTestResult)
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        // plugin.llmService는 main.ts의 public 필드
                        const result: ConnectionTestResult =
                            await this.plugin.llmService.testConnection();

                        if (result.ok) {
                            lastTestResult = `Connected (${result.latencyMs}ms)`;
                        } else {
                            lastTestResult = `Failed: ${result.error ?? 'Unknown error'}`;
                        }
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        lastTestResult = `Failed: ${msg}`;
                    } finally {
                        // 설명 텍스트 동적 업데이트
                        testSetting.setDesc(lastTestResult);
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                })
            );
    }

    private async persistSettings(): Promise<void> {
        await this.plugin.saveSettings();
    }
}
