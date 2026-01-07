/**
 * LightRAG TypeScript Type Definitions
 *
 * Comprehensive type definitions for the LightRAG system.
 * These types mirror the Python implementation for full compatibility.
 *
 * @module types
 */

// ==================== Query Types ====================

/**
 * Query retrieval modes:
 * - `local`: Entity + neighbor chunk search
 * - `global`: Entity + relation search
 * - `hybrid`: Entity + relation + neighbor chunks
 * - `naive`: Pure vector chunk search (no KG)
 * - `mix`: All sources combined
 * - `bypass`: Skip retrieval, direct LLM
 */
export type QueryMode = 'local' | 'global' | 'hybrid' | 'naive' | 'mix' | 'bypass';

/**
 * Parameters for query operations.
 */
export interface QueryParam {
    /** Retrieval mode */
    mode: QueryMode;
    /** If true, only returns the retrieved context without generating a response */
    onlyNeedContext?: boolean;
    /** If true, only returns the generated prompt without producing a response */
    onlyNeedPrompt?: boolean;
    /** Response format type (e.g., 'Multiple Paragraphs', 'Single Paragraph', 'List') */
    responseType?: string;
    /** Enable streaming output */
    stream?: boolean;
    /** Number of top items to retrieve */
    topK?: number;
    /** Number of text chunks to retrieve */
    chunkTopK?: number;
    /** Maximum tokens for entity context */
    maxEntityTokens?: number;
    /** Maximum tokens for relationship context */
    maxRelationTokens?: number;
    /** Maximum total tokens budget */
    maxTotalTokens?: number;
    /** High-level keywords to prioritize (overrides extraction) */
    hlKeywords?: string[];
    /** Low-level keywords to refine focus (overrides extraction) */
    llKeywords?: string[];
    /** Conversation history for multi-turn */
    conversationHistory?: ChatMessage[];
    /** Custom user prompt injection */
    userPrompt?: string;
    /** Enable reranking of results */
    enableRerank?: boolean;
    /** Minimum rerank score threshold */
    minRerankScore?: number;
    /** Cosine similarity threshold for filtering retrieval results */
    cosSimThreshold?: number;
}

/**
 * Chat message for conversation history.
 */
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// ==================== Document/Chunk Types ====================

/**
 * Text chunk schema matching Python's TextChunkSchema.
 */
export interface TextChunk {
    /** Number of tokens in the chunk */
    tokens: number;
    /** Text content of the chunk */
    content: string;
    /** Full document ID this chunk belongs to */
    fullDocId: string;
    /** Zero-based index of chunk order in document */
    chunkOrderIndex: number;
    /** File path of the source document */
    filePath?: string;
    /** LLM cache keys associated with this chunk */
    llmCacheList?: string[];
}

/**
 * Document processing status.
 */
export type DocStatusType = 'pending' | 'processing' | 'preprocessed' | 'processed' | 'failed';

/**
 * Document status tracking information.
 */
export interface DocumentStatus {
    /** First 100 chars preview */
    contentSummary: string;
    /** Total document length in characters */
    contentLength: number;
    /** File path of the document */
    filePath: string;
    /** Processing status */
    status: DocStatusType;
    /** ISO timestamp when created */
    createdAt: string;
    /** ISO timestamp when last updated */
    updatedAt: string;
    /** Number of chunks after splitting */
    chunksCount?: number;
    /** List of chunk IDs */
    chunksList?: string[];
    /** Error message if failed */
    errorMsg?: string;
    /** Content MD5 hash for change detection */
    contentMd5?: string;
}

// ==================== Entity/Relation Types ====================

/**
 * Extracted entity information.
 */
export interface Entity {
    /** Entity name (title case normalized) */
    entityName: string;
    /** Entity type category (lowercase) */
    entityType: string;
    /** Description of the entity */
    description: string;
    /** Source chunk ID */
    sourceId: string;
    /** File path of origin document */
    filePath: string;
    /** Extraction timestamp (epoch ms) */
    timestamp?: number;
}

/**
 * Extracted relationship information.
 */
export interface Relation {
    /** Source entity ID */
    srcId: string;
    /** Target entity ID */
    tgtId: string;
    /** Relationship weight (cumulative) */
    weight: number;
    /** Description of the relationship */
    description: string;
    /** Relationship keywords (comma-separated) */
    keywords: string;
    /** Source chunk ID */
    sourceId: string;
    /** File path of origin document */
    filePath: string;
    /** Extraction timestamp (epoch ms) */
    timestamp?: number;
}

// ==================== Knowledge Graph Types ====================

/**
 * Knowledge graph node for visualization/export.
 */
