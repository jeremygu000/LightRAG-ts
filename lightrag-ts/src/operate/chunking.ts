/**
 * Text Chunking Operations
 */

import type { TextChunk } from '../types.js';
import type { Tokenizer } from '../utils/index.js';
import { DEFAULT_CHUNK_TOKEN_SIZE, DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE } from '../constants.js';

export interface ChunkingOptions {
    /** Split text by this character first */
    splitByCharacter?: string;
    /** Only split by character, don't further chunk */
    splitByCharacterOnly?: boolean;
    /** Token overlap between chunks */
    chunkOverlapTokenSize?: number;
    /** Maximum tokens per chunk */
    chunkTokenSize?: number;
}

/**
 * Split content into chunks by token size
 */
export function chunkingByTokenSize(
    tokenizer: Tokenizer,
    content: string,
    options: ChunkingOptions = {}
): Array<Omit<TextChunk, 'fullDocId'>> {
    const {
        splitByCharacter,
        splitByCharacterOnly = false,
        chunkOverlapTokenSize = DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE,
        chunkTokenSize = DEFAULT_CHUNK_TOKEN_SIZE,
    } = options;

    const tokens = tokenizer.encode(content);
    const results: Array<Omit<TextChunk, 'fullDocId'>> = [];

    if (splitByCharacter) {
        const rawChunks = content.split(splitByCharacter);
        const newChunks: Array<{ tokens: number; content: string }> = [];

        if (splitByCharacterOnly) {
            // Only split by character, don't further subdivide
            for (const chunk of rawChunks) {
                const chunkTokens = tokenizer.encode(chunk);
                if (chunkTokens.length > chunkTokenSize) {
                    throw new Error(
                        `Chunk split by character exceeds token limit: ${chunkTokens.length} > ${chunkTokenSize}`
                    );
                }
                newChunks.push({
                    tokens: chunkTokens.length,
                    content: chunk.trim(),
                });
            }
        } else {
            // Split by character, then further chunk if needed
            for (const chunk of rawChunks) {
                const chunkTokens = tokenizer.encode(chunk);
                if (chunkTokens.length > chunkTokenSize) {
                    // Further split this chunk by token size
                    const step = chunkTokenSize - chunkOverlapTokenSize;
                    for (let start = 0; start < chunkTokens.length; start += step) {
                        const end = Math.min(start + chunkTokenSize, chunkTokens.length);
                        const subContent = tokenizer.decode(chunkTokens.slice(start, end));
                        newChunks.push({
                            tokens: end - start,
                            content: subContent.trim(),
                        });
                    }
                } else {
                    newChunks.push({
                        tokens: chunkTokens.length,
                        content: chunk.trim(),
                    });
                }
            }
        }

        // Convert to results with order index
        for (let index = 0; index < newChunks.length; index++) {
            const { tokens: tokenCount, content: chunkContent } = newChunks[index];
            if (chunkContent) {
                results.push({
                    tokens: tokenCount,
                    content: chunkContent,
                    chunkOrderIndex: index,
                });
            }
        }
    } else {
        // Simple token-based chunking with overlap
        const step = chunkTokenSize - chunkOverlapTokenSize;
        let index = 0;

        for (let start = 0; start < tokens.length; start += step) {
            const end = Math.min(start + chunkTokenSize, tokens.length);
            const chunkContent = tokenizer.decode(tokens.slice(start, end)).trim();

            if (chunkContent) {
                results.push({
                    tokens: end - start,
                    content: chunkContent,
                    chunkOrderIndex: index,
                });
                index++;
            }

            // Stop if we've reached the end
            if (end >= tokens.length) break;
        }
    }

    return results;
}

/**
 * Add document ID to chunks
 */
export function addDocIdToChunks(
    chunks: Array<Omit<TextChunk, 'fullDocId'>>,
    docId: string
): TextChunk[] {
    return chunks.map(chunk => ({
        ...chunk,
        fullDocId: docId,
    }));
}
