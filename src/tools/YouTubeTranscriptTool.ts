/**
 * YouTube Transcript Tool - Extract YouTube video captions
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 6
 * @MX:NOTE: YouTube 자막 추출 도구 (다국어 지원)
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { Vault } from 'obsidian';

export interface YouTubeTranscriptParams {
    url: string;
    language?: string;
    save_to_vault?: boolean;
}

export interface YouTubeTranscriptResult {
    success: boolean;
    transcript?: string;
    video_id?: string;
    language?: string;
    saved_to?: string;
    error?: string;
}

/**
 * YouTubeTranscriptTool extracts captions from YouTube videos.
 * Supports multiple languages with automatic fallback.
 * Can optionally save transcripts to vault.
 */
export class YouTubeTranscriptTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'youtube_transcription',
        description: 'Extract transcript/captions from YouTube videos. Supports multiple languages with automatic fallback.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'YouTube video URL (watch, youtu.be, or embed format)'
                },
                language: {
                    type: 'string',
                    description: 'Preferred language code (default: "ko" for Korean)',
                    default: 'ko'
                },
                save_to_vault: {
                    type: 'boolean',
                    description: 'Save transcript to vault as markdown file (default: false)',
                    default: false
                }
            },
            required: ['url']
        }
    };

    private requestUrl: any;
    private vault: Vault;
    private defaultLanguage: string = 'ko';
    private saveDirectory: string = 'youtube/transcripts';
    private includeTimestamps: boolean = true;
    private fallbackLanguages: string[] = ['en', 'ja', 'zh'];

    constructor(requestUrl: any, vault: Vault) {
        super();
        this.requestUrl = requestUrl;
        this.vault = vault;
    }

    /**
     * Extract YouTube transcript from video.
     */
    async execute(params: YouTubeTranscriptParams): Promise<YouTubeTranscriptResult> {
        const { url, language = this.defaultLanguage, save_to_vault = false } = params;

        // Extract video ID
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            return {
                success: false,
                error: 'Invalid YouTube URL. Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID'
            };
        }

        try {
            // Fetch YouTube page to get caption tracks
            const pageResponse = await this.requestUrl.requestUrl(
                `https://www.youtube.com/watch?v=${videoId}`,
                { method: 'GET' }
            );

            if (pageResponse.status !== 200) {
                return {
                    success: false,
                    error: `Failed to fetch YouTube page: HTTP ${pageResponse.status}`
                };
            }

            // Parse caption tracks from page
            const captionTracks = this.parseCaptionTracks(pageResponse.text);

            if (!captionTracks || captionTracks.length === 0) {
                return {
                    success: false,
                    error: 'No captions available for this video'
                };
            }

            // Find best matching caption track
            const selectedTrack = this.selectCaptionTrack(captionTracks, language);

            if (!selectedTrack) {
                return {
                    success: false,
                    error: `No captions available for language: ${language}`
                };
            }

            // Fetch and parse transcript
            const transcript = await this.fetchTranscript(selectedTrack.baseUrl);

            // Save to vault if requested
            let savedTo: string | undefined;
            if (save_to_vault) {
                savedTo = await this.saveTranscript(videoId, transcript, selectedTrack.languageCode);
            }

            return {
                success: true,
                transcript,
                video_id: videoId,
                language: selectedTrack.languageCode,
                saved_to: savedTo
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Extract video ID from various YouTube URL formats.
     */
    extractVideoId(url: string): string | null {
        if (!url || url.trim() === '') {
            return null;
        }

        // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
        const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);

        if (watchMatch) {
            return watchMatch[1];
        }

        return null;
    }

    /**
     * Parse caption tracks from YouTube page HTML.
     */
    private parseCaptionTracks(pageHtml: string): any[] | null {
        // Find ytInitialPlayerResponse in page
        const match = pageHtml.match(/var ytInitialPlayerResponse = ({.+?});/);

        if (!match) {
            return null;
        }

        try {
            const playerResponse = JSON.parse(match[1]);
            return playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
        } catch {
            return null;
        }
    }

    /**
     * Select best caption track based on language preference.
     */
    private selectCaptionTrack(tracks: any[], preferredLanguage: string): any | null {
        if (!tracks || tracks.length === 0) {
            return null;
        }

        // First try exact match
        let track = tracks.find((t: any) => t.languageCode === preferredLanguage);
        if (track) return track;

        // Try fallback languages
        for (const fallbackLang of this.fallbackLanguages) {
            track = tracks.find((t: any) => t.languageCode === fallbackLang);
            if (track) return track;
        }

        // Fall back to first available track
        return tracks[0];
    }

    /**
     * Fetch and parse transcript XML.
     */
    private async fetchTranscript(captionUrl: string): Promise<string> {
        const response = await this.requestUrl.requestUrl(captionUrl, { method: 'GET' });

        if (response.status !== 200) {
            throw new Error(`Failed to fetch captions: HTTP ${response.status}`);
        }

        // Parse XML transcript
        const transcript = this.parseTranscriptXml(response.text);

        return transcript;
    }

    /**
     * Parse transcript XML and format as text.
     */
    private parseTranscriptXml(xmlContent: string): string {
        // Simple XML parser for transcript
        const lines: string[] = [];

        // Extract <text> elements
        const textRegex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
        let match;

        while ((match = textRegex.exec(xmlContent)) !== null) {
            const [, start, duration, text] = match;
            const decodedText = this.decodeHtmlEntities(text);

            if (this.includeTimestamps) {
                const timestamp = this.formatTimestamp(parseFloat(start));
                lines.push(`[${timestamp}] ${decodedText}`);
            } else {
                lines.push(decodedText);
            }
        }

        return lines.join('\n');
    }

    /**
     * Decode HTML entities in text.
     */
    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#10;/g, '\n')
            .replace(/&#13;/g, '\r')
            .replace(/<[^>]+>/g, ''); // Remove any remaining HTML tags
    }

    /**
     * Format timestamp as [MM:SS].
     */
    private formatTimestamp(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Save transcript to vault as markdown file.
     */
    private async saveTranscript(videoId: string, transcript: string, language: string): Promise<string> {
        const filename = `${videoId}_${language}.md`;
        const filepath = `${this.saveDirectory}/${filename}`;

        const content = `# YouTube Transcript\n\n` +
            `- Video ID: ${videoId}\n` +
            `- Language: ${language}\n` +
            `- Extracted: ${new Date().toISOString()}\n\n` +
            `## Transcript\n\n${transcript}`;

        await this.vault.create(filepath, content);

        return filepath;
    }

    /**
     * Set default language.
     */
    setDefaultLanguage(language: string): void {
        this.defaultLanguage = language;
    }

    /**
     * Get default language.
     */
    getDefaultLanguage(): string {
        return this.defaultLanguage;
    }

    /**
     * Set save directory for transcripts.
     */
    setSaveDirectory(directory: string): void {
        this.saveDirectory = directory;
    }

    /**
     * Get save directory.
     */
    getSaveDirectory(): string {
        return this.saveDirectory;
    }

    /**
     * Enable or disable timestamps in transcript.
     */
    setIncludeTimestamps(enabled: boolean): void {
        this.includeTimestamps = enabled;
    }

    /**
     * Check if timestamps are enabled.
     */
    isIncludeTimestamps(): boolean {
        return this.includeTimestamps;
    }

    /**
     * Set fallback languages.
     */
    setFallbackLanguages(languages: string[]): void {
        this.fallbackLanguages = languages;
    }

    /**
     * Get fallback languages.
     */
    getFallbackLanguages(): string[] {
        return this.fallbackLanguages;
    }
}
