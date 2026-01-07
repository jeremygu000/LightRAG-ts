/**
 * Entity and Relationship Extraction Operations
 *
 * This module handles the extraction of entities and relationships from text chunks
 * using LLM, including gleaning (re-extraction), caching, and description merging.
 *
 * @module operate/extraction
 */

import type { Entity, Relation, TextChunk, LLMFunction, LLMCacheEntry, Tokenizer } from '../types.js';
import { PROMPTS, formatPrompt } from '../prompts.js';
import {
    DEFAULT_ENTITY_TYPES,
    DEFAULT_TUPLE_DELIMITER,
    DEFAULT_COMPLETION_DELIMITER,
    DEFAULT_SUMMARY_LANGUAGE,
    DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE,
    DEFAULT_SUMMARY_MAX_TOKENS,
    DEFAULT_SUMMARY_LENGTH_RECOMMENDED,
    DEFAULT_SUMMARY_CONTEXT_SIZE,
    GRAPH_FIELD_SEP,
} from '../constants.js';
import {
    splitStringByMultiMarkers,
    sanitizeAndNormalizeText,
    isFloatString,
    logger,
    computeMdhashId,
    computeArgsHash,
    removeThinkTags,
    fixTupleDelimiterCorruption,
    GPTTokenizer,
    packUserAssToOpenaiMessages,
} from '../utils/index.js';

// ==================== Types ====================

/**
 * Configuration for entity extraction.
 */
export interface ExtractionConfig {
    /** Entity types to extract */
    entityTypes?: string[];
    /** Output language */
    language?: string;
    /** Maximum gleaning (re-extraction) iterations */
    maxGleaning?: number;
    /** Tuple delimiter for parsing */
    tupleDelimiter?: string;
    /** Completion delimiter */
    completionDelimiter?: string;
    /** Enable LLM response caching */
    enableCache?: boolean;
    /** Force LLM summary threshold */
    forceLlmSummaryOnMerge?: number;
    /** Summary max tokens */
    summaryMaxTokens?: number;
    /** Summary recommended length */
    summaryLengthRecommended?: number;
    /** Summary context size */
    summaryContextSize?: number;
}

/**
 * Parsed entity from LLM output.
 */
export interface ParsedEntity {
    entityName: string;
    entityType: string;
    description: string;
    sourceId: string;
    filePath: string;
    timestamp: number;
}

/**
 * Parsed relation from LLM output.
 */
export interface ParsedRelation {
    srcId: string;
    tgtId: string;
    weight: number;
    description: string;
    keywords: string;
    sourceId: string;
    filePath: string;
    timestamp: number;
}

/**
 * LLM cache storage interface (subset of BaseKVStorage).
 */
export interface LLMCache {
    getById(id: string): Promise<LLMCacheEntry | null>;
    upsert(data: Record<string, LLMCacheEntry>): Promise<void>;
}

// ==================== Single Entity/Relation Parsing ====================

/**
 * Parse a single entity from LLM output record.
 *
 * Expected format: entity<|#|>name<|#|>type<|#|>description
 *
 * @param recordAttributes - Split record fields
 * @param chunkKey - Source chunk ID
 * @param timestamp - Extraction timestamp
 * @param filePath - Source file path
 * @returns Parsed entity or null if invalid
 */
