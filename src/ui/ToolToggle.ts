/**
 * Tool Toggle Component
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: 도구 활성화/비활성화 토글 버튼
 */

import { VaultAgentSettings } from '../types';

export class ToolToggle {
    private containerEl: HTMLElement;
    private settings: VaultAgentSettings;
    private onToggle: (toolKey: string, enabled: boolean) => void;

    constructor(
        containerEl: HTMLElement,
        settings: VaultAgentSettings,
        onToggle: (toolKey: string, enabled: boolean) => void
    ) {
        this.containerEl = containerEl;
        this.settings = settings;
        this.onToggle = onToggle;
    }

    render(): void {
        const toolsContainer = this.containerEl.createDiv({ cls: 'tool-toggles-container' });
        toolsContainer.createEl('h4', { text: '도구 토글' });

        const tools = [
            { key: 'vaultSearch', name: '볼트 검색', icon: '🔍' },
            { key: 'webSearch', name: '웹 검색', icon: '🌐' },
            { key: 'writeToFile', name: '파일 쓰기', icon: '📝' },
            { key: 'replaceInFile', name: '파일 수정', icon: '✏️' },
            { key: 'youtubeTranscript', name: 'YouTube 자막', icon: '📺' },
        ];

        tools.forEach(tool => {
            const enabled = this.settings.tools[tool.key as keyof typeof this.settings.tools];

            const toolEl = toolsContainer.createDiv({ cls: 'tool-toggle-item' });

            // 토글 스위치
            const toggleEl = toolEl.createEl('input', {
                type: 'checkbox',
                attr: { checked: enabled },
            });

            toggleEl.addEventListener('change', () => {
                const newState = toggleEl.checked;
                this.onToggle(tool.key, newState);
            });

            // 아이콘과 이름
            toolEl.createEl('span', { cls: 'tool-icon', text: tool.icon });
            toolEl.createEl('span', { cls: 'tool-name', text: tool.name });
        });
    }
}
