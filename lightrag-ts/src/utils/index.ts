/**
 * LightRAG TypeScript Utilities
 *
 * Comprehensive utility functions for text processing, hashing, async operations,
 * file I/O, and mathematical operations used throughout the LightRAG system.
 *
 * @module utils
 */

import { createHash } from 'crypto';
import { encode, decode } from 'gpt-tokenizer';
import { promises as fs } from 'fs';
import path from 'path';
import {
    GRAPH_FIELD_SEP,
    DEFAULT_MAX_SOURCE_IDS_PER_ENTITY,
    SOURCE_IDS_LIMIT_METHOD_FIFO,
    SOURCE_IDS_LIMIT_METHOD_KEEP,
} from '../constants.js';

// ==================== Hashing ====================

/**
 * Compute MD5 hash of concatenated arguments.
 *
 * @param args - Values to hash (will be stringified)
 * @returns Hexadecimal MD5 hash string
 *
 * @example
 * ```typescript
 * const hash = computeArgsHash('hello', 'world');
 * // => 'fc5e038d38a57032085441e7fe7010b0'
 * ```
 */
export function computeArgsHash(...args: unknown[]): string {
    const argsStr = args.map(arg => String(arg)).join('');
    return createHash('md5').update(argsStr, 'utf8').digest('hex');
}

/**
 * Compute a unique ID for content with optional prefix.
 *
 * @param content - Content to hash
 * @param prefix - Optional prefix for the ID
 * @returns Prefixed MD5 hash
 *
 * @example
 * ```typescript
 * const docId = computeMdhashId('document content', 'doc-');
 * // => 'doc-abc123...'
 * ```
 */
export function computeMdhashId(content: string, prefix: string = ''): string {
    return prefix + computeArgsHash(content);
}

// ==================== Tokenizer ====================

/**
 * Tokenizer interface for text encoding/decoding.
 */
export interface Tokenizer {
    /** Encode text to token IDs */
    encode(text: string): number[];
    /** Decode token IDs back to text */
    decode(tokens: number[]): string;
}

/**
 * GPT Tokenizer using tiktoken encoding (cl100k_base).
 *
 * @example
 * ```typescript
 * const tokenizer = new GPTTokenizer();
 * const tokens = tokenizer.encode('Hello, world!');
 * const text = tokenizer.decode(tokens);
 * ```
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
 * Count tokens in text using GPT tokenizer.
 *
 * @param text - Text to count tokens in
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
    return encode(text).length;
}

// ==================== Text Processing ====================

/**
 * Split string by multiple markers.
 *
 * @param input - String to split
 * @param markers - Array of markers to split by
 * @returns Array of trimmed, non-empty parts
 *
 * @example
 * ```typescript
 * const parts = splitStringByMultiMarkers('a<SEP>b<SEP>c', ['<SEP>']);
 * // => ['a', 'b', 'c']
 * ```
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
 * Sanitize and normalize extracted text.
 *
 * Removes outer quotes, optionally removes inner quotes,
 * and normalizes whitespace.
 *
 * @param text - Text to sanitize
 * @param removeInnerQuotes - Whether to remove quotes inside the text
 * @returns Sanitized text
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
 * Check if string represents a valid float number.
 *
 * @param value - String to check
 * @returns True if valid float format
 */
export function isFloatString(value: string): boolean {
    return /^-?\d+\.?\d*$/.test(value.trim());
}

/**
 * Remove <think>...</think> tags from LLM output.
 *
 * Used to strip reasoning/thinking sections from model responses.
 *
 * @param text - Text potentially containing think tags
 * @returns Text with think tags removed
 */
