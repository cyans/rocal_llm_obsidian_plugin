/**
 * VaultReadContentsTool - Read vault file contents
 * @MX:SPEC: SPEC-VAULT-SUMMARY Phase 1-2
 * @MX:NOTE: 볼트 내 파일 내용을 읽는 도구
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { TFile, Vault, MetadataCache } from 'obsidian';

export interface VaultReadContentsParams {
    file_paths: string[];
    max_chars_per_file?: number;
}

export interface VaultReadContentsResult {
    success: boolean;
    files: Array<{
        file_path: string;
        title: string;
        content: string;
        char_count: number;
        word_count: number;
        truncated: boolean;
    }>;
    errors: Array<{
        file_path: string;
        error: string;
    }>;
}

/**
 * VaultReadContentsTool implements reading vault file contents.
 */
export class VaultReadContentsTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'vault_read_contents',
        description: 'Read vault file contents',
        parameters: {
            type: 'object',
            properties: {
                file_paths: {
                    type: 'array',
                    description: 'List of file paths to read',
                    items: {
                        type: 'string'
                    }
                },
                max_chars_per_file: {
                    type: 'number',
                    description: 'Maximum characters per file (0-50000). If omitted, reads entire file'
                }
            },
            required: ['file_paths']
        }
    };

    private vault: Vault;
    private metadataCache: MetadataCache;

    constructor(vault: Vault, metadataCache: MetadataCache) {
        super();
        this.vault = vault;
        this.metadataCache = metadataCache;
    }

    /**
     * Execute vault read with given parameters.
     */
    async execute(params: VaultReadContentsParams): Promise<VaultReadContentsResult> {
        const files: VaultReadContentsResult['files'] = [];
        const errors: VaultReadContentsResult['errors'] = [];

        // Validate input
        if (!params.file_paths || params.file_paths.length === 0) {
            throw new Error('file_paths is required');
        }

        // Get all markdown files to create file map
        const allFiles = this.vault.getMarkdownFiles();
        const fileMap = new Map<string, TFile>();
        allFiles.forEach(file => {
            fileMap.set(file.path, file);
        });

        // Process each file
        for (const path of params.file_paths) {
            const file = fileMap.get(path);
            if (!file) {
                errors.push({
                    file_path: path,
                    error: `File not found: ${path}`
                });
                continue;
            }

            // Read file content
            let content: string | null = null;
            try {
                content = await this.vault.read(file);
            } catch (error) {
                console.error(`Failed to read file ${path}:`, error);
                errors.push({
                    file_path: path,
                    error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
                continue;
            }

            // Handle null content
            if (content === null) {
                content = '';
            }

            // Truncate if needed
            const maxLength = params.max_chars_per_file;
            let truncated = false;
            if (maxLength !== undefined && content.length > maxLength) {
                content = content.substring(0, maxLength);
                truncated = true;
            }

            // Get file title
            const metadata = this.metadataCache.getFileCache(file);
            const title = file.basename;

            // Count words
            const wordCount = this.countWords(content);

            files.push({
                file_path: path,
                title: title,
                content: content,
                char_count: content.length,
                word_count: wordCount,
                truncated: truncated
            });
        }

        return {
            success: errors.length === 0 || files.length > 0,
            files,
            errors
        };
    }

    /**
     * Get word count from content
     * @MX:NOTE: 공백 문자로 분리하여 단어 수 계산
     */
    private countWords(content: string): number {
        // Split by whitespace and filter empty strings
        const words = content.split(/\s+/).filter(word => word.trim() !== '');
        return words.length;
    }
}
