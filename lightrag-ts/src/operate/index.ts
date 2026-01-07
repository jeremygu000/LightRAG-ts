/**
 * Operations Module Exports
 *
 * Re-exports all operation functions for chunking, extraction, and querying.
 *
 * @module operate
 */

// ==================== Chunking ====================

export { chunkingByTokenSize, addDocIdToChunks } from './chunking.js';
export type { ChunkingOptions } from './chunking.js';

// ==================== Extraction ====================

export {
    // Main extraction functions
    extractFromChunk,
    extractFromChunks,
    // Description merging
    mergeEntityDescriptions,
    mergeRelationDescriptionsSimple,
    mergeSourceIds,
    // Parsing helpers
    parseEntityFromRecord,
    parseRelationFromRecord,
    processExtractionResult,
} from './extraction.js';

export type {
    ExtractionConfig,
    ParsedEntity,
    ParsedRelation,
    LLMCache,
} from './extraction.js';

// ==================== Query ====================

export { kgQuery, extractKeywords } from './query.js';
