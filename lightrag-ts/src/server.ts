import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { cors } from 'hono/cors';
import { LightRAG } from './index.js';
import * as dotenv from 'dotenv';
import { logger, computeMdhashId } from './utils/index.js';

dotenv.config();

const app = new Hono();

// Enable CORS for WebUI
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Global RAG instance
let rag: LightRAG | null = null;

async function getRag() {
    if (!rag) {
        rag = new LightRAG({
            workingDir: process.env.RAG_WORKING_DIR || './lightrag_eval_db_data',
            namespace: process.env.RAG_NAMESPACE || 'eval_db_v3',
            kvStorage: 'redis',
            vectorStorage: 'qdrant',
            graphStorage: 'neo4j',
            redisConfig: {
                host: process.env.REDIS_HOST || 'localhost',
                port: Number(process.env.REDIS_PORT) || 6380,
            },
            qdrantConfig: {
                url: process.env.QDRANT_URL || 'http://localhost:6333',
            },
            neo4jConfig: {
                uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
                user: process.env.NEO4J_USER || 'neo4j',
                password: process.env.NEO4J_PASSWORD || 'password',
            },
        });
        await rag.initialize();
        logger.info('[Server] LightRAG initialized with DB storage');
    }
    return rag;
}

// ==================== WebUI Compatible Endpoints ====================

/**
 * Health Check - WebUI Format
 * GET /health
 */
app.get('/health', async (c) => {
    const ragInstance = await getRag();
    const status = await ragInstance.getPipelineStatus();

    return c.json({
        status: 'healthy',
        working_directory: ragInstance.getWorkingDir(),
        input_directory: ragInstance.getWorkingDir() + '/inputs',
        configuration: {
            llm_binding: 'openai',
            llm_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            embedding_binding: 'openai',
            embedding_model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
            kv_storage: 'redis',
            graph_storage: 'neo4j',
            vector_storage: 'qdrant',
            summary_language: 'English',
            enable_rerank: true,
        },
        core_version: '1.0.0-ts',
        api_version: '1.0.0',
        pipeline_busy: false,
        ...status,
    });
});

/**
 * Auth Status - WebUI Format (Guest Mode)
 * GET /auth-status
 */
app.get('/auth-status', (c) => {
    return c.json({
        auth_configured: false,
        access_token: 'guest-token',
        token_type: 'bearer',
        auth_mode: 'disabled',
        core_version: '1.0.0-ts',
        api_version: '1.0.0',
        webui_title: 'LightRAG TypeScript',
        webui_description: 'TypeScript implementation of LightRAG',
    });
});

/**
 * Query - WebUI Format
 * POST /query
 */
app.post('/query', async (c) => {
    const body = await c.req.json();
    const {
        query,
        mode = 'hybrid',
        stream = false,
        enable_rerank = false,
        top_k,
        only_need_context = false,
    } = body;

    if (!query) {
        return c.json({ error: 'Query is required' }, 400);
    }

    const ragInstance = await getRag();

    try {
        const result = await ragInstance.query(query, {
            mode,
            stream: false,
            enableRerank: enable_rerank,
            topK: top_k,
        });

        if (only_need_context) {
            return c.json({ response: result.context });
        }

        return c.json({ response: result.response });
    } catch (err: any) {
        logger.error(`[API] Query error: ${err}`);
        return c.json({ error: String(err) }, 500);
    }
});

/**
 * Query Stream - WebUI Format
 * POST /query/stream
 */
