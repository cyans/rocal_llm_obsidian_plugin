/**
 * WriteToFileTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 4
 */

import { WriteToFileTool } from '../../../src/tools/WriteToFileTool';
import { TFile } from 'obsidian';

// Mock Obsidian Vault
class MockVault {
    private files: Map<string, string> = new Map();
    private adapters: any = {};

    async create(path: string, content: string): Promise<TFile> {
        this.files.set(path, content);
        return {
            path,
            basename: path.split('/').pop() || path,
            extension: path.split('.').pop() || '',
            stat: { mtime: Date.now(), size: content.length }
        } as TFile;
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
    result: any = null;

    async confirm(message: string): Promise<boolean> {
        return this.confirmed;
    }

    setConfirmed(value: boolean) {
        this.confirmed = value;
    }
}

describe('WriteToFileTool', () => {
    let writeTool: WriteToFileTool;
    let mockVault: MockVault;
    let mockModal: MockModal;

    beforeEach(() => {
        mockVault = new MockVault();
        mockModal = new MockModal();
        writeTool = new WriteToFileTool(mockVault as any, mockModal as any);
    });

    describe('definition', () => {
        it('should have correct tool definition', () => {
            expect(writeTool.definition.name).toBe('write_to_file');
            expect(writeTool.definition.description).toBeTruthy();
        });

        it('should have file_path parameter', () => {
            const params = writeTool.definition.parameters;
            expect(params.properties.file_path).toBeDefined();
        });

        it('should have content parameter', () => {
            const params = writeTool.definition.parameters;
            expect(params.properties.content).toBeDefined();
        });
    });

    describe('execute - create new file', () => {
        it('should create a new file', async () => {
            mockModal.setConfirmed(true);

            const result = await writeTool.execute({
                file_path: 'test/new-file.md',
                content: '# Test Content'
            });

            expect(result.success).toBe(true);
            expect(result.file_path).toBe('test/new-file.md');
            expect(mockVault.exists('test/new-file.md')).toBe(true);
        });

        it('should create file with content', async () => {
            mockModal.setConfirmed(true);

            await writeTool.execute({
                file_path: 'test/file.md',
                content: '# Hello World\n\nThis is content.'
            });

            const file = mockVault.getAbstractFileByPath('test/file.md');
            const content = await mockVault.read(file!);
            expect(content).toBe('# Hello World\n\nThis is content.');
        });

        it('should create nested directories', async () => {
            mockModal.setConfirmed(true);

            const result = await writeTool.execute({
                file_path: 'deep/nested/path/file.md',
                content: 'Content'
            });

            expect(result.success).toBe(true);
            expect(result.file_path).toBe('deep/nested/path/file.md');
        });
    });

    describe('execute - overwrite existing file', () => {
        beforeEach(() => {
            mockVault.create('existing.md', 'Old content');
        });

        it('should request confirmation for overwrite', async () => {
            mockModal.setConfirmed(true);

            const result = await writeTool.execute({
                file_path: 'existing.md',
                content: 'New content'
            });

            expect(result.success).toBe(true);
        });

        it('should not overwrite when confirmation denied', async () => {
            mockModal.setConfirmed(false);

            const result = await writeTool.execute({
                file_path: 'existing.md',
                content: 'New content'
            });

            expect(result.success).toBe(false);
            expect(result.reason).toContain('cancelled');

            const file = mockVault.getAbstractFileByPath('existing.md');
            const content = await mockVault.read(file!);
            expect(content).toBe('Old content');
        });

        it('should overwrite when confirmed', async () => {
            mockModal.setConfirmed(true);

            await writeTool.execute({
                file_path: 'existing.md',
                content: 'Updated content'
            });

            const file = mockVault.getAbstractFileByPath('existing.md');
            const content = await mockVault.read(file!);
            expect(content).toBe('Updated content');
        });
    });

    describe('execute - error handling', () => {
        it('should handle empty file_path', async () => {
            mockModal.setConfirmed(true);

            const result = await writeTool.execute({
                file_path: '',
                content: 'Content'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('file_path');
        });

        it('should handle missing content', async () => {
            mockModal.setConfirmed(true);

            const result = await writeTool.execute({
                file_path: 'test.md',
                content: ''
            });

            // Empty content is allowed for creating empty files
            expect(result.success).toBe(true);
        });
    });

    describe('backup', () => {
        it('should create backup before overwriting', async () => {
            mockVault.create('backup-test.md', 'Original content');
            mockModal.setConfirmed(true);

            await writeTool.execute({
                file_path: 'backup-test.md',
                content: 'New content'
            });

            // Backup should be created
            const backupPath = writeTool.getBackupPath('backup-test.md');
            expect(mockVault.exists(backupPath)).toBe(true);
        });
    });

    describe('configuration', () => {
        it('should allow setting auto-confirm mode', () => {
            writeTool.setAutoConfirm(true);
            expect(writeTool.isAutoConfirm()).toBe(true);
        });

        it('should allow enabling/disabling backups', () => {
            writeTool.setCreateBackups(false);
            expect(writeTool.isCreateBackups()).toBe(false);
        });
    });
});
