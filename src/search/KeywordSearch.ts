/**
 * Keyword Search - Vault file content search
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 3
 * @MX:NOTE: 키워드 기반 볼트 검색 엔진
 */

import { TFile, Vault } from 'obsidian';

export interface SearchResult {
    file: TFile;
    score: number;
    snippet: string;
}

export interface SearchOptions {
    maxResults?: number;
    excludeFolders?: string[];
    fileExtensions?: string[];
}

/**
 * KeywordSearch implements keyword-based search in vault files.
 * Supports case-insensitive search, folder exclusion, and file extension filtering.
 */
export class KeywordSearch {
    private vault: Vault;
    private excludeFolders: Set<string> = new Set();
    private fileExtensions: Set<string> = new Set();
    private maxSnippetLength: number = 200;

    constructor(vault: Vault) {
        this.vault = vault;
    }

    /**
     * Search files for matching keywords.
     * Returns ranked search results with snippets.
     */
    async search(
        query: string,
        files: TFile[],
        maxResults: number = 10
    ): Promise<SearchResult[]> {
        if (!query.trim() || files.length === 0) {
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();
        const results: SearchResult[] = [];

        for (const file of files) {
            // Check folder exclusion
            if (this.isExcludedFolder(file.path)) {
                continue;
            }

            // Check file extension filter
            if (this.fileExtensions.size > 0 && !this.fileExtensions.has(file.extension)) {
                continue;
            }

            // Read file content
            const content = await this.getFileContent(file);
            if (!content) {
                continue;
            }

            // Check for keyword match
            const normalizedContent = content.toLowerCase();
            if (normalizedContent.includes(normalizedQuery)) {
                const score = this.calculateScore(content, normalizedQuery);
                const snippet = this.generateSnippet(content, query);

                results.push({
                    file,
                    score,
                    snippet
                });
            }
        }

        // Sort by score (descending) and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }

    /**
     * Calculate relevance score for a file.
     * Higher score = more relevant.
     */
    private calculateScore(content: string, query: string): number {
        const normalizedContent = content.toLowerCase();
        const queryWords = query.split(/\s+/).filter(w => w.length > 0);

        let score = 0;

        for (const word of queryWords) {
            const regex = new RegExp(word, 'gi');
            const matches = normalizedContent.match(regex);
            const count = matches ? matches.length : 0;

            // Score based on frequency
            score += count * 10;

            // Bonus for word at start of content
            if (normalizedContent.startsWith(word)) {
                score += 20;
            }

            // Bonus for exact phrase match
            if (normalizedContent.includes(query)) {
                score += 30;
            }
        }

        return score;
    }

    /**
     * Generate a snippet showing where the keyword appears.
     */
    private generateSnippet(content: string, query: string): string {
        const normalizedContent = content.toLowerCase();
        const normalizedQuery = query.toLowerCase();

        // Find first occurrence of query
        const index = normalizedContent.indexOf(normalizedQuery);
        if (index === -1) {
            return content.substring(0, this.maxSnippetLength);
        }

        // Calculate snippet boundaries
        const contextLength = 50;
        let start = Math.max(0, index - contextLength);
        let end = Math.min(content.length, index + query.length + contextLength);

        let snippet = content.substring(start, end);

        // Add ellipsis if truncated
        if (start > 0) {
            snippet = '...' + snippet;
        }
        if (end < content.length) {
            snippet = snippet + '...';
        }

        // Truncate if still too long
        if (snippet.length > this.maxSnippetLength) {
            snippet = snippet.substring(0, this.maxSnippetLength - 3) + '...';
        }

        return snippet;
    }

    /**
     * Check if file path is in excluded folder.
     */
    private isExcludedFolder(path: string): boolean {
        for (const folder of this.excludeFolders) {
            if (path.startsWith(folder + '/') || path.startsWith(folder + '\\')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get file content from vault.
     */
    private async getFileContent(file: TFile): Promise<string | null> {
        try {
            return await this.vault.read(file);
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            return null;
        }
    }

    /**
     * Set folders to exclude from search.
     */
    setExcludeFolders(folders: string[]): void {
        this.excludeFolders = new Set(folders);
    }

    /**
     * Get current excluded folders.
     */
    getExcludeFolders(): string[] {
        return Array.from(this.excludeFolders);
    }

    /**
     * Set allowed file extensions.
     */
    setFileExtensions(extensions: string[]): void {
        this.fileExtensions = new Set(extensions);
    }

    /**
     * Get current allowed file extensions.
     */
    getFileExtensions(): string[] {
        return Array.from(this.fileExtensions);
    }

    /**
     * Set maximum snippet length.
     */
    setMaxSnippetLength(length: number): void {
        this.maxSnippetLength = Math.max(50, length);
    }

    /**
     * Get current max snippet length.
     */
    getMaxSnippetLength(): number {
        return this.maxSnippetLength;
    }
}
