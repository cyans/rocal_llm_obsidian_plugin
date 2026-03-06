/**
 * VaultSearchTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 3
 */

import { VaultSearchTool } from '../../../src/tools/VaultSearchTool';
import { TFile } from 'obsidian';

// Mock Obsidian Vault
class MockVault {
    private files: Map<string, { content: string; mtime: number }> = new Map();

    addFile(path: string, content: string) {
        this.files.set(path, {
            content,
            mtime: Date.now()
        });
    }

    async read(file: TFile): Promise<string> {
        const data = this.files.get(file.path);
        if (!data) {
            throw new Error(`File not found: ${file.path}`);
        }
        return data.content;
    }

    getMarkdownFiles(): TFile[] {
        return Array.from(this.files.keys()).map(path => {
            const data = this.files.get(path)!;
            const file = {
                path,
                basename: path.split('/').pop() || path,
                extension: path.split('.').pop() || '',
                stat: {
                    mtime: data.mtime,
                    size: data.content.length
                }
            } as any;

            // Add cached content for testing
            (file as any).cachedRead = data.content;

            return file;
        });
    }
}

// Mock Obsidian MetadataCache
class MockMetadataCache {
    getFileCache(file: TFile): any {
        return {
            tags: [],
            frontmatter: {},
            headings: []
        };
    }
}

describe('VaultSearchTool', () => {
    let vaultSearchTool: VaultSearchTool;
    let mockVault: MockVault;
    let mockMetadataCache: MockMetadataCache;

    beforeEach(() => {
        mockVault = new MockVault();
        mockMetadataCache = new MockMetadataCache();

        // Add test files
        mockVault.addFile('programming/typescript.md', 'TypeScript is a programming language developed by Microsoft.');
        mockVault.addFile('programming/javascript.md', 'JavaScript is a dynamic programming language.');
        mockVault.addFile('notes/meeting.md', 'Meeting notes from today about project planning.');
        mockVault.addFile('README.md', 'Project documentation for the vault agent plugin.');

        // Create tool with mock vault and metadata cache
        vaultSearchTool = new VaultSearchTool(mockVault as any, mockMetadataCache as any);
    });

    describe('definition', () => {
        it('should have correct tool definition', () => {
            expect(vaultSearchTool.definition.name).toBe('vault_search');
            expect(vaultSearchTool.definition.description).toBeTruthy();
        });

        it('should have query parameter', () => {
            const params = vaultSearchTool.definition.parameters;
            expect(params.properties.query).toBeDefined();
        });

        it('should have max_results parameter', () => {
            const params = vaultSearchTool.definition.parameters;
            expect(params.properties.max_results).toBeDefined();
        });
    });

    describe('execute', () => {
        it('should return search results', async () => {
            const result = await vaultSearchTool.execute({
                query: 'TypeScript',
                max_results: 5
            });

            expect(result.results).toBeDefined();
            expect(Array.isArray(result.results)).toBe(true);
        });

        it('should find relevant files', async () => {
            const result = await vaultSearchTool.execute({
                query: 'TypeScript',
                max_results: 5
            });

            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results[0].file_path).toContain('typescript');
        });

        it('should respect max_results limit', async () => {
            const result = await vaultSearchTool.execute({
                query: 'programming',
                max_results: 2
            });

            expect(result.results.length).toBeLessThanOrEqual(2);
        });

        it('should include snippets in results', async () => {
            const result = await vaultSearchTool.execute({
                query: 'TypeScript',
                max_results: 5
            });

            expect(result.results[0].snippet).toBeDefined();
            expect(result.results[0].snippet).toContain('TypeScript');
        });

        it('should include scores in results', async () => {
            const result = await vaultSearchTool.execute({
                query: 'TypeScript',
                max_results: 5
            });

            expect(result.results[0].score).toBeDefined();
            expect(result.results[0].score).toBeGreaterThan(0);
        });

        it('should return empty results for no matches', async () => {
            const result = await vaultSearchTool.execute({
                query: 'nonexistent_term_xyz',
                max_results: 5
            });

            expect(result.results).toEqual([]);
        });

        it('should use default max_results when not provided', async () => {
            const result = await vaultSearchTool.execute({
                query: 'programming'
            });

            // Default should be 5
            expect(result.results.length).toBeLessThanOrEqual(5);
        });

        it('should handle empty query', async () => {
            const result = await vaultSearchTool.execute({
                query: '',
                max_results: 5
            });

            expect(result.results).toEqual([]);
        });
    });

    describe('configuration', () => {
        it('should allow setting excluded folders', () => {
            expect(() => {
                vaultSearchTool.setExcludeFolders(['.obsidian', '.trash']);
            }).not.toThrow();
        });

        it('should allow setting file extensions', () => {
            expect(() => {
                vaultSearchTool.setFileExtensions(['md', 'txt']);
            }).not.toThrow();
        });
    });
});
