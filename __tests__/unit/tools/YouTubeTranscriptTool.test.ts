/**
 * YouTubeTranscriptTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 6
 */

import { YouTubeTranscriptTool } from '../../../src/tools/YouTubeTranscriptTool';

// Mock Obsidian requestUrl
class MockRequestUrl {
    private responses: Map<string, { status: number; content: string; headers: HeadersInit }> = new Map();

    setResponse(url: string, response: { status: number; content: string; headers?: HeadersInit }) {
        this.responses.set(url, {
            status: response.status,
            content: response.content,
            headers: response.headers || {}
        });
    }

    async requestUrl(url: string, options?: RequestInit): Promise<{ status: number; text: string; headers: HeadersInit }> {
        const response = this.responses.get(url);

        if (!response) {
            return {
                status: 404,
                text: 'Not Found',
                headers: {}
            };
        }

        return {
            status: response.status,
            text: response.content,
            headers: response.headers
        };
    }
}

// Mock Vault
class MockVault {
    private files: Map<string, string> = new Map();

    async create(path: string, content: string): Promise<any> {
        this.files.set(path, content);
        return { path };
    }

    exists(path: string): boolean {
        return this.files.has(path);
    }

    getFiles() {
        return Array.from(this.files.keys());
    }
}

describe('YouTubeTranscriptTool', () => {
    let youtubeTool: YouTubeTranscriptTool;
    let mockRequestUrl: MockRequestUrl;
    let mockVault: MockVault;

    beforeEach(() => {
        mockRequestUrl = new MockRequestUrl();
        mockVault = new MockVault();
        youtubeTool = new YouTubeTranscriptTool(mockRequestUrl as any, mockVault as any);
    });

    describe('definition', () => {
        it('should have correct tool definition', () => {
            expect(youtubeTool.definition.name).toBe('youtube_transcription');
            expect(youtubeTool.definition.description).toBeTruthy();
        });

        it('should have url parameter', () => {
            const params = youtubeTool.definition.parameters;
            expect(params.properties.url).toBeDefined();
        });

        it('should have language parameter', () => {
            const params = youtubeTool.definition.parameters;
            expect(params.properties.language).toBeDefined();
        });

        it('should have save_to_vault parameter', () => {
            const params = youtubeTool.definition.parameters;
            expect(params.properties.save_to_vault).toBeDefined();
        });
    });

    describe('URL parsing', () => {
        it('should extract video ID from standard URL', () => {
            const videoId = youtubeTool.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            expect(videoId).toBe('dQw4w9WgXcQ');
        });

        it('should extract video ID from short URL', () => {
            const videoId = youtubeTool.extractVideoId('https://youtu.be/dQw4w9WgXcQ');
            expect(videoId).toBe('dQw4w9WgXcQ');
        });

        it('should extract video ID from embed URL', () => {
            const videoId = youtubeTool.extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ');
            expect(videoId).toBe('dQw4w9WgXcQ');
        });

        it('should return null for invalid URL', () => {
            const videoId = youtubeTool.extractVideoId('https://example.com/video');
            expect(videoId).toBeNull();
        });

        it('should return null for empty string', () => {
            const videoId = youtubeTool.extractVideoId('');
            expect(videoId).toBeNull();
        });
    });

    describe('execute - transcript extraction', () => {
        it('should extract Korean transcript', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=ko","name":{"simpleText":"Korean"},"languageCode":"ko","kind":"asr"}]}}};`
            };

            const mockCaptionResponse = {
                status: 200,
                content: `<transcript><text start="0.0" dur="2.5">안녕하세요</text><text start="2.5" dur="3.0">오늘은 TypeScript에 대해</text><text start="5.5" dur="2.0">알아보겠습니다</text></transcript>`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);
            mockRequestUrl.setResponse('https://www.youtube.com/api/timedtext?v=test&lang=ko', mockCaptionResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(true);
            expect(result.transcript).toContain('안녕하세요');
            expect(result.transcript).toContain('TypeScript');
        });

        it('should fallback to English if Korean not available', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=en","name":{"simpleText":"English"},"languageCode":"en"}]}}};`
            };

            const mockCaptionResponse = {
                status: 200,
                content: `<transcript><text start="0.0" dur="2.5">Hello everyone</text><text start="2.5" dur="3.0">Today we learn TypeScript</text></transcript>`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);
            mockRequestUrl.setResponse('https://www.youtube.com/api/timedtext?v=test&lang=en', mockCaptionResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(true);
            expect(result.language).toBe('en');
        });
    });

    describe('execute - save to vault', () => {
        it('should save transcript to vault when requested', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=ko","name":{"simpleText":"Korean"},"languageCode":"ko"}]}}};`
            };

            const mockCaptionResponse = {
                status: 200,
                content: `<transcript><text start="0.0" dur="2.5">테스트 자막</text></transcript>`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);
            mockRequestUrl.setResponse('https://www.youtube.com/api/timedtext?v=test&lang=ko', mockCaptionResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko',
                save_to_vault: true
            });

            expect(result.success).toBe(true);
            expect(result.saved_to).toBeDefined();
            expect(result.saved_to && mockVault.exists(result.saved_to)).toBe(true);
        });

        it('should not save to vault by default', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=ko","name":{"simpleText":"Korean"},"languageCode":"ko"}]}}};`
            };

            const mockCaptionResponse = {
                status: 200,
                content: `<transcript><text start="0.0" dur="2.5">테스트</text></transcript>`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);
            mockRequestUrl.setResponse('https://www.youtube.com/api/timedtext?v=test&lang=ko', mockCaptionResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(true);
            expect(result.saved_to).toBeUndefined();
        });
    });

    describe('execute - error handling', () => {
        it('should handle invalid URL', async () => {
            const result = await youtubeTool.execute({
                url: 'https://example.com/not-youtube',
                language: 'ko'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid YouTube URL');
        });

        it('should handle network error', async () => {
            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', {
                status: 500,
                content: 'Internal Server Error'
            });

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle video without captions', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{}}};`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('No captions');
        });
    });

    describe('timestamp formatting', () => {
        it('should format timestamps in transcript', async () => {
            const mockPageResponse = {
                status: 200,
                content: `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test&lang=ko","name":{"simpleText":"Korean"},"languageCode":"ko"}]}}};`
            };

            const mockCaptionResponse = {
                status: 200,
                content: `<transcript><text start="65.5" dur="3.0">육십오 초입니다</text></transcript>`
            };

            mockRequestUrl.setResponse('https://www.youtube.com/watch?v=testVideoId', mockPageResponse);
            mockRequestUrl.setResponse('https://www.youtube.com/api/timedtext?v=test&lang=ko', mockCaptionResponse);

            const result = await youtubeTool.execute({
                url: 'https://www.youtube.com/watch?v=testVideoId',
                language: 'ko'
            });

            expect(result.success).toBe(true);
            expect(result.transcript).toContain('1:05');
        });
    });

    describe('configuration', () => {
        it('should allow setting default language', () => {
            youtubeTool.setDefaultLanguage('en');
            expect(youtubeTool.getDefaultLanguage()).toBe('en');
        });

        it('should allow setting save directory', () => {
            youtubeTool.setSaveDirectory('youtube/transcripts');
            expect(youtubeTool.getSaveDirectory()).toBe('youtube/transcripts');
        });

        it('should allow enabling/disabling timestamps', () => {
            youtubeTool.setIncludeTimestamps(false);
            expect(youtubeTool.isIncludeTimestamps()).toBe(false);
        });
    });
});
