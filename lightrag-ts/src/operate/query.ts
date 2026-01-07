/**
 * Query Pipeline Operations
 */

import type {
    QueryParam,
    QueryResult,
    QueryRawData,
    LLMFunction,
    ChatMessage,
} from '../types.js';
import type {
    BaseKVStorage,
    BaseVectorStorage,
    BaseGraphStorage,
    VectorQueryResult,
    GraphNode,
    GraphEdge,
} from '../storage/base.js';
import { PROMPTS, formatPrompt } from '../prompts.js';
import {
    DEFAULT_TOP_K,
    DEFAULT_MAX_ENTITY_TOKENS,
    DEFAULT_MAX_RELATION_TOKENS,
    GRAPH_FIELD_SEP,
} from '../constants.js';
import {
    logger,
    splitStringByMultiMarkers,
    truncateListByTokenSize,
    GPTTokenizer,
    parseJsonFromLlmResponse,
} from '../utils/index.js';
import { aliyunRerank } from '../rerank.js';

// ==================== Types ====================

interface QueryContext {
    entities: Array<{
        name: string;
        type: string;
        description: string;
        rank?: number;
    }>;
    relations: Array<{
        source: string;
        target: string;
        description: string;
        keywords?: string;
        rank?: number;
    }>;
    chunks: Array<{
        content: string;
        filePath: string;
        chunkId: string;
        referenceId?: number;
    }>;
}

// ==================== Keyword Extraction ====================

/**
 * Extract high-level and low-level keywords from query
 */
export async function extractKeywords(
    query: string,
    llmFunc: LLMFunction,
    language: string = 'English'
): Promise<{ highLevel: string[]; lowLevel: string[] }> {
    const prompt = formatPrompt(PROMPTS.keywordsExtraction, {
        query,
        language,
    });

    try {
        const response = await llmFunc(prompt);

        // Parse JSON response
        const parsed = parseJsonFromLlmResponse(response) as {
            high_level_keywords?: string[];
            low_level_keywords?: string[];
        } | null;

        if (!parsed) {
            logger.warn(`Failed to extract JSON from keyword response. Raw response: ${response.substring(0, 200)}...`);
            return { highLevel: [], lowLevel: [] };
        }

        return {
            highLevel: parsed.high_level_keywords || [],
            lowLevel: parsed.low_level_keywords || [],
        };
    } catch (error) {
        logger.error(`Keyword extraction failed: ${error}`);
        return { highLevel: [], lowLevel: [] };
    }
}

// ==================== Entity/Relation Search ====================

/**
 * Search entities from vector database
 */
async function searchEntities(
    query: string,
    entitiesVdb: BaseVectorStorage,
    graphStorage: BaseGraphStorage,
    topK: number,
    threshold?: number
): Promise<Array<GraphNode & { entityName: string; rank: number }>> {
    let results = await entitiesVdb.query(query, topK);

    if (threshold !== undefined) {
        results = results.filter(r => r.score >= threshold);
    }

    if (results.length === 0) {
        return [];
    }

    // Get node data from graph
    const nodeIds = results.map(r => r.data.metadata?.entity_name as string).filter(Boolean);
    const nodesMap = await graphStorage.getNodesBatch(nodeIds);
    const degreesMap = await graphStorage.nodeDegreesBatch(nodeIds);

    // Combine results
    const entities: Array<GraphNode & { entityName: string; rank: number }> = [];

    for (const result of results) {
        const entityName = result.data.metadata?.entity_name as string;
        if (!entityName) continue;

        const node = nodesMap.get(entityName);
        if (!node) continue;

        entities.push({
            ...node,
            entityName,
            rank: degreesMap.get(entityName) || 0,
        });
    }

    return entities;
}

/**
 * Get related edges for entities
 */
interface ExtendedEdge extends GraphEdge {
    srcTgt: [string, string];
    rank: number;
}

