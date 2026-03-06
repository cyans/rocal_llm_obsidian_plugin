/**
 * TASK-001: Plugin Scaffolding Tests
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Plugin Scaffolding', () => {
    describe('manifest.json', () => {
        let manifest: any;

        beforeAll(() => {
            // manifest.json 파일을 직접 읽어서 검증
            const manifestPath = path.join(__dirname, '../../manifest.json');
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            manifest = JSON.parse(manifestContent);
        });

        it('should have required id field', () => {
            expect(manifest).toHaveProperty('id');
            expect(manifest.id).toBe('vault-agent');
        });

        it('should have minAppVersion >= 1.5.0', () => {
            expect(manifest).toHaveProperty('minAppVersion');
            const [major, minor] = manifest.minAppVersion.split('.').map(Number);
            expect(major).toBeGreaterThan(0);
            expect(minor).toBeGreaterThanOrEqual(5);
        });

        it('should have isDesktopOnly field', () => {
            expect(manifest).toHaveProperty('isDesktopOnly');
            // Phase 1에서는 데스크톱 전용이 아님 (향후 모바일 지원 가능)
            expect(manifest.isDesktopOnly).toBe(false);
        });
    });

    describe('package.json', () => {
        let packageJson: any;

        beforeAll(() => {
            // package.json 파일을 직접 읽어서 검증
            const packagePath = path.join(__dirname, '../../package.json');
            const packageContent = fs.readFileSync(packagePath, 'utf-8');
            packageJson = JSON.parse(packageContent);
        });

        it('should have main field pointing to compiled output', () => {
            expect(packageJson).toHaveProperty('main');
            expect(packageJson.main).toBe('main.js');
        });

        it('should have build script', () => {
            expect(packageJson.scripts).toHaveProperty('build');
            expect(packageJson.scripts.build).toContain('tsc');
        });

        it('should have test script', () => {
            expect(packageJson.scripts).toHaveProperty('test');
            expect(packageJson.scripts.test).toContain('jest');
        });
    });

    describe('tsconfig.json', () => {
        let tsconfig: any;

        beforeAll(() => {
            // tsconfig.json 파일을 직접 읽어서 검증
            const tsconfigPath = path.join(__dirname, '../../tsconfig.json');
            const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
            tsconfig = JSON.parse(tsconfigContent);
        });

        it('should enable strict mode', () => {
            expect(tsconfig.compilerOptions).toHaveProperty('strictNullChecks');
            expect(tsconfig.compilerOptions.strictNullChecks).toBe(true);
        });

        it('should enable noImplicitAny', () => {
            expect(tsconfig.compilerOptions).toHaveProperty('noImplicitAny');
            expect(tsconfig.compilerOptions.noImplicitAny).toBe(true);
        });

        it('should have DOM lib for Obsidian API', () => {
            expect(tsconfig.compilerOptions.lib).toContain('DOM');
        });
    });
});
