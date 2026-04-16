/**
 * Replace in File Tool - SEARCH/REPLACE pattern edits
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 4
 * @MX:NOTE: 파일 부분 수정 도구 (SEARCH/REPLACE 패턴)
 * @MX:WARN: 검색 텍스트를 찾을 수 없으면 에러 반환
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { TFile, Vault } from 'obsidian';

export interface Replacement {
    search: string;
    replace: string;
}

export interface ReplaceInFileParams {
    file_path: string;
    replacements: Replacement[];
}

export interface ReplaceInFileResult {
    success: boolean;
    replacements_applied?: number;
    error?: string;
    reason?: string;
}

/**
 * Confirmation modal interface for file operations.
 */
export interface FileOperationModal {
    confirm(message: string): Promise<boolean>;
    selectOption?(message: string, options: string[]): Promise<number>;
}

/**
 * ReplaceInFileTool performs precise SEARCH/REPLACE edits on files.
 * Replaces exact text matches with specified replacements.
 * Shows diff preview and requires confirmation before applying changes.
 */
export class ReplaceInFileTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'replace_in_file',
        description: 'Make precise edits to files using SEARCH/REPLACE blocks. Each replacement finds exact text and replaces it.',
        parameters: {
            type: 'object',
            properties: {
                file_path: {
                    type: 'string',
                    description: 'Path to the file to modify (relative to vault root)'
                },
                replacements: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            search: {
                                type: 'string',
                                description: 'Exact text to find'
                            },
                            replace: {
                                type: 'string',
                                description: 'Replacement text'
                            }
                        },
                        required: ['search', 'replace']
                    },
                    description: 'List of SEARCH/REPLACE operations to apply'
                }
            },
            required: ['file_path', 'replacements']
        }
    };

    private vault: Vault;
    private modal: FileOperationModal;
    private autoConfirm: boolean = false;
    private createBackups: boolean = false;
    // @MX:NOTE: 백업 시 사용된 실제 경로를 보존하여 호출자가 동일 경로를 재구성할 필요 없게 함.
    // getBackupPath()는 매번 timestamp가 갱신되어 비결정적이므로, 생성된 마지막 경로를 기록.
    private lastBackupPath: string | null = null;

    constructor(vault: Vault, modal: FileOperationModal) {
        super();
        this.vault = vault;
        this.modal = modal;
    }

    /**
     * Execute replace operations.
     */
    async execute(params: ReplaceInFileParams): Promise<ReplaceInFileResult> {
        const { file_path, replacements } = params;

        // Validate parameters
        if (!file_path || file_path.trim() === '') {
            return {
                success: false,
                error: 'file_path is required and cannot be empty'
            };
        }

        if (!replacements || replacements.length === 0) {
            return {
                success: false,
                error: 'At least one replacement is required'
            };
        }

        // Get file
        const file = this.vault.getAbstractFileByPath(file_path) as TFile;
        if (!file) {
            return {
                success: false,
                error: `File not found: ${file_path}`
            };
        }

        // Read current content
        const content = await this.vault.read(file);

        // Validate all search texts exist
        const validation = this.validateReplacements(content, replacements);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error
            };
        }

        // Generate preview
        const preview = this.generatePreview(content, replacements);

        // Request confirmation
        if (!this.autoConfirm) {
            const confirmed = await this.modal.confirm(
                `Apply ${replacements.length} replacement(s) to ${file_path}?\n\n${preview}`
            );

            if (!confirmed) {
                return {
                    success: false,
                    reason: 'User cancelled the operation',
                    replacements_applied: 0
                };
            }
        }

        // Create backup
        if (this.createBackups) {
            await this.createBackup(file);
        }

        // Apply replacements
        let modifiedContent = content;
        let totalReplacements = 0;

        for (const replacement of replacements) {
            const result = this.applyReplacement(modifiedContent, replacement);
            modifiedContent = result.content;
            totalReplacements += result.count;
        }

        // Write modified content
        await this.vault.modify(file, modifiedContent);

        return {
            success: true,
            replacements_applied: totalReplacements
        };
    }

    /**
     * Validate that all search texts exist in content.
     */
    private validateReplacements(content: string, replacements: Replacement[]): {
        valid: boolean;
        error?: string;
    } {
        for (let i = 0; i < replacements.length; i++) {
            const { search } = replacements[i];

            if (!content.includes(search)) {
                return {
                    valid: false,
                    error: `Search text not found in file (replacement ${i + 1}): "${search.substring(0, 50)}${search.length > 50 ? '...' : ''}"`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Apply a single replacement to content.
     */
    private applyReplacement(content: string, replacement: Replacement): {
        content: string;
        count: number;
    } {
        const { search, replace } = replacement;

        // Use split and join to replace all occurrences
        const parts = content.split(search);
        const count = parts.length - 1;
        const newContent = parts.join(replace);

        return { content: newContent, count };
    }

    /**
     * Generate preview of changes.
     */
    private generatePreview(content: string, replacements: Replacement[]): string {
        const lines: string[] = [];

        for (let i = 0; i < replacements.length && i < 5; i++) {
            const { search, replace } = replacements[i];
            const searchPreview = search.length > 40 ? search.substring(0, 40) + '...' : search;
            const replacePreview = replace.length > 40 ? replace.substring(0, 40) + '...' : replace;

            lines.push(`${i + 1}. "${searchPreview}" → "${replacePreview}"`);
        }

        if (replacements.length > 5) {
            lines.push(`... and ${replacements.length - 5} more`);
        }

        return lines.join('\n');
    }

    /**
     * Create backup of file before modification.
     */
    private async createBackup(file: TFile): Promise<void> {
        const content = await this.vault.read(file);
        const backupPath = this.getBackupPath(file.path);

        try {
            await this.vault.create(backupPath, content);
            this.lastBackupPath = backupPath;
        } catch (error) {
            console.warn(`Failed to create backup: ${backupPath}`, error);
        }
    }

    /**
     * Get path of most recently created backup. Returns null if no backup created yet.
     */
    getLastBackupPath(): string | null {
        return this.lastBackupPath;
    }

    /**
     * Get backup file path.
     */
    getBackupPath(originalPath: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const parts = originalPath.split('/');
        const filename = parts.pop() || '';
        const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
        const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

        parts.push(`${nameWithoutExt}.backup-${timestamp}${ext}`);
        return parts.join('/');
    }

    /**
     * Enable or disable auto-confirm mode.
     */
    setAutoConfirm(enabled: boolean): void {
        this.autoConfirm = enabled;
    }

    /**
     * Check if auto-confirm is enabled.
     */
    isAutoConfirm(): boolean {
        return this.autoConfirm;
    }

    /**
     * Enable or disable backup creation.
     */
    setCreateBackups(enabled: boolean): void {
        this.createBackups = enabled;
    }

    /**
     * Check if backup creation is enabled.
     */
    isCreateBackups(): boolean {
        return this.createBackups;
    }

    /**
     * Get vault reference.
     */
    getVault(): Vault {
        return this.vault;
    }
}
