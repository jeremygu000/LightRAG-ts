/**
 * Storage Tests
 *
 * Unit tests for storage implementations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { JsonKVStorage, MemoryVectorStorage, MemoryGraphStorage } from '../src/storage/index.js';
import { DocStatusStorage } from '../src/storage/doc-status.js';

const TEST_DIR = './test_data_tmp';

describe('JsonKVStorage', () => {
    let storage: JsonKVStorage<{ name: string; value: number }>;

    beforeEach(async () => {
        storage = new JsonKVStorage({
            workingDir: TEST_DIR,
            namespace: 'test',
            storageName: 'kv_test',
        });
        await storage.initialize();
    });

    afterEach(async () => {
        await storage.drop();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it('should upsert and retrieve data', async () => {
        await storage.upsert({
            'key1': { name: 'test', value: 42 },
        });

        const result = await storage.getById('key1');
        expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('should return null for non-existent key', async () => {
        const result = await storage.getById('nonexistent');
        expect(result).toBeNull();
    });

    it('should delete data', async () => {
        await storage.upsert({
            'key1': { name: 'test', value: 1 },
        });

        await storage.delete(['key1']);
        const result = await storage.getById('key1');
        expect(result).toBeNull();
    });

    it('should filter non-existing keys', async () => {
        await storage.upsert({
            'existing': { name: 'test', value: 1 },
        });

        const keys = new Set(['existing', 'nonexistent']);
        const filtered = await storage.filterKeys(keys);

        expect(filtered.has('nonexistent')).toBe(true);
        expect(filtered.has('existing')).toBe(false);
    });
});

describe('MemoryVectorStorage', () => {
    let storage: MemoryVectorStorage;

    beforeEach(async () => {
        storage = new MemoryVectorStorage({
            workingDir: TEST_DIR,
            namespace: 'test',
            storageName: 'vector_test',
        });
        await storage.initialize();
    });

    afterEach(async () => {
        await storage.drop();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it('should upsert and retrieve vectors', async () => {
        await storage.upsert({
            'vec1': {
                id: 'vec1',
                embedding: [1, 0, 0],
                content: 'test vector',
                metadata: { type: 'test' },
            },
        });

        const result = await storage.getById('vec1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('vec1');
        expect(result?.content).toBe('test vector');
    });

    it('should delete vectors', async () => {
        await storage.upsert({
            'vec1': {
                id: 'vec1',
                embedding: [1, 0, 0],
                content: 'test',
            },
        });

        await storage.delete(['vec1']);
        const result = await storage.getById('vec1');
        expect(result).toBeNull();
    });
});

describe('MemoryGraphStorage', () => {
    let storage: MemoryGraphStorage;

    beforeEach(async () => {
        storage = new MemoryGraphStorage({
            workingDir: TEST_DIR,
            namespace: 'test',
            storageName: 'graph_test',
        });
        await storage.initialize();
    });

    afterEach(async () => {
        await storage.drop();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it('should upsert and retrieve nodes', async () => {
        await storage.upsertNode('entity1', {
            entity_type: 'Person',
            description: 'A test entity',
        });

        const node = await storage.getNode('entity1');
        expect(node).not.toBeNull();
        expect(node?.entity_type).toBe('Person');
    });

    it('should check node existence', async () => {
        await storage.upsertNode('entity1', { entity_type: 'Test' });

        expect(await storage.hasNode('entity1')).toBe(true);
        expect(await storage.hasNode('nonexistent')).toBe(false);
    });

    it('should upsert and retrieve edges', async () => {
        await storage.upsertNode('A', { entity_type: 'Test' });
        await storage.upsertNode('B', { entity_type: 'Test' });
        await storage.upsertEdge('A', 'B', {
            weight: 1.0,
            description: 'A relates to B',
        });

        const edge = await storage.getEdge('A', 'B');
        expect(edge).not.toBeNull();
        expect(edge?.weight).toBe(1.0);
    });

    it('should track node degree', async () => {
        await storage.upsertNode('A', { entity_type: 'Test' });
        await storage.upsertNode('B', { entity_type: 'Test' });
        await storage.upsertNode('C', { entity_type: 'Test' });
        await storage.upsertEdge('A', 'B', { weight: 1 });
        await storage.upsertEdge('A', 'C', { weight: 1 });

        const degree = await storage.nodeDegree('A');
        expect(degree).toBe(2);
    });

    it('should delete nodes', async () => {
        await storage.upsertNode('entity1', { entity_type: 'Test' });
        await storage.deleteNode('entity1');

        expect(await storage.hasNode('entity1')).toBe(false);
    });

    it('should get all nodes', async () => {
        await storage.upsertNode('A', { entity_type: 'Test' });
        await storage.upsertNode('B', { entity_type: 'Test' });

        const nodes = await storage.getAllNodes();
        expect(nodes.length).toBe(2);
    });
});

describe('DocStatusStorage', () => {
    let storage: DocStatusStorage;

    beforeEach(async () => {
        storage = new DocStatusStorage({
            workingDir: TEST_DIR,
            namespace: 'test',
        });
        await storage.initialize();
    });

    afterEach(async () => {
        await storage.drop();
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch {
            // Ignore
        }
    });

    it('should track document status', async () => {
        await storage.upsert({
            'doc1': {
                contentSummary: 'Test document',
                contentLength: 100,
                filePath: '/test/doc.txt',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        });

        const status = await storage.getById('doc1');
        expect(status).not.toBeNull();
        expect(status?.status).toBe('pending');
    });

    it('should mark document as processed', async () => {
        await storage.upsert({
            'doc1': {
                contentSummary: 'Test',
                contentLength: 50,
                filePath: '/test.txt',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        });

        await storage.markProcessed('doc1', 5, ['chunk1', 'chunk2']);

        const status = await storage.getById('doc1');
        expect(status?.status).toBe('processed');
        expect(status?.chunksCount).toBe(5);
    });

    it('should get documents by status', async () => {
        await storage.upsert({
            'doc1': {
                contentSummary: 'Test 1',
                contentLength: 50,
                filePath: '/test1.txt',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            'doc2': {
                contentSummary: 'Test 2',
                contentLength: 50,
                filePath: '/test2.txt',
                status: 'processed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        });

        const pending = await storage.getPending();
        expect(pending.length).toBe(1);
        expect(pending[0][0]).toBe('doc1');
    });
});