app.post('/query/stream', async (c) => {
    const body = await c.req.json();
    const { query, mode = 'hybrid', enable_rerank = false, top_k } = body;

    if (!query) {
        return c.json({ error: 'Query is required' }, 400);
    }

    const ragInstance = await getRag();

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Transfer-Encoding', 'chunked');

    return streamText(c, async (stream) => {
        try {
            const result = await ragInstance.query(query, {
                mode,
                stream: false, // We'll simulate streaming
                enableRerank: enable_rerank,
                topK: top_k,
            });

            // Send response in chunks (simulated streaming)
            const response = typeof result.response === 'string'
                ? result.response
                : 'No response';

            // Send as NDJSON
            await stream.write(JSON.stringify({ response }) + '\n');
        } catch (err) {
            logger.error(`[API] Stream error: ${err}`);
            await stream.write(JSON.stringify({ error: String(err) }) + '\n');
        }
    });
});

/**
 * Get Documents - WebUI Format
 * GET /documents
 */
app.get('/documents', async (c) => {
    const ragInstance = await getRag();
    const status = await ragInstance.getPipelineStatus();

    // Return mock structure for WebUI compatibility
    return c.json({
        statuses: {
            processed: [],
            pending: [],
            processing: [],
            failed: [],
        },
        total: status.documents,
    });
});

/**
 * Get Documents (Paginated) - WebUI Format
 * POST /documents/list
 */
app.post('/documents/list', async (c) => {
    const ragInstance = await getRag();
    const status = await ragInstance.getPipelineStatus();

    return c.json({
        documents: [],
        pagination: {
            page: 1,
            page_size: 10,
            total_count: status.documents,
            total_pages: Math.ceil(status.documents / 10),
            has_next: false,
            has_prev: false,
        },
        status_counts: {
            processed: status.documents,
            pending: 0,
            processing: 0,
            failed: 0,
        },
    });
});

/**
 * Insert Text - WebUI Format
 * POST /documents/text
 */
app.post('/documents/text', async (c) => {
    const body = await c.req.json();
    const { text } = body;

    if (!text) {
        return c.json({ error: 'Text is required' }, 400);
    }

    const ragInstance = await getRag();
    const docId = computeMdhashId(text, 'doc-');

    try {
        await ragInstance.insert(text, { ids: [docId] });
        return c.json({
            status: 'success',
            message: 'Document inserted successfully',
            doc_id: docId,
        });
    } catch (err: any) {
        logger.error(`[API] Insert error: ${err}`);
        return c.json({ status: 'failure', message: String(err) }, 500);
    }
});

/**
 * Insert Multiple Texts - WebUI Format
 * POST /documents/texts
 */
app.post('/documents/texts', async (c) => {
    const body = await c.req.json();
    const { texts } = body;

    if (!Array.isArray(texts) || texts.length === 0) {
        return c.json({ error: 'Texts array is required' }, 400);
    }

    const ragInstance = await getRag();
    const trackId = `track-${Date.now()}`;

    try {
        await ragInstance.insert(texts);
        return c.json({
            status: 'success',
            message: `Inserted ${texts.length} documents`,
            track_id: trackId,
        });
    } catch (err: any) {
        logger.error(`[API] Insert texts error: ${err}`);
        return c.json({ status: 'failure', message: String(err) }, 500);
    }
});

/**
 * Delete Document - WebUI Format
 * DELETE /documents/:id
 */
app.delete('/documents/:id', async (c) => {
    const id = c.req.param('id');
    const ragInstance = await getRag();

    try {
        const result = await ragInstance.deleteDocument(id, { deleteChunks: true });
        if (result.error) {
            return c.json({ status: 'not_allowed', message: result.error, doc_id: id }, 404);
        }
        return c.json({ status: 'deletion_started', message: 'Document deleted', doc_id: id });
    } catch (err: any) {
        return c.json({ status: 'failure', message: String(err), doc_id: id }, 500);
    }
});

/**
 * Get Knowledge Graph - WebUI Format
 * GET /graphs
 */
