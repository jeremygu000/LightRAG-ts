import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { LightRAG } from './index.js';
import * as dotenv from 'dotenv';
import { logger } from './utils/index.js';

dotenv.config();

const app = new Hono();

// Global RAG instance
let rag: LightRAG | null = null;

async function getRag() {
    if (!rag) {
        rag = new LightRAG({
            workingDir: process.env.RAG_WORKING_DIR || './lightrag_data',
        });
        await rag.initialize();
    }
    return rag;
}

// Health Check
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Ingest Documents
 * POST /ingest
 * Body: {
 *   documents: Array<{ text: string, id?: string, filePath?: string }>,
 *   upsert?: boolean
 * }
 */
app.post('/ingest', async (c) => {
    const body = await c.req.json();
    const { documents, upsert = false } = body;

    if (!Array.isArray(documents) || documents.length === 0) {
        return c.json({ error: 'Invalid input: documents array required' }, 400);
    }

    const ragInstance = await getRag();
    let processedCount = 0;
    const errors: any[] = [];

    for (const doc of documents) {
        try {
            if (!doc.text) continue;

            // If upsert is requested and ID is provided, delete first
            if (upsert && doc.id) {
                const existing = await ragInstance.getDocumentStatus(doc.id);
                if (existing) {
                    logger.info(`[API] Upsert: Deleting existing document ${doc.id}`);
                    await ragInstance.deleteDocument(doc.id, { deleteChunks: true });
                }
            }

            // Insert document
            await ragInstance.insert(doc.text, {
                ids: doc.id ? [doc.id] : undefined,
                filePaths: doc.filePath ? [doc.filePath] : undefined,
            });

            processedCount++;
        } catch (err) {
            logger.error(`[API] Failed to ingest document: ${err}`);
            errors.push({ id: doc.id, error: String(err) });
        }
    }

    return c.json({
        message: `Processed ${processedCount} documents`,
        errors: errors.length > 0 ? errors : undefined,
    });
});

/**
 * Query
 * POST /query
 * Body: {
 *   query: string,
 *   mode?: 'local' | 'global' | 'hybrid' | 'naive' | 'mix',
 *   stream?: boolean,
 *   enableRerank?: boolean
 * }
 */
app.post('/query', async (c) => {
    const body = await c.req.json();
    const { query, mode = 'hybrid', stream = false, enableRerank = false } = body;

    if (!query) {
        return c.json({ error: 'Query is required' }, 400);
    }

    const ragInstance = await getRag();

    if (stream) {
        return streamText(c, async (stream) => {
            try {
                const result = await ragInstance.query(query, {
                    mode,
                    stream: true,
                    enableRerank,
                });

                if (typeof result.response !== 'string') {
                    for await (const chunk of result.response) {
                        await stream.write(chunk);
                    }
                } else {
                    await stream.write(result.response);
                }
            } catch (err) {
                logger.error(`[API] Query error: ${err}`);
                await stream.write(`[Error: ${String(err)}]`);
            }
        });
    } else {
        try {
            const result = await ragInstance.query(query, {
                mode,
                stream: false,
                enableRerank,
            });
            return c.json({
                response: result.response,
                context: result.context,
            });
        } catch (err: any) {
            return c.json({ error: String(err) }, 500);
        }
    }
});

/**
 * Delete Document
 * DELETE /documents/:id
 */
app.delete('/documents/:id', async (c) => {
    const id = c.req.param('id');
    const ragInstance = await getRag();

    try {
        const result = await ragInstance.deleteDocument(id, { deleteChunks: true });
        if (result.error) {
            return c.json({ error: result.error }, 404);
        }
        return c.json({ message: `Document ${id} deleted`, details: result });
    } catch (err: any) {
        return c.json({ error: String(err) }, 500);
    }
});

const port = Number(process.env.PORT) || 3000;
// Only serve if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(`Server is running on port ${port}`);
    serve({
        fetch: app.fetch,
        port,
    });
}

export { app };
