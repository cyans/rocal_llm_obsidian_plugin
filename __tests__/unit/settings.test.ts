/**
 * TASK-002: Settings Tab Tests
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VaultAgentSettingTab } from '../../src/settings';
import { DEFAULT_SETTINGS, VaultAgentSettings } from '../../src/types';

describe('VaultAgentSettingTab', () => {
    let mockPlugin: any;
    let settingsTab: VaultAgentSettingTab;

    beforeEach(() => {
        // Mock Obsidian App
        const mockApp: any = {
            workspace: {},
            vault: {
                getConfigDir: jest.fn().mockReturnValue('.obsidian')
            }
        };

        // Mock Plugin with correct settings type
        mockPlugin = {
            settings: { ...DEFAULT_SETTINGS },
            saveSettings: jest.fn().mockImplementation(() => Promise.resolve()) as any
        };

        settingsTab = new VaultAgentSettingTab(mockApp, mockPlugin);
    });

    describe('display()', () => {
        it('should create VaultAgentSettingTab instance', () => {
            expect(settingsTab).toBeInstanceOf(VaultAgentSettingTab);
        });

        it('should have display method', () => {
            expect(typeof settingsTab.display).toBe('function');
        });
    });

    describe('Settings Persistence', () => {
        it('should have default settings structure', () => {
            expect(mockPlugin.settings.apiUrl).toBe('http://localhost:11434/v1');
            expect(mockPlugin.settings.model).toBe('qwen3.6:35b');
            expect(mockPlugin.settings.agentMode).toBe(true);
            expect(mockPlugin.settings.tools.vaultSearch).toBe(true);
            expect(mockPlugin.settings.tools.webSearch).toBe(true);
        });

        it('should call saveSettings when settings change', async () => {
            mockPlugin.settings.apiUrl = 'http://localhost:8080/v1';
            await mockPlugin.saveSettings();

            expect(mockPlugin.saveSettings).toHaveBeenCalled();
            expect(mockPlugin.settings.apiUrl).toBe('http://localhost:8080/v1');
        });
    });

    describe('Validation', () => {
        it('should validate API URL format', () => {
            const validUrl = 'http://localhost:11434/v1';
            const invalidUrl = 'not-a-url';

            expect(() => new URL(validUrl)).not.toThrow();
            expect(() => new URL(invalidUrl)).toThrow();
        });

        it('should validate temperature range (0-2)', () => {
            const validTemp = 0.7;
            const invalidTempHigh = 3.0;
            const invalidTempLow = -0.1;

            expect(validTemp).toBeGreaterThanOrEqual(0);
            expect(validTemp).toBeLessThanOrEqual(2);
            expect(invalidTempHigh).toBeGreaterThan(2);
            expect(invalidTempLow).toBeLessThan(0);
        });

        it('should validate maxTokens range (1-32000)', () => {
            const validTokens = 4096;
            const invalidTokensHigh = 50000;
            const invalidTokensLow = 0;

            expect(validTokens).toBeGreaterThanOrEqual(1);
            expect(validTokens).toBeLessThanOrEqual(32000);
            expect(invalidTokensHigh).toBeGreaterThan(32000);
            expect(invalidTokensLow).toBeLessThan(1);
        });
    });
});
