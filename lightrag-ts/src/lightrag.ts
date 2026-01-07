/**
 * LightRAG - Main Class
 * TypeScript implementation of LightRAG for Retrieval-Augmented Generation
 */

import path from 'path';
import type {
    LightRAGConfig,
    InsertOptions,
    DeleteOptions,
    QueryParam,
    QueryResult,
    LLMFunction,
    TextChunk,
    DocumentStatus,
    PipelineStatus,
} from './types.js';
import {
    JsonKVStorage,
    MemoryVectorStorage,
    MemoryGraphStorage,
    BaseKVStorage,
    BaseVectorStorage,
    BaseGraphStorage,
    Neo4jGraphStorage,
    RedisKVStorage,
    QdrantVectorStorage,
} from './storage/index.js';
import { createOpenAIComplete, createOpenAIEmbed } from './llm/index.js';
import { chunkingByTokenSize, addDocIdToChunks, extractFromChunks, mergeEntityDescriptions, mergeRelationDescriptionsSimple, mergeSourceIds } from './operate/index.js';
import { kgQuery } from './operate/query.js';
import {
    DEFAULT_CHUNK_TOKEN_SIZE,
    DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE,
    DEFAULT_TOP_K,
    DEFAULT_MAX_GLEANING,
    DEFAULT_ENTITY_TYPES,
    DEFAULT_SUMMARY_LANGUAGE,
    GRAPH_FIELD_SEP,
} from './constants.js';
import {
    GPTTokenizer,
    computeMdhashId,
    ensureDir,
    logger,
} from './utils/index.js';

// ==================== LightRAG Class ====================

export class LightRAG {
    private workingDir: string;
    private namespace: string;
    private tokenizer: GPTTokenizer;
    private llmModelFunc: LLMFunction;
    private embeddingFunc: (texts: string[]) => Promise<number[][]>;
    private embeddingDim: number;

    // Storage instances
    private docsKv!: BaseKVStorage<DocumentStatus>;
    private chunksKv!: BaseKVStorage<TextChunk>;
    private entitiesKv!: BaseKVStorage<Record<string, unknown>>;
    private relationsKv!: BaseKVStorage<Record<string, unknown>>;
    private entitiesVdb!: BaseVectorStorage;
    private relationsVdb!: BaseVectorStorage;
    private chunksVdb!: BaseVectorStorage;
    private graphStorage!: BaseGraphStorage;
    private llmCache!: BaseKVStorage<Record<string, unknown>>;

    // Config
    private chunkTokenSize: number;
    private chunkOverlapTokenSize: number;
    private topK: number;
    private maxGleaning: number;
    private entityTypes: string[];
    private language: string;
    private enableLlmCache: boolean;
    private graphStorageType: string;
    private neo4jConfig?: { uri?: string; user?: string; password?: string };

    // New storage config
    private kvStorageType: string;
    private vectorStorageType: string;
    private redisConfig?: { host?: string; port?: number; password?: string };
    private qdrantConfig?: { url?: string; apiKey?: string };

    private initialized: boolean = false;

    constructor(config: LightRAGConfig = {}) {
        this.workingDir = config.workingDir || './lightrag_data';
        this.namespace = config.namespace || 'default';
        this.tokenizer = new GPTTokenizer();
        this.embeddingDim = config.embeddingDim || 1536;

        // LLM function
        this.llmModelFunc = config.llmModelFunc || createOpenAIComplete();

        // Embedding function
        this.embeddingFunc = config.embeddingFunc || createOpenAIEmbed({ dimensions: this.embeddingDim });

        // Chunking config
        this.chunkTokenSize = config.chunkTokenSize || DEFAULT_CHUNK_TOKEN_SIZE;
        this.chunkOverlapTokenSize = config.chunkOverlapTokenSize || DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE;

        // Query config
        this.topK = config.topK || DEFAULT_TOP_K;

        // Extraction config
        this.maxGleaning = config.maxGleaning ?? DEFAULT_MAX_GLEANING;
        this.entityTypes = config.entityTypes || DEFAULT_ENTITY_TYPES;
        this.language = config.language || DEFAULT_SUMMARY_LANGUAGE;

        // Cache config
        this.enableLlmCache = config.enableLlmCache ?? true;

        // Storage config
        this.graphStorageType = config.graphStorage || 'memory';
        this.neo4jConfig = config.neo4jConfig;

        this.kvStorageType = config.kvStorage || 'json';
        this.vectorStorageType = config.vectorStorage || 'memory';
        this.redisConfig = config.redisConfig;
        this.qdrantConfig = config.qdrantConfig;
    }

