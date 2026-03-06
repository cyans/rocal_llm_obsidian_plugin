/**
 * Conversation Manager - 대화 히스토리 관리
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: LLM과의 대화 맥락을 유지하는 매니저
 */

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}

export class ConversationManager {
    private messages: ChatMessage[] = [];
    private systemPrompt: string = '';

    constructor(systemPrompt?: string) {
        if (systemPrompt) {
            this.systemPrompt = systemPrompt;
        }
    }

    /**
     * 메시지 추가
     */
    addMessage(role: ChatMessage['role'], content: string): void {
        this.messages.push({ role, content });
    }

    /**
     * 대화 히스토리 가져오기
     */
    getHistory(): ChatMessage[] {
        return [...this.messages];
    }

    /**
     * LLM API용 포맷으로 변환
     */
    formatForLLM(): ChatMessage[] {
        const formatted: ChatMessage[] = [];

        if (this.systemPrompt) {
            formatted.push({ role: 'system', content: this.systemPrompt });
        }

        return formatted.concat(this.messages);
    }

    /**
     * 대화 내용 초기화
     */
    clear(): void {
        this.messages = [];
    }

    /**
     * 시스템 프롬프트 설정
     */
    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    /**
     * 메시지 수 반환
     */
    get length(): number {
        return this.messages.length;
    }
}