export interface KnowledgeGraphNode {
    /** Node ID (entity name) */
    id: string;
    /** Node label/type */
    label?: string;
    /** Node description */
    description?: string;
    /** Source chunk IDs (SEP-separated) */
    sourceId?: string;
    /** Node degree (connection count) */
    degree?: number;
    /** Additional properties */
    [key: string]: unknown;
}

/**
 * Knowledge graph edge for visualization/export.
 */
export interface KnowledgeGraphEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Edge weight */
    weight?: number;
    /** Edge description */
    description?: string;
    /** Edge keywords */
    keywords?: string;
    /** Source chunk IDs (SEP-separated) */
    sourceId?: string;
    /** Additional properties */
    [key: string]: unknown;
}

/**
 * Complete knowledge graph structure.
 */
export interface KnowledgeGraph {
    /** Graph nodes */
    nodes: KnowledgeGraphNode[];
    /** Graph edges */
    edges: KnowledgeGraphEdge[];
    /** Whether graph was truncated due to size limits */
    isTruncated?: boolean;
}

// ==================== Query Result Types ====================

/**
 * Query operation result.
 */
export interface QueryResult {
    /** Generated response text */
    response: string | AsyncIterable<string>;
    /** Query context used for generation */
    context?: string;
    /** Raw data for debugging/inspection */
    rawData?: QueryRawData;
}

/**
 * Raw data from query for debugging.
 */
export interface QueryRawData {
    /** Entities used in context */
    entities: Array<{
        name: string;
        type: string;
        description: string;
    }>;
    /** Relationships used in context */
    relationships: Array<{
        source: string;
        target: string;
        description: string;
    }>;
    /** Chunks used in context */
    chunks: Array<{
        content: string;
        filePath: string;
    }>;
    /** Reference list */
    references: Array<{
        id: number;
        filePath: string;
    }>;
    /** Query metadata */
    metadata?: {
        keywords?: {
            highLevel: string[];
            lowLevel: string[];
        };
        queryMode?: QueryMode;
    };
}

// ==================== Storage Types ====================

/**
 * Vector data for storage.
 */
export interface VectorData {
    /** Unique ID */
    id: string;
    /** Vector embedding */
    embedding: number[];
    /** Text content */
    content?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Result from vector similarity query.
 */
export interface VectorQueryResult {
    /** Item ID */
    id: string;
    /** Similarity score */
    score: number;
    /** Item data */
    data: VectorData;
}

/**
 * Generic graph node data.
 */
export interface GraphNode {
    [key: string]: string | number | undefined;
}

/**
 * Generic graph edge data.
 */
export interface GraphEdge {
    [key: string]: string | number | undefined;
}

// ==================== Pipeline Status Types ====================

/**
 * Current status of a processing pipeline.
 */
export interface PipelineStatus {
    /** Latest status message */
    latestMessage: string;
    /** History of status messages */
    historyMessages: string[];
    /** Number of chunks processed */
    processedChunks?: number;
    /** Total number of chunks */
    totalChunks?: number;
    /** Number of entities extracted */
    entitiesExtracted?: number;
    /** Number of relations extracted */
    relationsExtracted?: number;
    /** Whether pipeline was cancelled */
    cancelled?: boolean;
    /** Error if pipeline failed */
    error?: string;
}

// ==================== Cache Types ====================

/**
 * LLM response cache entry.
 */
export interface LLMCacheEntry {
    /** Cache key (hash of prompt) */
    cacheKey: string;
    /** LLM response content */
    response: string;
    /** Cache creation timestamp */
    createTime: number;
    /** Type of cache entry */
    cacheType: 'extract' | 'summary' | 'query';
    /** Associated chunk ID (for extraction cache) */
    chunkId?: string;
}

/**
 * Extraction cache data structure.
 */
export interface ExtractionCache {
    /** Extraction result text */
    result: string;
    /** Extraction timestamp */
    timestamp: number;
    /** Hash of the source content */
    contentHash?: string;
}

// ==================== Function Types ====================

/**
 * LLM completion function signature.
 */
export type LLMFunction = (
    prompt: string,
    options?: {
        systemPrompt?: string;
        historyMessages?: ChatMessage[];
        stream?: boolean;
    }
) => Promise<string | AsyncIterable<string>>;

/**
 * Embedding function signature.
 */
export type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;

/**
 * LLM configuration options.
 */
export interface LLMConfig {
    /** API key for the LLM service */
    apiKey?: string;
    /** Base URL for the API */
    baseUrl?: string;
    /** Model name to use */
    model?: string;
    /** Temperature for generation */
    temperature?: number;
    /** Maximum tokens in response */
    maxTokens?: number;
    /** Request timeout in ms */
    timeout?: number;
}

/**
 * Embedding configuration options.
 */
export interface EmbeddingConfig {
    /** API key for embedding service */
    apiKey?: string;
    /** Base URL for the API */
    baseUrl?: string;
    /** Model name to use */
    model?: string;
    /** Embedding dimensions */
    dimensions?: number;
    /** Request timeout in ms */
    timeout?: number;
}

// ==================== LightRAG Config Types ====================

/**
 * Source IDs limit method.
 */
export type SourceIdsLimitMethod = 'KEEP' | 'FIFO';

/**
 * Complete LightRAG configuration options.
 */
export interface LightRAGConfig {
    // === Storage ===
    /** Working directory for storage */
    workingDir?: string;
    /** Namespace/workspace for data isolation */
    namespace?: string;
    /** KV storage implementation name */
    kvStorage?: string;
    /** Vector storage implementation name */
    vectorStorage?: string;
    /** Graph storage implementation name */
    graphStorage?: string;
    /** Document status storage implementation name */
    docStatusStorage?: string;

