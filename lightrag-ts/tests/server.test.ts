import { describe, it, expect, vi } from 'vitest';
import { app } from '../src/server.js';

// Mock dependencies
vi.mock('../src/index.js', () => {
    return {
        LightRAG: vi.fn().mockImplementation(() => ({
            initialize: vi.fn().mockResolvedValue(undefined),
            insert: vi.fn().mockResolvedValue(undefined),
            query: vi.fn().mockResolvedValue({
                response: 'Test response',
                context: 'Test context'
            }),
            getDocumentStatus: vi.fn().mockResolvedValue(null),
            deleteDocument: vi.fn().mockResolvedValue({
                historyMessages: ['Document deleted']
            }),
        })),
    };
});

// Since we mock LightRAG, we don't need real environment variables
// But LightRAG constructor might check them
process.env.RAG_WORKING_DIR = './test_data';

describe('API Server', () => {

    it('GET /health returns 200', async () => {
        const res = await app.request('/health');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
            status: 'ok',
            timestamp: expect.any(String),
        });
    });

    it('POST /ingest handles document insertion', async () => {
        const res = await app.request('/ingest', {
            method: 'POST',
            body: JSON.stringify({
                documents: [{ text: 'Hello world', id: 'doc1' }]
            }),
        });
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.message).toContain('Processed 1 documents');
    });

    it('POST /ingest with upsert triggers logic', async () => {
        const res = await app.request('/ingest', {
            method: 'POST',
            body: JSON.stringify({
                documents: [{ text: 'Hello world', id: 'doc1' }],
                upsert: true
            }),
        });
        expect(res.status).toBe(200);
    });

    it('POST /query handles requests', async () => {
        const res = await app.request('/query', {
            method: 'POST',
            body: JSON.stringify({
                query: 'test query'
            }),
        });
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.response).toBe('Test response');
    });

    it('DELETE /documents/:id', async () => {
        const res = await app.request('/documents/doc1', {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
    });
});