async function getRelatedEdges(
    entities: Array<{ entityName: string }>,
    graphStorage: BaseGraphStorage
): Promise<ExtendedEdge[]> {
    const nodeNames = entities.map(e => e.entityName);
    const seen = new Set<string>();
    const allEdges: Array<[string, string]> = [];

    // Collect unique edges
    for (const nodeName of nodeNames) {
        const edges = await graphStorage.getNodeEdges(nodeName);
        if (edges) {
            for (const [src, tgt] of edges) {
                const key = [src, tgt].sort().join('||');
                if (!seen.has(key)) {
                    seen.add(key);
                    allEdges.push([src, tgt]);
                }
            }
        }
    }

    // Get edge data and degrees
    const edgePairs = allEdges.map(([src, tgt]) => ({ src, tgt }));
    const edgesMap = await graphStorage.getEdgesBatch(edgePairs);

    const result: ExtendedEdge[] = [];

    for (const [src, tgt] of allEdges) {
        const key = `${src}||${tgt}`;
        const edge = edgesMap.get(key);
        if (edge) {
            const degree = await graphStorage.edgeDegree(src, tgt);
            result.push({
                ...edge,
                srcTgt: [src, tgt],
                rank: degree,
                weight: (edge.weight as number) || 1,
            });
        }
    }

    // Sort by rank and weight
    result.sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        return (b.weight as number || 1) - (a.weight as number || 1);
    });

    return result;
}

// ==================== Chunk Retrieval ====================

/**
 * Get chunks related to entities
 */
async function getEntityChunks(
    entities: Array<{ entityName: string; source_id?: string }>,
    chunksKv: BaseKVStorage<unknown>
): Promise<Array<{ content: string; filePath: string; chunkId: string }>> {
    const chunkIds = new Set<string>();

    for (const entity of entities) {
        const sourceId = entity.source_id as string;
        if (sourceId) {
            const ids = splitStringByMultiMarkers(sourceId, [GRAPH_FIELD_SEP]);
            for (const id of ids) {
                chunkIds.add(id);
            }
        }
    }

    if (chunkIds.size === 0) {
        return [];
    }

    const chunks = await chunksKv.getByIds(Array.from(chunkIds));
    return chunks.map((chunk, i) => ({
        content: (chunk as { content?: string }).content || '',
        filePath: (chunk as { file_path?: string }).file_path || 'unknown',
        chunkId: Array.from(chunkIds)[i],
    })).filter(c => c.content);
}

/**
 * Search chunks directly from vector database (naive mode)
 */
async function searchChunks(
    query: string,
    chunksVdb: BaseVectorStorage | undefined,
    topK: number,
    threshold?: number
): Promise<VectorQueryResult[]> {
    if (!chunksVdb) {
        return [];
    }
    let results = await chunksVdb.query(query, topK);
    if (threshold !== undefined) {
        results = results.filter(r => r.score >= threshold);
    }
    return results;
}

// ==================== Context Building ====================

/**
 * Build query context from search results
 */
function buildQueryContext(
    entities: Array<GraphNode & { entityName: string; rank: number }>,
    relations: ExtendedEdge[],
    chunks: Array<{ content: string; filePath: string; chunkId: string }>,
    param: QueryParam
): QueryContext {
    const tokenizer = new GPTTokenizer();
    const maxEntityTokens = param.maxEntityTokens || DEFAULT_MAX_ENTITY_TOKENS;
    const maxRelationTokens = param.maxRelationTokens || DEFAULT_MAX_RELATION_TOKENS;

    // Truncate entities by token limit
    const truncatedEntities = truncateListByTokenSize(
        entities.map(e => ({
            name: e.entityName,
            type: (e.entity_type as string) || 'unknown',
            description: (e.description as string) || '',
            rank: e.rank,
        })),
        e => JSON.stringify(e),
        maxEntityTokens,
        tokenizer
    );

    // Truncate relations by token limit
    const truncatedRelations = truncateListByTokenSize(
        relations.map(r => ({
            source: r.srcTgt[0],
            target: r.srcTgt[1],
            description: (r.description as string) || '',
            keywords: (r.keywords as string) || '',
            rank: r.rank,
        })),
        r => JSON.stringify(r),
        maxRelationTokens,
        tokenizer
    );

    // Add reference IDs to chunks
    const chunksWithRef = chunks.map((chunk, i) => ({
        ...chunk,
        referenceId: i + 1,
    }));

    return {
        entities: truncatedEntities,
        relations: truncatedRelations,
        chunks: chunksWithRef,
    };
}

