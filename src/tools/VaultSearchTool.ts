/**
 * Vault Search Tool - Search vault notes
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 3
 * @MX:NOTE: 볼트 내 노트 검색 도구
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { TFile, Vault, MetadataCache } from 'obsidian';
import { KeywordSearch } from '../search/KeywordSearch';

export interface VaultSearchResult {
    file_path: string;
    title: string;
    snippet: string;
    score: number;
    tags: string[];
    last_modified: string;
}

export interface VaultSearchParams {
    query: string;
    max_results?: number;
}

/**
 * VaultSearchTool implements vault search functionality.
 * Searches through vault files using keyword matching and TF-IDF scoring.
 */
export class VaultSearchTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'vault_search',
        description: 'Search notes in vault',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                max_results: { type: 'number' }
            },
            required: ['query']
        }
    };

    private vault: Vault;
    private metadataCache: MetadataCache;
    private keywordSearch: KeywordSearch;

    constructor(vault: Vault, metadataCache: MetadataCache) {
        super();
        this.vault = vault;
        this.metadataCache = metadataCache;
        this.keywordSearch = new KeywordSearch(vault);

        // Default configuration
        this.keywordSearch.setFileExtensions(['md', 'markdown', 'txt']);
    }

    /**
     * Execute vault search with given parameters.
     */
    async execute(params: VaultSearchParams): Promise<{ results: VaultSearchResult[] }> {
        const query = params.query || '';
        const maxResults = params.max_results || 5;

        // Get all markdown files from vault
        const files = this.vault.getMarkdownFiles();

        // Perform search
        const searchResults = await this.keywordSearch.search(query, files, maxResults);

        // Convert to VaultSearchResult format
        const results: VaultSearchResult[] = searchResults.map(result => {
            const file = result.file;
            const metadata = this.metadataCache.getFileCache(file);

            return {
                file_path: file.path,
                title: file.basename,
                snippet: result.snippet,
                score: result.score,
                tags: this.extractTags(file, metadata),
                last_modified: new Date(file.stat.mtime).toISOString()
            };
        });

        return { results };
    }

    /**
     * Extract tags from file metadata.
     */
    private extractTags(file: TFile, metadata: any): string[] {
        if (metadata?.tags && Array.isArray(metadata.tags)) {
            return metadata.tags.map((tag: any) => {
                if (typeof tag === 'string') {
                    return tag.startsWith('#') ? tag : `#${tag}`;
                }
                return `#${tag.tag}`;
            });
        }
        return [];
    }

    /**
     * Set folders to exclude from search.
     */
    setExcludeFolders(folders: string[]): void {
        this.keywordSearch.setExcludeFolders(folders);
    }

    /**
     * Get current excluded folders.
     */
    getExcludeFolders(): string[] {
        return this.keywordSearch.getExcludeFolders();
    }

    /**
     * Set allowed file extensions for search.
     */
    setFileExtensions(extensions: string[]): void {
        this.keywordSearch.setFileExtensions(extensions);
    }

    /**
     * Get current allowed file extensions.
     */
    getFileExtensions(): string[] {
        return this.keywordSearch.getFileExtensions();
    }

    /**
     * Set maximum snippet length.
     */
    setMaxSnippetLength(length: number): void {
        this.keywordSearch.setMaxSnippetLength(length);
    }

    /**
     * Get current max snippet length.
     */
    getMaxSnippetLength(): number {
        return this.keywordSearch.getMaxSnippetLength();
    }
}