    /**
     * Initialize all storage instances
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        const baseDir = path.join(this.workingDir, this.namespace);
        await ensureDir(baseDir);

        logger.info(`Initializing LightRAG in: ${baseDir}`);

        const storageConfig = {
            workingDir: this.workingDir,
            namespace: this.namespace,
            embeddingFunc: this.embeddingFunc,
            embeddingDim: this.embeddingDim,
        };

        // Initialize KV storages
        // Initialize KV storages
        if (this.kvStorageType === 'redis') {
            const redisOptions = { ...storageConfig, ...this.redisConfig };
            this.docsKv = new RedisKVStorage<DocumentStatus>({ ...redisOptions, storageName: 'docs' });
            this.chunksKv = new RedisKVStorage<TextChunk>({ ...redisOptions, storageName: 'chunks' });
            this.entitiesKv = new RedisKVStorage({ ...redisOptions, storageName: 'entities_kv' });
            this.relationsKv = new RedisKVStorage({ ...redisOptions, storageName: 'relations_kv' });
            this.llmCache = new RedisKVStorage({ ...redisOptions, storageName: 'llm_cache' });
        } else {
            this.docsKv = new JsonKVStorage<DocumentStatus>({ ...storageConfig, storageName: 'docs' });
            this.chunksKv = new JsonKVStorage<TextChunk>({ ...storageConfig, storageName: 'chunks' });
            this.entitiesKv = new JsonKVStorage({ ...storageConfig, storageName: 'entities_kv' });
            this.relationsKv = new JsonKVStorage({ ...storageConfig, storageName: 'relations_kv' });
            this.llmCache = new JsonKVStorage({ ...storageConfig, storageName: 'llm_cache' });
        }

        // Initialize vector storages
        if (this.vectorStorageType === 'qdrant') {
            const qdrantOptions = { ...storageConfig, ...this.qdrantConfig };
            this.entitiesVdb = new QdrantVectorStorage({ ...qdrantOptions, storageName: 'entities_vdb' });
            this.relationsVdb = new QdrantVectorStorage({ ...qdrantOptions, storageName: 'relations_vdb' });
            this.chunksVdb = new QdrantVectorStorage({ ...qdrantOptions, storageName: 'chunks_vdb' });
        } else {
            this.entitiesVdb = new MemoryVectorStorage({ ...storageConfig, storageName: 'entities_vdb' });
            this.relationsVdb = new MemoryVectorStorage({ ...storageConfig, storageName: 'relations_vdb' });
            this.chunksVdb = new MemoryVectorStorage({ ...storageConfig, storageName: 'chunks_vdb' });
        }

        // Initialize graph storage
        if (this.graphStorageType === 'neo4j') {
            this.graphStorage = new Neo4jGraphStorage({
                ...storageConfig,
                ...this.neo4jConfig
            });
        } else {
            this.graphStorage = new MemoryGraphStorage({
                ...storageConfig,
                storageName: 'graph_data'
            });
        }

        // Initialize all
        await Promise.all([
            this.docsKv.initialize(),
            this.chunksKv.initialize(),
            this.entitiesKv.initialize(),
            this.relationsKv.initialize(),
            this.llmCache.initialize(),
            this.entitiesVdb.initialize(),
            this.relationsVdb.initialize(),
            this.chunksVdb.initialize(),
            this.graphStorage.initialize(),
        ]);

        this.initialized = true;
        logger.info('LightRAG initialized successfully');
    }

    /**
     * Finalize and cleanup
     */
    async finalize(): Promise<void> {
        if (!this.initialized) return;

        await Promise.all([
            this.docsKv.finalize(),
            this.chunksKv.finalize(),
            this.entitiesKv.finalize(),
            this.relationsKv.finalize(),
            this.llmCache.finalize(),
            this.entitiesVdb.finalize(),
            this.relationsVdb.finalize(),
            this.chunksVdb.finalize(),
            this.graphStorage.finalize(),
        ]);

        this.initialized = false;
        logger.info('LightRAG finalized');
    }

