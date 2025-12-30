/**
 * LightRAG TypeScript Utilities
 */

import { createHash } from 'crypto';
import { encode, decode } from 'gpt-tokenizer';

// ==================== Hashing ====================

/**
 * Compute MD5 hash of a string
 */
export function computeArgsHash(...args: unknown[]): string {
    const argsStr = args.map(arg => String(arg)).join('');
    return createHash('md5').update(argsStr, 'utf8').digest('hex');
}

/**
 * Compute a unique ID for content with optional prefix
 */
export function computeMdhashId(content: string, prefix: string = ''): string {
    return prefix + computeArgsHash(content);
}

// ==================== Tokenizer ====================

export interface Tokenizer {
    encode(text: string): number[];
    decode(tokens: number[]): string;
}

/**
 * GPT Tokenizer using tiktoken encoding
 */
export class GPTTokenizer implements Tokenizer {
    encode(text: string): number[] {
        return encode(text);
    }

    decode(tokens: number[]): string {
        return decode(tokens);
    }
}

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
    return encode(text).length;
}

// ==================== Text Processing ====================

/**
 * Split string by multiple markers
 */
export function splitStringByMultiMarkers(input: string, markers: string[]): string[] {
    if (!markers || markers.length === 0) {
        return [input];
    }

    let result = [input];
    for (const marker of markers) {
        const newResult: string[] = [];
        for (const part of result) {
            const splits = part.split(marker);
            for (const s of splits) {
                const trimmed = s.trim();
                if (trimmed) {
                    newResult.push(trimmed);
                }
            }
        }
        result = newResult;
    }
    return result;
}

/**
 * Sanitize and normalize extracted text
 */
export function sanitizeAndNormalizeText(text: string, removeInnerQuotes: boolean = false): string {
    if (!text) return '';

    let result = text.trim();

    // Remove outer quotes
    if ((result.startsWith('"') && result.endsWith('"')) ||
        (result.startsWith("'") && result.endsWith("'"))) {
        result = result.slice(1, -1);
    }

    // Remove inner quotes if requested
    if (removeInnerQuotes) {
        result = result.replace(/['"]/g, '');
    }

    // Normalize whitespace
    result = result.replace(/\s+/g, ' ').trim();

    return result;
}

/**
 * Check if string is a valid float
 */
export function isFloatString(value: string): boolean {
    return /^-?\d+\.?\d*$/.test(value.trim());
}

/**
 * Truncate list by token size
 */
export function truncateListByTokenSize<T>(
    items: T[],
    getContent: (item: T) => string,
    maxTokenSize: number,
    tokenizer: Tokenizer
): T[] {
    const result: T[] = [];
    let totalTokens = 0;

    for (const item of items) {
        const content = getContent(item);
        const tokens = tokenizer.encode(content).length;

        if (totalTokens + tokens > maxTokenSize) {
            break;
        }

        result.push(item);
        totalTokens += tokens;
    }

    return result;
}

// ==================== Async Utilities ====================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

/**
 * Run operations in parallel with concurrency limit
 */
export async function parallelLimit<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    limit: number = 4
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
        const p = operation(items[i]).then(result => {
            results[i] = result;
        });

        executing.push(p as unknown as Promise<void>);

        if (executing.length >= limit) {
            await Promise.race(executing);
            // Remove completed promises
            for (let j = executing.length - 1; j >= 0; j--) {
                // Check if promise is resolved by trying to race with immediate
                const isResolved = await Promise.race([
                    executing[j].then(() => true),
                    Promise.resolve(false)
                ]);
                if (isResolved) {
                    executing.splice(j, 1);
                }
            }
        }
    }

    await Promise.all(executing);
    return results;
}

// ==================== File Utilities ====================

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read JSON file
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}

/**
 * Write JSON file
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// ==================== Math Utilities ====================

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

// ==================== Logger ====================

export const logger = {
    info: (message: string, ...args: unknown[]) => {
        console.log(`INFO: ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(`WARN: ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(`ERROR: ${message}`, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
        if (process.env.DEBUG) {
            console.log(`DEBUG: ${message}`, ...args);
        }
    },
};
