/**
 * Web Search Tool - Internet search capability
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 5
 * @MX:NOTE: 인터넷 검색 도구 (다중 Provider 지원)
 */

import { BaseTool, ToolDefinition } from './BaseTool';
import { Cache } from '../utils/cache';

export interface WebSearchParams {
    query: string;
    num_results?: number;
}

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface WebSearchResponse {
    success: boolean;
    results?: WebSearchResult[];
    error?: string;
    provider?: string;
}

const TOOL_DEFINITION = {
    name: 'web_search',
    description: 'Search the internet for current information',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string'
            },
            num_results: {
                type: 'number'
            }
        },
        required: ['query']
    }
} as const;

/**
 * Search provider interface.
 */
export interface SearchProvider {
    name: string;
    search(query: string, numResults: number): Promise<WebSearchResult[]>;
}

/**
 * SearXNG search provider implementation.
 */
export class SearXNGProvider implements SearchProvider {
    name = 'searxng';
    public baseUrl: string;
    private requestUrl: any;

    constructor(baseUrl: string, requestUrl: any) {
        this.baseUrl = baseUrl;
        this.requestUrl = requestUrl;
    }

    async search(query: string, numResults: number): Promise<WebSearchResult[]> {
        const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;

        const response = await this.requestUrl.requestUrl(url, {
            method: 'GET'
        });

        if (response.status !== 200) {
            throw new Error(`SearXNG returned status ${response.status}`);
        }

        const data = JSON.parse(response.text);

        return (data.results || []).slice(0, numResults).map((item: any) => ({
            title: item.title || '',
            url: item.url || '',
            snippet: item.content || ''
        }));
    }
}

/**
 * Brave Search provider implementation.
 */
export class BraveSearchProvider implements SearchProvider {
    name = 'brave';
    public apiKey: string;
    private requestUrl: any;

    constructor(apiKey: string, requestUrl: any) {
        this.apiKey = apiKey;
        this.requestUrl = requestUrl;
    }

    async search(query: string, numResults: number): Promise<WebSearchResult[]> {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;

        const headers: HeadersInit = {
            'Accept': 'application/json'
        };

        if (this.apiKey) {
            headers['X-Subscription-Token'] = this.apiKey;
        }

        const response = await this.requestUrl.requestUrl(url, {
            method: 'GET',
            headers
        });

        if (response.status !== 200) {
            throw new Error(`Brave Search returned status ${response.status}`);
        }

        const data = JSON.parse(response.text);

        return (data.web?.results || []).map((item: any) => ({
            title: item.title || item.name || '',
            url: item.url || '',
            snippet: item.description || ''
        }));
    }
}

/**
 * WebSearchTool implements internet search functionality.
 * Supports multiple search providers with automatic fallback.
 * Caches results for improved performance.
 */
export class WebSearchTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'web_search',
        description: 'Search the internet for real-time information. Returns relevant web pages with titles, URLs, and snippets.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query or keywords'
                },
                num_results: {
                    type: 'number',
                    description: 'Maximum number of results to return (default: 5)',
                    default: 5
                }
            },
            required: ['query']
        }
    };

    private requestUrl: any;
    private providers: SearchProvider[] = [];
    private cache: Cache;
    private cacheTTL: number = 300000; // 5 minutes
    private useCache: boolean = true;

    constructor(requestUrl: any) {
        super();
        this.requestUrl = requestUrl;
        this.cache = new Cache(this.cacheTTL);

        // Default providers
        this.providers = [
            new SearXNGProvider('http://localhost:8080', requestUrl)
        ];
    }

    /**
     * Execute web search.
     */
    async execute(params: WebSearchParams): Promise<WebSearchResponse> {
        const { query, num_results = 5 } = params;

        // Validate parameters
        if (!query || query.trim() === '') {
            return {
                success: false,
                error: 'query is required and cannot be empty'
            };
        }

        // Check cache first
        if (this.useCache) {
            const cacheKey = `web_search:${query}`;
            const cached = this.cache.get<WebSearchResponse>(cacheKey);

            if (cached) {
                return { ...cached, provider: 'cache' };
            }
        }

        // Try each provider until one succeeds
        let lastError: Error | null = null;

        for (const provider of this.providers) {
            try {
                const results = await provider.search(query, num_results);

                const response: WebSearchResponse = {
                    success: true,
                    results,
                    provider: provider.name
                };

                // Cache successful results
                if (this.useCache) {
                    this.cache.set(`web_search:${query}`, response, this.cacheTTL);
                }

                return response;
            } catch (error) {
                lastError = error as Error;
                // Try next provider
                continue;
            }
        }

        // All providers failed
        return {
            success: false,
            error: `All search providers failed. Last error: ${lastError?.message || 'Unknown error'}`
        };
    }

    /**
     * Set SearXNG base URL.
     * SearXNG는 백업 provider로 뒤에 배치됨
     */
    setSearXNGUrl(url: string): void {
        const index = this.providers.findIndex(p => p.name === 'searxng');
        const provider = new SearXNGProvider(url, this.requestUrl);

        if (index >= 0) {
            this.providers[index] = provider;
        } else {
            this.providers.push(provider);  // 뒤에 추가 (우선순위 낮음)
        }
    }

    /**
     * Get current SearXNG URL.
     */
    getSearXNGUrl(): string {
        const provider = this.providers.find(p => p.name === 'searxng') as SearXNGProvider;
        return provider?.baseUrl || 'http://localhost:8080';
    }

    /**
     * Set Brave Search API key.
     * Brave는 항상 첫 번째 provider로 설정 (API 키가 있는 경우 우선 사용)
     */
    setBraveAPIKey(apiKey: string): void {
        const index = this.providers.findIndex(p => p.name === 'brave');
        const provider = new BraveSearchProvider(apiKey, this.requestUrl);

        if (index >= 0) {
            this.providers[index] = provider;
        } else {
            this.providers.unshift(provider);  // 맨 앞에 추가 (최우선)
        }
    }

    /**
     * Get current Brave API key.
     */
    getBraveAPIKey(): string {
        const provider = this.providers.find(p => p.name === 'brave') as BraveSearchProvider;
        return provider?.apiKey || '';
    }

    /**
     * Set search providers in order of priority.
     */
    setSearchProviders(providerNames: string[]): void {
        const newProviders: SearchProvider[] = [];

        for (const name of providerNames) {
            const existing = this.providers.find(p => p.name === name);
            if (existing) {
                newProviders.push(existing);
            }
        }

        if (newProviders.length > 0) {
            this.providers = newProviders;
        }
    }

    /**
     * Set cache TTL in milliseconds.
     */
    setCacheTTL(ttl: number): void {
        this.cacheTTL = ttl;
        this.cache.setDefaultTTL(ttl);
    }

    /**
     * Get current cache TTL.
     */
    getCacheTTL(): number {
        return this.cacheTTL;
    }

    /**
     * Enable or disable cache.
     */
    setUseCache(enabled: boolean): void {
        this.useCache = enabled;
    }

    /**
     * Check if cache is enabled.
     */
    isUseCache(): boolean {
        return this.useCache;
    }

    /**
     * Get cache instance.
     */
    getCache(): Cache {
        return this.cache;
    }

    /**
     * Clear search cache.
     */
    clearCache(): void {
        this.cache.clear();
    }
}