    /**
     * Insert documents
     */
    async insert(
        input: string | string[],
        options: InsertOptions = {}
    ): Promise<void> {
        await this.initialize();

        const documents = Array.isArray(input) ? input : [input];
        const ids = options.ids
            ? (Array.isArray(options.ids) ? options.ids : [options.ids])
            : documents.map(doc => computeMdhashId(doc, 'doc-'));
        const filePaths = options.filePaths
            ? (Array.isArray(options.filePaths) ? options.filePaths : [options.filePaths])
            : documents.map(() => 'unknown_source');

        logger.info(`Inserting ${documents.length} documents`);

        // Process each document
        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const docId = ids[i] || computeMdhashId(doc, 'doc-');
            const filePath = filePaths[i] || 'unknown_source';

            // Check if already processed
            const existing = await this.docsKv.getById(docId);
            if (existing && existing.status === 'processed') {
                logger.info(`Document ${docId} already processed, skipping`);
                continue;
            }

            try {
                // Update status
                const docStatus: DocumentStatus = {
                    contentSummary: doc.substring(0, 100),
                    contentLength: doc.length,
                    filePath,
                    status: 'processing',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                await this.docsKv.upsert({ [docId]: docStatus });

                // Chunk document
                const chunks = chunkingByTokenSize(this.tokenizer, doc, {
                    splitByCharacter: options.splitByCharacter,
                    splitByCharacterOnly: options.splitByCharacterOnly,
                    chunkTokenSize: this.chunkTokenSize,
                    chunkOverlapTokenSize: this.chunkOverlapTokenSize,
                });

                const chunksWithId = addDocIdToChunks(chunks, docId);
                logger.info(`Document ${docId}: ${chunksWithId.length} chunks`);

                // Store chunks
                const chunkData: Record<string, TextChunk> = {};
                for (const chunk of chunksWithId) {
                    const chunkId = computeMdhashId(chunk.content, 'chunk-');
                    chunkData[chunkId] = { ...chunk, fullDocId: docId } as TextChunk;
                }
                await this.chunksKv.upsert(chunkData);

                // Generate chunk embeddings and store in vector DB
                const chunkContents = Object.values(chunkData).map(c => c.content);
                const chunkIds = Object.keys(chunkData);
                if (chunkContents.length > 0) {
                    const embeddings = await this.embeddingFunc(chunkContents);
                    const vectorData: Record<string, { id: string; embedding: number[]; content: string; metadata: Record<string, unknown> }> = {};
                    for (let j = 0; j < chunkIds.length; j++) {
                        vectorData[chunkIds[j]] = {
                            id: chunkIds[j],
                            embedding: embeddings[j],
                            content: chunkContents[j],
                            metadata: { file_path: filePath, doc_id: docId },
                        };
                    }
                    await this.chunksVdb.upsert(vectorData);
                }

                // Extract entities and relations
                const { entities, relations } = await extractFromChunks(
                    chunksWithId,
                    this.llmModelFunc,
                    {
                        entityTypes: this.entityTypes,
                        language: this.language,
                        maxGleaning: this.maxGleaning,
                    },
                    (current, total) => {
                        logger.debug(`Extraction progress: ${current}/${total}`);
                    }
                );

                logger.info(`Extracted ${entities.size} entities, ${relations.size} relations`);

                // Merge and store entities
                for (const [entityName, entityList] of entities.entries()) {
                    const { description } = await mergeEntityDescriptions(entityList, {}, this.llmModelFunc);
                    const sourceIds = entityList.map(e => e.sourceId).join(GRAPH_FIELD_SEP);
                    const entityType = entityList[0].entityType;

                    // Update graph
                    const existingNode = await this.graphStorage.getNode(entityName);
                    const existingSourceId = (existingNode?.source_id as string) || '';
                    const mergedSourceId = mergeSourceIds(existingSourceId, sourceIds);

                    await this.graphStorage.upsertNode(entityName, {
                        entity_type: entityType,
                        description: existingNode?.description
                            ? `${existingNode.description} ${description}`
                            : description,
                        source_id: mergedSourceId,
                    });

                    // Store in vector DB
                    const entityEmbed = await this.embeddingFunc([description]);
                    await this.entitiesVdb.upsert({
                        [entityName]: {
                            id: entityName,
                            embedding: entityEmbed[0],
                            content: description,
                            metadata: { entity_name: entityName, entity_type: entityType },
                        },
                    });
                }

                // Merge and store relations
                for (const [relKey, relList] of relations.entries()) {
                    const [srcId, tgtId] = relKey.split(GRAPH_FIELD_SEP);
                    const { description, keywords, weight } = mergeRelationDescriptionsSimple(relList);
                    const sourceIds = relList.map(r => r.sourceId).join(GRAPH_FIELD_SEP);

                    // Update graph
                    // Update graph
                    const existingEdge = await this.graphStorage.getEdge(srcId, tgtId);
                    const existingSourceId = (existingEdge?.source_id as string) || '';
                    const mergedSourceId = mergeSourceIds(existingSourceId, sourceIds);

                    /**
                     * Edge Merging Logic:
                     * 
                     * 1. Weight Aggregation:
                     *    Accrue weights from multiple occurrences to reflect relationship strength.
                     *    ((existingEdge?.weight as number) || 0) + weight
                     * 
                     * 2. Description/Keywords Concatenation:
                     *    Merge text properties to preserve accumulated context from different documents.
                     *    Prevents information loss when the same relationship is described differently.
                     */
                    await this.graphStorage.upsertEdge(srcId, tgtId, {
                        weight: ((existingEdge?.weight as number) || 0) + weight,
                        description: existingEdge?.description
                            ? `${existingEdge.description} ${description}`
                            : description,
                        keywords: existingEdge?.keywords
                            ? `${existingEdge.keywords}, ${keywords}`
                            : keywords,
                        source_id: mergedSourceId,
                    });

                    // Store in vector DB
                    const relEmbed = await this.embeddingFunc([description]);
                    await this.relationsVdb.upsert({
                        [relKey]: {
                            id: relKey,
                            embedding: relEmbed[0],
                            content: description,
                            metadata: { src_id: srcId, tgt_id: tgtId, keywords },
                        },
                    });
                }

                // Update doc status
                docStatus.status = 'processed';
                docStatus.updatedAt = new Date().toISOString();
                docStatus.chunksCount = chunksWithId.length;
                docStatus.chunksList = Object.keys(chunkData);
                await this.docsKv.upsert({ [docId]: docStatus });

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`Failed to insert document ${docId}: ${errorMsg}`);

                await this.docsKv.upsert({
                    [docId]: {
                        contentSummary: doc.substring(0, 100),
                        contentLength: doc.length,
                        filePath,
                        status: 'failed',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        errorMsg,
                    },
                });
            }
        }