app.get('/graphs', async (c) => {
    const label = c.req.query('label') || '*';
    const maxDepth = Number(c.req.query('max_depth')) || 3;
    const maxNodes = Number(c.req.query('max_nodes')) || 100;

    const ragInstance = await getRag();

    try {
        const graph = await ragInstance.getKnowledgeGraph(label, maxDepth, maxNodes);

        // Transform to WebUI format
        const nodes = graph.nodes.map((n: any) => ({
            id: n.id || n.name,
            labels: [n.type || 'Entity'],
            properties: {
                name: n.name,
                description: n.description,
                ...n,
            },
        }));

        const edges = graph.edges.map((e: any) => ({
            id: `${e.source}-${e.target}`,
            source: e.source,
            target: e.target,
            type: e.type || 'RELATED_TO',
            properties: {
                description: e.description,
                ...e,
            },
        }));

        return c.json({ nodes, edges });
    } catch (err: any) {
        logger.error(`[API] Graph error: ${err}`);
        return c.json({ nodes: [], edges: [] });
    }
});

/**
 * Get Graph Labels - WebUI Format
 * GET /graph/label/list
 */
app.get('/graph/label/list', async (c) => {
    const ragInstance = await getRag();

    try {
        const graph = await ragInstance.getKnowledgeGraph('*', 1, 1000);
        const labels = [...new Set(graph.nodes.map((n: any) => n.name || n.id))];
        return c.json(labels.slice(0, 100));
    } catch {
        return c.json([]);
    }
});

/**
 * Get Popular Labels - WebUI Format
 * GET /graph/label/popular
 */
app.get('/graph/label/popular', async (c) => {
    const limit = Number(c.req.query('limit')) || 10;
    const ragInstance = await getRag();

    try {
        const graph = await ragInstance.getKnowledgeGraph('*', 1, 100);
        const labels = graph.nodes.map((n: any) => n.name || n.id).slice(0, limit);
        return c.json(labels);
    } catch {
        return c.json([]);
    }
});

/**
 * Search Labels - WebUI Format
 * GET /graph/label/search
 */
app.get('/graph/label/search', async (c) => {
    const query = c.req.query('q') || '';
    const limit = Number(c.req.query('limit')) || 10;
    const ragInstance = await getRag();

    try {
        const graph = await ragInstance.getKnowledgeGraph(query, 1, limit);
        return c.json(graph.nodes.map((n: any) => n.name || n.id));
    } catch {
        return c.json([]);
    }
});

/**
 * Pipeline Status - WebUI Format
 * GET /pipeline/status
 */
app.get('/pipeline/status', async (c) => {
    return c.json({
        autoscanned: false,
        busy: false,
        job_name: '',
        docs: 0,
        batchs: 0,
        cur_batch: 0,
        request_pending: false,
        latest_message: 'Ready',
    });
});

/**
 * Clear Documents - WebUI Format
 * POST /documents/clear
 */
app.post('/documents/clear', async (c) => {
    const ragInstance = await getRag();

    try {
        await ragInstance.drop();
        return c.json({ status: 'success', message: 'All documents cleared' });
    } catch (err: any) {
        return c.json({ status: 'failure', message: String(err) }, 500);
    }
});

// Keep legacy /ingest endpoint for backward compatibility
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

            if (upsert && doc.id) {
                const existing = await ragInstance.getDocumentStatus(doc.id);
                if (existing) {
                    await ragInstance.deleteDocument(doc.id, { deleteChunks: true });
                }
            }

            await ragInstance.insert(doc.text, {
                ids: doc.id ? [doc.id] : undefined,
                filePaths: doc.filePath ? [doc.filePath] : undefined,
            });

            processedCount++;
        } catch (err) {
            errors.push({ id: doc.id, error: String(err) });
        }
    }

    return c.json({
        message: `Processed ${processedCount} documents`,
        errors: errors.length > 0 ? errors : undefined,
    });
});

const port = Number(process.env.PORT) || 3000;

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(`Server is running on port ${port}`);
    console.log(`WebUI compatible API ready at http://localhost:${port}`);
    serve({
        fetch: app.fetch,
        port,
    });
}

export { app };