export function parseEntityFromRecord(
    recordAttributes: string[],
    chunkKey: string,
    timestamp: number,
    filePath: string = 'unknown_source'
): ParsedEntity | null {
    // Must have exactly 4 fields and start with 'entity'
    if (recordAttributes.length !== 4 || !recordAttributes[0].toLowerCase().includes('entity')) {
        if (recordAttributes.length > 1 && recordAttributes[0].toLowerCase().includes('entity')) {
            logger.warn(
                `${chunkKey}: LLM output format error; found ${recordAttributes.length}/4 fields on ENTITY '${recordAttributes[1]}'`
            );
        }
        return null;
    }

    try {
        const entityName = sanitizeAndNormalizeText(recordAttributes[1], true);

        // Validate entity name after sanitization
        if (!entityName.trim()) {
            logger.debug(`Empty entity name after sanitization: ${recordAttributes[1]}`);
            return null;
        }

        let entityType = sanitizeAndNormalizeText(recordAttributes[2], true);

        // Validate entity type
        if (!entityType.trim() || /['()<>|/\\]/.test(entityType)) {
            logger.warn(`Invalid entity type: ${entityType}`);
            return null;
        }

        // Normalize type: remove spaces, lowercase
        entityType = entityType.replace(/\s+/g, '').toLowerCase();

        const description = sanitizeAndNormalizeText(recordAttributes[3]);

        if (!description.trim()) {
            logger.warn(`Empty description for entity: ${entityName}`);
            return null;
        }

        return {
            entityName,
            entityType,
            description,
            sourceId: chunkKey,
            filePath,
            timestamp,
        };
    } catch (error) {
        logger.error(`Entity extraction failed for chunk ${chunkKey}: ${error}`);
        return null;
    }
}

/**
 * Parse a single relation from LLM output record.
 *
 * Expected format: relation<|#|>source<|#|>target<|#|>keywords<|#|>description
 *
 * @param recordAttributes - Split record fields
 * @param chunkKey - Source chunk ID
 * @param timestamp - Extraction timestamp
 * @param filePath - Source file path
 * @returns Parsed relation or null if invalid
 */
export function parseRelationFromRecord(
    recordAttributes: string[],
    chunkKey: string,
    timestamp: number,
    filePath: string = 'unknown_source'
): ParsedRelation | null {
    // Must have exactly 5 fields and contain 'relation'
    if (recordAttributes.length !== 5 || !recordAttributes[0].toLowerCase().includes('relation')) {
        if (recordAttributes.length > 1 && recordAttributes[0].toLowerCase().includes('relation')) {
            logger.warn(
                `${chunkKey}: LLM output format error; found ${recordAttributes.length}/5 fields on RELATION '${recordAttributes[1]}'~'${recordAttributes[2] || 'N/A'}'`
            );
        }
        return null;
    }

    try {
        const source = sanitizeAndNormalizeText(recordAttributes[1], true);
        const target = sanitizeAndNormalizeText(recordAttributes[2], true);

        if (!source || !target) {
            logger.debug(`Empty source or target: ${recordAttributes[1]}, ${recordAttributes[2]}`);
            return null;
        }

        // Ignore self-referencing relations
        if (source === target) {
            logger.debug(`Self-referencing relation ignored: ${source}`);
            return null;
        }

        // Process keywords (convert Chinese comma)
        let keywords = sanitizeAndNormalizeText(recordAttributes[3], true);
        keywords = keywords.replace(/，/g, ',');

        const description = sanitizeAndNormalizeText(recordAttributes[4]);

        // Try to extract weight from last attribute
        const lastAttr = recordAttributes[recordAttributes.length - 1].replace(/['"]/g, '');
        const weight = isFloatString(lastAttr) ? parseFloat(lastAttr) : 1.0;

        return {
            srcId: source,
            tgtId: target,
            weight,
            description,
            keywords,
            sourceId: chunkKey,
            filePath,
            timestamp,
        };
    } catch (error) {
        logger.warn(`Relation extraction failed for chunk ${chunkKey}: ${error}`);
        return null;
    }
}

/**
 * Process extraction result text into entities and relations.
 *
 * @param result - Raw LLM output text
 * @param chunkKey - Source chunk ID
 * @param timestamp - Extraction timestamp
 * @param filePath - Source file path
 * @param tupleDelimiter - Field delimiter
 * @param completionDelimiter - End marker
 * @returns Maps of entities and relations
 */
export function processExtractionResult(
    result: string,
    chunkKey: string,
    timestamp: number,
    filePath: string,
    tupleDelimiter: string = DEFAULT_TUPLE_DELIMITER,
    completionDelimiter: string = DEFAULT_COMPLETION_DELIMITER
): {
    entities: Map<string, ParsedEntity[]>;
    relations: Map<string, ParsedRelation[]>;
} {
    const entities = new Map<string, ParsedEntity[]>();
    const relations = new Map<string, ParsedRelation[]>();

    if (!result) return { entities, relations };

    // Clean up result
    let cleanResult = removeThinkTags(result);
    cleanResult = fixTupleDelimiterCorruption(cleanResult, tupleDelimiter);

    const lines = cleanResult.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === completionDelimiter) continue;

        const parts = splitStringByMultiMarkers(trimmedLine, [tupleDelimiter]);
        if (parts.length < 4) continue;

        // Try parsing as entity
        const entity = parseEntityFromRecord(parts, chunkKey, timestamp, filePath);
        if (entity) {
            const existing = entities.get(entity.entityName) || [];
            existing.push(entity);
            entities.set(entity.entityName, existing);
            continue;
        }

        // Try parsing as relation
        const relation = parseRelationFromRecord(parts, chunkKey, timestamp, filePath);
        if (relation) {
            // Use sorted key for undirected relation
            const key = [relation.srcId, relation.tgtId].sort().join(GRAPH_FIELD_SEP);
            const existing = relations.get(key) || [];
            existing.push(relation);
            relations.set(key, existing);
        }
    }

    return { entities, relations };
}

// ==================== LLM Cache Helpers ====================

/**
 * Generate cache key for LLM request.
 */
function generateCacheKey(prompt: string, systemPrompt?: string): string {
    return 'llm-' + computeArgsHash(prompt, systemPrompt || '');
}

/**
 * Call LLM with optional caching.
 */
async function callLLMWithCache(
    prompt: string,
    llmFunc: LLMFunction,
    options: {
        systemPrompt?: string;
        historyMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        cache?: LLMCache;
        cacheType?: 'extract' | 'summary' | 'query';
        chunkId?: string;
    } = {}
): Promise<{ response: string; timestamp: number; fromCache: boolean }> {
    const cacheKey = generateCacheKey(prompt, options.systemPrompt);
    const timestamp = Date.now();

    // Check cache
    if (options.cache) {
        const cached = await options.cache.getById(cacheKey);
        if (cached) {
            logger.debug(`Cache hit for ${cacheKey}`);
            return {
                response: cached.response,
                timestamp: cached.createTime,
                fromCache: true,
            };
        }
    }

    // Call LLM
    const response = await llmFunc(prompt, {
        systemPrompt: options.systemPrompt,
        historyMessages: options.historyMessages,
    });

    // Save to cache
    if (options.cache) {
        const cacheEntry: LLMCacheEntry = {
            cacheKey,
            response,
            createTime: timestamp,
            cacheType: options.cacheType || 'extract',
            chunkId: options.chunkId,
        };
        await options.cache.upsert({ [cacheKey]: cacheEntry });
    }

    return { response, timestamp, fromCache: false };
}

// ==================== Main Extraction Functions ====================

/**
 * Extract entities and relationships from a single chunk.
 *
 * @param chunk - Text chunk to process
 * @param llmFunc - LLM function for extraction
 * @param config - Extraction configuration
 * @param cache - Optional LLM response cache
 * @returns Extracted entities and relations
 */
export async function extractFromChunk(
    chunk: TextChunk,
    llmFunc: LLMFunction,
    config: ExtractionConfig = {},
    cache?: LLMCache
): Promise<{ entities: ParsedEntity[]; relations: ParsedRelation[] }> {
    const {
        entityTypes = DEFAULT_ENTITY_TYPES,
        language = DEFAULT_SUMMARY_LANGUAGE,
        maxGleaning = 1,
        tupleDelimiter = DEFAULT_TUPLE_DELIMITER,
        completionDelimiter = DEFAULT_COMPLETION_DELIMITER,
    } = config;

    const chunkKey = computeMdhashId(chunk.content, 'chunk-');
    const filePath = chunk.filePath || 'unknown_source';
    const timestamp = Date.now();

    // Format prompts
    const contextBase = {
        entity_types: entityTypes.join(', '),
        tuple_delimiter: tupleDelimiter,
        completion_delimiter: completionDelimiter,
        language,
        examples: PROMPTS.entityExtractionExamples[0] || '',
    };

    const systemPrompt = formatPrompt(PROMPTS.entityExtractionSystemPrompt, contextBase);
    const userPrompt = formatPrompt(PROMPTS.entityExtractionUserPrompt, {
        ...contextBase,
        input_text: chunk.content,
    });

    // Call LLM
    const { response, timestamp: respTimestamp } = await callLLMWithCache(
        userPrompt,
        llmFunc,
        {
            systemPrompt,
            cache,
            cacheType: 'extract',
            chunkId: chunkKey,
        }
    );

    // Parse initial extraction
    const { entities: entityMap, relations: relationMap } = processExtractionResult(
        response,
        chunkKey,
        respTimestamp,
        filePath,
        tupleDelimiter,
        completionDelimiter
    );

    // Gleaning: Re-extraction to catch missed items
    if (maxGleaning > 0) {
        const continuePrompt = formatPrompt(PROMPTS.entityContinueExtractionUserPrompt, {
            ...contextBase,
            input_text: chunk.content,
        });

        const history = packUserAssToOpenaiMessages(userPrompt, response);

        const { response: gleanResponse, timestamp: gleanTimestamp } = await callLLMWithCache(
            continuePrompt,
            llmFunc,
            {
                systemPrompt,
                historyMessages: history,
                cache,
                cacheType: 'extract',
                chunkId: chunkKey,
            }
        );

        // Parse gleaning results
        const { entities: gleanEntities, relations: gleanRelations } = processExtractionResult(
            gleanResponse,
            chunkKey,
            gleanTimestamp,
            filePath,
            tupleDelimiter,
            completionDelimiter
        );

        // Merge entities (keep longer description)
        for (const [name, entities] of gleanEntities.entries()) {
            if (entityMap.has(name)) {
                const existing = entityMap.get(name)!;
                const existingDescLen = existing[0]?.description?.length || 0;
                const newDescLen = entities[0]?.description?.length || 0;
                if (newDescLen > existingDescLen) {
                    entityMap.set(name, entities);
                }
            } else {
                entityMap.set(name, entities);
            }
        }

        // Merge relations (keep longer description)
        for (const [key, relations] of gleanRelations.entries()) {
            if (relationMap.has(key)) {
                const existing = relationMap.get(key)!;
                const existingDescLen = existing[0]?.description?.length || 0;
                const newDescLen = relations[0]?.description?.length || 0;
                if (newDescLen > existingDescLen) {
                    relationMap.set(key, relations);
                }
            } else {
                relationMap.set(key, relations);
            }
        }
    }

    // Flatten to arrays
    const allEntities: ParsedEntity[] = [];
    const allRelations: ParsedRelation[] = [];

    for (const entities of entityMap.values()) {
        allEntities.push(...entities);
    }
    for (const relations of relationMap.values()) {
        allRelations.push(...relations);
    }

    logger.debug(`Extracted ${allEntities.length} entities, ${allRelations.length} relations from chunk`);
    return { entities: allEntities, relations: allRelations };
}

/**
 * Extract entities and relationships from multiple chunks.
 *
 * @param chunks - Text chunks to process
 * @param llmFunc - LLM function for extraction
 * @param config - Extraction configuration
 * @param onProgress - Progress callback
 * @param cache - Optional LLM response cache
 * @returns Maps of entities and relations grouped by name/key
 */
export async function extractFromChunks(
    chunks: TextChunk[],
    llmFunc: LLMFunction,
    config: ExtractionConfig = {},
    onProgress?: (current: number, total: number) => void,
    cache?: LLMCache
): Promise<{
    entities: Map<string, ParsedEntity[]>;
    relations: Map<string, ParsedRelation[]>;
}> {
    const entitiesMap = new Map<string, ParsedEntity[]>();
    const relationsMap = new Map<string, ParsedRelation[]>();

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        onProgress?.(i + 1, chunks.length);

        try {
            const { entities, relations } = await extractFromChunk(chunk, llmFunc, config, cache);

            // Group entities by name
            for (const entity of entities) {
                const existing = entitiesMap.get(entity.entityName) || [];
                existing.push(entity);
                entitiesMap.set(entity.entityName, existing);
            }

            // Group relations by src-tgt pair (sorted for undirected)
            for (const relation of relations) {
                const key = [relation.srcId, relation.tgtId].sort().join(GRAPH_FIELD_SEP);
                const existing = relationsMap.get(key) || [];
                existing.push(relation);
                relationsMap.set(key, existing);
            }
        } catch (error) {
            logger.error(`Failed to extract from chunk ${i}: ${error}`);
        }
    }

    return { entities: entitiesMap, relations: relationsMap };
}

