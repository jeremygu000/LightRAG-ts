import neo4j, { Driver, Session, Transaction } from 'neo4j-driver';
import {
    BaseGraphStorage,
    GraphNode,
    GraphEdge,
    KnowledgeGraph,
    StorageConfig
} from './base.js';
import { logger } from '../utils/index.js';

export interface Neo4jConfig extends StorageConfig {
    uri?: string;
    user?: string;
    password?: string;
}

export class Neo4jGraphStorage implements BaseGraphStorage {
    private driver: Driver;
    private initialized: boolean = false;

    constructor(private config: Neo4jConfig) {
        const uri = config.uri || process.env.NEO4J_URI || 'bolt://localhost:7687';
        const user = config.user || process.env.NEO4J_USER || 'neo4j';
        const password = config.password || process.env.NEO4J_PASSWORD || 'password';

        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.driver.verifyConnectivity();
            logger.info('Connected to Neo4j');

            // Create constraints for performance
            const session = this.driver.session();
            try {
                // Ensure ID uniqueness for Entity
                await session.run(`
                    CREATE CONSTRAINT entity_id_unique IF NOT EXISTS 
                    FOR (n:Entity) REQUIRE n.id IS UNIQUE
                `);
            } finally {
                await session.close();
            }

            this.initialized = true;
        } catch (error) {
            logger.error(`Failed to connect to Neo4j: ${error}`);
            throw error;
        }
    }

    async finalize(): Promise<void> {
        await this.driver.close();
        logger.info('Closed Neo4j connection');
    }

    async hasNode(nodeId: string): Promise<boolean> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity {id: $id}) RETURN count(n) > 0 as exists',
                { id: nodeId }
            );
            return result.records[0].get('exists');
        } finally {
            await session.close();
        }
    }

    async hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (a:Entity {id: $src})-[r]->(b:Entity {id: $tgt}) RETURN count(r) > 0 as exists',
                { src: sourceNodeId, tgt: targetNodeId }
            );
            return result.records[0].get('exists');
        } finally {
            await session.close();
        }
    }

    async nodeDegree(nodeId: string): Promise<number> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity {id: $id})-[r]-() RETURN count(r) as degree',
                { id: nodeId }
            );
            return result.records[0].get('degree').toNumber();
        } finally {
            await session.close();
        }
    }

    async edgeDegree(srcId: string, tgtId: string): Promise<number> {
        const srcDegree = await this.nodeDegree(srcId);
        const tgtDegree = await this.nodeDegree(tgtId);
        return srcDegree + tgtDegree;
    }

    async getNode(nodeId: string): Promise<GraphNode | null> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity {id: $id}) RETURN properties(n) as props',
                { id: nodeId }
            );
            if (result.records.length === 0) return null;
            return result.records[0].get('props');
        } finally {
            await session.close();
        }
    }

    async getEdge(sourceNodeId: string, targetNodeId: string): Promise<GraphEdge | null> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (a:Entity {id: $src})-[r]->(b:Entity {id: $tgt}) RETURN properties(r) as props',
                { src: sourceNodeId, tgt: targetNodeId }
            );
            if (result.records.length === 0) return null;
            return result.records[0].get('props');
        } finally {
            await session.close();
        }
    }

    async getNodeEdges(sourceNodeId: string): Promise<Array<[string, string]> | null> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity {id: $id})-[r]-(m:Entity) RETURN m.id as neighbor',
                { id: sourceNodeId }
            );
            if (result.records.length === 0) return null;
            return result.records.map(record => [sourceNodeId, record.get('neighbor')]);
        } finally {
            await session.close();
        }
    }

    async getNodesBatch(nodeIds: string[]): Promise<Map<string, GraphNode>> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity) WHERE n.id IN $ids RETURN n.id as id, properties(n) as props',
                { ids: nodeIds }
            );
            const map = new Map<string, GraphNode>();
            result.records.forEach(record => {
                map.set(record.get('id'), record.get('props'));
            });
            return map;
        } finally {
            await session.close();
        }
    }

    async nodeDegreesBatch(nodeIds: string[]): Promise<Map<string, number>> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity)-[r]-() WHERE n.id IN $ids RETURN n.id as id, count(r) as degree',
                { ids: nodeIds }
            );
            const map = new Map<string, number>();
            result.records.forEach(record => {
                map.set(record.get('id'), record.get('degree').toNumber());
            });
            // Fill missing with 0
            nodeIds.forEach(id => {
                if (!map.has(id)) map.set(id, 0);
            });
            return map;
        } finally {
            await session.close();
        }
    }

    async getEdgesBatch(pairs: Array<{ src: string; tgt: string }>): Promise<Map<string, GraphEdge>> {
        // Neo4j doesn't support complex composite key lookup easily in one go without unwinding
        // We simulate it via UNWIND
        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                UNWIND $pairs as pair
                MATCH (a:Entity {id: pair.src})-[r]->(b:Entity {id: pair.tgt})
                RETURN pair.src as src, pair.tgt as tgt, properties(r) as props
                `,
                { pairs }
            );
            const map = new Map<string, GraphEdge>();
            result.records.forEach(record => {
                const src = record.get('src');
                const tgt = record.get('tgt');
                // Use the same key format as MemoryGraphStorage: "src||tgt"
                // Although sorting might be needed if we treat it undirected
                // LightRAG seems to use specific direction in getEdgesBatch (src, tgt)
                // but MemoryGraphStorage sorts it. Let's follow MemoryGraphStorage for consistency key.
                const key = [src, tgt].sort().join('||');
                map.set(key, record.get('props'));
            });
            return map;
        } finally {
            await session.close();
        }
    }

    async upsertNode(nodeId: string, nodeData: GraphNode): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(
                `
                MERGE (n:Entity {id: $id})
                SET n += $props
                `,
                { id: nodeId, props: nodeData }
            );
        } finally {
            await session.close();
        }
    }

    async upsertEdge(sourceNodeId: string, targetNodeId: string, edgeData: GraphEdge): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(
                `
                MERGE (a:Entity {id: $src})
                MERGE (b:Entity {id: $tgt})
                MERGE (a)-[r:RELATION]->(b)
                SET r += $props
                `,
                { src: sourceNodeId, tgt: targetNodeId, props: edgeData }
            );
        } finally {
            await session.close();
        }
    }

    async deleteNode(nodeId: string): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(
                'MATCH (n:Entity {id: $id}) DETACH DELETE n',
                { id: nodeId }
            );
        } finally {
            await session.close();
        }
    }

    async removeNodes(nodes: string[]): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(
                'MATCH (n:Entity) WHERE n.id IN $ids DETACH DELETE n',
                { ids: nodes }
            );
        } finally {
            await session.close();
        }
    }

    async removeEdges(edges: Array<[string, string]>): Promise<void> {
        const session = this.driver.session();
        try {
            const pairs = edges.map(([src, tgt]) => ({ src, tgt }));
            await session.run(
                `
                UNWIND $pairs as pair
                MATCH (a:Entity {id: pair.src})-[r]->(b:Entity {id: pair.tgt})
                DELETE r
                `,
                { pairs }
            );
        } finally {
            await session.close();
        }
    }

    async getAllLabels(): Promise<string[]> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                'MATCH (n:Entity) RETURN n.id as id ORDER BY id'
            );
            return result.records.map(r => r.get('id'));
        } finally {
            await session.close();
        }
    }

    async getKnowledgeGraph(nodeLabel: string, maxDepth: number = 3, maxNodes: number = 1000): Promise<KnowledgeGraph> {
        const session = this.driver.session();
        const result: KnowledgeGraph = { nodes: [], edges: [], isTruncated: false };

        try {
            let query = '';
            if (nodeLabel === '*') {
                // Get arbitrary nodes
                query = `
                    MATCH (n:Entity)
                    WITH n LIMIT 10
                    CALL apoc.path.subgraphAll(n, {
                        maxLevel: $maxDepth,
                        limit: $maxNodes
                    })
                    YIELD nodes, relationships
                    RETURN nodes, relationships
                `;
            } else {
                // Find start nodes by label/name match (fuzzy)
                query = `
                    MATCH (n:Entity)
                    WHERE toLower(n.id) CONTAINS toLower($label) 
                       OR toLower(n.entity_name) CONTAINS toLower($label)
                    WITH n LIMIT 10
                    CALL apoc.path.subgraphAll(n, {
                        maxLevel: $maxDepth,
                        limit: $maxNodes
                    })
                    YIELD nodes, relationships
                    RETURN nodes, relationships
                `;
            }

            // Note: This relies on APOC for efficient subgraph expansion
            // If APOC is not present, we need a manual BFS or variable length path query
            // Attempt standard Cypher variable length path first to avoid APOC dependency if possible,
            // but standard path query can be slow for "graph" retrieval.

            // Fallback to simple variable length path if APOC concern, but APOC is standard for Neo4j.
            // Let's assume standard install has APOC, or use variable path.

            // Standard Cypher approximation (bfs-like):
            query = `
                MATCH (start:Entity)
                WHERE ($label = '*' OR toLower(start.id) CONTAINS toLower($label) OR toLower(start.entity_name) CONTAINS toLower($label))
                WITH start LIMIT 10
                
                MATCH path = (start)-[*0..${maxDepth}]-(m)
                WITH path LIMIT $maxNodes
                WITH collect(path) as paths
                CALL apoc.convert.toTree(paths) YIELD value
                RETURN value
            `;

            // Let's implementation a custom BFS in typescript to be consistent with MemoryGraphStorage logic
            // providing exact control and no APOC dependency.

            return await this.bfsTraversal(nodeLabel, maxDepth, maxNodes);

        } finally {
            await session.close();
        }
    }

    // Re-implement BFS in client-side to ensure behavioral consistency and avoid APOC dependency
    private async bfsTraversal(nodeLabel: string, maxDepth: number, maxNodes: number): Promise<KnowledgeGraph> {
        const session = this.driver.session();
        try {
            const result: KnowledgeGraph = { nodes: [], edges: [], isTruncated: false };
            let startNodes: string[] = [];

            // 1. Find start nodes
            if (nodeLabel === '*') {
                const res = await session.run('MATCH (n:Entity) RETURN n.id as id LIMIT 100');
                startNodes = res.records.map(r => r.get('id'));
            } else {
                const res = await session.run(
                    `MATCH (n:Entity) 
                     WHERE toLower(n.id) CONTAINS toLower($label) 
                        OR toLower(n.entity_name) CONTAINS toLower($label)
                     RETURN n.id as id LIMIT 100`,
                    { label: nodeLabel }
                );
                startNodes = res.records.map(r => r.get('id'));
            }

            if (startNodes.length === 0) return result;

            const visited = new Set<string>();
            const visitedEdges = new Set<string>();
            const queue: Array<{ nodeId: string; depth: number }> = [];

            for (const startNode of startNodes.slice(0, 10)) {
                queue.push({ nodeId: startNode, depth: 0 });
            }

            while (queue.length > 0 && visited.size < maxNodes) {
                const { nodeId, depth } = queue.shift()!;

                if (visited.has(nodeId)) continue;
                visited.add(nodeId);

                // Get Node
                const nodeRes = await session.run('MATCH (n:Entity {id: $id}) RETURN properties(n) as props', { id: nodeId });
                if (nodeRes.records.length > 0) {
                    const props = nodeRes.records[0].get('props');
                    result.nodes.push({
                        id: nodeId,
                        label: props.entity_type || 'unknown',
                        description: props.description || '',
                        sourceId: props.source_id || '',
                        degree: await this.nodeDegree(nodeId),
                        ...props
                    });
                }

                if (depth < maxDepth) {
                    // Get neighbors
                    const edgesRes = await session.run(
                        `MATCH (n:Entity {id: $id})-[r]-(m:Entity) 
                         RETURN m.id as neighbor, properties(r) as props, type(r) as type, startNode(r).id as startId`,
                        { id: nodeId }
                    );

                    for (const record of edgesRes.records) {
                        const neighbor = record.get('neighbor');
                        const props = record.get('props');
                        const startId = record.get('startId');

                        // Edge Key
                        const src = startId;
                        const tgt = (startId === nodeId) ? neighbor : nodeId; // Should match direction
                        // Actually effectively undirected for traversal, but storage is directed

                        // To match MemoryGraphStorage "visitedEdges", we construct unique key
                        const edgeKey = [nodeId, neighbor].sort().join('||');

                        if (!visitedEdges.has(edgeKey)) {
                            visitedEdges.add(edgeKey);
                            result.edges.push({
                                source: nodeId,
                                target: neighbor,
                                weight: props.weight || 1,
                                description: props.description || '',
                                keywords: props.keywords || '',
                                sourceId: props.source_id || '',
                                ...props
                            });
                        }

                        if (!visited.has(neighbor)) {
                            queue.push({ nodeId: neighbor, depth: depth + 1 });
                        }
                    }
                }
            }

            if (queue.length > 0) result.isTruncated = true;
            return result;

        } finally {
            await session.close();
        }
    }

    async getAllNodes(): Promise<GraphNode[]> {
        const session = this.driver.session();
        try {
            const result = await session.run('MATCH (n:Entity) RETURN properties(n) as props');
            return result.records.map(r => r.get('props'));
        } finally {
            await session.close();
        }
    }

    async getAllEdges(): Promise<GraphEdge[]> {
        const session = this.driver.session();
        try {
            const result = await session.run('MATCH ()-[r]->() RETURN properties(r) as props');
            return result.records.map(r => r.get('props'));
        } finally {
            await session.close();
        }
    }

    async indexDoneCallback(): Promise<void> {
        // Neo4j is transactional, immediate consistency usually (or eventual depending on cluster)
        // No explicit "save" needed
    }

    async drop(): Promise<{ status: string; message: string }> {
        const session = this.driver.session();
        try {
            await session.run('MATCH (n) DETACH DELETE n');
            return { status: 'success', message: 'Neo4j database cleared' };
        } catch (error) {
            return { status: 'error', message: String(error) };
        } finally {
            await session.close();
        }
    }
}
