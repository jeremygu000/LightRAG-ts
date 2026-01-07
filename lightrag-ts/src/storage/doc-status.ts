/**
 * Document Status Storage
 *
 * Storage implementation for tracking document processing status.
 * Allows checking whether documents have been processed, are in progress,
 * or failed during ingestion.
 *
 * @module storage/doc-status
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { DocumentStatus, DocStatusType } from '../types.js';
import { ensureDir, readJson, writeJson, logger } from '../utils/index.js';

/**
 * Document status storage configuration.
 */
export interface DocStatusStorageConfig {
    /** Working directory for status file */
    workingDir: string;
    /** Namespace for isolation */
    namespace?: string;
}

/**
 * JSON file-based document status storage.
 *
 * Tracks the processing status of documents throughout the ingestion pipeline.
 * Each document is identified by its content hash and stores metadata about
 * processing progress.
 *
 * @implements BaseKVStorage<DocumentStatus>
 *
 * @example
 * ```typescript
 * const docStatus = new DocStatusStorage({ workingDir: './data' });
 * await docStatus.initialize();
 *
 * // Check if document already processed
 * const status = await docStatus.getById('doc-abc123');
 * if (!status || status.status === 'failed') {
 *   // Process document
 * }
 *
 * // Update status
 * await docStatus.upsert({
 *   'doc-abc123': {
 *     contentSummary: 'First 100 chars...',
 *     contentLength: 5000,
 *     filePath: '/path/to/doc.txt',
 *     status: 'processing',
 *     createdAt: new Date().toISOString(),
 *     updatedAt: new Date().toISOString(),
 *   }
 * });
 * ```
 */
export class DocStatusStorage {
    private data: Map<string, DocumentStatus> = new Map();
    private filePath: string;
    private isDirty: boolean = false;

    constructor(private config: DocStatusStorageConfig) {
        const namespace = config.namespace || 'default';
        this.filePath = path.join(config.workingDir, namespace, 'doc_status.json');
    }

    /**
     * Initialize storage and load existing data.
     */
    async initialize(): Promise<void> {
        await ensureDir(path.dirname(this.filePath));
        const loaded = await readJson<Record<string, DocumentStatus>>(this.filePath);
        if (loaded) {
            this.data = new Map(Object.entries(loaded));
            logger.debug(`DocStatusStorage: loaded ${this.data.size} document statuses`);
        }
    }

    /**
     * Persist changes to disk if dirty.
     */
    async finalize(): Promise<void> {
        if (this.isDirty) {
            const obj = Object.fromEntries(this.data.entries());
            await writeJson(this.filePath, obj);
            this.isDirty = false;
            logger.debug(`DocStatusStorage: saved ${this.data.size} document statuses`);
        }
    }

    /**
     * Get document status by ID (content hash).
     *
     * @param id - Document content hash
     * @returns Document status or null if not found
     */
    async getById(id: string): Promise<DocumentStatus | null> {
        return this.data.get(id) ?? null;
    }

    /**
     * Get multiple document statuses by IDs.
     *
     * @param ids - Array of document content hashes
     * @returns Array of statuses (null for not found)
     */
    async getByIds(ids: string[]): Promise<(DocumentStatus | null)[]> {
        return ids.map(id => this.data.get(id) ?? null);
    }

    /**
     * Upsert document statuses.
     *
     * @param data - Map of ID to status
     */
    async upsert(data: Record<string, DocumentStatus>): Promise<void> {
        const now = new Date().toISOString();
        for (const [id, status] of Object.entries(data)) {
            const existing = this.data.get(id);
            if (existing) {
                // Update existing
                this.data.set(id, {
                    ...existing,
                    ...status,
                    updatedAt: now,
                });
            } else {
                // Create new
                this.data.set(id, {
                    ...status,
                    createdAt: status.createdAt || now,
                    updatedAt: now,
                });
            }
        }
        this.isDirty = true;
    }

    /**
     * Delete document status by ID.
     *
     * @param id - Document ID to delete
     */
    async deleteById(id: string): Promise<void> {
        if (this.data.delete(id)) {
            this.isDirty = true;
        }
    }

    /**
     * Delete multiple document statuses.
     *
     * @param ids - Document IDs to delete
     */
    async deleteByIds(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.data.delete(id);
        }
        this.isDirty = true;
    }

    /**
     * Drop all document statuses.
     */
    async drop(): Promise<void> {
        this.data.clear();
        try {
            await fs.unlink(this.filePath);
        } catch {
            // Ignore if file doesn't exist
        }
        this.isDirty = false;
    }

    /**
     * Check if a document has been fully processed.
     *
     * @param id - Document ID
     * @returns True if document exists and status is 'processed'
     */
    async isProcessed(id: string): Promise<boolean> {
        const status = await this.getById(id);
        return status?.status === 'processed';
    }

    /**
     * Get all documents with a specific status.
     *
     * @param status - Status to filter by
     * @returns Array of [id, DocumentStatus] tuples
     */
    async getByStatus(status: DocStatusType): Promise<[string, DocumentStatus][]> {
        const results: [string, DocumentStatus][] = [];
        for (const [id, docStatus] of this.data.entries()) {
            if (docStatus.status === status) {
                results.push([id, docStatus]);
            }
        }
        return results;
    }

    /**
     * Get all pending documents (not yet processed).
     */
    async getPending(): Promise<[string, DocumentStatus][]> {
        return this.getByStatus('pending');
    }

    /**
     * Get all failed documents.
     */
    async getFailed(): Promise<[string, DocumentStatus][]> {
        return this.getByStatus('failed');
    }

    /**
     * Get all documents currently being processed.
     */
    async getProcessing(): Promise<[string, DocumentStatus][]> {
        return this.getByStatus('processing');
    }

    /**
     * Mark document as processing.
     *
     * @param id - Document ID
     */
    async markProcessing(id: string): Promise<void> {
        const existing = await this.getById(id);
        if (existing) {
            await this.upsert({
                [id]: { ...existing, status: 'processing' },
            });
        }
    }

    /**
     * Mark document as processed with chunk info.
     *
     * @param id - Document ID
     * @param chunksCount - Number of chunks created
     * @param chunksList - List of chunk IDs
     */
    async markProcessed(id: string, chunksCount?: number, chunksList?: string[]): Promise<void> {
        const existing = await this.getById(id);
        if (existing) {
            await this.upsert({
                [id]: {
                    ...existing,
                    status: 'processed',
                    chunksCount,
                    chunksList,
                    errorMsg: undefined,
                },
            });
        }
    }

    /**
     * Mark document as failed with error.
     *
     * @param id - Document ID
     * @param errorMsg - Error message
     */
    async markFailed(id: string, errorMsg: string): Promise<void> {
        const existing = await this.getById(id);
        if (existing) {
            await this.upsert({
                [id]: { ...existing, status: 'failed', errorMsg },
            });
        }
    }

    /**
     * Get total document count.
     */
    get size(): number {
        return this.data.size;
    }

    /**
     * Get all document IDs.
     */
    getAllIds(): string[] {
        return Array.from(this.data.keys());
    }

    /**
     * Check if document exists.
     */
    async has(id: string): Promise<boolean> {
        return this.data.has(id);
    }
}