    // === LLM & Embedding ===
    /** LLM function for completions */
    llmModelFunc?: LLMFunction;
    /** Embedding function */
    embeddingFunc?: EmbeddingFunction;
    /** Embedding dimensions */
    embeddingDim?: number;
    /** Embedding token limit */
    embeddingTokenLimit?: number;
    /** Maximum concurrent LLM calls */
    llmModelMaxAsync?: number;
    /** Default LLM timeout in ms */
    defaultLlmTimeout?: number;
    /** Default embedding timeout in ms */
    defaultEmbeddingTimeout?: number;

    // === Chunking ===
    /** Chunk token size */
    chunkTokenSize?: number;
    /** Chunk overlap token size */
    chunkOverlapTokenSize?: number;

    // === Query ===
    /** Number of top results to retrieve */
    topK?: number;
    /** Chunk top K */
    chunkTopK?: number;
    /** Cosine similarity threshold */
    cosineBetterThanThreshold?: number;
    /** KG chunk pick method */
    kgChunkPickMethod?: string;

    // === Extraction ===
    /** Maximum gleaning iterations */
    maxGleaning?: number;
    /** Entity types to extract */
    entityTypes?: string[];
    /** Entity name max length */
    entityNameMaxLength?: number;
    /** Summary language */
    language?: string;

    // === Merging & Summary ===
    /** Force LLM summary when this many descriptions merge */
    forceLlmSummaryOnMerge?: number;
    /** Maximum summary tokens */
    summaryMaxTokens?: number;
    /** Recommended summary length */
    summaryLengthRecommended?: number;
    /** Summary context size */
    summaryContextSize?: number;

    // === Source IDs ===
    /** Source IDs limit method */
    sourceIdsLimitMethod?: SourceIdsLimitMethod;
    /** Max source IDs per entity */
    maxSourceIdsPerEntity?: number;
    /** Max source IDs per relation */
    maxSourceIdsPerRelation?: number;
    /** Max file paths in metadata */
    maxFilePaths?: number;

    // === Caching ===
    /** Enable LLM response caching */
    enableLlmCache?: boolean;

    // === Addon Parameters ===
    /** Additional parameters (e.g., language) */
    addonParams?: Record<string, unknown>;
}

/**
 * Options for document insertion.
 */
export interface InsertOptions {
    /** Custom document IDs (must match input length) */
    ids?: string | string[];
    /** File paths for the documents */
    filePaths?: string | string[];
    /** Split by specific character first */
    splitByCharacter?: string;
    /** Only split by character, don't further chunk */
    splitByCharacterOnly?: boolean;
    /** Pipeline status callback */
    onProgress?: (status: PipelineStatus) => void;
}

/**
 * Options for document deletion.
 */
export interface DeleteOptions {
    /** Delete associated chunks */
    deleteChunks?: boolean;
    /** Rebuild affected entities/relations */
    rebuildGraph?: boolean;
    /** Pipeline status callback */
    onProgress?: (status: PipelineStatus) => void;
}

// ==================== Rebuild Types ====================

/**
 * Configuration for knowledge graph rebuild.
 */
export interface RebuildConfig {
    /** Entities to rebuild: entity_name -> [chunk_ids] */
    entitiesToRebuild: Map<string, string[]>;
    /** Relations to rebuild: [src, tgt] -> [chunk_ids] */
    relationsToRebuild: Map<string, string[]>;
    /** Pipeline status callback */
    onProgress?: (status: PipelineStatus) => void;
}

// ==================== Tokenizer Interface ====================

/**
 * Tokenizer interface for text encoding/decoding.
 */
export interface Tokenizer {
    /** Encode text to token IDs */
    encode(text: string): number[];
    /** Decode token IDs to text */
    decode(tokens: number[]): string;
}
