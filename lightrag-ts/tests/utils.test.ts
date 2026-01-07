/**
 * Utils Tests
 *
 * Unit tests for utility functions in utils/index.ts
 */

import { describe, it, expect } from 'vitest';
import {
    computeArgsHash,
    computeMdhashId,
    splitStringByMultiMarkers,
    sanitizeAndNormalizeText,
    isFloatString,
    truncateListByTokenSize,
    mergeSourceIds,
    applySourceIdsLimit,
    makeRelationChunkKey,
    cosineSimilarity,
    sleep,
    retry,
    GPTTokenizer,
} from '../src/utils/index.js';
import { GRAPH_FIELD_SEP } from '../src/constants.js';

describe('Hashing Functions', () => {
    it('computeArgsHash should produce consistent hashes', () => {
        const hash1 = computeArgsHash('hello', 'world');
        const hash2 = computeArgsHash('hello', 'world');
        expect(hash1).toBe(hash2);
    });

    it('computeArgsHash should produce different hashes for different inputs', () => {
        const hash1 = computeArgsHash('hello');
        const hash2 = computeArgsHash('world');
        expect(hash1).not.toBe(hash2);
    });

    it('computeMdhashId should prepend prefix', () => {
        const id = computeMdhashId('content', 'doc-');
        expect(id.startsWith('doc-')).toBe(true);
    });
});

describe('Text Processing', () => {
    it('splitStringByMultiMarkers should split by multiple markers', () => {
        const result = splitStringByMultiMarkers('a<SEP>b<SEP>c', ['<SEP>']);
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('splitStringByMultiMarkers should handle multiple different markers', () => {
        const result = splitStringByMultiMarkers('a|b,c', ['|', ',']);
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('splitStringByMultiMarkers should return original if no markers', () => {
        const result = splitStringByMultiMarkers('abc', []);
        expect(result).toEqual(['abc']);
    });

    it('sanitizeAndNormalizeText should remove outer quotes', () => {
        expect(sanitizeAndNormalizeText('"hello"')).toBe('hello');
        expect(sanitizeAndNormalizeText("'hello'")).toBe('hello');
    });

    it('sanitizeAndNormalizeText should normalize whitespace', () => {
        expect(sanitizeAndNormalizeText('  hello   world  ')).toBe('hello world');
    });

    it('sanitizeAndNormalizeText should remove inner quotes when requested', () => {
        expect(sanitizeAndNormalizeText('hello "world"', true)).toBe('hello world');
    });

    it('isFloatString should detect valid floats', () => {
        expect(isFloatString('123')).toBe(true);
        expect(isFloatString('123.45')).toBe(true);
        expect(isFloatString('-123.45')).toBe(true);
        expect(isFloatString('abc')).toBe(false);
        expect(isFloatString('')).toBe(false);
    });
});

describe('Tokenizer', () => {
    const tokenizer = new GPTTokenizer();

    it('should encode text to tokens', () => {
        const tokens = tokenizer.encode('Hello, world!');
        expect(Array.isArray(tokens)).toBe(true);
        expect(tokens.length).toBeGreaterThan(0);
    });

    it('should decode tokens back to text', () => {
        const original = 'Hello, world!';
        const tokens = tokenizer.encode(original);
        const decoded = tokenizer.decode(tokens);
        expect(decoded).toBe(original);
    });
});

describe('truncateListByTokenSize', () => {
    const tokenizer = new GPTTokenizer();

    it('should truncate items when exceeding max tokens', () => {
        const items = [
            { text: 'This is a short sentence.' },
            { text: 'This is another sentence that is a bit longer.' },
            { text: 'Yet another sentence to test truncation.' },
        ];

        const result = truncateListByTokenSize(
            items,
            item => item.text,
            20, // Very low limit to force truncation
            tokenizer
        );

        expect(result.length).toBeLessThan(items.length);
    });

    it('should return all items if under limit', () => {
        const items = [{ text: 'Hi' }, { text: 'Hey' }];
        const result = truncateListByTokenSize(
            items,
            item => item.text,
            1000,
            tokenizer
        );
        expect(result).toEqual(items);
    });
});

describe('Source IDs Management', () => {
    it('mergeSourceIds should combine unique IDs', () => {
        const result = mergeSourceIds('a<SEP>b', 'c<SEP>d');
        expect(result).toContain('a');
        expect(result).toContain('b');
        expect(result).toContain('c');
        expect(result).toContain('d');
    });

    it('mergeSourceIds should deduplicate', () => {
        const result = mergeSourceIds('a<SEP>b', 'b<SEP>c');
        const ids = result.split(GRAPH_FIELD_SEP);
        const uniqueIds = [...new Set(ids)];
        expect(ids.length).toBe(uniqueIds.length);
    });

    it('applySourceIdsLimit FIFO should keep newest', () => {
        const input = 'a<SEP>b<SEP>c<SEP>d<SEP>e';
        const result = applySourceIdsLimit(input, 3, 'FIFO');
        const ids = result.split(GRAPH_FIELD_SEP);
        expect(ids).toEqual(['c', 'd', 'e']);
    });

    it('applySourceIdsLimit KEEP should keep oldest', () => {
        const input = 'a<SEP>b<SEP>c<SEP>d<SEP>e';
        const result = applySourceIdsLimit(input, 3, 'KEEP');
        const ids = result.split(GRAPH_FIELD_SEP);
        expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('makeRelationChunkKey should sort alphabetically', () => {
        const key1 = makeRelationChunkKey('z', 'a');
        const key2 = makeRelationChunkKey('a', 'z');
        expect(key1).toBe(key2);
        expect(key1.startsWith('a')).toBe(true);
    });
});

describe('Math Functions', () => {
    it('cosineSimilarity should return 1 for identical vectors', () => {
        const v = [1, 2, 3];
        expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('cosineSimilarity should return 0 for orthogonal vectors', () => {
        const v1 = [1, 0];
        const v2 = [0, 1];
        expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
    });

    it('cosineSimilarity should throw for different lengths', () => {
        expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });
});

describe('Async Utilities', () => {
    it('sleep should wait for specified time', async () => {
        const start = Date.now();
        await sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('retry should succeed on first try', async () => {
        let calls = 0;
        const result = await retry(async () => {
            calls++;
            return 'success';
        });
        expect(result).toBe('success');
        expect(calls).toBe(1);
    });

    it('retry should retry on failure', async () => {
        let calls = 0;
        const result = await retry(
            async () => {
                calls++;
                if (calls < 3) throw new Error('fail');
                return 'success';
            },
            3,
            10
        );
        expect(result).toBe('success');
        expect(calls).toBe(3);
    });

    it('retry should throw after max retries', async () => {
        let calls = 0;
        await expect(
            retry(
                async () => {
                    calls++;
                    throw new Error('always fail');
                },
                2,
                10
            )
        ).rejects.toThrow('always fail');
        expect(calls).toBe(2);
    });
});
