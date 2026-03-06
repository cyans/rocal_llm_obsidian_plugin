/**
 * Cache Utility Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 5
 */

import { Cache } from '../../../src/utils/cache';

describe('Cache', () => {
    let cache: Cache;

    beforeEach(() => {
        cache = new Cache();
    });

    describe('set and get', () => {
        it('should store and retrieve values', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        it('should return undefined for non-existent keys', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
        });

        it('should store different data types', () => {
            cache.set('string', 'text');
            cache.set('number', 123);
            cache.set('object', { foo: 'bar' });
            cache.set('array', [1, 2, 3]);

            expect(cache.get('string')).toBe('text');
            expect(cache.get('number')).toBe(123);
            expect(cache.get('object')).toEqual({ foo: 'bar' });
            expect(cache.get('array')).toEqual([1, 2, 3]);
        });
    });

    describe('TTL (Time To Live)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should expire entries after TTL', () => {
            cache.set('key', 'value', 1000); // 1 second TTL

            expect(cache.get('key')).toBe('value');

            jest.advanceTimersByTime(1100); // Advance past TTL

            expect(cache.get('key')).toBeUndefined();
        });

        it('should not expire entries before TTL', () => {
            cache.set('key', 'value', 1000);

            jest.advanceTimersByTime(500); // Advance half TTL

            expect(cache.get('key')).toBe('value');
        });

        it('should handle infinite TTL (0)', () => {
            cache.set('key', 'value', 0); // No expiration

            jest.advanceTimersByTime(999999);

            expect(cache.get('key')).toBe('value');
        });

        it('should use default TTL when not specified', () => {
            const cacheWithDefault = new Cache(5000); // 5 second default
            cacheWithDefault.set('key', 'value');

            jest.advanceTimersByTime(4000);
            expect(cacheWithDefault.get('key')).toBe('value');

            jest.advanceTimersByTime(2000);
            expect(cacheWithDefault.get('key')).toBeUndefined();
        });
    });

    describe('has', () => {
        it('should return true for existing keys', () => {
            cache.set('key', 'value');
            expect(cache.has('key')).toBe(true);
        });

        it('should return false for non-existent keys', () => {
            expect(cache.has('nonexistent')).toBe(false);
        });

        it('should return false for expired keys', () => {
            jest.useFakeTimers();
            cache.set('key', 'value', 1000);

            jest.advanceTimersByTime(1100);

            expect(cache.has('key')).toBe(false);
            jest.useRealTimers();
        });
    });

    describe('delete', () => {
        it('should remove entries', () => {
            cache.set('key', 'value');
            expect(cache.has('key')).toBe(true);

            cache.delete('key');
            expect(cache.has('key')).toBe(false);
        });

        it('should not throw when deleting non-existent keys', () => {
            expect(() => cache.delete('nonexistent')).not.toThrow();
        });
    });

    describe('clear', () => {
        it('should remove all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');

            expect(cache.size()).toBe(3);

            cache.clear();

            expect(cache.size()).toBe(0);
        });
    });

    describe('size', () => {
        it('should return number of entries', () => {
            expect(cache.size()).toBe(0);

            cache.set('key1', 'value1');
            expect(cache.size()).toBe(1);

            cache.set('key2', 'value2');
            cache.set('key3', 'value3');
            expect(cache.size()).toBe(3);

            cache.delete('key1');
            expect(cache.size()).toBe(2);
        });
    });

    describe('keys', () => {
        it('should return all keys', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');

            const keys = cache.keys();
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
            expect(keys).toContain('key3');
            expect(keys.length).toBe(3);
        });

        it('should return empty array for empty cache', () => {
            expect(cache.keys()).toEqual([]);
        });
    });

    describe('cleanup expired entries', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should remove expired entries', () => {
            cache.set('key1', 'value1', 1000);
            cache.set('key2', 'value2', 2000);
            cache.set('key3', 'value3', 3000);

            expect(cache.size()).toBe(3);

            jest.advanceTimersByTime(1500);
            cache.cleanup(); // Manual cleanup

            expect(cache.size()).toBe(2); // key1 expired
            expect(cache.has('key1')).toBe(false);
            expect(cache.has('key2')).toBe(true);
            expect(cache.has('key3')).toBe(true);
        });
    });
});