export function removeThinkTags(text: string): string {
    if (!text) return '';
    // Remove <think>...</think> tags including content
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Fix common tuple delimiter corruption in LLM output.
 *
 * Handles cases where the delimiter is malformed or partially generated.
 *
 * @param text - Text with potentially corrupted delimiters
 * @param expectedDelimiter - The expected delimiter format
 * @returns Text with fixed delimiters
 */
export function fixTupleDelimiterCorruption(text: string, expectedDelimiter: string = '<|#|>'): string {
    if (!text) return '';

    // Common corruption patterns
    const patterns = [
        /\s*<\|\s*#\s*\|\s*>\s*/g,  // Spaces inside delimiter
        /\s*<\s*\|\s*#\s*\|\s*>\s*/g,  // More spaces
        /\s*<\|#\|>\s*/g,  // Spaces around delimiter
    ];

    let result = text;
    for (const pattern of patterns) {
        result = result.replace(pattern, expectedDelimiter);
    }

    return result;
}

/**
 * Truncate list by total token size.
 *
 * @param items - Array of items to truncate
 * @param getContent - Function to get string content from item
 * @param maxTokenSize - Maximum total tokens allowed
 * @param tokenizer - Tokenizer instance
 * @returns Truncated array fitting within token limit
 *
 * @example
 * ```typescript
 * const items = [{ text: 'hello' }, { text: 'world' }];
 * const truncated = truncateListByTokenSize(
 *   items,
 *   item => item.text,
 *   10,
 *   new GPTTokenizer()
 * );
 * ```
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

// ==================== Source IDs Management ====================

/**
 * Merge source IDs with deduplication.
 *
 * @param existing - Existing source IDs (SEP-separated)
 * @param newIds - New source IDs to add (SEP-separated)
 * @returns Merged source IDs string
 */
export function mergeSourceIds(existing: string, newIds: string): string {
    if (!existing) return newIds || '';
    if (!newIds) return existing;

    const existingSet = new Set(existing.split(GRAPH_FIELD_SEP).filter(Boolean));
    const newIdsList = newIds.split(GRAPH_FIELD_SEP).filter(Boolean);

    for (const id of newIdsList) {
        existingSet.add(id);
    }

    return Array.from(existingSet).join(GRAPH_FIELD_SEP);
}

/**
 * Apply source IDs limit using specified method.
 *
 * @param sourceIds - Source IDs string (SEP-separated)
 * @param limit - Maximum number of IDs to keep
 * @param method - 'FIFO' (newest) or 'KEEP' (oldest)
 * @returns Limited source IDs string
 *
 * @example
 * ```typescript
 * const limited = applySourceIdsLimit(
 *   'chunk-1<SEP>chunk-2<SEP>chunk-3',
 *   2,
 *   'FIFO'
 * );
 * // => 'chunk-2<SEP>chunk-3' (keeps newest)
 * ```
 */
export function applySourceIdsLimit(
    sourceIds: string,
    limit: number = DEFAULT_MAX_SOURCE_IDS_PER_ENTITY,
    method: string = SOURCE_IDS_LIMIT_METHOD_FIFO
): string {
    if (!sourceIds) return '';

    const ids = sourceIds.split(GRAPH_FIELD_SEP).filter(Boolean);

    if (ids.length <= limit) {
        return sourceIds;
    }

    if (method === SOURCE_IDS_LIMIT_METHOD_FIFO) {
        // Keep newest (last N items)
        return ids.slice(-limit).join(GRAPH_FIELD_SEP);
    } else if (method === SOURCE_IDS_LIMIT_METHOD_KEEP) {
        // Keep oldest (first N items)
        return ids.slice(0, limit).join(GRAPH_FIELD_SEP);
    }

    // Default to FIFO
    return ids.slice(-limit).join(GRAPH_FIELD_SEP);
}

/**
 * Generate reference list from chunks for RAG output.
 *
 * @param chunks - Array of chunks with file paths
 * @returns Formatted reference list string
 */
export function generateReferenceList(
    chunks: Array<{ filePath: string; referenceId?: number }>
): string {
    const seen = new Set<string>();
    const references: string[] = [];
    let refId = 1;

    for (const chunk of chunks) {
        if (!seen.has(chunk.filePath)) {
            seen.add(chunk.filePath);
            const id = chunk.referenceId ?? refId++;
            references.push(`[${id}] ${chunk.filePath}`);
        }
    }

    return references.join('\n');
}

/**
 * Make relation chunk key from source and target.
 *
 * @param srcId - Source entity ID
 * @param tgtId - Target entity ID
 * @returns Normalized relation key (sorted alphabetically)
 */
export function makeRelationChunkKey(srcId: string, tgtId: string): string {
    return [srcId, tgtId].sort().join(GRAPH_FIELD_SEP);
}

// ==================== Selection Strategies ====================

/**
 * Pick items by vector similarity (weighted random selection).
 *
 * @param items - Items with scores
 * @param k - Number of items to pick
 * @returns Selected items
 */
export function pickByVectorSimilarity<T extends { score: number }>(
    items: T[],
    k: number
): T[] {
    if (items.length <= k) return items;

    // Sort by score descending and take top k
    return [...items].sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Pick items using weighted polling strategy.
 *
 * Higher-scored items have proportionally higher chance of selection.
 *
 * @param items - Items with scores
 * @param k - Number of items to pick
 * @returns Selected items
 */
export function pickByWeightedPolling<T extends { score: number }>(
    items: T[],
    k: number
): T[] {
    if (items.length <= k) return items;

    // Calculate cumulative weights
    const totalScore = items.reduce((sum, item) => sum + Math.max(0, item.score), 0);
    if (totalScore === 0) {
        // Equal probability if all scores are 0 or negative
        return items.slice(0, k);
    }

    const selected: T[] = [];
    const remaining = [...items];

    while (selected.length < k && remaining.length > 0) {
        const rand = Math.random() * remaining.reduce((sum, item) => sum + Math.max(0, item.score), 0);
        let cumulative = 0;

        for (let i = 0; i < remaining.length; i++) {
            cumulative += Math.max(0, remaining[i].score);
            if (cumulative >= rand) {
                selected.push(remaining[i]);
                remaining.splice(i, 1);
                break;
            }
        }
    }

    return selected;
}

// ==================== OpenAI Message Formatting ====================

/**
 * Pack user and assistant messages into OpenAI format.
 *
 * @param userMessage - User message content
 * @param assistantMessage - Assistant response content
 * @returns Array of message objects
 */
export function packUserAssToOpenaiMessages(
    userMessage: string,
    assistantMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantMessage },
    ];
}

