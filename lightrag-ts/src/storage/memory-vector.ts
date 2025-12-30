/**
 * In-Memory Vector Storage Implementation with Cosine Similarity
 */

import path from 'path';
import { BaseVectorStorage, VectorData, VectorQueryResult, StorageConfig } from './base.js';
import { readJson, writeJson, fileExists, ensureDir, cosineSimilarity, logger } from '../utils/index.js';

export class MemoryVectorStorage implements BaseVectorStorage {
    private data: Map<string, VectorData> = new Map();
    private filePath: string;
    private isDirty: boolean = false;
    private initialized: boolean = false;
    private embeddingFunc?: (texts: string[]) => Promise<number[][]>;
    private cosineThreshold: number;

    constructor(private config: StorageConfig & {
        storageName: string;
        cosineThreshold?: number;
    }) {
        this.filePath = path.join(
            config.workingDir,
            config.namespace || 'default',
            `${config.storageName}.json`
        );
        this.embeddingFunc = config.embeddingFunc;
        this.cosineThreshold = config.cosineThreshold ?? 0.2;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await ensureDir(path.dirname(this.filePath));

        if (await fileExists(this.filePath)) {
            const loaded = await readJson<Record<string, VectorData>>(this.filePath);
            if (loaded) {
                this.data = new Map(Object.entries(loaded));
                logger.debug(`Loaded ${this.data.size} vectors from ${this.filePath}`);
            }
        }

        this.initialized = true;
    }

    async finalize(): Promise<void> {
        if (this.isDirty) {
            await this.persist();
        }
    }

    async query(query: string, topK: number, queryEmbedding?: number[]): Promise<VectorQueryResult[]> {
        // Get query embedding if not provided
        let embedding = queryEmbedding;
        if (!embedding) {
            if (!this.embeddingFunc) {
                throw new Error('Embedding function not configured');
            }
            const embeddings = await this.embeddingFunc([query]);
            embedding = embeddings[0];
        }

        // Calculate similarities
        const results: VectorQueryResult[] = [];

        for (const [id, vectorData] of this.data.entries()) {
            const score = cosineSimilarity(embedding, vectorData.embedding);

            if (score >= this.cosineThreshold) {
                results.push({
                    id,
                    score,
                    data: vectorData,
                });
            }
        }

        // Sort by score descending and take topK
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    async upsert(data: Record<string, VectorData>): Promise<void> {
        for (const [key, value] of Object.entries(data)) {
            this.data.set(key, value);
        }
        this.isDirty = true;
    }

    async delete(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.data.delete(id);
        }
        this.isDirty = true;
    }

    async deleteEntity(entityName: string): Promise<void> {
        // Delete by entity_name in metadata
        const toDelete: string[] = [];
        for (const [id, data] of this.data.entries()) {
            if (data.metadata?.entity_name === entityName) {
                toDelete.push(id);
            }
        }
        await this.delete(toDelete);
    }

    async deleteEntityRelation(entityName: string): Promise<void> {
        // Delete relations where entityName is src or tgt
        const toDelete: string[] = [];
        for (const [id, data] of this.data.entries()) {
            const srcId = data.metadata?.src_id;
            const tgtId = data.metadata?.tgt_id;
            if (srcId === entityName || tgtId === entityName) {
                toDelete.push(id);
            }
        }
        await this.delete(toDelete);
    }

    async getById(id: string): Promise<VectorData | null> {
        return this.data.get(id) ?? null;
    }

    async getByIds(ids: string[]): Promise<VectorData[]> {
        const results: VectorData[] = [];
        for (const id of ids) {
            const item = this.data.get(id);
            if (item !== undefined) {
                results.push(item);
            }
        }
        return results;
    }

    async indexDoneCallback(): Promise<void> {
        if (this.isDirty) {
            await this.persist();
        }
    }

    async drop(): Promise<{ status: string; message: string }> {
        try {
            this.data.clear();
            this.isDirty = true;
            await this.persist();
            return { status: 'success', message: 'data dropped' };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { status: 'error', message };
        }
    }

    private async persist(): Promise<void> {
        const obj: Record<string, VectorData> = {};
        for (const [key, value] of this.data.entries()) {
            obj[key] = value;
        }
        await writeJson(this.filePath, obj);
        this.isDirty = false;
        logger.debug(`Persisted ${this.data.size} vectors to ${this.filePath}`);
    }
}
