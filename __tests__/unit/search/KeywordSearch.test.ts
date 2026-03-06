/**
 * KeywordSearch Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 3
 */

import { KeywordSearch } from '../../../src/search/KeywordSearch';
import { TFile, Vault } from 'obsidian';

// Mock Vault
class MockVault {
    private files: Map<string, string> = new Map();

    addFile(path: string, content: string) {
        this.files.set(path, content);
    }

    async read(file: TFile): Promise<string> {
        const content = this.files.get(file.path);
        if (content === undefined) {
            throw new Error(`File not found: ${file.path}`);
        }
        return content;
    }
}

// Mock TFile
class MockTFile {
    path: string;
    basename: string;
    extension: string;
    stat: { mtime: number; size: number };
    cachedRead?: string;

    constructor(
        path: string,
        basename: string,
        extension: string,
        content: string = ''
    ) {
        this.path = path;
        this.basename = basename;
        this.extension = extension;
        this.stat = { mtime: Date.now(), size: content.length };
        this.cachedRead = content;
    }
}

describe('KeywordSearch', () => {
    let keywordSearch: KeywordSearch;
    let mockVault: MockVault;
    let mockFiles: MockTFile[];

    beforeEach(() => {
        mockVault = new MockVault();
        keywordSearch = new KeywordSearch(mockVault as any);

        mockFiles = [
            new MockTFile('test1.md', 'test1', 'md', 'This is a test file about TypeScript programming.'),
            new MockTFile('test2.md', 'test2', 'md', 'Another file about JavaScript and testing.'),
            new MockTFile('notes.md', 'notes', 'md', 'Meeting notes from yesterday.'),
            new MockTFile('code.ts', 'code', 'ts', 'function test() { return true; }'),
            new MockTFile('README.md', 'README', 'md', 'Project documentation and setup instructions.')
        ];

        // Add files to mock vault
        for (const file of mockFiles) {
            mockVault.addFile(file.path, file.cachedRead || '');
        }
    });

    describe('search', () => {
        it('should find files matching keyword', async () => {
            const results = await keywordSearch.search(
                'TypeScript',
                mockFiles as any
            );

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].file.path).toBe('test1.md');
        });

        it('should return empty array for no matches', async () => {
            const results = await keywordSearch.search(
                'nonexistent',
                mockFiles as any
            );

            expect(results).toEqual([]);
        });

        it('should be case insensitive', async () => {
            const results = await keywordSearch.search(
                'typescript',
                mockFiles as any
            );

            expect(results.length).toBeGreaterThan(0);
        });

        it('should respect maxResults limit', async () => {
            const results = await keywordSearch.search(
                'test',
                mockFiles as any,
                2
            );

            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should handle empty file list', async () => {
            const results = await keywordSearch.search(
                'test',
                []
            );

            expect(results).toEqual([]);
        });

        it('should handle empty query', async () => {
            const results = await keywordSearch.search(
                '',
                mockFiles as any
            );

            expect(results).toEqual([]);
        });
    });

    describe('excludeFolders', () => {
        it('should exclude files in specified folders', async () => {
            const filesWithHidden = [
                ...mockFiles,
                new MockTFile('.hidden/secret.md', 'secret', 'md', 'Hidden content'),
                new MockTFile('public/visible.md', 'visible', 'md', 'Public content')
            ];

            keywordSearch.setExcludeFolders(['.hidden']);

            const results = await keywordSearch.search(
                'content',
                filesWithHidden as any
            );

            expect(results).not.toContainEqual(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: expect.stringContaining('.hidden')
                    })
                })
            );
        });

        it('should handle multiple exclude folders', async () => {
            keywordSearch.setExcludeFolders(['.hidden', 'private']);

            const files = [
                new MockTFile('.hidden/file.md', 'file', 'md', 'content'),
                new MockTFile('private/file.md', 'file', 'md', 'content'),
                new MockTFile('public/file.md', 'file', 'md', 'content')
            ];

            // Register files in mock vault so vault.read() works
            for (const file of files) {
                mockVault.addFile(file.path, file.cachedRead || '');
            }

            const results = await keywordSearch.search('content', files as any);

            expect(results.length).toBe(1);
            expect(results[0].file.path).toBe('public/file.md');
        });
    });

    describe('fileExtensions', () => {
        it('should filter by file extensions', async () => {
            keywordSearch.setFileExtensions(['md']);

            const results = await keywordSearch.search(
                'test',
                mockFiles as any
            );

            expect(results).not.toContainEqual(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: expect.stringMatching(/\.ts$/)
                    })
                })
            );
        });

        it('should allow multiple extensions', async () => {
            keywordSearch.setFileExtensions(['md', 'ts']);

            const results = await keywordSearch.search(
                'test',
                mockFiles as any
            );

            const paths = results.map(r => r.file.path);
            expect(paths).toContain('test1.md');
            expect(paths).toContain('code.ts');
        });
    });

    describe('snippet generation', () => {
        it('should generate snippets with highlighted keywords', async () => {
            const results = await keywordSearch.search(
                'TypeScript',
                mockFiles as any
            );

            expect(results[0].snippet).toBeDefined();
            expect(results[0].snippet).toContain('TypeScript');
        });

        it('should truncate long snippets', async () => {
            const results = await keywordSearch.search(
                'test',
                mockFiles as any
            );

            expect(results[0].snippet.length).toBeLessThanOrEqual(200);
        });
    });
});
