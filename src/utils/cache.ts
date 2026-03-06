/**
 * Cache Utility - Result caching with TTL support
 * @MX:SPEC: SPEC-PLUGIN-001 Phase 5
 * @MX:NOTE: 검색 결과 캐싱 유틸리티 (TTL 지원)
 */

export interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/**
 * Cache implements an in-memory cache with Time-To-Live (TTL) support.
 * Automatically expires entries after their TTL expires.
 */
export class Cache {
    private entries: Map<string, CacheEntry<any>> = new Map();
    private defaultTTL: number; // milliseconds

    constructor(defaultTTL: number = 300000) {
        // Default 5 minutes TTL
        this.defaultTTL = defaultTTL;
    }

    /**
     * Store a value in the cache.
     * @param key - Cache key
     * @param value - Value to store
     * @param ttl - Time to live in milliseconds (0 = no expiration)
     */
    set<T>(key: string, value: T, ttl?: number): void {
        const expiresAt = ttl === 0
            ? 0 // No expiration
            : Date.now() + (ttl || this.defaultTTL);

        this.entries.set(key, { value, expiresAt });
    }

    /**
     * Retrieve a value from the cache.
     * Returns undefined if key doesn't exist or entry has expired.
     */
    get<T>(key: string): T | undefined {
        const entry = this.entries.get(key);

        if (!entry) {
            return undefined;
        }

        // Check if expired
        if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.value as T;
    }

    /**
     * Check if a key exists in the cache and is not expired.
     */
    has(key: string): boolean {
        const entry = this.entries.get(key);

        if (!entry) {
            return false;
        }

        // Check if expired
        if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
            this.entries.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Remove a specific entry from the cache.
     */
    delete(key: string): void {
        this.entries.delete(key);
    }

    /**
     * Remove all entries from the cache.
     */
    clear(): void {
        this.entries.clear();
    }

    /**
     * Get the number of entries in the cache (excluding expired ones).
     */
    size(): number {
        // Cleanup expired entries first
        this.cleanup();
        return this.entries.size;
    }

    /**
     * Get all cache keys.
     */
    keys(): string[] {
        this.cleanup();
        return Array.from(this.entries.keys());
    }

    /**
     * Remove all expired entries from the cache.
     */
    cleanup(): void {
        const now = Date.now();

        for (const [key, entry] of this.entries.entries()) {
            if (entry.expiresAt > 0 && now > entry.expiresAt) {
                this.entries.delete(key);
            }
        }
    }

    /**
     * Get the default TTL in milliseconds.
     */
    getDefaultTTL(): number {
        return this.defaultTTL;
    }

    /**
     * Set the default TTL.
     */
    setDefaultTTL(ttl: number): void {
        this.defaultTTL = ttl;
    }

    /**
     * Get cache statistics.
     */
    getStats(): {
        size: number;
        expired: number;
        valid: number;
    } {
        let expired = 0;
        let valid = 0;
        const now = Date.now();

        for (const entry of this.entries.values()) {
            if (entry.expiresAt > 0 && now > entry.expiresAt) {
                expired++;
            } else {
                valid++;
            }
        }

        return {
            size: this.entries.size,
            expired,
            valid
        };
    }
}