        // Commit all changes
        await this.commitChanges();
        logger.info('Insert complete');
    }

    /**
     * Query with RAG
     */
    async query(
        query: string,
        param: Partial<QueryParam> = {}
    ): Promise<QueryResult> {
        await this.initialize();

        const fullParam: QueryParam = {
            mode: param.mode || 'hybrid',
            topK: param.topK || this.topK,
            ...param,
        };

        logger.info(`Query: mode=${fullParam.mode}, "${query.substring(0, 50)}..."`);

        return kgQuery(
            query,
            this.graphStorage,
            this.entitiesVdb,
            this.relationsVdb,
            this.chunksKv,
            this.llmModelFunc,
            fullParam,
            this.chunksVdb
        );
    }

    /**
     * Get knowledge graph
     */
    async getKnowledgeGraph(
        nodeLabel: string = '*',
        maxDepth: number = 3,
        maxNodes: number = 1000
    ) {
        await this.initialize();
        return this.graphStorage.getKnowledgeGraph(nodeLabel, maxDepth, maxNodes);
    }

    /**
     * Get document status
     */
    async getDocumentStatus(docId: string): Promise<DocumentStatus | null> {
        await this.initialize();
        return this.docsKv.getById(docId);
    }

    /**
     * Drop all data
     */
    async drop(): Promise<void> {
        await this.initialize();

        await Promise.all([
            this.docsKv.drop(),
            this.chunksKv.drop(),
            this.entitiesKv.drop(),
            this.relationsKv.drop(),
            this.llmCache.drop(),
            this.entitiesVdb.drop(),
            this.relationsVdb.drop(),
            this.chunksVdb.drop(),
            this.graphStorage.drop(),
        ]);

        logger.info('All data dropped');
        this.initialized = false;
    }

    /**
     * Commit all pending changes
     */
    private async commitChanges(): Promise<void> {
        await Promise.all([
            this.docsKv.indexDoneCallback(),
            this.chunksKv.indexDoneCallback(),
            this.entitiesKv.indexDoneCallback(),
            this.relationsKv.indexDoneCallback(),
            this.llmCache.indexDoneCallback(),
            this.entitiesVdb.indexDoneCallback(),
            this.relationsVdb.indexDoneCallback(),
            this.chunksVdb.indexDoneCallback(),
            this.graphStorage.indexDoneCallback(),
        ]);
    }

    // ==================== Document Deletion ====================

    /**
     * Delete a document and optionally its associated data.
     * 
     * @param docId - Document ID to delete
     * @param options - Deletion options
     * @returns Pipeline status with deletion results
     * 
     * @example
     * ```typescript
     * await rag.deleteDocument('doc-abc123', { 
     *   deleteChunks: true,
     *   rebuildGraph: false 
     * });
     * ```
     */
    async deleteDocument(
        docId: string,
        options: DeleteOptions = {}
    ): Promise<PipelineStatus> {
        await this.initialize();

        const { deleteChunks = true, rebuildGraph = false } = options;
        const status: PipelineStatus = {
            latestMessage: `Deleting document ${docId}`,
            historyMessages: [],
        };

        try {
            // Get document status
            const docStatus = await this.docsKv.getById(docId);
            if (!docStatus) {
                status.latestMessage = `Document ${docId} not found`;
                status.error = 'Document not found';
                return status;
            }

            const chunkIds = docStatus.chunksList || [];
            status.historyMessages.push(`Found ${chunkIds.length} chunks to process`);

            // Collect entities and relations to clean up
            const entitiesToCheck = new Set<string>();
            const relationsToCheck = new Set<string>();

            if (deleteChunks && chunkIds.length > 0) {
                // Find all entities and relations referencing these chunks
                // Only query once, not per chunk
                const nodes = await this.graphStorage.getAllNodes();
                const edges = await this.graphStorage.getAllEdges();

                for (const chunkId of chunkIds) {
                    // Check entities via graph (nodes is an array)
                    for (const nodeData of nodes) {
                        const nodeId = nodeData.id as string || nodeData.entity_name as string;
                        const sourceId = (nodeData?.source_id as string) || '';
                        if (nodeId && sourceId.includes(chunkId)) {
                            entitiesToCheck.add(nodeId);
                        }
                    }

                    // Check relations via graph (edges is an array)
                    for (const edgeData of edges) {
                        const srcId = edgeData.src_id as string || edgeData.source as string;
                        const tgtId = edgeData.tgt_id as string || edgeData.target as string;
                        const sourceId = (edgeData?.source_id as string) || '';
                        if (srcId && tgtId && sourceId.includes(chunkId)) {
                            const edgeKey = [srcId, tgtId].sort().join(GRAPH_FIELD_SEP);
                            relationsToCheck.add(edgeKey);
                        }
                    }
                }

                status.historyMessages.push(
                    `Found ${entitiesToCheck.size} entities and ${relationsToCheck.size} relations to check`
                );

                // Remove chunk references from entities
                for (const entityName of entitiesToCheck) {
                    await this.removeChunkReferencesFromEntity(entityName, chunkIds);
                }

                // Remove chunk references from relations
                for (const relationKey of relationsToCheck) {
                    const [srcId, tgtId] = relationKey.split(GRAPH_FIELD_SEP);
                    await this.removeChunkReferencesFromRelation(srcId, tgtId, chunkIds);
                }

                // Delete chunks from storage
                await this.chunksKv.delete(chunkIds);
                await this.chunksVdb.delete(chunkIds);

                status.historyMessages.push(`Deleted ${chunkIds.length} chunks`);
            }

            // Delete document
            await this.docsKv.delete([docId]);
            status.historyMessages.push(`Deleted document ${docId}`);

            // Rebuild graph if requested
            if (rebuildGraph && entitiesToCheck.size > 0) {
                status.latestMessage = 'Rebuilding affected entities...';
                options.onProgress?.(status);
                // Note: Full rebuild would require re-extracting from remaining chunks
                // This is a complex operation - for now just log
                status.historyMessages.push('Graph rebuild requested (not yet implemented)');
            }

            await this.commitChanges();

            status.latestMessage = `Successfully deleted document ${docId}`;
            options.onProgress?.(status);
            return status;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            status.latestMessage = `Failed to delete document: ${errorMsg}`;
            status.error = errorMsg;
            logger.error(`Delete document failed: ${errorMsg}`);
            return status;
        }
    }

    /**
     * Delete multiple documents.
     */
    async deleteDocuments(
        docIds: string[],
        options: DeleteOptions = {}
    ): Promise<PipelineStatus> {
        const status: PipelineStatus = {
            latestMessage: `Deleting ${docIds.length} documents`,
            historyMessages: [],
        };

        for (const docId of docIds) {
            const result = await this.deleteDocument(docId, options);
            status.historyMessages.push(...result.historyMessages);
            if (result.error) {
                status.historyMessages.push(`Error for ${docId}: ${result.error}`);
            }
        }

        status.latestMessage = `Completed deleting ${docIds.length} documents`;
        return status;
    }

    /**
     * Remove chunk references from an entity, deleting if no references remain.
     */
    private async removeChunkReferencesFromEntity(
        entityName: string,
        chunkIds: string[]
    ): Promise<void> {
        const node = await this.graphStorage.getNode(entityName);
        if (!node) return;

        const currentSourceId = (node.source_id as string) || '';
        const sourceIdSet = new Set(currentSourceId.split(GRAPH_FIELD_SEP).filter(Boolean));

        // Remove chunk IDs
        for (const chunkId of chunkIds) {
            sourceIdSet.delete(chunkId);
        }

        if (sourceIdSet.size === 0) {
            // No more references, delete entity
            await this.graphStorage.deleteNode(entityName);
            await this.entitiesVdb.deleteEntity(entityName);
            logger.debug(`Deleted orphaned entity: ${entityName}`);
        } else {
            // Update with remaining references
            await this.graphStorage.upsertNode(entityName, {
                ...node,
                source_id: Array.from(sourceIdSet).join(GRAPH_FIELD_SEP),
            });
        }
    }

    /**
     * Remove chunk references from a relation, deleting if no references remain.
     */
    private async removeChunkReferencesFromRelation(
        srcId: string,
        tgtId: string,
        chunkIds: string[]
    ): Promise<void> {
        const edge = await this.graphStorage.getEdge(srcId, tgtId);
        if (!edge) return;

        const currentSourceId = (edge.source_id as string) || '';
        const sourceIdSet = new Set(currentSourceId.split(GRAPH_FIELD_SEP).filter(Boolean));

        // Remove chunk IDs
        for (const chunkId of chunkIds) {
            sourceIdSet.delete(chunkId);
        }

        if (sourceIdSet.size === 0) {
            // No more references, delete relation using removeEdges
            await this.graphStorage.removeEdges([[srcId, tgtId]]);
            await this.relationsVdb.deleteEntityRelation(srcId);
            logger.debug(`Deleted orphaned relation: ${srcId} -> ${tgtId}`);
        } else {
            // Update with remaining references
            await this.graphStorage.upsertEdge(srcId, tgtId, {
                ...edge,
                source_id: Array.from(sourceIdSet).join(GRAPH_FIELD_SEP),
            });
        }
    }

    // ==================== Pipeline Status ====================

    /**
     * Get current pipeline status.
     */
    async getPipelineStatus(): Promise<{ documents: number; chunks: number; entities: number; relations: number }> {
        await this.initialize();

        const nodes = await this.graphStorage.getAllNodes();
        const edges = await this.graphStorage.getAllEdges();

        return {
            documents: 0, // Would need to count from docsKv
            chunks: 0,    // Would need to count from chunksKv
            entities: nodes.length,
            relations: edges.length,
        };
    }

    /**
     * Check if the RAG system is initialized.
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get working directory.
     */
    getWorkingDir(): string {
        return this.workingDir;
    }

    /**
     * Get namespace.
     */
    getNamespace(): string {
        return this.namespace;
    }

    // ==================== LLM Cache Management ====================

    /**
     * Clear LLM response cache.
     */
    async clearLlmCache(): Promise<void> {
        await this.initialize();
        await this.llmCache.drop();
        logger.info('LLM cache cleared');
    }

    /**
     * Get LLM cache statistics.
     */
    async getLlmCacheStats(): Promise<{ size: number }> {
        await this.initialize();
        const isEmpty = await this.llmCache.isEmpty();
        return { size: isEmpty ? 0 : -1 }; // Can't get exact size without iterating
    }
}

export default LightRAG;