/**
 * Build LLM prompt from context
 */
function buildPrompt(
    query: string,
    context: QueryContext,
    param: QueryParam,
    isNaive: boolean = false
): string {
    const entitiesStr = context.entities.length > 0
        ? context.entities.map(e => JSON.stringify(e)).join('\n')
        : 'No entities found.';

    const relationsStr = context.relations.length > 0
        ? context.relations.map(r => JSON.stringify(r)).join('\n')
        : 'No relationships found.';

    const chunksStr = context.chunks.length > 0
        ? context.chunks.map(c => JSON.stringify({
            reference_id: c.referenceId,
            content: c.content,
        })).join('\n')
        : 'No document chunks found.';

    const referenceListStr = context.chunks
        .map(c => `[${c.referenceId}] ${c.filePath}`)
        .join('\n');

    if (isNaive) {
        const contextData = formatPrompt(PROMPTS.naiveQueryContext, {
            text_chunks_str: chunksStr,
            reference_list_str: referenceListStr,
        });

        return formatPrompt(PROMPTS.naiveRagResponse, {
            content_data: contextData,
        });
    }

    const contextData = formatPrompt(PROMPTS.kgQueryContext, {
        entities_str: entitiesStr,
        relations_str: relationsStr,
        text_chunks_str: chunksStr,
        reference_list_str: referenceListStr,
    });

    return formatPrompt(PROMPTS.ragResponse, {
        context_data: contextData,
        response_type: param.responseType || 'Multiple Paragraphs',
        user_prompt: param.userPrompt || '',
    });
}

// ==================== Main Query Function ====================

/**
 * Execute knowledge graph query
 */