// ==================== Description Merging ====================

/**
 * Merge entity descriptions using Map-Reduce strategy.
 *
 * If total tokens or count exceed thresholds, uses LLM to summarize.
 *
 * @param entities - Array of parsed entities
 * @param config - Merge configuration
 * @param llmFunc - LLM function for summarization (optional)
 * @param cache - LLM cache (optional)
 * @returns Merged description string
 */
export async function mergeEntityDescriptions(
    entities: ParsedEntity[],
    config: {
        forceLlmSummaryOnMerge?: number;
        summaryMaxTokens?: number;
        summaryContextSize?: number;
        summaryLengthRecommended?: number;
        language?: string;
    } = {},
    llmFunc?: LLMFunction,
    cache?: LLMCache
): Promise<{ description: string; llmUsed: boolean }> {
    if (entities.length === 0) return { description: '', llmUsed: false };
    if (entities.length === 1) return { description: entities[0].description, llmUsed: false };

    const {
        forceLlmSummaryOnMerge = DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE,
        summaryMaxTokens = DEFAULT_SUMMARY_MAX_TOKENS,
        summaryContextSize = DEFAULT_SUMMARY_CONTEXT_SIZE,
        summaryLengthRecommended = DEFAULT_SUMMARY_LENGTH_RECOMMENDED,
        language = DEFAULT_SUMMARY_LANGUAGE,
    } = config;

    // Deduplicate descriptions
    const seen = new Set<string>();
    const descriptions: string[] = [];
    for (const entity of entities) {
        const desc = entity.description.trim();
        if (desc && !seen.has(desc)) {
            seen.add(desc);
            descriptions.push(desc);
        }
    }

    if (descriptions.length === 0) return { description: '', llmUsed: false };
    if (descriptions.length === 1) return { description: descriptions[0], llmUsed: false };

    // Calculate total tokens
    const tokenizer = new GPTTokenizer();
    const totalTokens = descriptions.reduce(
        (sum, desc) => sum + tokenizer.encode(desc).length,
        0
    );

    // Check if LLM summary needed
    if (descriptions.length < forceLlmSummaryOnMerge && totalTokens < summaryMaxTokens) {
        // Simple concatenation
        return { description: descriptions.join(' '), llmUsed: false };
    }

    // LLM summarization required
    if (!llmFunc) {
        // No LLM available, fallback to concatenation
        return { description: descriptions.join(' '), llmUsed: false };
    }

    // Use Map-Reduce for large description lists
    return handleDescriptionSummary(
        'Entity',
        entities[0].entityName,
        descriptions,
        { summaryContextSize, summaryMaxTokens, forceLlmSummaryOnMerge, summaryLengthRecommended, language },
        llmFunc,
        cache
    );
}

