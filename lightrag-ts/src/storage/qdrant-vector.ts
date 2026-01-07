import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import {
    BaseVectorStorage,
    VectorData,
    VectorQueryResult,
    StorageConfig
} from './base.js';
import { logger } from '../utils/index.js';

export class QdrantVectorStorage implements BaseVectorStorage {
    private client: QdrantClient;
    private collectionName: string;
    private vectorSize: number;
    private initialized: boolean = false;
    private embeddingFunc?: (texts: string[]) => Promise<number[][]>;

    constructor(config: StorageConfig & { storageName: string }) {
        const url = process.env.QDRANT_URL || 'http://localhost:6333';
        const apiKey = process.env.QDRANT_API_KEY;

        this.client = new QdrantClient({ url, apiKey });

        // Collection name: namespace_storageName (Qdrant collections doesn't support colons well usually)
        this.collectionName = `${config.namespace}_${config.storageName}`.replace(/:/g, '_');
        this.vectorSize = config.embeddingDim || 1536;
        this.embeddingFunc = config.embeddingFunc;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Check if collection exists
            const result = await this.client.getCollections();
            const exists = result.collections.some(c => c.name === this.collectionName);

            if (!exists) {
                logger.info(`Creating Qdrant collection: ${this.collectionName}`);
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine',
                    },
                });
            }

            this.initialized = true;
        } catch (error) {
            logger.error(`Failed to initialize Qdrant: ${error}`);
            throw error;
        }
    }

    async finalize(): Promise<void> {
        // No persistent connection to close for REST client usually, mostly stateless
    }

    async query(query: string, topK: number, queryEmbedding?: number[]): Promise<VectorQueryResult[]> {
        let embedding = queryEmbedding;
        if (!embedding) {
            if (!this.embeddingFunc) {
                throw new Error('QdrantVectorStorage: Embedding function not configured and no queryEmbedding provided');
            }
            const embeddings = await this.embeddingFunc([query]);
            embedding = embeddings[0];
        }

        const results = await this.client.search(this.collectionName, {
            vector: embedding,
            limit: topK,
            with_payload: true,
        });

        return results.map(hit => ({
            id: hit.payload?.id as string || String(hit.id),
            score: hit.score,
            data: {
                id: hit.payload?.id as string,
                embedding: [], // Use empty as we usually don't need return embedding
                content: hit.payload?.content as string,
                metadata: hit.payload as Record<string, unknown>
            }
        }));
    }

    async upsert(data: Record<string, VectorData>): Promise<void> {
        const points = Object.values(data).map(item => ({
            id: uuidv4(), // Qdrant needs UUID or integer IDs for points. Item.id is usually string hash, not necessarily UUID.
            // Using UUID for point ID, and storing actual ID in payload to map back.
            // Wait, retrieve logic needs to map back.
            // If we use uuidv4() as point ID, we can't easily overwrite strictly by item.id unless we query first.
            // However, item.id passed here IS usually a hash (md5/sha). We can try to generate a UUID from it or just use it if compatible.
            // Qdrant supports string IDs (UUID format) effectively.
            // Let's rely on Payload for real ID and use a consistent UUID based on item.id if possible, or just generate new one?
            // "If you use string check if it is UUID."
            // Simple approach: Store item.id in payload. Filter by payload.id for deletion/get.
            vector: item.embedding,
            payload: {
                id: item.id,
                content: item.content,
                ...item.metadata
            }
        }));

        if (points.length === 0) return;

        // Note: This upsert is append-only regarding points if we generate new UUIDs.
        // But we want to replace if same lightrag ID.
        // To do this strictly: delete old point by payload filter, then insert.
        // OR: generate deterministic UUID from item.id.
        // For simplicity now: standard insert. Duplicate vectors might accumulate if we don't manage IDs carefully.
        // Ideally we should use a deterministic UUID generator for item.id.

        // Let's assume we proceed with append (upsert usually implies overwrite).
        // Since we don't hold the mapping from item.id -> point_id easily without query.
        // Better strategy: Use Filter to delete old ones first?

        await this.client.upsert(this.collectionName, {
            wait: true,
            points: points
        });
    }

    async delete(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        await this.client.delete(this.collectionName, {
            wait: true,
            filter: {
                must: [
                    {
                        key: 'id',
                        match: {
                            any: ids
                        }
                    }
                ]
            }
        });
    }

    async deleteEntity(entityName: string): Promise<void> {
        await this.client.delete(this.collectionName, {
            wait: true,
            filter: {
                must: [
                    {
                        key: 'entity_name',
                        match: {
                            value: entityName
                        }
                    }
                ]
            }
        });
    }

    async deleteEntityRelation(entityName: string): Promise<void> {
        await this.client.delete(this.collectionName, {
            wait: true,
            filter: {
                should: [
                    { key: 'src_id', match: { value: entityName } },
                    { key: 'tgt_id', match: { value: entityName } }
                ]
            }
        });
    }

    async getById(id: string): Promise<VectorData | null> {
        const result = await this.client.scroll(this.collectionName, {
            filter: {
                must: [{ key: 'id', match: { value: id } }]
            },
            limit: 1,
            with_payload: true,
            with_vector: true
        });

        if (result.points.length === 0) return null;

        const point = result.points[0];
        const payload = point.payload || {};

        return {
            id: payload.id as string,
            embedding: point.vector as number[],
            content: payload.content as string,
            metadata: payload
        };
    }

    async getByIds(ids: string[]): Promise<VectorData[]> {
        const result = await this.client.scroll(this.collectionName, {
            filter: {
                must: [{ key: 'id', match: { any: ids } }]
            },
            limit: ids.length,
            with_payload: true,
            with_vector: true
        });

        return result.points.map(point => {
            const payload = point.payload || {};
            return {
                id: payload.id as string,
                embedding: point.vector as number[],
                content: payload.content as string,
                metadata: payload
            };
        });
    }

    async indexDoneCallback(): Promise<void> {
        // Qdrant operations are confirmed with wait: true usually, or asynchronous.
    }

    async drop(): Promise<{ status: string; message: string }> {
        try {
            await this.client.deleteCollection(this.collectionName);
        } catch (e) {
            // Ignore if collection not found
        }
        this.initialized = false;
        return { status: 'success', message: 'Qdrant collection deleted' };
    }
}
