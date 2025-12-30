/**
 * LightRAG TypeScript Type Definitions
 */

// ==================== Query Types ====================

export type QueryMode = 'local' | 'global' | 'hybrid' | 'naive' | 'mix' | 'bypass';

export interface QueryParam {
    /** Retrieval mode */
    mode: QueryMode;
    /** If true, only returns the retrieved context without generating a response */
    onlyNeedContext?: boolean;
    /** If true, only returns the generated prompt without producing a response */
    onlyNeedPrompt?: boolean;
    /** Response format type */
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
    /** High-level keywords to prioritize */
    hlKeywords?: string[];
    /** Low-level keywords to refine focus */
    llKeywords?: string[];
    /** Conversation history */
    conversationHistory?: ChatMessage[];
    /** Custom user prompt injection */
    userPrompt?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// ==================== Document/Chunk Types ====================

export interface TextChunk {
    /** Number of tokens in the chunk */
    tokens: number;
    /** Text content of the chunk */
    content: string;
    /** Full document ID this chunk belongs to */
    fullDocId: string;
    /** Zero-based index of chunk order in document */
    chunkOrderIndex: number;
}

export interface DocumentStatus {
    /** First 100 chars preview */
    contentSummary: string;
    /** Total document length */
    contentLength: number;
    /** File path of the document */
    filePath: string;
    /** Processing status */
    status: 'pending' | 'processing' | 'preprocessed' | 'processed' | 'failed';
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
}

// ==================== Entity/Relation Types ====================

export interface Entity {
    /** Entity name (title case) */
    entityName: string;
    /** Entity type category */
    entityType: string;
    /** Description of the entity */
    description: string;
    /** Source chunk ID */
    sourceId: string;
    /** File path of origin */
    filePath: string;
    /** Extraction timestamp */
    timestamp?: number;
}

export interface Relation {
    /** Source entity ID */
    srcId: string;
    /** Target entity ID */
    tgtId: string;
    /** Relationship weight */
    weight: number;
    /** Description of the relationship */
    description: string;
    /** Relationship keywords */
    keywords: string;
    /** Source chunk ID */
    sourceId: string;
    /** File path of origin */
    filePath: string;
    /** Extraction timestamp */
    timestamp?: number;
}

// ==================== Knowledge Graph Types ====================

export interface KnowledgeGraphNode {
    /** Node ID (entity name) */
    id: string;
    /** Node label/type */
    label?: string;
    /** Node description */
    description?: string;
    /** Source chunk IDs */
    sourceId?: string;
    /** Node degree (connection count) */
    degree?: number;
    /** Additional properties */
    [key: string]: unknown;
}

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
    /** Source chunk IDs */
    sourceId?: string;
    /** Additional properties */
    [key: string]: unknown;
}

export interface KnowledgeGraph {
    /** Graph nodes */
    nodes: KnowledgeGraphNode[];
    /** Graph edges */
    edges: KnowledgeGraphEdge[];
    /** Whether graph was truncated */
    isTruncated?: boolean;
}

// ==================== Query Result Types ====================

export interface QueryResult {
    /** Generated response text */
    response: string;
    /** Query context used */
    context?: string;
    /** Raw data for debugging */
    rawData?: QueryRawData;
}

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

export interface VectorQueryResult {
    /** Item ID */
    id: string;
    /** Similarity score */
    score: number;
    /** Item data */
    data: VectorData;
}

export interface GraphNode {
    [key: string]: string | number | undefined;
}

export interface GraphEdge {
    [key: string]: string | number | undefined;
}

// ==================== Function Types ====================

export type LLMFunction = (
    prompt: string,
    options?: {
        systemPrompt?: string;
        historyMessages?: ChatMessage[];
        stream?: boolean;
    }
) => Promise<string>;

export type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;

export interface LLMConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
}

export interface EmbeddingConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    dimensions?: number;
    timeout?: number;
}

// ==================== LightRAG Config Types ====================

export interface LightRAGConfig {
    /** Working directory for storage */
    workingDir?: string;
    /** Namespace/workspace for data isolation */
    namespace?: string;
    /** LLM function for completions */
    llmModelFunc?: LLMFunction;
    /** Embedding function */
    embeddingFunc?: EmbeddingFunction;
    /** Embedding dimensions */
    embeddingDim?: number;
    /** Chunk token size */
    chunkTokenSize?: number;
    /** Chunk overlap token size */
    chunkOverlapTokenSize?: number;
    /** Number of top results to retrieve */
    topK?: number;
    /** Chunk top K */
    chunkTopK?: number;
    /** Maximum gleaning iterations */
    maxGleaning?: number;
    /** Entity types to extract */
    entityTypes?: string[];
    /** Summary language */
    language?: string;
    /** Enable LLM response caching */
    enableLlmCache?: boolean;
}

export interface InsertOptions {
    /** Custom document IDs */
    ids?: string | string[];
    /** File paths for the documents */
    filePaths?: string | string[];
    /** Split by specific character */
    splitByCharacter?: string;
    /** Only split by character, don't further chunk */
    splitByCharacterOnly?: boolean;
}
