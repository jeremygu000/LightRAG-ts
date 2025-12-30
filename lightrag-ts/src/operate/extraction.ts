/**
 * Entity and Relationship Extraction Operations
 */

import type { Entity, Relation, TextChunk, LLMFunction } from '../types.js';
import { PROMPTS, formatPrompt } from '../prompts.js';
import {
    DEFAULT_ENTITY_TYPES,
    DEFAULT_TUPLE_DELIMITER,
    DEFAULT_COMPLETION_DELIMITER,
    DEFAULT_SUMMARY_LANGUAGE,
    GRAPH_FIELD_SEP,
} from '../constants.js';
import {
    splitStringByMultiMarkers,
    sanitizeAndNormalizeText,
    isFloatString,
    logger,
    computeMdhashId,
} from '../utils/index.js';

// ==================== Extraction Config ====================

export interface ExtractionConfig {
    entityTypes?: string[];
    language?: string;
    maxGleaning?: number;
    tupleDelimiter?: string;
    completionDelimiter?: string;
}

// ==================== Single Entity/Relation Parsing ====================

interface ParsedEntity {
    entityName: string;
    entityType: string;
    description: string;
    sourceId: string;
    filePath: string;
    timestamp: number;
}

interface ParsedRelation {
    srcId: string;
    tgtId: string;
    weight: number;
    description: string;
    keywords: string;
    sourceId: string;
    filePath: string;
    timestamp: number;
}

function parseEntityFromRecord(
    recordAttributes: string[],
    chunkKey: string,
    timestamp: number,
    filePath: string = 'unknown_source'
): ParsedEntity | null {
    if (recordAttributes.length !== 4 || !recordAttributes[0].includes('entity')) {
        return null;
    }

    try {
        const entityName = sanitizeAndNormalizeText(recordAttributes[1], true);
        if (!entityName.trim()) {
            logger.debug(`Empty entity name after sanitization: ${recordAttributes[1]}`);
            return null;
        }

        let entityType = sanitizeAndNormalizeText(recordAttributes[2], true);
        if (!entityType.trim() || /['()<>|/\\]/.test(entityType)) {
            logger.warn(`Invalid entity type: ${entityType}`);
            return null;
        }
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

function parseRelationFromRecord(
    recordAttributes: string[],
    chunkKey: string,
    timestamp: number,
    filePath: string = 'unknown_source'
): ParsedRelation | null {
    if (recordAttributes.length !== 5 || !recordAttributes[0].includes('relation')) {
        return null;
    }

    try {
        const source = sanitizeAndNormalizeText(recordAttributes[1], true);
        const target = sanitizeAndNormalizeText(recordAttributes[2], true);

        if (!source || !target) {
            logger.debug(`Empty source or target: ${recordAttributes[1]}, ${recordAttributes[2]}`);
            return null;
        }

        if (source === target) {
            logger.debug(`Self-referencing relation ignored: ${source}`);
            return null;
        }

        let keywords = sanitizeAndNormalizeText(recordAttributes[3], true);
        keywords = keywords.replace(/，/g, ',');  // Convert Chinese comma

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

// ==================== Main Extraction ====================

/**
 * Extract entities and relationships from a single chunk
 */
export async function extractFromChunk(
    chunk: TextChunk,
    llmFunc: LLMFunction,
    config: ExtractionConfig = {}
): Promise<{ entities: ParsedEntity[]; relations: ParsedRelation[] }> {
    const {
        entityTypes = DEFAULT_ENTITY_TYPES,
        language = DEFAULT_SUMMARY_LANGUAGE,
        tupleDelimiter = DEFAULT_TUPLE_DELIMITER,
        completionDelimiter = DEFAULT_COMPLETION_DELIMITER,
    } = config;

    const chunkKey = computeMdhashId(chunk.content, 'chunk-');
    const timestamp = Date.now();

    // Format prompts
    const systemPrompt = formatPrompt(PROMPTS.entityExtractionSystemPrompt, {
        entity_types: entityTypes.join(', '),
        tuple_delimiter: tupleDelimiter,
        completion_delimiter: completionDelimiter,
        language,
        examples: PROMPTS.entityExtractionExamples.join('\n'),
    });

    const userPrompt = formatPrompt(PROMPTS.entityExtractionUserPrompt, {
        entity_types: entityTypes.join(', '),
        input_text: chunk.content,
        completion_delimiter: completionDelimiter,
        language,
    });

    // Call LLM
    const response = await llmFunc(userPrompt, { systemPrompt });

    // Parse response
    const entities: ParsedEntity[] = [];
    const relations: ParsedRelation[] = [];

    const lines = response.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === completionDelimiter) continue;

        const parts = splitStringByMultiMarkers(trimmedLine, [tupleDelimiter]);
        if (parts.length < 4) continue;

        // Try parsing as entity
        const entity = parseEntityFromRecord(parts, chunkKey, timestamp);
        if (entity) {
            entities.push(entity);
            continue;
        }

        // Try parsing as relation
        const relation = parseRelationFromRecord(parts, chunkKey, timestamp);
        if (relation) {
            relations.push(relation);
        }
    }

    logger.debug(`Extracted ${entities.length} entities, ${relations.length} relations from chunk`);
    return { entities, relations };
}

/**
 * Extract entities and relationships from multiple chunks
 */
export async function extractFromChunks(
    chunks: TextChunk[],
    llmFunc: LLMFunction,
    config: ExtractionConfig = {},
    onProgress?: (current: number, total: number) => void
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
            const { entities, relations } = await extractFromChunk(chunk, llmFunc, config);

            // Group entities by name
            for (const entity of entities) {
                const existing = entitiesMap.get(entity.entityName) || [];
                existing.push(entity);
                entitiesMap.set(entity.entityName, existing);
            }

            // Group relations by src-tgt pair
            for (const relation of relations) {
                // Sort to make undirected
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

// ==================== Merge Operations ====================

/**
 * Merge entity descriptions
 */
export function mergeEntityDescriptions(entities: ParsedEntity[]): string {
    if (entities.length === 0) return '';
    if (entities.length === 1) return entities[0].description;

    // Simple concatenation with deduplication
    const seen = new Set<string>();
    const descriptions: string[] = [];

    for (const entity of entities) {
        const desc = entity.description.trim();
        if (desc && !seen.has(desc)) {
            seen.add(desc);
            descriptions.push(desc);
        }
    }

    return descriptions.join(' ');
}

/**
 * Merge relation descriptions
 */
export function mergeRelationDescriptions(relations: ParsedRelation[]): {
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
 * Merge source IDs
 */
export function mergeSourceIds(existing: string, newId: string, maxIds: number = 300): string {
    if (!existing) return newId;
    if (!newId) return existing;

    const ids = existing.split(GRAPH_FIELD_SEP);
    if (!ids.includes(newId)) {
        ids.push(newId);
    }

    // Limit number of source IDs (FIFO)
    if (ids.length > maxIds) {
        return ids.slice(-maxIds).join(GRAPH_FIELD_SEP);
    }

    return ids.join(GRAPH_FIELD_SEP);
}
