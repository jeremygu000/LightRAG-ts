/**
 * Chunking Tests
 *
 * Unit tests for text chunking operations in operate/chunking.ts
 */

import { describe, it, expect } from 'vitest';
import { chunkingByTokenSize, addDocIdToChunks } from '../src/operate/chunking.js';
import { GPTTokenizer } from '../src/utils/index.js';

describe('chunkingByTokenSize', () => {
    const tokenizer = new GPTTokenizer();

    it('should create chunks from text', () => {
        const text = 'This is a test document with multiple sentences. It has enough content to potentially create multiple chunks. We want to verify that chunking works correctly.';
        const chunks = chunkingByTokenSize(tokenizer, text, {
            chunkTokenSize: 20,
            chunkOverlapTokenSize: 5,
        });

        expect(Array.isArray(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThan(0);
    });

    it('should preserve content', () => {
        const text = 'Hello world. This is a test.';
        const chunks = chunkingByTokenSize(tokenizer, text, {
            chunkTokenSize: 1000,
            chunkOverlapTokenSize: 0,
        });

        // With large chunk size, should have one chunk
        expect(chunks.length).toBe(1);
        expect(chunks[0].content).toContain('Hello world');
    });

    it('should track token counts', () => {
        const text = 'This is some text for testing.';
        const chunks = chunkingByTokenSize(tokenizer, text, {
            chunkTokenSize: 1000,
            chunkOverlapTokenSize: 0,
        });

        expect(chunks[0].tokens).toBeGreaterThan(0);
        expect(chunks[0].tokens).toBeLessThanOrEqual(1000);
    });

    it('should set chunk order index', () => {
        const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence.';
        const chunks = chunkingByTokenSize(tokenizer, text, {
            chunkTokenSize: 10,
            chunkOverlapTokenSize: 2,
        });

        if (chunks.length > 1) {
            expect(chunks[0].chunkOrderIndex).toBe(0);
            expect(chunks[1].chunkOrderIndex).toBe(1);
        }
    });

    it('should split by character when specified', () => {
        const text = 'Part1###Part2###Part3';
        const chunks = chunkingByTokenSize(tokenizer, text, {
            splitByCharacter: '###',
            chunkTokenSize: 1000,
            chunkOverlapTokenSize: 0,
        });

        expect(chunks.length).toBe(3);
        expect(chunks[0].content).toBe('Part1');
        expect(chunks[1].content).toBe('Part2');
        expect(chunks[2].content).toBe('Part3');
    });

    it('should handle empty text', () => {
        const chunks = chunkingByTokenSize(tokenizer, '', {
            chunkTokenSize: 100,
            chunkOverlapTokenSize: 10,
        });

        expect(chunks).toEqual([]);
    });
});

describe('addDocIdToChunks', () => {
    it('should add fullDocId to all chunks', () => {
        const chunks = [
            { content: 'chunk 1', tokens: 5, chunkOrderIndex: 0, fullDocId: '' },
            { content: 'chunk 2', tokens: 5, chunkOrderIndex: 1, fullDocId: '' },
        ];

        const result = addDocIdToChunks(chunks, 'doc-123');

        expect(result[0].fullDocId).toBe('doc-123');
        expect(result[1].fullDocId).toBe('doc-123');
    });

    it('should not mutate original chunks', () => {
        const chunks = [
            { content: 'chunk 1', tokens: 5, chunkOrderIndex: 0, fullDocId: '' },
        ];

        const result = addDocIdToChunks(chunks, 'doc-456');

        expect(chunks[0].fullDocId).toBe('');
        expect(result[0].fullDocId).toBe('doc-456');
    });

    it('should handle empty array', () => {
        const result = addDocIdToChunks([], 'doc-789');
        expect(result).toEqual([]);
    });
});
