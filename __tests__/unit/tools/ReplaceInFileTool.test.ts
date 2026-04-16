/**
 * ReplaceInFileTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 4
 */

import { ReplaceInFileTool } from '../../../src/tools/ReplaceInFileTool';
import { TFile } from 'obsidian';

// Mock Obsidian Vault
class MockVault {
    private files: Map<string, string> = new Map();

    async create(path: string, content: string): Promise<TFile> {
        this.files.set(path, content);
        return {
            path,
            basename: path.split('/').pop() || path,
            extension: path.split('.').pop() || '',
            stat: { mtime: Date.now(), size: content.length }
        } as TFile;
    }

    setFile(path: string, content: string) {
        this.files.set(path, content);
    }

    async modify(file: TFile, content: string): Promise<void> {
        this.files.set(file.path, content);
    }

    async read(file: TFile): Promise<string> {
        return this.files.get(file.path) || '';
    }

    getAbstractFileByPath(path: string): TFile | null {
        if (this.files.has(path)) {
            return {
                path,
                basename: path.split('/').pop() || path,
                extension: path.split('.').pop() || '',
                stat: { mtime: Date.now(), size: (this.files.get(path) || '').length }
            } as TFile;
        }
        return null;
    }

    exists(path: string): boolean {
        return this.files.has(path);
    }
}

// Mock Modal
class MockModal {
    confirmed: boolean = false;
    selectedOption: number = 0;

    async confirm(message: string): Promise<boolean> {
        return this.confirmed;
    }

    async selectOption(message: string, options: string[]): Promise<number> {
        return this.selectedOption;
    }

    setConfirmed(value: boolean) {
        this.confirmed = value;
    }

    setSelectedOption(value: number) {
        this.selectedOption = value;
    }
}

describe('ReplaceInFileTool', () => {
    let replaceTool: ReplaceInFileTool;
    let mockVault: MockVault;
    let mockModal: MockModal;

    beforeEach(() => {
        mockVault = new MockVault();
        mockModal = new MockModal();
        replaceTool = new ReplaceInFileTool(mockVault as any, mockModal as any);
    });

    describe('definition', () => {
        it('should have correct tool definition', () => {
            expect(replaceTool.definition.name).toBe('replace_in_file');
            expect(replaceTool.definition.description).toBeTruthy();
        });

        it('should have file_path parameter', () => {
            const params = replaceTool.definition.parameters;
            expect(params.properties.file_path).toBeDefined();
        });

        it('should have replacements parameter', () => {
            const params = replaceTool.definition.parameters;
            expect(params.properties.replacements).toBeDefined();
        });
    });

    describe('execute - single replacement', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', 'Hello World\nThis is a test\nGoodbye World');
        });

        it('should replace single occurrence', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    {
                        search: 'World',
                        replace: 'Universe'
                    }
                ]
            });

            expect(result.success).toBe(true);
            expect(result.replacements_applied).toBe(2);

            const file = mockVault.getAbstractFileByPath('test.md');
            const content = await mockVault.read(file!);
            expect(content).toBe('Hello Universe\nThis is a test\nGoodbye Universe');
        });

        it('should require confirmation before replacement', async () => {
            mockModal.setConfirmed(false);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    { search: 'World', replace: 'Universe' }
                ]
            });

            expect(result.success).toBe(false);
            expect(result.reason).toContain('cancelled');
        });
    });

    describe('execute - multiple replacements', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', 'Hello World\n2023-12-25\nMerry Christmas');
        });

        it('should apply multiple replacements', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    { search: 'World', replace: 'Universe' },
                    { search: '2023', replace: '2024' },
                    { search: 'Christmas', replace: 'New Year' }
                ]
            });

            expect(result.success).toBe(true);
            expect(result.replacements_applied).toBe(3);

            const file = mockVault.getAbstractFileByPath('test.md');
            const content = await mockVault.read(file!);
            expect(content).toBe('Hello Universe\n2024-12-25\nMerry New Year');
        });
    });

    describe('execute - SEARCH/REPLACE block format', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', '## TODO List\n\n- [ ] Task 1\n- [ ] Task 2\n- [x] Task 3');
        });

        it('should handle SEARCH/REPLACE format', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    {
                        search: '- [ ] Task 1',
                        replace: '- [x] Task 1'
                    }
                ]
            });

            expect(result.success).toBe(true);

            const file = mockVault.getAbstractFileByPath('test.md');
            const content = await mockVault.read(file!);
            expect(content).toContain('- [x] Task 1');
        });
    });

    describe('execute - error handling', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', 'Content here');
        });

        it('should handle non-existent file', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'nonexistent.md',
                replacements: [
                    { search: 'test', replace: 'done' }
                ]
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should handle search text not found', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    { search: 'nonexistent text', replace: 'replacement' }
                ]
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should handle empty file_path', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: '',
                replacements: []
            });

            expect(result.success).toBe(false);
        });
    });

    describe('execute - multiple matches handling', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', 'test\ntest\ntest\nunique\ntest');
        });

        it('should replace all occurrences by default', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    { search: 'test', replace: 'done' }
                ]
            });

            expect(result.success).toBe(true);
            expect(result.replacements_applied).toBe(4);

            const file = mockVault.getAbstractFileByPath('test.md');
            const content = await mockVault.read(file!);
            expect(content.split('done').length - 1).toBe(4);
        });
    });

    describe('diff preview', () => {
        beforeEach(() => {
            mockVault.setFile('test.md', 'Line 1\nLine 2\nLine 3');
        });

        it('should generate diff preview', async () => {
            mockModal.setConfirmed(true);

            const result = await replaceTool.execute({
                file_path: 'test.md',
                replacements: [
                    { search: 'Line 2', replace: 'Modified Line 2' }
                ]
            });

            expect(result.success).toBe(true);
        });
    });

    describe('backup', () => {
        it('should create backup before replacement', async () => {
            mockVault.setFile('backup-test.md', 'Original content');
            mockModal.setConfirmed(true);
            replaceTool.setCreateBackups(true); // 백업 기능 명시적 활성화

            await replaceTool.execute({
                file_path: 'backup-test.md',
                replacements: [
                    { search: 'Original', replace: 'Modified' }
                ]
            });

            // Backup should be created — use the actually-recorded path
            // to avoid timestamp drift between createBackup() and getBackupPath()
            const backupPath = replaceTool.getLastBackupPath();
            expect(backupPath).not.toBeNull();
            expect(mockVault.exists(backupPath as string)).toBe(true);
        });
    });
});
