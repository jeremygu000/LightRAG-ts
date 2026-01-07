/**
 * Rerank Tests
 *
 * Unit tests for rerank functionality
 */

import { describe, it, expect } from 'vitest';
import {
    chunkDocumentsForRerank,
    aggregateChunkScores,
    createRerankFunction,
} from '../src/rerank.js';
import type { RerankResult } from '../src/rerank.js';

describe('chunkDocumentsForRerank', () => {
    it('should not chunk short documents', () => {
        const docs = ['Short doc 1', 'Short doc 2', 'Short doc 3'];
        const { chunkedDocs, docIndices } = chunkDocumentsForRerank(docs, 100, 10);

        expect(chunkedDocs.length).toBe(3);
        expect(docIndices).toEqual([0, 1, 2]);
    });

    it('should chunk long documents', () => {
        // Create a long document by repeating text
        const longText = 'This is a test sentence. '.repeat(100);
        const docs = ['Short doc', longText];

        const { chunkedDocs, docIndices } = chunkDocumentsForRerank(docs, 20, 5);

        // Should have more chunks than original docs
        expect(chunkedDocs.length).toBeGreaterThan(2);
        // First chunk should map to index 0
        expect(docIndices[0]).toBe(0);
        // Subsequent chunks should map to index 1
        expect(docIndices.filter(i => i === 1).length).toBeGreaterThan(1);
    });

    it('should handle empty documents array', () => {
        const { chunkedDocs, docIndices } = chunkDocumentsForRerank([], 100, 10);

        expect(chunkedDocs).toEqual([]);
        expect(docIndices).toEqual([]);
    });

    it('should clamp overlap to prevent infinite loop', () => {
        const docs = ['Some text here'];
        // overlap >= maxTokens would cause infinite loop without clamping
        const { chunkedDocs, docIndices } = chunkDocumentsForRerank(docs, 10, 100);

        expect(chunkedDocs.length).toBeGreaterThan(0);
        expect(docIndices.length).toBeGreaterThan(0);
    });
});

describe('aggregateChunkScores', () => {
    it('should aggregate with max strategy', () => {
        const chunkResults: RerankResult[] = [
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.9 },  // chunk 1 of doc 0
            { index: 2, relevanceScore: 0.5 },  // chunk 0 of doc 1
            { index: 3, relevanceScore: 0.7 },  // chunk 1 of doc 1
        ];
        const docIndices = [0, 0, 1, 1];  // maps chunks to original docs

        const results = aggregateChunkScores(chunkResults, docIndices, 2, 'max');

        expect(results.length).toBe(2);
        // Doc 0 should have max of 0.8 and 0.9 = 0.9
        const doc0 = results.find(r => r.index === 0);
        expect(doc0?.relevanceScore).toBe(0.9);
        // Doc 1 should have max of 0.5 and 0.7 = 0.7
        const doc1 = results.find(r => r.index === 1);
        expect(doc1?.relevanceScore).toBe(0.7);
    });

    it('should aggregate with mean strategy', () => {
        const chunkResults: RerankResult[] = [
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.6 },
        ];
        const docIndices = [0, 0];

        const results = aggregateChunkScores(chunkResults, docIndices, 1, 'mean');

        expect(results.length).toBe(1);
        expect(results[0].relevanceScore).toBeCloseTo(0.7, 5);
    });

    it('should aggregate with first strategy', () => {
        const chunkResults: RerankResult[] = [
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.9 },
        ];
        const docIndices = [0, 0];

        const results = aggregateChunkScores(chunkResults, docIndices, 1, 'first');

        expect(results.length).toBe(1);
        expect(results[0].relevanceScore).toBe(0.8);
    });

    it('should sort results by score descending', () => {
        const chunkResults: RerankResult[] = [
            { index: 0, relevanceScore: 0.5 },
            { index: 1, relevanceScore: 0.9 },
            { index: 2, relevanceScore: 0.7 },
        ];
        const docIndices = [0, 1, 2];

        const results = aggregateChunkScores(chunkResults, docIndices, 3, 'max');

        expect(results[0].index).toBe(1);  // 0.9
        expect(results[1].index).toBe(2);  // 0.7
        expect(results[2].index).toBe(0);  // 0.5
    });

    it('should handle empty chunk results', () => {
        const results = aggregateChunkScores([], [], 0, 'max');
        expect(results).toEqual([]);
    });
});

describe('createRerankFunction', () => {
    it('should return null for null binding', () => {
        const fn = createRerankFunction({ binding: 'null' });
        expect(fn).toBeNull();
    });

    it('should create cohere function', () => {
        const fn = createRerankFunction({
            binding: 'cohere',
            apiKey: 'test-key',
        });
        expect(fn).not.toBeNull();
        expect(typeof fn).toBe('function');
    });

    it('should create jina function', () => {
        const fn = createRerankFunction({
            binding: 'jina',
            apiKey: 'test-key',
        });
        expect(fn).not.toBeNull();
    });

    it('should create aliyun function', () => {
        const fn = createRerankFunction({
            binding: 'aliyun',
            apiKey: 'test-key',
        });
        expect(fn).not.toBeNull();
    });
});
