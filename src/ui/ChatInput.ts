/**
 * Chat Input Component
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: 메시지 입력 및 전송 UI
 */

import { VaultAgentSettings } from '../types';

export class ChatInput {
    private containerEl: HTMLElement;
    private settings: VaultAgentSettings;
    private onSend: (message: string) => void;

    constructor(
        containerEl: HTMLElement,
        settings: VaultAgentSettings,
        onSend: (message: string) => void
    ) {
        this.containerEl = containerEl;
        this.settings = settings;
        this.onSend = onSend;
    }

    render(): void {
        const inputContainer = this.containerEl.createDiv({ cls: 'chat-input-container' });

        // 메시지 입력창
        const inputEl = inputContainer.createEl('textarea', {
            cls: 'chat-textarea',
            attr: { placeholder: '메시지를 입력하세요...' },
        });

        // 전송 버튼
        const sendBtn = inputContainer.createEl('button', {
            cls: 'chat-send-button',
            text: '전송',
        });

        sendBtn.addEventListener('click', () => {
            const message = inputEl.value.trim();
            if (message) {
                this.onSend(message);
                inputEl.value = '';
            }
        });

        // 도구 토글 표시 (간단 구현)
        this.renderToolToggles(inputContainer);
    }

    private renderToolToggles(containerEl: HTMLElement): void {
        const toolsContainer = containerEl.createDiv({ cls: 'tool-toggles' });

        const tools = [
            { key: 'vaultSearch', name: '볼트 검색' },
            { key: 'webSearch', name: '웹 검색' },
        ];

        tools.forEach(tool => {
            const enabled = this.settings.tools[tool.key as keyof typeof this.settings.tools];
            const badge = toolsContainer.createEl('span', {
                cls: enabled ? 'tool-badge enabled' : 'tool-badge disabled',
                text: tool.name,
            });
        });
    }
}