// ==================== Async Utilities ====================

/**
 * Sleep for specified milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param maxRetries - Maximum number of attempts
 * @param baseDelay - Initial delay in ms (doubles each retry)
 * @returns Result of successful operation
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetchData(),
 *   3,
 *   1000
 * );
 * ```
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
 * Run operations in parallel with concurrency limit.
 *
 * @param items - Items to process
 * @param operation - Async operation for each item
 * @param limit - Maximum concurrent operations
 * @returns Array of results in original order
 *
 * @example
 * ```typescript
 * const results = await parallelLimit(
 *   urls,
 *   url => fetch(url),
 *   4  // max 4 concurrent requests
 * );
 * ```
 */
export async function parallelLimit<T, R>(
    items: T[],
    operation: (item: T, index: number) => Promise<R>,
    limit: number = 4
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await operation(items[currentIndex], currentIndex);
        }
    }

    // Create workers up to the limit
    const workers = Array(Math.min(limit, items.length))
        .fill(null)
        .map(() => worker());

    await Promise.all(workers);
    return results;
}

/**
 * Create a semaphore for limiting concurrent operations.
 *
 * @param limit - Maximum concurrent operations
 * @returns Semaphore object with acquire/release methods
 *
 * @example
 * ```typescript
 * const sem = createSemaphore(4);
 * await sem.acquire();
 * try {
 *   await doWork();
 * } finally {
 *   sem.release();
 * }
 * ```
 */
export function createSemaphore(limit: number) {
    let current = 0;
    const queue: Array<() => void> = [];

    return {
        async acquire(): Promise<void> {
            if (current < limit) {
                current++;
                return;
            }
            return new Promise<void>(resolve => {
                queue.push(() => {
                    current++;
                    resolve();
                });
            });
        },
        release(): void {
            current--;
            const next = queue.shift();
            if (next) {
                next();
            }
        },
    };
}

// ==================== File Utilities ====================

/**
 * Ensure directory exists (creates recursively if needed).
 *
 * @param dirPath - Directory path to ensure
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read JSON file safely.
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON or null if read fails
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
 * Write JSON file with pretty printing.
 *
 * @param filePath - Path to write to
 * @param data - Data to serialize
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check if file exists.
 *
 * @param filePath - Path to check
 * @returns True if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Delete file if it exists.
 *
 * @param filePath - Path to delete
 */
export async function deleteFile(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore errors (file may not exist)
    }
}

// ==================== Math Utilities ====================

/**
 * Compute cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1
 * @throws If vectors have different lengths
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

/**
 * Log level type.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration.
 */
export interface LoggerConfig {
    level: LogLevel;
    prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
let logPrefix = 'LightRAG';

/**
 * Configure logger settings.
 *
 * @param config - Logger configuration
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
    if (config.level) {
        currentLogLevel = config.level;
    }
    if (config.prefix !== undefined) {
        logPrefix = config.prefix;
    }
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

function formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = logPrefix ? `[${logPrefix}] ` : '';
    return `${timestamp} ${level.toUpperCase()} ${prefix}${message}`;
}

/**
 * Logger utility with configurable levels.
 *
 * Set LOG_LEVEL environment variable to control output:
 * - debug: All messages
 * - info: Info, warn, error
 * - warn: Warn, error
 * - error: Only errors
 *
 * @example
 * ```typescript
 * logger.info('Processing document');
 * logger.debug('Detail information');
 * logger.error('Something failed', error);
 * ```
 */
export const logger = {
    debug: (message: string, ...args: unknown[]) => {
        if (shouldLog('debug') || process.env.DEBUG) {
            console.log(formatMessage('debug', message), ...args);
        }
    },
    info: (message: string, ...args: unknown[]) => {
        if (shouldLog('info')) {
            console.log(formatMessage('info', message), ...args);
        }
    },
    warn: (message: string, ...args: unknown[]) => {
        if (shouldLog('warn')) {
            console.warn(formatMessage('warn', message), ...args);
        }
    },
    error: (message: string, ...args: unknown[]) => {
        if (shouldLog('error')) {
            console.error(formatMessage('error', message), ...args);
        }
    },
};
