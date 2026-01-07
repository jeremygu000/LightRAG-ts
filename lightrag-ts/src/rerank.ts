/**
 * Rerank Module
 *
 * Document reranking functionality using various providers:
 * - Cohere (and vLLM compatible)
 * - Jina AI
 * - Aliyun DashScope
 *
 * @module rerank
 */

import { logger, retry, GPTTokenizer } from './utils/index.js';

// ==================== Types ====================

/**
 * Rerank result for a single document.
 */
export interface RerankResult {
    /** Original document index */
    index: number;
    /** Relevance score from reranker */
    relevanceScore: number;
}

/**
 * Rerank function signature.
 */
export type RerankFunction = (
    query: string,
    documents: string[],
    options?: RerankOptions
) => Promise<RerankResult[]>;

/**
 * Options for rerank operations.
 */
export interface RerankOptions {
    /** Number of top results to return */
    topN?: number;
    /** API key for the rerank service */
    apiKey?: string;
    /** Model name to use */
    model?: string;
    /** Base URL for the API */
    baseUrl?: string;
    /** Enable document chunking for long documents */
    enableChunking?: boolean;
    /** Maximum tokens per document for chunking */
    maxTokensPerDoc?: number;
    /** Score aggregation strategy for chunked documents */
    aggregation?: 'max' | 'mean' | 'first';
}

/**
 * Configuration for creating a rerank function.
 */
export interface RerankConfig {
    /** Rerank provider binding */
    binding: 'cohere' | 'jina' | 'aliyun' | 'null';
    /** API key */
    apiKey?: string;
    /** Model name */
    model?: string;
    /** Base URL override */
    baseUrl?: string;
    /** Request timeout in ms */
    timeout?: number;
}

// ==================== Document Chunking ====================

/**
 * Chunk documents that exceed token limit for reranking.
 *
 * @param documents - List of document strings to chunk
 * @param maxTokens - Maximum tokens per chunk (default 480)
 * @param overlapTokens - Number of tokens to overlap between chunks
 * @returns Tuple of [chunked documents, original doc indices]
 */
export function chunkDocumentsForRerank(
    documents: string[],
    maxTokens: number = 480,
    overlapTokens: number = 32
): { chunkedDocs: string[]; docIndices: number[] } {
    // Clamp overlap to prevent infinite loop
    if (overlapTokens >= maxTokens) {
        const originalOverlap = overlapTokens;
        overlapTokens = Math.max(0, maxTokens - 1);
        logger.warn(
            `overlap_tokens (${originalOverlap}) must be less than max_tokens (${maxTokens}). ` +
            `Clamping to ${overlapTokens}`
        );
    }

    const tokenizer = new GPTTokenizer();
    const chunkedDocs: string[] = [];
    const docIndices: number[] = [];

    for (let idx = 0; idx < documents.length; idx++) {
        const doc = documents[idx];
        const tokens = tokenizer.encode(doc);

        if (tokens.length <= maxTokens) {
            // Document fits in one chunk
            chunkedDocs.push(doc);
            docIndices.push(idx);
        } else {
            // Split into overlapping chunks
            let start = 0;
            while (start < tokens.length) {
                const end = Math.min(start + maxTokens, tokens.length);
                const chunkTokens = tokens.slice(start, end);
                const chunkText = tokenizer.decode(chunkTokens);
                chunkedDocs.push(chunkText);
                docIndices.push(idx);

                if (end >= tokens.length) break;
                start = end - overlapTokens;
            }
        }
    }

    return { chunkedDocs, docIndices };
}

/**
 * Aggregate rerank scores from document chunks back to original documents.
 *
 * @param chunkResults - Rerank results for chunks
 * @param docIndices - Maps each chunk index to original document index
 * @param numOriginalDocs - Total number of original documents
 * @param aggregation - Strategy for aggregating scores
 * @returns Aggregated results for original documents
 */
export function aggregateChunkScores(
    chunkResults: RerankResult[],
    docIndices: number[],
    numOriginalDocs: number,
    aggregation: 'max' | 'mean' | 'first' = 'max'
): RerankResult[] {
    // Group scores by original document index
    const docScores: Map<number, number[]> = new Map();
    for (let i = 0; i < numOriginalDocs; i++) {
        docScores.set(i, []);
    }

    for (const result of chunkResults) {
        const chunkIdx = result.index;
        const score = result.relevanceScore;

        if (chunkIdx >= 0 && chunkIdx < docIndices.length) {
            const originalDocIdx = docIndices[chunkIdx];
            const scores = docScores.get(originalDocIdx) || [];
            scores.push(score);
            docScores.set(originalDocIdx, scores);
        }
    }

    // Aggregate scores
    const aggregatedResults: RerankResult[] = [];
    for (const [docIdx, scores] of docScores.entries()) {
        if (scores.length === 0) continue;

        let finalScore: number;
        if (aggregation === 'max') {
            finalScore = Math.max(...scores);
        } else if (aggregation === 'mean') {
            finalScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        } else if (aggregation === 'first') {
            finalScore = scores[0];
        } else {
            logger.warn(`Unknown aggregation strategy: ${aggregation}, using max`);
            finalScore = Math.max(...scores);
        }

        aggregatedResults.push({
            index: docIdx,
            relevanceScore: finalScore,
        });
    }

    // Sort by relevance score (descending)
    aggregatedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return aggregatedResults;
}

