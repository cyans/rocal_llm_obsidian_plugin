/**
 * VaultReadContentsTool Tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { TFile, Vault, MetadataCache } from 'obsidian';
import { VaultReadContentsTool } from '../../../src/tools/VaultReadContentsTool';

// Mock Obsidian API
const mockVault = {
    getMarkdownFiles: jest.fn(),
    read: jest.fn(),
    cachedRead: jest.fn(),
};

const mockMetadataCache = {
    getFileCache: jest.fn(),
};

describe('VaultReadContentsTool', () => {
    let tool: VaultReadContentsTool;
    let mockVaultInstance: any;
    let mockMetadataCacheInstance: any;

    beforeEach(() => {
        mockVaultInstance = mockVault as any;
        mockMetadataCacheInstance = mockMetadataCache as any;
        tool = new VaultReadContentsTool(mockVaultInstance, mockMetadataCacheInstance);

        // Clear mocks before each test
        jest.clearAllMocks();
    });

    describe('execute', () => {
        test('파일 읽기 성공', async () => {
            // Setup
            const mockFile = { path: 'test.md', extension: 'md', basename: 'test' } as TFile;
            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile]);
            mockVaultInstance.read.mockResolvedValue('# Test content\n\nThis is a test file.');

            // Execute
            const result = await tool.execute({
                file_paths: ['test.md']
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]).toEqual({
                file_path: 'test.md',
                title: 'test',
                content: '# Test content\n\nThis is a test file.',
                char_count: 36,
                word_count: 8,
                truncated: false
            });
        });

        test('여러 파일 읽기 성공', async () => {
            // Setup
            const mockFile1 = { path: 'file1.md', extension: 'md', basename: 'file1' } as TFile;
            const mockFile2 = { path: 'file2.md', extension: 'md', basename: 'file2' } as TFile;

            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile1, mockFile2]);
            mockVaultInstance.read
                .mockResolvedValueOnce('Content of file 1')
                .mockResolvedValueOnce('Content of file 2');

            // Execute
            const result = await tool.execute({
                file_paths: ['file1.md', 'file2.md']
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(2);
            expect(result.files[0].file_path).toBe('file1.md');
            expect(result.files[1].file_path).toBe('file2.md');
        });

        test('존재하지 않는 파일 처리', async () => {
            // Setup
            const mockFile = { path: 'existing.md', extension: 'md', basename: 'existing' } as TFile;
            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile]);
            mockVaultInstance.read.mockResolvedValue('Content of existing file');

            // Execute
            const result = await tool.execute({
                file_paths: ['existing.md', 'nonexistent.md']
            });

            // Verify
            expect(result.success).toBe(true); // Has partial success
            expect(result.files).toHaveLength(1);
            expect(result.files[0].file_path).toBe('existing.md');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].file_path).toBe('nonexistent.md');
            expect(result.errors[0].error).toContain('File not found');
        });

        test('빈 파일 처리', async () => {
            // Setup
            const mockFile = { path: 'empty.md', extension: 'md', basename: 'empty' } as TFile;
            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile]);
            mockVaultInstance.read.mockResolvedValue('');

            // Execute
            const result = await tool.execute({
                file_paths: ['empty.md']
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(1);
            expect(result.files[0]).toEqual({
                file_path: 'empty.md',
                title: 'empty',
                content: '',
                char_count: 0,
                word_count: 0,
                truncated: false
            });
        });

        test('max_chars 제한', async () => {
            // Setup
            const mockFile = { path: 'large.md', extension: 'md', basename: 'large' } as TFile;
            const largeContent = 'x'.repeat(1000);
            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile]);
            mockVaultInstance.read.mockResolvedValue(largeContent);

            // Execute with limit
            const result = await tool.execute({
                file_paths: ['large.md'],
                max_chars_per_file: 50
            });

            // Verify
            expect(result.success).toBe(true);
            expect(result.files[0].truncated).toBe(true);
            expect(result.files[0].char_count).toBe(50);
            expect(result.files[0].content.length).toBe(50); // Content was truncated
        });
    });

    describe('edge cases', () => {
        test('빈 file_paths 배열', async () => {
            await expect(tool.execute({
                file_paths: []
            })).rejects.toThrow('file_paths is required');
        });

        test('읽기 실패 처리', async () => {
            // Setup
            const mockFile = { path: 'error.md', extension: 'md', basename: 'error' } as TFile;
            mockVaultInstance.getMarkdownFiles.mockReturnValue([mockFile]);
            mockVaultInstance.read.mockRejectedValue(new Error('Read error'));

            // Execute
            const result = await tool.execute({
                file_paths: ['error.md']
            });

            // Verify
            expect(result.success).toBe(false); // No successful reads
            expect(result.files).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].file_path).toBe('error.md');
            expect(result.errors[0].error).toContain('Failed to read file');
        });
    });
});
