/**
 * LightRAG TypeScript Constants
 * Centralized configuration constants matching the Python implementation
 */

// Separator for: description, source_id and relation-key fields
export const GRAPH_FIELD_SEP = '<SEP>';

// Query and retrieval configuration defaults
export const DEFAULT_TOP_K = 40;
export const DEFAULT_CHUNK_TOP_K = 20;
export const DEFAULT_MAX_ENTITY_TOKENS = 6000;
export const DEFAULT_MAX_RELATION_TOKENS = 8000;
export const DEFAULT_MAX_TOTAL_TOKENS = 30000;
export const DEFAULT_COSINE_THRESHOLD = 0.2;
export const DEFAULT_RELATED_CHUNK_NUMBER = 5;
export const DEFAULT_KG_CHUNK_PICK_METHOD = 'VECTOR';

// Entity extraction settings
export const DEFAULT_SUMMARY_LANGUAGE = 'English';
export const DEFAULT_MAX_GLEANING = 1;
export const DEFAULT_ENTITY_NAME_MAX_LENGTH = 256;
export const DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE = 8;
export const DEFAULT_SUMMARY_MAX_TOKENS = 1200;
export const DEFAULT_SUMMARY_LENGTH_RECOMMENDED = 600;
export const DEFAULT_SUMMARY_CONTEXT_SIZE = 12000;

// Default entity types to extract
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

// Chunking configuration
export const DEFAULT_CHUNK_TOKEN_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE = 100;

// Async configuration
export const DEFAULT_MAX_ASYNC = 4;
export const DEFAULT_MAX_PARALLEL_INSERT = 2;

// Source IDs limit methods
export const SOURCE_IDS_LIMIT_METHOD_KEEP = 'KEEP';
export const SOURCE_IDS_LIMIT_METHOD_FIFO = 'FIFO';
export const DEFAULT_SOURCE_IDS_LIMIT_METHOD = SOURCE_IDS_LIMIT_METHOD_FIFO;
export const DEFAULT_MAX_SOURCE_IDS_PER_ENTITY = 300;
export const DEFAULT_MAX_SOURCE_IDS_PER_RELATION = 300;

// File path settings
export const DEFAULT_MAX_FILE_PATHS = 100;
export const DEFAULT_FILE_PATH_MORE_PLACEHOLDER = 'truncated';

// LLM/Embedding timeouts
export const DEFAULT_LLM_TIMEOUT = 180000; // ms
export const DEFAULT_EMBEDDING_TIMEOUT = 30000; // ms

// Default tuple delimiters for entity extraction
export const DEFAULT_TUPLE_DELIMITER = '<|#|>';
export const DEFAULT_COMPLETION_DELIMITER = '<|COMPLETE|>';
