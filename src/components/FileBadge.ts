/**
 * FileBadge 컴포넌트
 *
 * Copilot 스타일 파일 배지
 * 선택된 파일이 있을 때만 표시
 * 초록색 배경에 파일명 표시
 * 닫기 버튼으로 선택 해제
 */

export class FileBadge {
  private container: HTMLElement;
  private fileName: string | null;
  private onRemove?: () => void;

  constructor(
    container: HTMLElement,
    fileName: string | null,
    onRemove?: () => void
  ) {
    this.container = container;
    this.fileName = fileName;
    this.onRemove = onRemove;
  }

  /**
   * 배지 렌더링
   */
  render(): void {
    // 파일이 선택되지 않았으면 렌더링하지 않음
    if (!this.fileName) {
      this.clear();
      return;
    }

    // 기존 배지 제거
    this.clear();

    // 배지 생성
    const badge = document.createElement('div');
    badge.className = 'file-badge';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      background-color: rgb(76, 175, 80);
      color: white;
      border-radius: 4px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    `;

    // 파일명 텍스트
    const fileNameSpan = document.createElement('span');
    fileNameSpan.textContent = this.fileName;
    badge.appendChild(fileNameSpan);

    // 닫기 버튼
    const closeButton = document.createElement('button');
    closeButton.className = 'file-badge-close';
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 14px;
      padding: 0 4px;
      line-height: 1;
    `;

    if (this.onRemove) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onRemove!();
      });
    }

    badge.appendChild(closeButton);
    this.container.appendChild(badge);
  }

  /**
   * 파일 변경
   */
  setFile(fileName: string | null): void {
    this.fileName = fileName;
    this.render();
  }

  /**
   * 배지 제거
   */
  private clear(): void {
    const existingBadge = this.container.querySelector('.file-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
  }
}
