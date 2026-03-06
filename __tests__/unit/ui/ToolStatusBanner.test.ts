/**
 * ToolStatusBanner Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 2
 */

import { ToolStatusBanner, ToolStatus } from '../../../src/ui/ToolStatusBanner';

// Mock HTMLElement for testing
class MockHTMLElement {
    private children: MockHTMLElement[] = [];
    private _textContent: string = '';

    empty(): void {
        this.children = [];
        this._textContent = '';
    }

    createDiv(_options?: { cls?: string }): MockHTMLElement {
        const child = new MockHTMLElement();
        this.children.push(child);
        return child;
    }

    createEl(_tag: string, _options?: { cls?: string; text?: string }): MockHTMLElement {
        const child = new MockHTMLElement();
        if (_options?.text) {
            child._textContent = _options.text;
        }
        this.children.push(child);
        return child;
    }

    hide(): void {
        // Mock hide method
    }

    get textContent(): string {
        let content = this._textContent;
        for (const child of this.children) {
            content += child.textContent;
        }
        return content;
    }

    set textContent(value: string) {
        this._textContent = value;
    }
}

describe('ToolStatusBanner', () => {
    let banner: ToolStatusBanner;
    let mockContainerEl: any;

    beforeEach(() => {
        mockContainerEl = new MockHTMLElement();
        banner = new ToolStatusBanner(mockContainerEl as any);
    });

    describe('showStatus', () => {
        it('should display running status', () => {
            const status: ToolStatus = {
                toolName: 'vault_search',
                status: 'running'
            };

            banner.showStatus(status);

            expect(mockContainerEl.textContent).toContain('vault_search');
            expect(mockContainerEl.textContent).toContain('실행 중...');
        });

        it('should display completed status', () => {
            const status: ToolStatus = {
                toolName: 'vault_search',
                status: 'completed',
                result: { results: [] }
            };

            banner.showStatus(status);

            expect(mockContainerEl.textContent).toContain('vault_search');
            expect(mockContainerEl.textContent).toContain('완료');
        });

        it('should display failed status', () => {
            const status: ToolStatus = {
                toolName: 'vault_search',
                status: 'failed',
                error: 'Network error'
            };

            banner.showStatus(status);

            expect(mockContainerEl.textContent).toContain('vault_search');
            expect(mockContainerEl.textContent).toContain('실패');
            expect(mockContainerEl.textContent).toContain('Network error');
        });

        it('should show multiple statuses', () => {
            const status1: ToolStatus = {
                toolName: 'vault_search',
                status: 'completed',
                result: {}
            };

            const status2: ToolStatus = {
                toolName: 'web_search',
                status: 'running'
            };

            banner.showStatus(status1);
            banner.showStatus(status2);

            expect(mockContainerEl.textContent).toContain('vault_search');
            expect(mockContainerEl.textContent).toContain('web_search');
        });
    });

    describe('updateStatus', () => {
        it('should update existing status', () => {
            const initialStatus: ToolStatus = {
                toolName: 'vault_search',
                status: 'running'
            };

            banner.showStatus(initialStatus);
            banner.updateStatus('vault_search', { status: 'completed', result: {} });

            expect(mockContainerEl.textContent).toContain('완료');
            expect(mockContainerEl.textContent).not.toContain('실행 중...');
        });

        it('should not update non-existent status', () => {
            banner.updateStatus('non_existent', { status: 'completed' });

            expect(mockContainerEl.textContent).toBe('');
        });
    });

    describe('clear', () => {
        it('should clear all statuses', () => {
            const status: ToolStatus = {
                toolName: 'vault_search',
                status: 'completed',
                result: {}
            };

            banner.showStatus(status);
            expect(mockContainerEl.textContent).not.toBe('');

            banner.clear();
            expect(mockContainerEl.textContent).toBe('');
        });
    });
});