export async function kgQuery(
    query: string,
    graphStorage: BaseGraphStorage,
    entitiesVdb: BaseVectorStorage,
    relationsVdb: BaseVectorStorage,
    chunksKv: BaseKVStorage<unknown>,
    llmFunc: LLMFunction,
    param: QueryParam,
    chunksVdb?: BaseVectorStorage
): Promise<QueryResult> {
    const topK = param.topK || DEFAULT_TOP_K;
    const mode = param.mode;

    logger.info(`KG Query: mode=${mode}, topK=${topK}`);

    // Extract keywords if not provided
    let hlKeywords = param.hlKeywords || [];
    let llKeywords = param.llKeywords || [];

    if (hlKeywords.length === 0 && llKeywords.length === 0) {
        const extracted = await extractKeywords(query, llmFunc);
        hlKeywords = extracted.highLevel;
        llKeywords = extracted.lowLevel;
    }

    // Build search query
    const searchQuery = [...hlKeywords, ...llKeywords, query].join(' ');

    // Initialize results
    let entities: Array<GraphNode & { entityName: string; rank: number }> = [];
    let relations: ExtendedEdge[] = [];
    let chunks: Array<{ content: string; filePath: string; chunkId: string }> = [];

    // Mode-specific search
    if (mode === 'naive' || mode === 'mix') {
        // Direct chunk search
        const vectorResults = await searchChunks(query, chunksVdb, topK, param.cosSimThreshold);
        chunks = vectorResults.map(r => ({
            content: r.data.content || '',
            filePath: (r.data.metadata?.file_path as string) || 'unknown',
            chunkId: r.id,
        }));
    }

    if (mode === 'local' || mode === 'hybrid' || mode === 'mix') {
        // Entity search
        entities = await searchEntities(searchQuery, entitiesVdb, graphStorage, topK, param.cosSimThreshold);

        // Get related chunks
        const entityChunks = await getEntityChunks(entities, chunksKv);
        chunks = [...chunks, ...entityChunks];
    }

    if (mode === 'global' || mode === 'hybrid' || mode === 'mix') {
        // Relation-based search
        if (entities.length === 0) {
            entities = await searchEntities(searchQuery, entitiesVdb, graphStorage, topK, param.cosSimThreshold);
        }
        relations = await getRelatedEdges(entities, graphStorage);
    }

    // Bypass mode - return fail response immediately
    if (mode === 'bypass') {
        return {
            response: PROMPTS.failResponse,
            context: '',
            rawData: {
                entities: [],
                relationships: [],
                chunks: [],
                references: [],
                metadata: { queryMode: mode },
            },
        };
    }

    // Deduplicate chunks
    const seenChunkIds = new Set<string>();
    chunks = chunks.filter(c => {
        if (seenChunkIds.has(c.chunkId)) return false;
        seenChunkIds.add(c.chunkId);
        return true;
    });

    // Apply reranking if enabled
    if (param.enableRerank && chunks.length > 1) {
        logger.info(`Reranking ${chunks.length} chunks...`);
        try {
            const chunkContents = chunks.map(c => c.content);
            const rerankResults = await aliyunRerank(query, chunkContents, {
                apiKey: process.env.OPENAI_API_KEY,
                topN: param.topK || DEFAULT_TOP_K,
                model: process.env.RERANK_MODEL || 'gte-rerank',
            });

            // Filter by minRerankScore if provided
            const threshold = param.minRerankScore ?? 0.1;
            const filteredIndices = rerankResults
                .filter(r => r.relevanceScore >= threshold)
                .map(r => r.index);

            // Reorder chunks based on rerank scores
            const rerankedChunks = filteredIndices.map(i => chunks[i]);
            chunks = rerankedChunks;
            logger.info(`Reranking complete: ${chunks.length} chunks after filtering (threshold=${threshold})`);
        } catch (error) {
            logger.warn(`Reranking failed, using original order: ${error}`);
        }
    }

    // Build context
    const context = buildQueryContext(entities, relations, chunks, param);

    // Check if we have any results
    if (context.entities.length === 0 && context.relations.length === 0 && context.chunks.length === 0) {
        return {
            response: PROMPTS.failResponse,
            context: '',
            rawData: {
                entities: [],
                relationships: [],
                chunks: [],
                references: [],
                metadata: {
                    queryMode: mode,
                    keywords: { highLevel: hlKeywords, lowLevel: llKeywords },
                },
            },
        };
    }

    // Only need context?
    if (param.onlyNeedContext) {
        const rawData: QueryRawData = {
            entities: context.entities,
            relationships: context.relations.map(r => ({
                source: r.source,
                target: r.target,
                description: r.description,
            })),
            chunks: context.chunks.map(c => ({
                content: c.content,
                filePath: c.filePath,
            })),
            references: context.chunks.map(c => ({
                id: c.referenceId!,
                filePath: c.filePath,
            })),
            metadata: {
                queryMode: mode,
                keywords: { highLevel: hlKeywords, lowLevel: llKeywords },
            },
        };

        return {
            response: '',
            context: buildPrompt(query, context, param, mode === 'naive'),
            rawData,
        };
    }

    // Build and execute prompt
    const systemPrompt = buildPrompt(query, context, param, mode === 'naive');

    // Build history messages
    const historyMessages: ChatMessage[] = param.conversationHistory || [];

    const response = await llmFunc(query, {
        systemPrompt,
        historyMessages,
    });

    // Build raw data
    const rawData: QueryRawData = {
        entities: context.entities,
        relationships: context.relations.map(r => ({
            source: r.source,
            target: r.target,
            description: r.description,
        })),
        chunks: context.chunks.map(c => ({
            content: c.content,
            filePath: c.filePath,
        })),
        references: context.chunks.map(c => ({
            id: c.referenceId!,
            filePath: c.filePath,
        })),
        metadata: {
            queryMode: mode,
            keywords: { highLevel: hlKeywords, lowLevel: llKeywords },
        },
    };

    return {
        response,
        context: systemPrompt,
        rawData,
    };
}