/**
 * Merge relation descriptions.
 */
export function mergeRelationDescriptionsSimple(relations: ParsedRelation[]): {
    description: string;
    keywords: string;
    weight: number;
} {
    if (relations.length === 0) {
        return { description: '', keywords: '', weight: 1 };
    }

    if (relations.length === 1) {
        return {
            description: relations[0].description,
            keywords: relations[0].keywords,
            weight: relations[0].weight,
        };
    }

    // Merge descriptions
    const seenDescs = new Set<string>();
    const descriptions: string[] = [];
    for (const rel of relations) {
        const desc = rel.description.trim();
        if (desc && !seenDescs.has(desc)) {
            seenDescs.add(desc);
            descriptions.push(desc);
        }
    }

    // Merge keywords
    const seenKeywords = new Set<string>();
    for (const rel of relations) {
        const kws = rel.keywords.split(',').map(k => k.trim()).filter(k => k);
        for (const kw of kws) {
            seenKeywords.add(kw);
        }
    }

    // Sum weights
    const totalWeight = relations.reduce((sum, rel) => sum + rel.weight, 0);

    return {
        description: descriptions.join(' '),
        keywords: Array.from(seenKeywords).join(', '),
        weight: totalWeight,
    };
}

/**
 * Handle description summary using Map-Reduce approach.
 */
