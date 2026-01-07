/**
 * LightRAG TypeScript Constants
 *
 * Centralized configuration constants matching the Python implementation.
 * This file defines all default values used across the LightRAG system.
 *
 * @module constants
 */

// ==================== Separators ====================

/**
 * Separator for description, source_id, and relation-key fields.
 * Cannot be changed after data is inserted.
 */
export const GRAPH_FIELD_SEP = '<SEP>';

/**
 * Tuple delimiter for entity extraction output parsing.
 */
export const DEFAULT_TUPLE_DELIMITER = '<|#|>';

/**
 * Completion delimiter signaling end of LLM extraction.
 */
export const DEFAULT_COMPLETION_DELIMITER = '<|COMPLETE|>';

// ==================== Query & Retrieval ====================

/** Number of top items to retrieve in vector search */
export const DEFAULT_TOP_K = 40;

/** Number of text chunks to retrieve */
export const DEFAULT_CHUNK_TOP_K = 20;

/** Maximum tokens for entity context */
export const DEFAULT_MAX_ENTITY_TOKENS = 6000;

/** Maximum tokens for relationship context */
export const DEFAULT_MAX_RELATION_TOKENS = 8000;

/** Maximum total tokens budget */
export const DEFAULT_MAX_TOTAL_TOKENS = 30000;

/** Cosine similarity threshold for vector search */
export const DEFAULT_COSINE_THRESHOLD = 0.2;

/** Number of related chunks to retrieve */
export const DEFAULT_RELATED_CHUNK_NUMBER = 5;

/** Chunk picking method for KG queries */
export const DEFAULT_KG_CHUNK_PICK_METHOD = 'VECTOR';

// ==================== Entity Extraction ====================

/** Default language for document processing */
export const DEFAULT_SUMMARY_LANGUAGE = 'English';

/** Maximum gleaning (re-extraction) iterations */
export const DEFAULT_MAX_GLEANING = 1;

/** Maximum length for entity names */
export const DEFAULT_ENTITY_NAME_MAX_LENGTH = 256;

/** Number of description fragments to trigger LLM summary */
export const DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE = 8;

/** Maximum description token size to trigger LLM summary */
export const DEFAULT_SUMMARY_MAX_TOKENS = 1200;

/** Recommended LLM summary output length in tokens */
export const DEFAULT_SUMMARY_LENGTH_RECOMMENDED = 600;

/** Maximum token size sent to LLM for summary */
export const DEFAULT_SUMMARY_CONTEXT_SIZE = 12000;

/** Default entity types to extract */
export const DEFAULT_ENTITY_TYPES = [
    'Person',
    'Creature',
    'Organization',
    'Location',
    'Event',
    'Concept',
    'Method',
    'Content',
    'Data',
    'Artifact',
    'NaturalObject',
];

// ==================== Chunking ====================

/** Maximum tokens per chunk */
export const DEFAULT_CHUNK_TOKEN_SIZE = 1200;

/** Token overlap between chunks */
export const DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE = 100;

// ==================== Async & Concurrency ====================

/** Maximum concurrent async operations */
export const DEFAULT_MAX_ASYNC = 4;

/** Maximum parallel insert operations */
export const DEFAULT_MAX_PARALLEL_INSERT = 2;

/** Maximum async operations for embedding functions */
export const DEFAULT_EMBEDDING_FUNC_MAX_ASYNC = 8;

/** Batch size for embedding computations */
export const DEFAULT_EMBEDDING_BATCH_NUM = 10;

// ==================== Source IDs Management ====================

/** Keep oldest source IDs (less merge action, faster) */
export const SOURCE_IDS_LIMIT_METHOD_KEEP = 'KEEP';

/** First in first out (replace oldest with newest) */
export const SOURCE_IDS_LIMIT_METHOD_FIFO = 'FIFO';

/** Default source IDs limit method */
export const DEFAULT_SOURCE_IDS_LIMIT_METHOD = SOURCE_IDS_LIMIT_METHOD_FIFO;

/** Maximum number of source IDs per entity */
export const DEFAULT_MAX_SOURCE_IDS_PER_ENTITY = 300;

/** Maximum number of source IDs per relation */
export const DEFAULT_MAX_SOURCE_IDS_PER_RELATION = 300;

/** Set of valid source IDs limit methods */
export const VALID_SOURCE_IDS_LIMIT_METHODS = new Set([
    SOURCE_IDS_LIMIT_METHOD_KEEP,
    SOURCE_IDS_LIMIT_METHOD_FIFO,
]);

// ==================== File Path Settings ====================

/** Maximum number of file paths stored in entity/relation metadata */
export const DEFAULT_MAX_FILE_PATHS = 100;

/** Maximum length of file_path field in storage schema */
export const DEFAULT_MAX_FILE_PATH_LENGTH = 32768;

/** Placeholder for truncated file paths */
export const DEFAULT_FILE_PATH_MORE_PLACEHOLDER = 'truncated';

// ==================== LLM Configuration ====================

/** Default temperature for LLM */
export const DEFAULT_TEMPERATURE = 1.0;

/** Default LLM timeout in milliseconds */
export const DEFAULT_LLM_TIMEOUT = 180000;

/** Default embedding timeout in milliseconds */
export const DEFAULT_EMBEDDING_TIMEOUT = 30000;

// ==================== Logging ====================

/** Default log file max size in bytes (10MB) */
export const DEFAULT_LOG_MAX_BYTES = 10485760;

/** Default number of log file backups */
export const DEFAULT_LOG_BACKUP_COUNT = 5;

/** Default log filename */
export const DEFAULT_LOG_FILENAME = 'lightrag.log';

// ==================== Server Configuration ====================

/** Default number of workers */
export const DEFAULT_WORKERS = 2;

/** Default maximum graph nodes */
export const DEFAULT_MAX_GRAPH_NODES = 1000;

/** Gunicorn worker timeout in seconds */
export const DEFAULT_TIMEOUT = 300;

// ==================== Rerank Configuration ====================

/** Minimum rerank score threshold */
export const DEFAULT_MIN_RERANK_SCORE = 0.0;

/** Default rerank binding */
export const DEFAULT_RERANK_BINDING = 'null';

// ==================== Conversation ====================

/** Default history turns (deprecated, all history sent to LLM) */
export const DEFAULT_HISTORY_TURNS = 0;
