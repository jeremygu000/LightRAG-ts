/**
 * OpenAI LLM Integration
 */

import OpenAI from 'openai';
import type { ChatMessage, LLMConfig, EmbeddingConfig } from '../types.js';
import { logger, retry } from '../utils/index.js';

// ==================== OpenAI Client ====================

let defaultClient: OpenAI | null = null;

function getOpenAIClient(config?: LLMConfig): OpenAI {
    if (config?.apiKey || config?.baseUrl) {
        return new OpenAI({
            apiKey: config.apiKey || process.env.OPENAI_API_KEY,
            baseURL: config.baseUrl,
            timeout: config.timeout || 180000,
        });
    }

    if (!defaultClient) {
        defaultClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 180000,
        });
    }

    return defaultClient;
}

// ==================== LLM Completion ====================

export interface CompletionOptions {
    systemPrompt?: string;
    historyMessages?: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
}

/**
 * Complete a prompt using OpenAI's API
 */
export async function openaiComplete(
    prompt: string,
    options: CompletionOptions = {}
): Promise<string> {
    const client = getOpenAIClient({
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        timeout: options.timeout,
    });

    const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = options.temperature ?? 1.0;
    const maxTokens = options.maxTokens;

    // Build messages array
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
        messages.push({
            role: 'system',
            content: options.systemPrompt,
        });
    }

    if (options.historyMessages) {
        for (const msg of options.historyMessages) {
            messages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
            });
        }
    }

    messages.push({
        role: 'user',
        content: prompt,
    });

    logger.debug(`OpenAI request: model=${model}, messages=${messages.length}`);

    const response = await retry(async () => {
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Empty response from OpenAI');
        }

        return content;
    }, 3, 1000);

    return response;
}

/**
 * Create an LLM function with preset configuration
 */
export function createOpenAIComplete(config: LLMConfig = {}) {
    return async (
        prompt: string,
        options?: {
            systemPrompt?: string;
            historyMessages?: ChatMessage[];
            stream?: boolean;
        }
    ): Promise<string> => {
        return openaiComplete(prompt, {
            ...config,
            ...options,
        });
    };
}

// ==================== Embedding ====================

export interface EmbeddingOptions {
    model?: string;
    dimensions?: number;
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
}

/**
 * Generate embeddings using OpenAI's API
 */
export async function openaiEmbed(
    texts: string[],
    options: EmbeddingOptions = {}
): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    const client = getOpenAIClient({
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        timeout: options.timeout || 30000,
    });

    const model = options.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

    logger.debug(`OpenAI embedding request: model=${model}, texts=${texts.length}`);

    const response = await retry(async () => {
        const params: OpenAI.EmbeddingCreateParams = {
            model,
            input: texts,
        };

        // Add dimensions if supported by model
        if (options.dimensions && model.includes('text-embedding-3')) {
            params.dimensions = options.dimensions;
        }

        return client.embeddings.create(params);
    }, 3, 1000);

    // Sort by index to maintain order
    const sorted = response.data.sort((a, b) => a.index - b.index);
    return sorted.map(item => item.embedding);
}

/**
 * Create an embedding function with preset configuration
 */
export function createOpenAIEmbed(config: EmbeddingConfig = {}) {
    return async (texts: string[]): Promise<number[][]> => {
        return openaiEmbed(texts, {
            model: config.model,
            dimensions: config.dimensions,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            timeout: config.timeout,
        });
    };
}

// ==================== Convenience Functions ====================

/**
 * GPT-4o completion
 */
export async function gpt4oComplete(
    prompt: string,
    options: Omit<CompletionOptions, 'model'> = {}
): Promise<string> {
    return openaiComplete(prompt, { ...options, model: 'gpt-4o' });
}

/**
 * GPT-4o-mini completion (default, cost-effective)
 */
export async function gpt4oMiniComplete(
    prompt: string,
    options: Omit<CompletionOptions, 'model'> = {}
): Promise<string> {
    return openaiComplete(prompt, { ...options, model: 'gpt-4o-mini' });
}
