/**
 * Message Renderer Component
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: 마크다운 메시지 렌더링
 */

export interface Message {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: number;
}

export class MessageRenderer {
    private containerEl: HTMLElement;

    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }

    renderMessage(message: Message): void {
        const messageEl = this.containerEl.createDiv({
            cls: `chat-message ${message.role}`,
        });

        // 역할 라벨
        const roleLabel = messageEl.createEl('span', {
            cls: 'message-role',
            text: message.role === 'user' ? '사용자' : 'AI',
        });

        // 내용 (마크다운 → HTML 변환은 Obsidian MarkdownRenderer 활용)
        const contentEl = messageEl.createEl('div', {
            cls: 'message-content',
        });
        contentEl.createEl('p', { text: message.content });

        // 타임스탬프
        const timeEl = messageEl.createEl('span', {
            cls: 'message-time',
            text: new Date(message.timestamp).toLocaleTimeString(),
        });
    }

    clear(): void {
        this.containerEl.empty();
    }

    renderStreaming(content: string): void {
        // 스트리밍 응답 업데이트
        const lastMessage = this.containerEl.querySelector('.chat-message.assistant:last-child .message-content');
        if (lastMessage) {
            lastMessage.innerHTML = `<p>${content}</p>`;
        }
    }
}
