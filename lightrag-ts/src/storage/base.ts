/**
 * LightRAG Storage Base Interfaces
 */

// ==================== Base KV Storage ====================

export interface BaseKVStorage<T = Record<string, unknown>> {
    /** Initialize the storage */
    initialize(): Promise<void>;

    /** Finalize the storage (cleanup/persist) */
    finalize(): Promise<void>;

    /** Get value by ID */
    getById(id: string): Promise<T | null>;

    /** Get multiple values by IDs */
    getByIds(ids: string[]): Promise<T[]>;

    /** Filter keys - return keys that don't exist */
    filterKeys(keys: Set<string>): Promise<Set<string>>;

    /** Upsert data */
    upsert(data: Record<string, T>): Promise<void>;

    /** Delete by IDs */
    delete(ids: string[]): Promise<void>;

    /** Check if storage is empty */
    isEmpty(): Promise<boolean>;

    /** Commit changes after indexing */
    indexDoneCallback(): Promise<void>;

    /** Drop all data */
    drop(): Promise<{ status: string; message: string }>;
}

// ==================== Base Vector Storage ====================

export interface VectorData {
    id: string;
    embedding: number[];
    content?: string;
    metadata?: Record<string, unknown>;
}

export interface VectorQueryResult {
    id: string;
    score: number;
    data: VectorData;
}

export interface BaseVectorStorage {
    /** Initialize the storage */
    initialize(): Promise<void>;

    /** Finalize the storage */
    finalize(): Promise<void>;

    /** Query vectors by similarity */
    query(query: string, topK: number, queryEmbedding?: number[]): Promise<VectorQueryResult[]>;

    /** Upsert vectors */
    upsert(data: Record<string, VectorData>): Promise<void>;

    /** Delete vectors by IDs */
    delete(ids: string[]): Promise<void>;

    /** Delete entity by name */
    deleteEntity(entityName: string): Promise<void>;

    /** Delete entity relations */
    deleteEntityRelation(entityName: string): Promise<void>;

    /** Get vector by ID */
    getById(id: string): Promise<VectorData | null>;

    /** Get multiple vectors by IDs */
    getByIds(ids: string[]): Promise<VectorData[]>;

    /** Commit changes */
    indexDoneCallback(): Promise<void>;

    /** Drop all data */
    drop(): Promise<{ status: string; message: string }>;
}

// ==================== Base Graph Storage ====================

export type GraphNode = Record<string, unknown>;

export type GraphEdge = Record<string, unknown>;

export interface KnowledgeGraphNode {
    id: string;
    label?: string;
    description?: string;
    sourceId?: string;
    degree?: number;
    [key: string]: unknown;
}

export interface KnowledgeGraphEdge {
    source: string;
    target: string;
    weight?: number;
    description?: string;
    keywords?: string;
    sourceId?: string;
    [key: string]: unknown;
}

export interface KnowledgeGraph {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
    isTruncated?: boolean;
}

export interface BaseGraphStorage {
    /** Initialize the storage */
    initialize(): Promise<void>;

    /** Finalize the storage */
    finalize(): Promise<void>;

    /** Check if node exists */
    hasNode(nodeId: string): Promise<boolean>;

    /** Check if edge exists */
    hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean>;

    /** Get node degree */
    nodeDegree(nodeId: string): Promise<number>;

    /** Get edge degree (sum of source and target degrees) */
    edgeDegree(srcId: string, tgtId: string): Promise<number>;

    /** Get node by ID */
    getNode(nodeId: string): Promise<GraphNode | null>;

    /** Get edge between two nodes */
    getEdge(sourceNodeId: string, targetNodeId: string): Promise<GraphEdge | null>;

    /** Get all edges connected to a node */
    getNodeEdges(sourceNodeId: string): Promise<Array<[string, string]> | null>;

    /** Get multiple nodes by IDs */
    getNodesBatch(nodeIds: string[]): Promise<Map<string, GraphNode>>;

    /** Get node degrees in batch */
    nodeDegreesBatch(nodeIds: string[]): Promise<Map<string, number>>;

    /** Get edges in batch */
    getEdgesBatch(pairs: Array<{ src: string; tgt: string }>): Promise<Map<string, GraphEdge>>;

    /** Upsert a node */
    upsertNode(nodeId: string, nodeData: GraphNode): Promise<void>;

    /** Upsert an edge */
    upsertEdge(sourceNodeId: string, targetNodeId: string, edgeData: GraphEdge): Promise<void>;

    /** Delete a node */
    deleteNode(nodeId: string): Promise<void>;

    /** Remove multiple nodes */
    removeNodes(nodes: string[]): Promise<void>;

    /** Remove multiple edges */
    removeEdges(edges: Array<[string, string]>): Promise<void>;

    /** Get all node labels */
    getAllLabels(): Promise<string[]>;

    /** Get knowledge graph from a starting node */
    getKnowledgeGraph(nodeLabel: string, maxDepth?: number, maxNodes?: number): Promise<KnowledgeGraph>;

    /** Get all nodes */
    getAllNodes(): Promise<GraphNode[]>;

    /** Get all edges */
    getAllEdges(): Promise<GraphEdge[]>;

    /** Commit changes */
    indexDoneCallback(): Promise<void>;

    /** Drop all data */
    drop(): Promise<{ status: string; message: string }>;
}

// ==================== Storage Config ====================

export interface StorageConfig {
    workingDir: string;
    namespace: string;
    embeddingFunc?: (texts: string[]) => Promise<number[][]>;
    embeddingDim?: number;
}
