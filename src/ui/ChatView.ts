/**
 * Chat View UI Component
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: ChatGPT 스타일 미니멀 디자인, CSS 클래스 기반 스타일링
 */

import { ItemView, WorkspaceLeaf, MarkdownRenderer } from 'obsidian';
import { TFile } from 'obsidian';
import VaultAgentPlugin from '../main';
import { FileBadge } from '../components/FileBadge';

export const VIEW_TYPE_VAULT_AGENT_CHAT = 'vault-agent-chat';

export class ChatView extends ItemView {
    plugin: VaultAgentPlugin;
    private messagesEl: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    private sendButtonEl: HTMLButtonElement;
    private clearButtonEl: HTMLButtonElement;
    private debugMode: boolean = false;
    private fileBadgeContainer: HTMLElement;
    private fileBadge: FileBadge | null = null;
    private activeFilePath: string | null = null;
    private isProcessing: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: VaultAgentPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_VAULT_AGENT_CHAT;
    }

    getDisplayText(): string {
        return 'Vault Agent Chat';
    }

    async onOpen() {
        console.log('[ChatView] Chat view opened\!');
        const container = this.containerEl;
        container.empty();
        container.addClass('vault-agent-chat-container');

        const notesPanel = container.createDiv({ cls: 'chat-relevant-notes' });
        const notesHeader = notesPanel.createDiv({ cls: 'chat-relevant-notes-header' });
        notesHeader.createDiv({ cls: 'chat-relevant-notes-title', text: 'Relevant Notes' });
        notesHeader.createEl('button', {
            cls: 'chat-relevant-notes-refresh',
            text: '↻'
        });
        notesPanel.createDiv({
            cls: 'chat-relevant-notes-body',
            text: 'No relevant notes found'
        });

        // 메시지 표시 영역
        this.messagesEl = container.createDiv({ cls: 'chat-messages' });

        // 환영 메시지
        this.addMessage('assistant', '안녕하세요\! Vault Agent입니다.\n\n웹 검색, 노트 검색, YouTube 자막 추출 등의 기능을 사용할 수 있습니다.\n\n무엇을 도와드릴까요?');

        // 입력 영역 컨테이너
        const inputContainer = container.createDiv({ cls: 'chat-input-container' });
        const composerEl = inputContainer.createDiv({ cls: 'chat-composer' });

        // 파일 배지 컨테이너 (입력창 위)
        this.fileBadgeContainer = composerEl.createDiv({ cls: 'file-badge-container' });
        this.fileBadge = new FileBadge(
            this.fileBadgeContainer,
            null,
            () => this.clearActiveFile()
        );

        // 버튼 컨테이너
        const buttonContainer = composerEl.createDiv({ cls: 'chat-actions' });

        // 왼쪽 버튼 그룹
        const leftButtons = buttonContainer.createDiv({ cls: 'left-buttons' });

        // 대화 초기화 버튼
        this.clearButtonEl = leftButtons.createEl('button', {
            text: '초기화'
        });
        this.clearButtonEl.onclick = () => this.clearConversation();

        // 디버그 모드 토글
        const debugButton = leftButtons.createEl('button', {
            text: '디버그'
        });
        debugButton.onclick = () => {
            this.debugMode = !this.debugMode;
            debugButton.textContent = this.debugMode ? '디버그 ON' : '디버그';
        };

        // 입력창
        this.inputEl = composerEl.createEl('textarea', {
            cls: 'chat-input',
            attr: {
                placeholder: '메시지를 입력하세요... (Shift+Enter: 줄바꿈)',
                rows: '1'
            }
        });

        // Auto-resize textarea
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
        });

        // 전송 버튼 컨테이너
        const composerFooter = composerEl.createDiv({ cls: 'chat-composer-footer' });
        const composerMeta = composerFooter.createDiv({ cls: 'chat-composer-meta' });
        composerMeta.createSpan({
            cls: 'chat-composer-model',
            text: this.plugin.settings.model || 'model'
        });
        composerMeta.createSpan({
            cls: 'chat-composer-hint',
            text: 'Shift+Enter 줄바꿈'
        });

        const sendButtonContainer = composerFooter.createDiv({ cls: 'chat-send-container' });
        this.sendButtonEl = sendButtonContainer.createEl('button', {
            cls: 'chat-send-button',
            text: '전송'
        });
        this.sendButtonEl.onclick = () => this.sendMessage();

        // Enter 키로 전송 (Shift+Enter는 줄바꿈)
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    /**
     * 활성 파일 설정
     */
    setActiveFile(fileName: string, filePath: string): void {
        this.activeFilePath = filePath;
        if (this.fileBadge) {
            this.fileBadge.setFile(fileName);
        }
    }

    /**
     * 활성 파일 초기화
     */
    clearActiveFile(): void {
        this.activeFilePath = null;
        if (this.fileBadge) {
            this.fileBadge.setFile(null);
        }
    }

    /**
     * 현재 활성 파일 경로 반환
     */
    getActiveFilePath(): string | null {
        return this.activeFilePath;
    }

    /**
     * 활성 파일 내용 읽기
     */
    private async readActiveFileContent(): Promise<string | null> {
        if (!this.activeFilePath) return null;
        
        try {
            const abstractFile = this.app.vault.getAbstractFileByPath(this.activeFilePath);
            if (abstractFile instanceof TFile) {
                return await this.app.vault.read(abstractFile);
            }
            return null;
        } catch (error) {
            console.warn('[ChatView] Failed to read file:', this.activeFilePath, error);
            return null;
        }
    }

    /**
     * 메시지 추가
     */
    async addMessage(role: 'user' | 'assistant' | 'system', content: string, isToolCall: boolean = false, rawLLMResponse?: string) {
        const displayContent = role === 'assistant' || role === 'system'
            ? this.sanitizeDisplayContent(content)
            : content;
        const messageEl = this.messagesEl.createDiv({ cls: `chat-message ${role}` });
        // 데이터 속성으로 내용 저장 (액션에서 사용)
        messageEl.dataset.content = displayContent;
        messageEl.dataset.role = role;

        // 메시지 버블 컨테이너
        const bubbleEl = messageEl.createDiv({ cls: 'message-bubble' });

        const metaEl = bubbleEl.createDiv({ cls: 'message-meta' });
        metaEl.createDiv({ cls: 'message-role-label', text: this.getRoleLabel(role) });
        metaEl.createDiv({ cls: 'message-timestamp', text: this.formatTimestamp(new Date()) });

        // 콘텐츠 영역
        const contentEl = bubbleEl.createDiv({ cls: 'message-content' });
        await MarkdownRenderer.renderMarkdown(displayContent, contentEl, '', this.plugin);

        // 툴 호출 표시 (디버그 모드에서만)
        if (isToolCall && this.debugMode) {
            const toolBadge = bubbleEl.createDiv({ cls: 'chat-tool-badge' });
            toolBadge.textContent = '도구 사용됨';
        }

        // 디버그 모드: LLM 원본 응답 표시
        if (this.debugMode && rawLLMResponse) {
            const debugEl = bubbleEl.createDiv({ cls: 'chat-debug' });
            debugEl.textContent = `[DEBUG LLM Response]:\n${rawLLMResponse}`;
        }

        // 메시지 액션 바 (상시 표시)
        const actionsEl = messageEl.createDiv({ cls: 'message-actions' });

        // 공통: 복사 버튼
        const copyBtn = actionsEl.createEl('button', {
            cls: 'message-action-btn',
            attr: { title: '복사', 'aria-label': '복사' }
        });
        const copyIcon = copyBtn.createDiv({ cls: 'icon-container' });
        copyIcon.appendChild(this.createIcon('copy'));
        copyBtn.onclick = () => this.copyToClipboard(displayContent, copyBtn);

        if (role === 'assistant') {
            // AI 답변: 재생성, 삭제
            const regenerateBtn = actionsEl.createEl('button', {
                cls: 'message-action-btn',
                attr: { title: '재생성', 'aria-label': '재생성' }
            });
            const regenerateIcon = regenerateBtn.createDiv({ cls: 'icon-container' });
            regenerateIcon.appendChild(this.createIcon('regenerate'));
            regenerateBtn.onclick = () => this.regenerateMessage(messageEl);

            const deleteBtn = actionsEl.createEl('button', {
                cls: 'message-action-btn',
                attr: { title: '삭제', 'aria-label': '삭제' }
            });
            const deleteIcon = deleteBtn.createDiv({ cls: 'icon-container' });
            deleteIcon.appendChild(this.createIcon('delete'));
            deleteBtn.onclick = () => this.deleteMessage(messageEl);
        } else if (role === 'user') {
            // 사용자: 편집, 삭제
            const editBtn = actionsEl.createEl('button', {
                cls: 'message-action-btn',
                attr: { title: '편집', 'aria-label': '편집' }
            });
            const editIcon = editBtn.createDiv({ cls: 'icon-container' });
            editIcon.appendChild(this.createIcon('edit'));
            editBtn.onclick = () => this.editMessage(messageEl);

            const deleteBtn = actionsEl.createEl('button', {
                cls: 'message-action-btn',
                attr: { title: '삭제', 'aria-label': '삭제' }
            });
            const deleteIcon2 = deleteBtn.createDiv({ cls: 'icon-container' });
            deleteIcon2.appendChild(this.createIcon('delete'));
            deleteBtn.onclick = () => this.deleteMessage(messageEl);
        }

        // 스크롤을 아래로
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    /**
     * SVG 아이콘 생성 헬퍼
     */
    private createIcon(name: string): SVGElement {
        const icons: Record<string, string> = {
            copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
            edit: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
            delete: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
            regenerate: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
            check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            close: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
        };

        const svg = document.createElement('div');
        svg.innerHTML = icons[name] || icons.copy;
        return svg.firstElementChild as SVGElement;
    }

    private sanitizeDisplayContent(content: string): string {
        if (!content) {
            return content;
        }

        let sanitized = content.replace(/\r\n/g, '\n').trim();

        sanitized = sanitized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
        sanitized = sanitized.replace(/<tool>[\s\S]*?<\/tool>/gi, '').trim();
        sanitized = sanitized.replace(/<invoke>[\s\S]*?<\/invoke>/gi, '').trim();
        sanitized = sanitized.replace(/\[Calling tool:[\s\S]*?\]/gi, '').trim();
        sanitized = sanitized.replace(/\[Calling tool:[\s\S]*$/gi, '').trim();
        sanitized = sanitized.replace(/<function=[\s\S]*$/gi, '').trim();
        sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
        sanitized = sanitized.replace(/[ \t]+\n/g, '\n');

        if (!sanitized) {
            return '도구를 사용해 요청을 처리했습니다.';
        }

        return sanitized;
    }

    /**
     * 클립보드에 복사
     */
    private async copyToClipboard(content: string, button: HTMLElement) {
        try {
            await navigator.clipboard.writeText(content);
            const iconEl = button.querySelector('.icon-container');
            if (iconEl) {
                iconEl.innerHTML = '';
                iconEl.appendChild(this.createIcon('check'));
            }
            setTimeout(() => {
                if (iconEl) {
                    iconEl.innerHTML = '';
                    iconEl.appendChild(this.createIcon('copy'));
                }
            }, 1500);
        } catch (err) {
            console.error('[ChatView] 복사 실패:', err);
        }
    }

    /**
     * 메시지 재생성 (마지막 사용자 메시지 기반)
     */
    private async regenerateMessage(messageEl: HTMLElement) {
        // 현재 AI 메시지 삭제
        messageEl.remove();

        // 마지막 사용자 메시지 찾기
        const userMessages = this.messagesEl.querySelectorAll('.chat-message.user');
        if (userMessages.length === 0) {
            this.addMessage('system', '재생성할 사용자 메시지가 없습니다.');
            return;
        }

        const lastUserMessage = userMessages[userMessages.length - 1] as HTMLElement;
        const originalContent = lastUserMessage.dataset.content || '';

        // 마지막 사용자 메시지도 삭제 (다시 전송할 것이므로)
        lastUserMessage.remove();

        // 처리 중 상태 설정
        this.setProcessingState(true);

        // 타이핑 인디케이터 표시
        const typingIndicator = this.showTypingIndicator();

        try {
            // Agent Controller를 통한 재전송
            const response = await this.plugin.agentController.processMessage(originalContent);

            // 타이핑 인디케이터 제거
            typingIndicator.remove();

            // 사용자 메시지 다시 표시
            this.addMessage('user', originalContent);

            // 응답 표시
            this.addMessage('assistant', response.content, response.type === 'tool_call', this.debugMode ? response.content : undefined);

        } catch (error) {
            typingIndicator.remove();
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            this.addMessage('system', `오류가 발생했습니다:\n\n${errorMessage}`);
        } finally {
            this.setProcessingState(false);
        }
    }

    /**
     * 메시지 삭제
     */
    private deleteMessage(messageEl: HTMLElement) {
        messageEl.style.animation = 'messageFadeOut 0.2s ease-out forwards';
        setTimeout(() => {
            messageEl.remove();
        }, 200);
    }

    /**
     * 메시지 편집 (사용자 메시지만)
     */
    private editMessage(messageEl: HTMLElement) {
        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        const originalContent = messageEl.dataset.content || '';

        // 편집 모드 UI로 전환
        const editContainer = messageEl.createDiv({ cls: 'message-edit-container' });
        const textarea = editContainer.createEl('textarea', {
            cls: 'message-edit-textarea',
            attr: { rows: '3' }
        });
        textarea.value = originalContent;

        // 버튼 컨테이너
        const buttonContainer = editContainer.createDiv({ cls: 'message-edit-buttons' });

        const saveBtn = buttonContainer.createEl('button', {
            cls: 'message-edit-save',
            text: '저장'
        });

        const cancelBtn = buttonContainer.createEl('button', {
            cls: 'message-edit-cancel',
            text: '취소'
        });

        // 기존 콘텐츠 숨기기
        contentEl.style.display = 'none';
        const actionsEl = messageEl.querySelector('.message-actions') as HTMLElement;
        if (actionsEl) actionsEl.style.display = 'none';

        // 저장 버튼 핸들러
        saveBtn.onclick = async () => {
            const newContent = textarea.value.trim();
            if (!newContent) return;

            // 데이터 속성 업데이트
            messageEl.dataset.content = newContent;

            // 콘텐츠 업데이트
            contentEl.empty();
            await MarkdownRenderer.renderMarkdown(newContent, contentEl, '', this.plugin);
            contentEl.style.display = '';

            // 편집 컨테이너 제거
            editContainer.remove();

            // 액션 바 다시 표시
            if (actionsEl) actionsEl.style.display = '';

            // 편집된 메시지로 재전송
            // 현재 AI 메시지들 모두 삭제 (편집 지점 이후)
            let nextEl = messageEl.nextElementSibling;
            while (nextEl) {
                const toRemove = nextEl;
                nextEl = nextEl.nextElementSibling;
                toRemove.remove();
            }

            // 새로운 응답 요청
            this.setProcessingState(true);

            const typingIndicator = this.showTypingIndicator();

            try {
                const response = await this.plugin.agentController.processMessage(newContent);
                typingIndicator.remove();
                this.addMessage('assistant', response.content, response.type === 'tool_call', this.debugMode ? response.content : undefined);
            } catch (error) {
                typingIndicator.remove();
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
                this.addMessage('system', `오류가 발생했습니다:\n\n${errorMessage}`);
            } finally {
                this.setProcessingState(false);
            }
        };

        // 취소 버튼 핸들러
        cancelBtn.onclick = () => {
            contentEl.style.display = '';
            if (actionsEl) actionsEl.style.display = '';
            editContainer.remove();
        };

        // 텍스트 영역 포커스
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    /**
     * 처리 중 상태 설정
     */
    private setProcessingState(processing: boolean) {
        this.isProcessing = processing;
        this.sendButtonEl.disabled = processing;
        this.sendButtonEl.textContent = processing ? '처리 중...' : '전송';
    }

    /**
     * 타이핑 인디케이터 표시
     */
    private showTypingIndicator(): HTMLElement {
        const indicator = this.messagesEl.createDiv({ cls: 'typing-indicator' });

        // 3개의 애니메이션 점 추가
        for (let i = 0; i < 3; i++) {
            indicator.createDiv({ cls: 'dot' });
        }

        // 스크롤을 아래로
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

        return indicator;
    }

    private getRoleLabel(role: 'user' | 'assistant' | 'system'): string {
        if (role === 'user') return 'You';
        if (role === 'assistant') return 'Copilot';
        return 'System';
    }

    private formatTimestamp(date: Date): string {
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    /**
     * 메시지 전송
     */
    async sendMessage() {
        const message = this.inputEl.value.trim();
        if (!message || this.isProcessing) return;

        // 입력창 비우기
        this.inputEl.value = '';
        this.inputEl.focus();

        // 처리 중 상태 설정
        this.setProcessingState(true);

        // 사용자 메시지 표시
        this.addMessage('user', message);

        // 타이핑 인디케이터 표시
        const typingIndicator = this.showTypingIndicator();

        try {
            console.log('[ChatView] Sending message to agent:', message);

            // Set status callback to show tool execution progress
            this.plugin.agentController.setStatusCallback((status: string) => {
                // 타이핑 인디케이터가 있으면 상태 텍스트로 변경
                if (typingIndicator) {
                    typingIndicator.empty();
                    const statusText = typingIndicator.createDiv({ cls: 'status-text' });
                    statusText.textContent = status;
                }
            });

            // Set active file content if file is selected
            if (this.activeFilePath) {
                this.plugin.agentController.setActiveFilePath(this.activeFilePath);
                const fileContent = await this.readActiveFileContent();
                if (fileContent) {
                    this.plugin.agentController.setActiveFileContent(fileContent);
                }
            } else {
                this.plugin.agentController.setActiveFilePath(null);
                this.plugin.agentController.setActiveFileContent(null);
            }

            // Agent Controller를 통한 ReAct 루프 실행
            const response = await this.plugin.agentController.processMessage(message);
            this.plugin.agentController.setStatusCallback(null);
            console.log('[ChatView] Agent response:', response);

            // 타이핑 인디케이터 제거
            typingIndicator.remove();

            if (response.type === 'tool_call' && response.toolCalls && this.debugMode) {
                // 툴 호출이 있었음을 표시 (디버그 모드에서만)
                for (const toolCall of response.toolCalls) {
                    this.addMessage('system', `도구 호출: ${toolCall.function.name}\n인자: ${JSON.stringify(toolCall.function.arguments)}`, true);
                }
            }

            // 응답 표시
            this.addMessage('assistant', response.content, response.type === 'tool_call', this.debugMode ? response.content : undefined);

        } catch (error) {
            this.plugin.agentController.setStatusCallback(null);
            typingIndicator.remove();
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            this.addMessage('system', `오류가 발생했습니다:\n\n${errorMessage}`);
        } finally {
            // 처리 중 상태 해제
            this.setProcessingState(false);
        }
    }

    /**
     * 대화 초기화
     */
    clearConversation() {
        if (confirm('대화 내용을 초기화하시겠습니까?')) {
            this.messagesEl.empty();
            this.plugin.agentController.resetConversation();
            this.addMessage('assistant', '대화가 초기화되었습니다. 새로운 대화를 시작할 수 있습니다\!');
        }
    }

    async onClose() {
        // 정리 작업
    }
}