// ==================== Generic Rerank API ====================

/**
 * Generic rerank API call supporting multiple providers.
 */
async function genericRerankApi(
    query: string,
    documents: string[],
    options: {
        model: string;
        baseUrl: string;
        apiKey?: string;
        topN?: number;
        returnDocuments?: boolean;
        responseFormat: 'standard' | 'aliyun';
        requestFormat: 'standard' | 'aliyun';
        enableChunking?: boolean;
        maxTokensPerDoc?: number;
        aggregation?: 'max' | 'mean' | 'first';
    }
): Promise<RerankResult[]> {
    const {
        model,
        baseUrl,
        apiKey,
        topN,
        responseFormat,
        requestFormat,
        enableChunking = false,
        maxTokensPerDoc = 480,
        aggregation = 'max',
    } = options;

    if (!baseUrl) {
        throw new Error('Base URL is required for rerank API');
    }

    // Handle document chunking if enabled
    let processedDocs = documents;
    let docIndices: number[] | null = null;
    let originalTopN = topN;

    if (enableChunking) {
        const result = chunkDocumentsForRerank(documents, maxTokensPerDoc);
        processedDocs = result.chunkedDocs;
        docIndices = result.docIndices;
        logger.debug(`Chunked ${documents.length} documents into ${processedDocs.length} chunks`);
        // Disable API-level topN to get all chunk scores for proper aggregation
        originalTopN = topN;
    }

    // Build request payload
    let payload: Record<string, unknown>;

    if (requestFormat === 'aliyun') {
        // Aliyun format: nested input/parameters structure
        payload = {
            model,
            input: {
                query,
                documents: processedDocs,
            },
            parameters: {},
        };

        if (topN !== undefined && !enableChunking) {
            (payload.parameters as Record<string, unknown>).top_n = topN;
        }
    } else {
        // Standard format for Jina/Cohere
        payload = {
            model,
            query,
            documents: processedDocs,
        };

        if (topN !== undefined && !enableChunking) {
            payload.top_n = topN;
        }
    }

    // Make API request
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    logger.debug(`Rerank request: ${processedDocs.length} documents, model: ${model}`);

    const response = await retry(async () => {
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Rerank API error ${res.status}: ${errorText}`);
        }

        return res.json();
    }, 3, 1000) as Record<string, unknown>;

    // Parse response based on format
    let results: Array<{ index: number; relevance_score: number }>;

    if (responseFormat === 'aliyun') {
        // Aliyun format: {"output": {"results": [...]}}
        const output = response?.output as Record<string, unknown> | undefined;
        results = (output?.results as Array<{ index: number; relevance_score: number }>) || [];
    } else {
        // Standard format: {"results": [...]}
        results = (response?.results as Array<{ index: number; relevance_score: number }>) || [];
    }

    if (!results || !Array.isArray(results)) {
        logger.warn('Rerank API returned empty or invalid results');
        return [];
    }

    // Standardize results
    let standardizedResults: RerankResult[] = results.map(r => ({
        index: r.index,
        relevanceScore: r.relevance_score,
    }));

    // Aggregate chunk scores if chunking was enabled
    if (enableChunking && docIndices) {
        standardizedResults = aggregateChunkScores(
            standardizedResults,
            docIndices,
            documents.length,
            aggregation
        );

        // Apply original topN limit at document level
        if (originalTopN && standardizedResults.length > originalTopN) {
            standardizedResults = standardizedResults.slice(0, originalTopN);
        }
    }

    return standardizedResults;
}

// ==================== Provider-Specific Functions ====================

/**
 * Rerank documents using Cohere API.
 *
 * Supports both standard Cohere API and Cohere-compatible proxies (vLLM).
 *
 * @param query - The search query
 * @param documents - List of documents to rerank
 * @param options - Rerank options
 * @returns Sorted list of rerank results
 *
 * @example
 * ```typescript
 * const results = await cohereRerank(
 *   'What is the capital of France?',
 *   ['Paris is in France.', 'Tokyo is in Japan.'],
 *   { apiKey: 'your-api-key', topN: 5 }
 * );
 * ```
 */
export async function cohereRerank(
    query: string,
    documents: string[],
    options: RerankOptions = {}
): Promise<RerankResult[]> {
    const {
        apiKey = process.env.COHERE_API_KEY || process.env.RERANK_BINDING_API_KEY,
        model = 'rerank-v3.5',
        baseUrl = 'https://api.cohere.com/v2/rerank',
        topN,
        enableChunking = false,
        maxTokensPerDoc = 4096,
        aggregation = 'max',
    } = options;

    return genericRerankApi(query, documents, {
        model,
        baseUrl,
        apiKey,
        topN,
        responseFormat: 'standard',
        requestFormat: 'standard',
        enableChunking,
        maxTokensPerDoc,
        aggregation,
    });
}

/**
 * Rerank documents using Jina AI API.
 *
 * @param query - The search query
 * @param documents - List of documents to rerank
 * @param options - Rerank options
 * @returns Sorted list of rerank results
 *
 * @example
 * ```typescript
 * const results = await jinaRerank(
 *   'What is machine learning?',
 *   ['ML is a subset of AI.', 'Python is a language.'],
 *   { apiKey: 'your-jina-key' }
 * );
 * ```
 */
export async function jinaRerank(
    query: string,
    documents: string[],
    options: RerankOptions = {}
): Promise<RerankResult[]> {
    const {
        apiKey = process.env.JINA_API_KEY || process.env.RERANK_BINDING_API_KEY,
        model = 'jina-reranker-v2-base-multilingual',
        baseUrl = 'https://api.jina.ai/v1/rerank',
        topN,
        aggregation = 'max',
    } = options;

    return genericRerankApi(query, documents, {
        model,
        baseUrl,
        apiKey,
        topN,
        responseFormat: 'standard',
        requestFormat: 'standard',
        aggregation,
    });
}

/**
 * Rerank documents using Aliyun DashScope API.
 *
 * @param query - The search query
 * @param documents - List of documents to rerank
 * @param options - Rerank options
 * @returns Sorted list of rerank results
 *
 * @example
 * ```typescript
 * const results = await aliyunRerank(
 *   'What is cloud computing?',
 *   ['AWS is a cloud provider.', 'Java is a language.'],
 *   { apiKey: 'your-dashscope-key' }
 * );
 * ```
 */
export async function aliyunRerank(
    query: string,
    documents: string[],
    options: RerankOptions = {}
): Promise<RerankResult[]> {
    const {
        apiKey = process.env.DASHSCOPE_API_KEY || process.env.RERANK_BINDING_API_KEY,
        model = 'gte-rerank-v2',
        baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
        topN,
        aggregation = 'max',
    } = options;

    return genericRerankApi(query, documents, {
        model,
        baseUrl,
        apiKey,
        topN,
        responseFormat: 'aliyun',
        requestFormat: 'aliyun',
        aggregation,
    });
}

// ==================== Factory Function ====================

/**
 * Create a rerank function based on configuration.
 *
 * @param config - Rerank configuration
 * @returns Configured rerank function
 *
 * @example
 * ```typescript
 * const rerank = createRerankFunction({
 *   binding: 'cohere',
 *   apiKey: 'your-api-key',
 *   model: 'rerank-v3.5'
 * });
 *
 * const results = await rerank('query', ['doc1', 'doc2']);
 * ```
 */
export function createRerankFunction(config: RerankConfig): RerankFunction | null {
    const { binding, apiKey, model, baseUrl } = config;

    if (binding === 'null' || !binding) {
        return null;
    }

    const defaultOptions: RerankOptions = {
        apiKey,
        model,
        baseUrl,
    };

    switch (binding) {
        case 'cohere':
            return (query, documents, options = {}) =>
                cohereRerank(query, documents, { ...defaultOptions, ...options });

        case 'jina':
            return (query, documents, options = {}) =>
                jinaRerank(query, documents, { ...defaultOptions, ...options });

        case 'aliyun':
            return (query, documents, options = {}) =>
                aliyunRerank(query, documents, { ...defaultOptions, ...options });

        default:
            logger.warn(`Unknown rerank binding: ${binding}`);
            return null;
    }
}

/**
 * Apply reranking to search results.
 *
 * @param query - Original search query
 * @param documents - Documents to rerank (with their content)
 * @param rerankFunc - Rerank function to use
 * @param options - Rerank options
 * @returns Reordered documents based on rerank scores
 */
export async function applyRerank<T extends { content: string }>(
    query: string,
    documents: T[],
    rerankFunc: RerankFunction,
    options: RerankOptions = {}
): Promise<T[]> {
    if (documents.length === 0) return [];

    const contents = documents.map(d => d.content);
    const results = await rerankFunc(query, contents, options);

    // Reorder documents based on rerank results
    const reordered: T[] = [];
    for (const result of results) {
        if (result.index >= 0 && result.index < documents.length) {
            reordered.push(documents[result.index]);
        }
    }

    return reordered;
}
