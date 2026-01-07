/**
 * LightRAG Custom Exceptions
 *
 * Custom error classes for handling various error conditions in the LightRAG system.
 * These exceptions provide semantic meaning and can be caught selectively.
 *
 * @module exceptions
 */

/**
 * Base error class for all LightRAG errors.
 *
 * @extends Error
 *
 * @example
 * ```typescript
 * try {
 *   await rag.insert(document);
 * } catch (error) {
 *   if (error instanceof LightRAGError) {
 *     console.error('LightRAG error:', error.message);
 *   }
 * }
 * ```
 */
export class LightRAGError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LightRAGError';
        // Maintains proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Thrown when a pipeline operation is cancelled.
 *
 * This can occur when:
 * - User manually cancels an ongoing operation
 * - A shutdown signal is received during processing
 * - A timeout limit is reached
 *
 * @extends LightRAGError
 */
export class PipelineCancelledException extends LightRAGError {
    constructor(message: string = 'Pipeline operation was cancelled') {
        super(message);
        this.name = 'PipelineCancelledException';
    }
}

/**
 * Thrown when a text chunk exceeds the configured token limit.
 *
 * This typically occurs when using `splitByCharacterOnly` mode and
 * the resulting chunks are larger than `chunkTokenSize`.
 *
 * @extends LightRAGError
 *
 * @example
 * ```typescript
 * try {
 *   const chunks = chunkingByTokenSize(tokenizer, text, {
 *     splitByCharacterOnly: true,
 *     chunkTokenSize: 1200,
 *   });
 * } catch (error) {
 *   if (error instanceof ChunkTokenLimitExceededError) {
 *     console.error(`Chunk too large: ${error.chunkTokens} > ${error.chunkTokenLimit}`);
 *   }
 * }
 * ```
 */
export class ChunkTokenLimitExceededError extends LightRAGError {
    /** Actual number of tokens in the chunk */
    public readonly chunkTokens: number;
    /** Configured maximum token limit */
    public readonly chunkTokenLimit: number;
    /** Preview of the chunk content (first 120 chars) */
    public readonly chunkPreview: string;

    constructor(options: {
        chunkTokens: number;
        chunkTokenLimit: number;
        chunkPreview?: string;
    }) {
        const message = `Chunk exceeds token limit: ${options.chunkTokens} > ${options.chunkTokenLimit}`;
        super(message);
        this.name = 'ChunkTokenLimitExceededError';
        this.chunkTokens = options.chunkTokens;
        this.chunkTokenLimit = options.chunkTokenLimit;
        this.chunkPreview = options.chunkPreview ?? '';
    }
}

/**
 * Thrown when a storage operation fails.
 *
 * @extends LightRAGError
 */
export class StorageError extends LightRAGError {
    /** Name of the storage that failed */
    public readonly storageName: string;
    /** Type of operation that failed */
    public readonly operation: string;

    constructor(options: {
        storageName: string;
        operation: string;
        message?: string;
        cause?: Error;
    }) {
        const message = options.message
            ?? `Storage operation '${options.operation}' failed on '${options.storageName}'`;
        super(message);
        this.name = 'StorageError';
        this.storageName = options.storageName;
        this.operation = options.operation;
        if (options.cause) {
            this.cause = options.cause;
        }
    }
}

/**
 * Thrown when an LLM call fails after retries.
 *
 * @extends LightRAGError
 */
export class LLMError extends LightRAGError {
    /** Number of retries attempted */
    public readonly retries: number;
    /** Original error from the LLM provider */
    public readonly originalError?: Error;

    constructor(options: {
        message: string;
        retries?: number;
        originalError?: Error;
    }) {
        super(options.message);
        this.name = 'LLMError';
        this.retries = options.retries ?? 0;
        this.originalError = options.originalError;
        if (options.originalError) {
            this.cause = options.originalError;
        }
    }
}

/**
 * Thrown when embedding generation fails.
 *
 * @extends LightRAGError
 */
export class EmbeddingError extends LightRAGError {
    /** Number of texts that failed to embed */
    public readonly textCount: number;

    constructor(options: {
        message: string;
        textCount?: number;
        cause?: Error;
    }) {
        super(options.message);
        this.name = 'EmbeddingError';
        this.textCount = options.textCount ?? 0;
        if (options.cause) {
            this.cause = options.cause;
        }
    }
}

/**
 * Thrown when entity extraction fails.
 *
 * @extends LightRAGError
 */
export class ExtractionError extends LightRAGError {
    /** Chunk ID that failed extraction */
    public readonly chunkId?: string;

    constructor(options: {
        message: string;
        chunkId?: string;
        cause?: Error;
    }) {
        super(options.message);
        this.name = 'ExtractionError';
        this.chunkId = options.chunkId;
        if (options.cause) {
            this.cause = options.cause;
        }
    }
}

/**
 * Thrown when configuration validation fails.
 *
 * @extends LightRAGError
 */
export class ConfigurationError extends LightRAGError {
    /** Name of the configuration parameter */
    public readonly paramName: string;
    /** Invalid value that was provided */
    public readonly invalidValue: unknown;

    constructor(options: {
        paramName: string;
        invalidValue: unknown;
        message?: string;
    }) {
        const message = options.message
            ?? `Invalid configuration for '${options.paramName}': ${JSON.stringify(options.invalidValue)}`;
        super(message);
        this.name = 'ConfigurationError';
        this.paramName = options.paramName;
        this.invalidValue = options.invalidValue;
    }
}

/**
 * Thrown when a required resource is not found.
 *
 * @extends LightRAGError
 */
export class NotFoundError extends LightRAGError {
    /** Type of resource that was not found */
    public readonly resourceType: string;
    /** Identifier of the resource */
    public readonly resourceId: string;

    constructor(options: {
        resourceType: string;
        resourceId: string;
        message?: string;
    }) {
        const message = options.message
            ?? `${options.resourceType} not found: ${options.resourceId}`;
        super(message);
        this.name = 'NotFoundError';
        this.resourceType = options.resourceType;
        this.resourceId = options.resourceId;
    }
}
