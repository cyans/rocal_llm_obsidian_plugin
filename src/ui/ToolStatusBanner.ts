/**
 * Tool Status Banner Component
 * @MX:SPEC: SPEC-PLUGIN-001
 * @MX:NOTE: 도구 실행 상태 표시 배너
 */

export interface ToolStatus {
    toolName: string;
    status: 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}

export class ToolStatusBanner {
    private containerEl: HTMLElement;
    private statuses: Map<string, ToolStatus> = new Map();

    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }

    showStatus(status: ToolStatus): void {
        this.statuses.set(status.toolName, status);
        this.render();
    }

    updateStatus(toolName: string, status: Partial<ToolStatus>): void {
        const existing = this.statuses.get(toolName);
        if (existing) {
            this.statuses.set(toolName, { ...existing, ...status });
            this.render();
        }
    }

    private render(): void {
        this.containerEl.empty();

        for (const [toolName, status] of this.statuses) {
            const bannerEl = this.containerEl.createDiv({
                cls: `tool-status-banner ${status.status}`,
            });

            // 도구 이름
            bannerEl.createEl('span', {
                cls: 'tool-name',
                text: toolName,
            });

            // 상태 텍스트
            const statusText = {
                running: '실행 중...',
                completed: '완료',
                failed: '실패',
            }[status.status];

            bannerEl.createEl('span', { cls: 'status-text', text: statusText });

            // 결과 미리보기 (완료 시)
            if (status.status === 'completed' && status.result) {
                const previewEl = bannerEl.createEl('div', {
                    cls: 'result-preview',
                    text: JSON.stringify(status.result).slice(0, 100) + '...',
                });
                previewEl.hide();
            }

            // 에러 메시지 (실패 시)
            if (status.status === 'failed' && status.error) {
                bannerEl.createEl('div', {
                    cls: 'error-message',
                    text: status.error,
                });
            }
        }
    }

    clear(): void {
        this.statuses.clear();
        this.containerEl.empty();
    }
}