async function handleDescriptionSummary(
    descriptionType: string,
    descriptionName: string,
    descriptions: string[],
    config: {
        summaryContextSize: number;
        summaryMaxTokens: number;
        forceLlmSummaryOnMerge: number;
        summaryLengthRecommended: number;
        language: string;
    },
    llmFunc: LLMFunction,
    cache?: LLMCache
): Promise<{ description: string; llmUsed: boolean }> {
    const tokenizer = new GPTTokenizer();
    let currentList = [...descriptions];
    let llmUsed = false;

    // Iterative Map-Reduce
    while (true) {
        const totalTokens = currentList.reduce(
            (sum, desc) => sum + tokenizer.encode(desc).length,
            0
        );

        // Check if we can stop
        if (totalTokens <= config.summaryContextSize || currentList.length <= 2) {
            if (
                currentList.length < config.forceLlmSummaryOnMerge &&
                totalTokens < config.summaryMaxTokens
            ) {
                return { description: currentList.join(' '), llmUsed };
            }

            // Final summarization
            const summary = await summarizeDescriptions(
                descriptionType,
                descriptionName,
                currentList,
                config,
                llmFunc,
                cache
            );
            return { description: summary, llmUsed: true };
        }

        // Split into chunks and summarize each
        const chunks: string[][] = [];
        let currentChunk: string[] = [];
        let currentTokens = 0;

        for (const desc of currentList) {
            const descTokens = tokenizer.encode(desc).length;

            if (currentTokens + descTokens > config.summaryContextSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [desc];
                currentTokens = descTokens;
            } else {
                currentChunk.push(desc);
                currentTokens += descTokens;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        logger.debug(`Map-Reduce: ${currentList.length} descriptions -> ${chunks.length} chunks`);

        // Reduce: summarize each chunk
        const newSummaries: string[] = [];
        for (const chunk of chunks) {
            if (chunk.length === 1) {
                newSummaries.push(chunk[0]);
            } else {
                const summary = await summarizeDescriptions(
                    descriptionType,
                    descriptionName,
                    chunk,
                    config,
                    llmFunc,
                    cache
                );
                newSummaries.push(summary);
                llmUsed = true;
            }
        }

        currentList = newSummaries;
    }
}

/**
 * Summarize a list of descriptions using LLM.
 */
async function summarizeDescriptions(
    descriptionType: string,
    descriptionName: string,
    descriptions: string[],
    config: {
        summaryLengthRecommended: number;
        language: string;
    },
    llmFunc: LLMFunction,
    cache?: LLMCache
): Promise<string> {
    // Format descriptions as JSONL
    const jsonDescriptions = descriptions.map(desc => JSON.stringify({ Description: desc }));
    const joinedDescriptions = jsonDescriptions.join('\n');

    const prompt = formatPrompt(PROMPTS.summarizeEntityDescriptions, {
        description_type: descriptionType,
        description_name: descriptionName,
        description_list: joinedDescriptions,
        summary_length: String(config.summaryLengthRecommended),
        language: config.language,
    });

    const { response } = await callLLMWithCache(prompt, llmFunc, {
        cache,
        cacheType: 'summary',
    });

    return response.trim();
}

/**
 * Merge source IDs with deduplication and limit.
 */
export function mergeSourceIds(existing: string, newId: string, maxIds: number = 300): string {
    if (!existing) return newId;
    if (!newId) return existing;

    const ids = existing.split(GRAPH_FIELD_SEP);
    const newIds = newId.split(GRAPH_FIELD_SEP);

    for (const id of newIds) {
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }

    // Limit number of source IDs (FIFO)
    if (ids.length > maxIds) {
        return ids.slice(-maxIds).join(GRAPH_FIELD_SEP);
    }

    return ids.join(GRAPH_FIELD_SEP);
}
