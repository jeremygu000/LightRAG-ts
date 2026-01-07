/**
 * LightRAG TypeScript
 *
 * Simple and Fast Retrieval-Augmented Generation with Knowledge Graphs.
 *
 * @packageDocumentation
 * @module lightrag-ts
 *
 * @example
 * ```typescript
 * import { LightRAG } from 'lightrag-ts';
 *
 * const rag = new LightRAG({ workingDir: './data' });
 * await rag.initialize();
 * await rag.insert('Your document content here.');
 * const result = await rag.query('Your question here?');
 * console.log(result.response);
 * ```
 */

// ==================== Main Class ====================

export { LightRAG, default } from './lightrag.js';

// ==================== Types ====================

export type {
    // Query types
    QueryParam,
    QueryMode,
    QueryResult,
    QueryRawData,
    ChatMessage,
    // Document types
    TextChunk,
    DocumentStatus,
    DocStatusType,
    // Entity/Relation types
    Entity,
    Relation,
    // Knowledge Graph types
    KnowledgeGraph,
    KnowledgeGraphNode,
    KnowledgeGraphEdge,
    // Storage types
    VectorData,
    VectorQueryResult,
    GraphNode,
    GraphEdge,
    // Pipeline types
    PipelineStatus,
    LLMCacheEntry,
    ExtractionCache,
    RebuildConfig,
    // Function types
    LLMFunction,
    EmbeddingFunction,
    Tokenizer,
    // Config types
    LLMConfig,
    EmbeddingConfig,
    LightRAGConfig,
    InsertOptions,
    DeleteOptions,
    SourceIdsLimitMethod,
} from './types.js';

// ==================== Exceptions ====================

export {
    LightRAGError,
    PipelineCancelledException,
    ChunkTokenLimitExceededError,
    StorageError,
    LLMError,
    EmbeddingError,
    ExtractionError,
    ConfigurationError,
    NotFoundError,
} from './exceptions.js';

// ==================== Storage ====================

export {
    JsonKVStorage,
    MemoryVectorStorage,
    MemoryGraphStorage,
} from './storage/index.js';

export type {
    BaseKVStorage,
    BaseVectorStorage,
    BaseGraphStorage,
    StorageConfig,
} from './storage/index.js';

// ==================== LLM ====================

export {
    openaiComplete,
    openaiEmbed,
    createOpenAIComplete,
    createOpenAIEmbed,
    gpt4oComplete,
    gpt4oMiniComplete,
} from './llm/index.js';

// ==================== Operations ====================

export {
    chunkingByTokenSize,
    extractFromChunk,
    extractFromChunks,
    extractKeywords,
    kgQuery,
} from './operate/index.js';

// ==================== Utilities ====================

export {
    GPTTokenizer,
    computeMdhashId,
    computeArgsHash,
    cosineSimilarity,
    truncateListByTokenSize,
    splitStringByMultiMarkers,
    sanitizeAndNormalizeText,
    isFloatString,
    countTokens,
    ensureDir,
    readJson,
    writeJson,
    fileExists,
    sleep,
    retry,
    parallelLimit,
    logger,
} from './utils/index.js';

// ==================== Constants ====================

export {
    // Separators
    GRAPH_FIELD_SEP,
    DEFAULT_TUPLE_DELIMITER,
    DEFAULT_COMPLETION_DELIMITER,
    // Query & Retrieval
    DEFAULT_TOP_K,
    DEFAULT_CHUNK_TOP_K,
    DEFAULT_MAX_ENTITY_TOKENS,
    DEFAULT_MAX_RELATION_TOKENS,
    DEFAULT_MAX_TOTAL_TOKENS,
    DEFAULT_COSINE_THRESHOLD,
    DEFAULT_RELATED_CHUNK_NUMBER,
    DEFAULT_KG_CHUNK_PICK_METHOD,
    // Entity Extraction
    DEFAULT_SUMMARY_LANGUAGE,
    DEFAULT_MAX_GLEANING,
    DEFAULT_ENTITY_NAME_MAX_LENGTH,
    DEFAULT_ENTITY_TYPES,
    DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE,
    DEFAULT_SUMMARY_MAX_TOKENS,
    DEFAULT_SUMMARY_LENGTH_RECOMMENDED,
    DEFAULT_SUMMARY_CONTEXT_SIZE,
    // Chunking
    DEFAULT_CHUNK_TOKEN_SIZE,
    DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE,
    // Async
    DEFAULT_MAX_ASYNC,
    DEFAULT_MAX_PARALLEL_INSERT,
    DEFAULT_EMBEDDING_FUNC_MAX_ASYNC,
    DEFAULT_EMBEDDING_BATCH_NUM,
    // Source IDs
    SOURCE_IDS_LIMIT_METHOD_KEEP,
    SOURCE_IDS_LIMIT_METHOD_FIFO,
    DEFAULT_SOURCE_IDS_LIMIT_METHOD,
    DEFAULT_MAX_SOURCE_IDS_PER_ENTITY,
    DEFAULT_MAX_SOURCE_IDS_PER_RELATION,
    // LLM
    DEFAULT_TEMPERATURE,
    DEFAULT_LLM_TIMEOUT,
    DEFAULT_EMBEDDING_TIMEOUT,
    // Logging
    DEFAULT_LOG_MAX_BYTES,
    DEFAULT_LOG_BACKUP_COUNT,
    DEFAULT_LOG_FILENAME,
} from './constants.js';

// ==================== Prompts ====================

export { PROMPTS, formatPrompt } from './prompts.js';
