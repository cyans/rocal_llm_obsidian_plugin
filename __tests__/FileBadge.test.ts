import { FileBadge } from '../src/components/FileBadge';

type Listener = (event: any) => void;

class FakeStyle {
  backgroundColor = '';
  color = '';
  borderRadius = '';
  fontSize = '';
  fontFamily = '';
  display = '';
  alignItems = '';
  gap = '';
  padding = '';
  border = '';
  cursor = '';
  lineHeight = '';

  set cssText(value: string) {
    const declarations = value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const declaration of declarations) {
      const [rawKey, rawValue] = declaration.split(':');
      if (!rawKey || !rawValue) continue;

      const key = rawKey.trim().replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      (this as any)[key] = rawValue.trim();
    }
  }
}

class FakeElement {
  className = '';
  textContent = '';
  innerHTML = '';
  style = new FakeStyle();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(private tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    if (child.parent) {
      child.remove();
    }

    if (child.innerHTML && !child.textContent) {
      child.textContent = child.innerHTML;
    }

    child.parent = this;
    this.children.push(child);
    this.refreshTextContent();
    return child;
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent.refreshTextContent();
    this.parent = null;
  }

  querySelector(selector: string): FakeElement | null {
    if (!selector.startsWith('.')) {
      return null;
    }

    const className = selector.slice(1);
    for (const child of this.children) {
      const classes = child.className.split(/\s+/).filter(Boolean);
      if (classes.includes(className)) {
        return child;
      }

      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: any): boolean {
    const listeners = this.listeners.get(event.type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
    return true;
  }

  private refreshTextContent(): void {
    this.textContent = this.children
      .map((child) => child.textContent || child.innerHTML || '')
      .join('');
  }
}

class FakeDocument {
  body = new FakeElement('body');

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

describe('FileBadge', () => {
  let container: HTMLElement;
  let fakeDocument: FakeDocument;

  beforeEach(() => {
    fakeDocument = new FakeDocument();
    (globalThis as any).document = fakeDocument;
    (globalThis as any).MouseEvent = class {
      type: string;
      bubbles: boolean;

      constructor(type: string, init?: { bubbles?: boolean }) {
        this.type = type;
        this.bubbles = init?.bubbles ?? false;
      }

      stopPropagation(): void {}
    };

    container = fakeDocument.createElement('div') as unknown as HTMLElement;
    fakeDocument.body.appendChild(container as unknown as FakeElement);
  });

  afterEach(() => {
    (container as unknown as FakeElement).remove();
    delete (globalThis as any).document;
    delete (globalThis as any).MouseEvent;
  });

  describe('렌더링', () => {
    it('파일명이 표시되어야 한다', () => {
      const badge = new FileBadge(container, 'test.txt');
      badge.render();

      const badgeElement = container.querySelector('.file-badge');
      expect(badgeElement).toBeTruthy();
      expect(badgeElement?.textContent).toContain('test.txt');
    });

    it('선택되지 않았을 때는 렌더링하지 않아야 한다', () => {
      const badge = new FileBadge(container, null);
      badge.render();

      const badgeElement = container.querySelector('.file-badge');
      expect(badgeElement).toBeFalsy();
    });
  });

  describe('닫기 버튼', () => {
    it('닫기 버튼이 클릭되면 onRemove 콜백이 호출되어야 한다', () => {
      const onRemove = jest.fn();
      const badge = new FileBadge(container, 'test.txt', onRemove);
      badge.render();

      const closeButton = container.querySelector('.file-badge-close');
      expect(closeButton).toBeTruthy();

      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe('파일 변경', () => {
    it('setFile로 파일을 변경할 수 있어야 한다', () => {
      const badge = new FileBadge(container, 'old.txt');
      badge.render();

      badge.setFile('new.txt');

      const badgeElement = container.querySelector('.file-badge');
      expect(badgeElement?.textContent).toContain('new.txt');
    });

    it('setFile(null)로 파일 선택을 해제할 수 있어야 한다', () => {
      const badge = new FileBadge(container, 'test.txt');
      badge.render();

      badge.setFile(null);

      const badgeElement = container.querySelector('.file-badge');
      expect(badgeElement).toBeFalsy();
    });
  });

  describe('스타일', () => {
    it('초록색 배경이 적용되어야 한다', () => {
      const badge = new FileBadge(container, 'test.txt');
      badge.render();

      const badgeElement = container.querySelector('.file-badge') as HTMLElement;
      expect(badgeElement?.style.backgroundColor).toMatch(/rgb\(\d+,\s*\d+,\s*\d+\)/);
      // 초록색 계열인지 확인 (G 값이 R, B보다 큼)
      const match = badgeElement?.style.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
      }
    });
  });

  describe('이벤트', () => {
    it('파일 변경 시 자동으로 리렌더링되어야 한다', () => {
      const badge = new FileBadge(container, 'first.txt');
      badge.render();

      let badgeElement = container.querySelector('.file-badge');
      expect(badgeElement?.textContent).toContain('first.txt');

      badge.setFile('second.txt');

      badgeElement = container.querySelector('.file-badge');
      expect(badgeElement?.textContent).toContain('second.txt');
    });
  });
});
