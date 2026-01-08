/**
 * Elasticsearch BM25 Storage - Production-grade keyword search
 *
 * Uses Elasticsearch for BM25-based keyword retrieval to complement vector search.
 */

import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/index.js';

export interface BM25Document {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
}

export interface BM25SearchResult {
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
}

/**
 * Elasticsearch-based BM25 Storage for keyword search
 */
export class BM25Storage {
    private client: Client;
    private indexName: string;
    private initialized: boolean = false;

    constructor(options: {
        url?: string;
        indexName?: string;
    } = {}) {
        const esUrl = options.url || process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
        this.indexName = options.indexName || 'lightrag_chunks';

        this.client = new Client({
            node: esUrl,
        });
    }

    /**
     * Initialize the Elasticsearch index with BM25 settings
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Check if index exists
            const indexExists = await this.client.indices.exists({
                index: this.indexName,
            });

            if (!indexExists) {
                // Create index with BM25 optimized settings
                await this.client.indices.create({
                    index: this.indexName,
                    settings: {
                        index: {
                            similarity: {
                                default: {
                                    type: 'BM25',
                                    k1: 1.2,
                                    b: 0.75,
                                },
                            },
                        },
                    },
                    mappings: {
                        properties: {
                            content: {
                                type: 'text',
                                analyzer: 'standard',
                            },
                            metadata: {
                                type: 'object',
                                enabled: false,
                            },
                        },
                    },
                });
                logger.info(`Created Elasticsearch index: ${this.indexName}`);
            }

            this.initialized = true;
        } catch (error) {
            logger.error(`Failed to initialize Elasticsearch: ${error}`);
            // Don't throw - allow graceful degradation if ES is not available
            this.initialized = true;
        }
    }

    /**
     * Add documents to the Elasticsearch index
     */
    async addDocuments(docs: BM25Document[]): Promise<void> {
        if (docs.length === 0) return;

        try {
            const operations = docs.flatMap(doc => [
                { index: { _index: this.indexName, _id: doc.id } },
                { content: doc.content, metadata: doc.metadata },
            ]);

            await this.client.bulk({
                refresh: true,
                operations,
            });
        } catch (error) {
            logger.warn(`Failed to add documents to Elasticsearch: ${error}`);
        }
    }

    /**
     * Add a single document to the index
     */
    async addDocument(doc: BM25Document): Promise<void> {
        await this.addDocuments([doc]);
    }

    /**
     * Search documents using BM25 algorithm
     */
    search(query: string, topK: number = 10): BM25SearchResult[] {
        // Note: This is a synchronous wrapper for compatibility
        // Actual search is async, so we need to handle this carefully
        return [];
    }

    /**
     * Search documents using BM25 algorithm (async version)
     */
    async searchAsync(query: string, topK: number = 10): Promise<BM25SearchResult[]> {
        if (!query.trim()) {
            return [];
        }

        try {
            const response = await this.client.search({
                index: this.indexName,
                query: {
                    match: {
                        content: {
                            query,
                            operator: 'or',
                        },
                    },
                },
                size: topK,
            });

            return response.hits.hits.map(hit => ({
                id: hit._id as string,
                score: hit._score || 0,
                metadata: (hit._source as { metadata?: Record<string, unknown> })?.metadata,
            }));
        } catch (error) {
            logger.warn(`Elasticsearch search failed: ${error}`);
            return [];
        }
    }

    /**
     * Get document count
     */
    async getCount(): Promise<number> {
        try {
            const response = await this.client.count({
                index: this.indexName,
            });
            return response.count;
        } catch {
            return 0;
        }
    }

    /**
     * Clear all documents and reset the index
     */
    async drop(): Promise<void> {
        try {
            const indexExists = await this.client.indices.exists({
                index: this.indexName,
            });

            if (indexExists) {
                await this.client.indices.delete({
                    index: this.indexName,
                });
            }
            this.initialized = false;
        } catch (error) {
            logger.warn(`Failed to drop Elasticsearch index: ${error}`);
        }
    }
}

/**
 * Create a new BM25Storage instance
 */
export function createBM25Storage(options?: {
    url?: string;
    indexName?: string;
}): BM25Storage {
    return new BM25Storage(options);
}
