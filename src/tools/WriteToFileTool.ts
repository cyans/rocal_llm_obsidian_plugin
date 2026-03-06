/**
 * Write to File Tool - Create or overwrite files
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 4
 * @MX:NOTE: 파일 생성 및 전체 수정 도구
 * @MX:WARN: 파일 덮어쓰기는 사용자 승인 필요
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { TFile, Vault } from 'obsidian';

export interface WriteToFileParams {
    file_path: string;
    content: string;
}

export interface WriteToFileResult {
    success: boolean;
    file_path?: string;
    error?: string;
    reason?: string;
}

/**
 * Confirmation modal interface for file operations.
 */
export interface FileOperationModal {
    confirm(message: string): Promise<boolean>;
}

/**
 * WriteToFileTool creates new files or overwrites existing ones.
 * Requires user confirmation for overwriting existing files.
 * Creates automatic backups before overwriting.
 */
export class WriteToFileTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'write_to_file',
        description: 'Create or overwrite file in vault',
        parameters: {
            type: 'object',
            properties: {
                file_path: { type: 'string' },
                content: { type: 'string' }
            },
            required: ['file_path', 'content']
        }
    };

    private vault: Vault;
    private modal: FileOperationModal;
    private autoConfirm: boolean = false;
    private createBackups: boolean = true;
    private backupTimestamp: boolean = true;

    constructor(vault: Vault, modal: FileOperationModal) {
        super();
        this.vault = vault;
        this.modal = modal;
    }

    /**
     * Execute write operation.
     */
    async execute(params: WriteToFileParams): Promise<WriteToFileResult> {
        const { file_path, content } = params;

        // Validate parameters
        if (!file_path || file_path.trim() === '') {
            return {
                success: false,
                error: 'file_path is required and cannot be empty'
            };
        }

        // Check if file exists
        const existingFile = this.vault.getAbstractFileByPath(file_path);

        if (existingFile) {
            // File exists, need confirmation
            if (!this.autoConfirm) {
                const confirmed = await this.modal.confirm(
                    `File "${file_path}" already exists. Overwrite?`
                );

                if (!confirmed) {
                    return {
                        success: false,
                        reason: 'User cancelled the operation',
                        file_path
                    };
                }
            }

            // Create backup before overwriting
            if (this.createBackups) {
                await this.createBackup(existingFile as TFile);
            }

            // Overwrite existing file
            await this.vault.modify(existingFile as TFile, content);
        } else {
            // Create new file (will create directories automatically)
            await this.ensureDirectoryExists(file_path);
            await this.vault.create(file_path, content);
        }

        return {
            success: true,
            file_path
        };
    }

    /**
     * Create backup of existing file.
     */
    private async createBackup(file: TFile): Promise<void> {
        const content = await this.vault.read(file);
        const backupPath = this.getBackupPath(file.path);

        try {
            await this.vault.create(backupPath, content);
        } catch (error) {
            // Backup creation failed, but continue with operation
            console.warn(`Failed to create backup: ${backupPath}`, error);
        }
    }

    /**
     * Get backup file path.
     */
    getBackupPath(originalPath: string): string {
        if (this.backupTimestamp) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const parts = originalPath.split('/');
            const filename = parts.pop() || '';
            const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
            const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

            parts.push(`${nameWithoutExt}.backup-${timestamp}${ext}`);
            return parts.join('/');
        }

        return `${originalPath}.backup`;
    }

    /**
     * Ensure parent directories exist.
     */
    private async ensureDirectoryExists(filePath: string): Promise<void> {
        const parts = filePath.split('/');
        parts.pop(); // Remove filename

        if (parts.length === 0) {
            return; // Root directory, no need to create
        }

        // Obsidian's create API automatically creates parent directories
        // No additional action needed
    }

    /**
     * Enable or disable auto-confirm mode.
     * When enabled, file operations proceed without confirmation.
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
     * Enable or disable timestamp in backup filenames.
     */
    setBackupTimestamp(enabled: boolean): void {
        this.backupTimestamp = enabled;
    }

    /**
     * Get vault reference.
     */
    getVault(): Vault {
        return this.vault;
    }
}
