/**
 * WebSearchTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 5
 */

import { WebSearchTool } from '../../../src/tools/WebSearchTool';

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

describe('WebSearchTool', () => {
    let webSearchTool: WebSearchTool;
    let mockRequestUrl: MockRequestUrl;

    beforeEach(() => {
        mockRequestUrl = new MockRequestUrl();
        webSearchTool = new WebSearchTool(mockRequestUrl as any);
    });

    describe('definition', () => {
        it('should have correct tool definition', () => {
            expect(webSearchTool.definition.name).toBe('web_search');
            expect(webSearchTool.definition.description).toBeTruthy();
        });

        it('should have query parameter', () => {
            const params = webSearchTool.definition.parameters;
            expect(params.properties.query).toBeDefined();
        });

        it('should have num_results parameter', () => {
            const params = webSearchTool.definition.parameters;
            expect(params.properties.num_results).toBeDefined();
        });
    });

    describe('execute - SearXNG provider', () => {
        it('should search using SearXNG', async () => {
            const mockResponse = {
                status: 200,
                content: JSON.stringify({
                    results: [
                        {
                            title: 'Test Result 1',
                            url: 'https://example.com/1',
                            content: 'Snippet 1',
                            engine: ['google']
                        },
                        {
                            title: 'Test Result 2',
                            url: 'https://example.com/2',
                            content: 'Snippet 2',
                            engine: ['duckduckgo']
                        }
                    ]
                })
            };

            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', mockResponse);

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
            expect(result.results?.length).toBe(2);
        });

        it('should respect num_results limit', async () => {
            const mockResponse = {
                status: 200,
                content: JSON.stringify({
                    results: Array.from({ length: 10 }, (_, i) => ({
                        title: `Result ${i + 1}`,
                        url: `https://example.com/${i + 1}`,
                        content: `Snippet ${i + 1}`
                    }))
                })
            };

            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', mockResponse);

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 3
            });

            expect(result.results?.length).toBe(3);
        });
    });

    describe('execute - caching', () => {
        it('should cache search results', async () => {
            const mockResponse = {
                status: 200,
                content: JSON.stringify({
                    results: [
                        { title: 'Cached Result', url: 'https://example.com', content: 'Snippet' }
                    ]
                })
            };

            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', mockResponse);

            // First call
            await webSearchTool.execute({ query: 'test', num_results: 5 });

            // Second call should use cache (no additional requestUrl call)
            const result2 = await webSearchTool.execute({ query: 'test', num_results: 5 });

            expect(result2.results).toBeDefined();
        });

        it('should respect cache TTL', async () => {
            const cache = webSearchTool.getCache();
            cache.set('web_search:test', 'cached_value', 1000);

            jest.useFakeTimers();
            jest.advanceTimersByTime(500);

            const cached = cache.get('web_search:test');
            expect(cached).toBe('cached_value');

            jest.advanceTimersByTime(600);

            const expired = cache.get('web_search:test');
            expect(expired).toBeUndefined();

            jest.useRealTimers();
        });
    });

    describe('execute - error handling', () => {
        it('should handle empty query', async () => {
            const result = await webSearchTool.execute({
                query: '',
                num_results: 5
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('query');
        });

        it('should handle network errors', async () => {
            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', {
                status: 500,
                content: 'Internal Server Error'
            });

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle malformed JSON response', async () => {
            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', {
                status: 200,
                content: 'Invalid JSON{{{'
            });

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.success).toBe(false);
        });
    });

    describe('execute - Brave Search fallback', () => {
        it('should fall back to Brave Search when SearXNG fails', async () => {
            // Add Brave Search provider first
            webSearchTool.setBraveAPIKey('test-api-key');

            // SearXNG fails
            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', {
                status: 500,
                content: 'SearXNG Error'
            });

            // Brave Search succeeds
            mockRequestUrl.setResponse('https://api.search.brave.com/res/v1/web/search?q=test&count=5', {
                status: 200,
                content: JSON.stringify({
                    web: {
                        results: [
                            {
                                title: 'Brave Result',
                                url: 'https://example.com',
                                description: 'Brave Search Result'
                            }
                        ]
                    }
                })
            });

            webSearchTool.setSearchProviders(['searxng', 'brave']);

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.success).toBe(true);
        });

        it('should return error when all providers fail', async () => {
            // Add Brave Search provider
            webSearchTool.setBraveAPIKey('test-api-key');

            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', {
                status: 500,
                content: 'SearXNG Error'
            });

            mockRequestUrl.setResponse('https://api.search.brave.com/res/v1/web/search?q=test&count=5', {
                status: 500,
                content: 'Brave Error'
            });

            webSearchTool.setSearchProviders(['searxng', 'brave']);

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.success).toBe(false);
        });
    });

    describe('configuration', () => {
        it('should allow setting SearXNG URL', () => {
            webSearchTool.setSearXNGUrl('https://search.example.com');
            expect(webSearchTool.getSearXNGUrl()).toBe('https://search.example.com');
        });

        it('should allow setting Brave API key', () => {
            webSearchTool.setBraveAPIKey('test-api-key');
            expect(webSearchTool.getBraveAPIKey()).toBe('test-api-key');
        });

        it('should allow setting cache TTL', () => {
            webSearchTool.setCacheTTL(60000); // 1 minute
            expect(webSearchTool.getCacheTTL()).toBe(60000);
        });

        it('should allow enabling/disabling cache', () => {
            webSearchTool.setUseCache(false);
            expect(webSearchTool.isUseCache()).toBe(false);
        });
    });

    describe('result formatting', () => {
        it('should format search results consistently', async () => {
            const mockResponse = {
                status: 200,
                content: JSON.stringify({
                    results: [
                        {
                            title: 'Test Result',
                            url: 'https://example.com/test',
                            content: 'This is a test result with relevant information.',
                            engine: ['google']
                        }
                    ]
                })
            };

            mockRequestUrl.setResponse('http://localhost:8080/search?q=test&format=json', mockResponse);

            const result = await webSearchTool.execute({
                query: 'test',
                num_results: 5
            });

            expect(result.results?.[0]).toHaveProperty('title');
            expect(result.results?.[0]).toHaveProperty('url');
            expect(result.results?.[0]).toHaveProperty('snippet');
        });
    });
});
