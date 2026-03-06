/**
 * Obsidian API mock for Jest tests
 */

export class App {
    workspace: any = {};
    vault: any = {};
}

export class Plugin {
    app: App;
    constructor() {
        this.app = new App();
    }
    loadData(): Promise<any> { return Promise.resolve({}); }
    saveData(data: any): Promise<void> { return Promise.resolve(); }
    addSettingTab(tab: any): void {}
    addRibbonIcon(icon: string, title: string, callback: () => void): void {}
    registerView(type: string, factory: (leaf: any) => any): void {}
}

export class PluginSettingTab {
    app: App;
    containerEl: any;

    constructor(app: App, plugin: any) {
        this.app = app;
        this.containerEl = {
            empty: () => {},
            createEl: (tag: string, opts?: any) => ({
                textContent: '',
                ...opts
            })
        };
    }

    display(): void {}
}

export class Setting {
    constructor(containerEl: any) {}
    setName(name: string): this { return this; }
    setDesc(desc: string): this { return this; }
    addText(cb: (text: any) => any): this {
        cb({
            setPlaceholder: (p: string) => ({
                setValue: (v: string) => ({
                    onChange: (fn: (v: string) => void) => {}
                })
            })
        });
        return this;
    }
    addToggle(cb: (toggle: any) => any): this {
        cb({
            setValue: (v: boolean) => ({
                onChange: (fn: (v: boolean) => void) => {}
            })
        });
        return this;
    }
}

export class ItemView {
    containerEl: any = { children: [null, { empty: () => {}, addClass: () => {} }] };
    leaf: any;
    constructor(leaf: any) { this.leaf = leaf; }
    getViewType(): string { return ''; }
    getDisplayText(): string { return ''; }
}

export class WorkspaceLeaf {}

export class TFile {
    path: string = '';
    basename: string = '';
    extension: string = '';
    stat: { mtime: number; size: number } = { mtime: 0, size: 0 };
}

export class Vault {
    getMarkdownFiles(): TFile[] { return []; }
    getAbstractFileByPath(path: string): any { return null; }
    async read(file: TFile): Promise<string> { return ''; }
    async create(path: string, content: string): Promise<TFile> { return new TFile(); }
    async modify(file: TFile, content: string): Promise<void> {}
}

export class MetadataCache {
    getFileCache(file: TFile): any { return null; }
}
