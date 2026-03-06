/**
 * Settings Tab for Vault Agent Plugin
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { VaultAgentSettings } from './types';
import VaultAgentPlugin from './main';

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
            .setDesc('Model name for Qwen 3.5')
            .addText(text => text.setPlaceholder('qwen3.5:latest')
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
    }

    private async persistSettings(): Promise<void> {
        await this.plugin.saveSettings();
    }
}
