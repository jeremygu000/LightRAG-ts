/**
 * JSON-based Key-Value Storage Implementation
 */

import path from 'path';
import { BaseKVStorage, StorageConfig } from './base.js';
import { readJson, writeJson, fileExists, ensureDir, logger } from '../utils/index.js';

export class JsonKVStorage<T = Record<string, unknown>> implements BaseKVStorage<T> {
    private data: Map<string, T> = new Map();
    private filePath: string;
    private isDirty: boolean = false;
    private initialized: boolean = false;

    constructor(private config: StorageConfig & { storageName: string }) {
        this.filePath = path.join(
            config.workingDir,
            config.namespace || 'default',
            `${config.storageName}.json`
        );
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await ensureDir(path.dirname(this.filePath));

        if (await fileExists(this.filePath)) {
            const loaded = await readJson<Record<string, T>>(this.filePath);
            if (loaded) {
                this.data = new Map(Object.entries(loaded));
                logger.debug(`Loaded ${this.data.size} items from ${this.filePath}`);
            }
        }

        this.initialized = true;
    }

    async finalize(): Promise<void> {
        if (this.isDirty) {
            await this.persist();
        }
    }

    async getById(id: string): Promise<T | null> {
        return this.data.get(id) ?? null;
    }

    async getByIds(ids: string[]): Promise<T[]> {
        const results: T[] = [];
        for (const id of ids) {
            const item = this.data.get(id);
            if (item !== undefined) {
                results.push(item);
            }
        }
        return results;
    }

    async filterKeys(keys: Set<string>): Promise<Set<string>> {
        const nonExistent = new Set<string>();
        for (const key of keys) {
            if (!this.data.has(key)) {
                nonExistent.add(key);
            }
        }
        return nonExistent;
    }

    async upsert(data: Record<string, T>): Promise<void> {
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

    async isEmpty(): Promise<boolean> {
        return this.data.size === 0;
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
        const obj: Record<string, T> = {};
        for (const [key, value] of this.data.entries()) {
            obj[key] = value;
        }
        await writeJson(this.filePath, obj);
        this.isDirty = false;
        logger.debug(`Persisted ${this.data.size} items to ${this.filePath}`);
    }

    // Additional utility methods

    async getAllKeys(): Promise<string[]> {
        return Array.from(this.data.keys());
    }

    async getAll(): Promise<Record<string, T>> {
        const obj: Record<string, T> = {};
        for (const [key, value] of this.data.entries()) {
            obj[key] = value;
        }
        return obj;
    }
}
