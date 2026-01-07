import { Redis } from 'ioredis';
import { BaseKVStorage, StorageConfig } from './base.js';
import { logger } from '../utils/index.js';

export class RedisKVStorage<T> implements BaseKVStorage<T> {
    private client: Redis;
    private prefix: string;
    private initialized: boolean = false;

    constructor(config: StorageConfig & { storageName: string }) {
        this.client = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            lazyConnect: true, // Don't connect on creation, wait for initialize()
        });

        // Key prefix: namespace:storageName:
        this.prefix = `${config.namespace}:${config.storageName}:`;
    }

    private getKey(id: string): string {
        return `${this.prefix}${id}`;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.client.connect();
            logger.info(`RedisKVStorage initialized for ${this.prefix}`);
            this.initialized = true;
        } catch (error) {
            // Redis lazyConnect throws if connection fails on connect() call
            // OR if already connected (which shouldn't happen with lazyConnect+flag check)
            // But ioredis might auto-connect if we didn't set lazyConnect: true.
            // With lazyConnect: true, we must call connect().
            if ((error as any).message !== 'Redis is already connecting/connected') {
                logger.error(`Failed to connect to Redis: ${error}`);
                throw error;
            }
        }
    }

    async finalize(): Promise<void> {
        await this.client.quit();
    }

    async getById(id: string): Promise<T | null> {
        const value = await this.client.get(this.getKey(id));
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch (e) {
            logger.error(`Failed to parse Redis value for ${id}: ${e}`);
            return null;
        }
    }

    async getByIds(ids: string[]): Promise<T[]> {
        if (ids.length === 0) return [];

        const pipeline = this.client.pipeline();
        ids.forEach(id => pipeline.get(this.getKey(id)));
        const results = await pipeline.exec();

        if (!results) return [];

        return results
            .map(([err, result]: [Error | null, unknown]) => {
                if (err || !result) return null;
                try {
                    return JSON.parse(result as string) as T;
                } catch {
                    return null;
                }
            })
            .filter((item: T | null): item is T => item !== null);
    }

    async filterKeys(keys: Set<string>): Promise<Set<string>> {
        const missingKeys = new Set<string>();
        // Pipeline EXISTS check
        // Or simpler: just MGET and check nulls if keys count is reasonable.
        // For large sets, pipeline EXISTS or check individually. 
        // Let's use pipeline EXISTS for efficiency.

        const keyArray = Array.from(keys);
        if (keyArray.length === 0) return missingKeys;

        const pipeline = this.client.pipeline();
        keyArray.forEach(id => pipeline.exists(this.getKey(id)));
        const results = await pipeline.exec();

        if (results) {
            results.forEach(([err, exists]: [Error | null, unknown], index: number) => {
                if (err || !exists) {
                    missingKeys.add(keyArray[index]);
                }
            });
        }

        return missingKeys;
    }

    async upsert(data: Record<string, T>): Promise<void> {
        const pipeline = this.client.pipeline();
        for (const [id, value] of Object.entries(data)) {
            pipeline.set(this.getKey(id), JSON.stringify(value));
        }
        await pipeline.exec();
    }

    async delete(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const pipeline = this.client.pipeline();
        ids.forEach(id => pipeline.del(this.getKey(id)));
        await pipeline.exec();
    }

    async isEmpty(): Promise<boolean> {
        // SCAN for one key with prefix
        const stream = this.client.scanStream({
            match: `${this.prefix}*`,
            count: 1
        });

        return new Promise((resolve) => {
            stream.on('data', (keys: string[]) => {
                if (keys.length > 0) {
                    resolve(false);
                    stream.destroy();
                }
            });
            stream.on('end', () => {
                resolve(true);
            });
        });
    }

    async indexDoneCallback(): Promise<void> {
        // Redis is persistent by default (AOF/RDB)
    }

    async drop(): Promise<{ status: string; message: string }> {
        // Delete all keys with prefix
        const stream = this.client.scanStream({
            match: `${this.prefix}*`,
            count: 100
        });

        const pipeline = this.client.pipeline();

        for await (const keys of stream) {
            if (keys.length > 0) {
                (keys as string[]).forEach((key: string) => pipeline.del(key));
            }
        }
        await pipeline.exec();

        return { status: 'success', message: 'Redis storage cleared' };
    }
}
