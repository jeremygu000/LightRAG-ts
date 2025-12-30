/**
 * In-Memory Graph Storage Implementation
 */

import path from 'path';
import {
    BaseGraphStorage,
    GraphNode,
    GraphEdge,
    KnowledgeGraph,
    KnowledgeGraphNode,
    KnowledgeGraphEdge,
    StorageConfig
} from './base.js';
import { readJson, writeJson, fileExists, ensureDir, logger } from '../utils/index.js';

interface GraphData {
    nodes: Record<string, GraphNode>;
    edges: Record<string, GraphEdge>;  // key: "src||tgt"
}

export class MemoryGraphStorage implements BaseGraphStorage {
    private nodes: Map<string, GraphNode> = new Map();
    private edges: Map<string, GraphEdge> = new Map();  // key: "src||tgt"
    private adjacency: Map<string, Set<string>> = new Map();  // node -> connected nodes
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

    private edgeKey(src: string, tgt: string): string {
        // Sort to make undirected edges
        const sorted = [src, tgt].sort();
        return `${sorted[0]}||${sorted[1]}`;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await ensureDir(path.dirname(this.filePath));

        if (await fileExists(this.filePath)) {
            const loaded = await readJson<GraphData>(this.filePath);
            if (loaded) {
                // Load nodes
                this.nodes = new Map(Object.entries(loaded.nodes || {}));

                // Load edges and rebuild adjacency
                this.edges = new Map(Object.entries(loaded.edges || {}));

                // Rebuild adjacency list
                for (const key of this.edges.keys()) {
                    const [src, tgt] = key.split('||');
                    this.addToAdjacency(src, tgt);
                }

                logger.debug(`Loaded ${this.nodes.size} nodes and ${this.edges.size} edges from ${this.filePath}`);
            }
        }

        this.initialized = true;
    }

    async finalize(): Promise<void> {
        if (this.isDirty) {
            await this.persist();
        }
    }

    private addToAdjacency(src: string, tgt: string): void {
        if (!this.adjacency.has(src)) {
            this.adjacency.set(src, new Set());
        }
        if (!this.adjacency.has(tgt)) {
            this.adjacency.set(tgt, new Set());
        }
        this.adjacency.get(src)!.add(tgt);
        this.adjacency.get(tgt)!.add(src);
    }

    private removeFromAdjacency(src: string, tgt: string): void {
        this.adjacency.get(src)?.delete(tgt);
        this.adjacency.get(tgt)?.delete(src);
    }

    async hasNode(nodeId: string): Promise<boolean> {
        return this.nodes.has(nodeId);
    }

    async hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean> {
        return this.edges.has(this.edgeKey(sourceNodeId, targetNodeId));
    }

    async nodeDegree(nodeId: string): Promise<number> {
        return this.adjacency.get(nodeId)?.size ?? 0;
    }

    async edgeDegree(srcId: string, tgtId: string): Promise<number> {
        const srcDegree = await this.nodeDegree(srcId);
        const tgtDegree = await this.nodeDegree(tgtId);
        return srcDegree + tgtDegree;
    }

    async getNode(nodeId: string): Promise<GraphNode | null> {
        return this.nodes.get(nodeId) ?? null;
    }

    async getEdge(sourceNodeId: string, targetNodeId: string): Promise<GraphEdge | null> {
        return this.edges.get(this.edgeKey(sourceNodeId, targetNodeId)) ?? null;
    }

    async getNodeEdges(sourceNodeId: string): Promise<Array<[string, string]> | null> {
        const neighbors = this.adjacency.get(sourceNodeId);
        if (!neighbors) return null;

        const edges: Array<[string, string]> = [];
        for (const neighbor of neighbors) {
            edges.push([sourceNodeId, neighbor]);
        }
        return edges;
    }

    async getNodesBatch(nodeIds: string[]): Promise<Map<string, GraphNode>> {
        const result = new Map<string, GraphNode>();
        for (const id of nodeIds) {
            const node = this.nodes.get(id);
            if (node) {
                result.set(id, node);
            }
        }
        return result;
    }

    async nodeDegreesBatch(nodeIds: string[]): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        for (const id of nodeIds) {
            result.set(id, this.adjacency.get(id)?.size ?? 0);
        }
        return result;
    }

    async getEdgesBatch(pairs: Array<{ src: string; tgt: string }>): Promise<Map<string, GraphEdge>> {
        const result = new Map<string, GraphEdge>();
        for (const { src, tgt } of pairs) {
            const key = this.edgeKey(src, tgt);
            const edge = this.edges.get(key);
            if (edge) {
                result.set(`${src}||${tgt}`, edge);
            }
        }
        return result;
    }

    async upsertNode(nodeId: string, nodeData: GraphNode): Promise<void> {
        this.nodes.set(nodeId, nodeData);
        if (!this.adjacency.has(nodeId)) {
            this.adjacency.set(nodeId, new Set());
        }
        this.isDirty = true;
    }

    async upsertEdge(sourceNodeId: string, targetNodeId: string, edgeData: GraphEdge): Promise<void> {
        const key = this.edgeKey(sourceNodeId, targetNodeId);
        this.edges.set(key, edgeData);
        this.addToAdjacency(sourceNodeId, targetNodeId);
        this.isDirty = true;
    }

    async deleteNode(nodeId: string): Promise<void> {
        // Remove all edges connected to this node
        const neighbors = this.adjacency.get(nodeId);
        if (neighbors) {
            for (const neighbor of neighbors) {
                const key = this.edgeKey(nodeId, neighbor);
                this.edges.delete(key);
                this.adjacency.get(neighbor)?.delete(nodeId);
            }
        }

        this.nodes.delete(nodeId);
        this.adjacency.delete(nodeId);
        this.isDirty = true;
    }

    async removeNodes(nodes: string[]): Promise<void> {
        for (const nodeId of nodes) {
            await this.deleteNode(nodeId);
        }
    }

    async removeEdges(edges: Array<[string, string]>): Promise<void> {
        for (const [src, tgt] of edges) {
            const key = this.edgeKey(src, tgt);
            this.edges.delete(key);
            this.removeFromAdjacency(src, tgt);
        }
        this.isDirty = true;
    }

    async getAllLabels(): Promise<string[]> {
        return Array.from(this.nodes.keys()).sort();
    }

    async getKnowledgeGraph(nodeLabel: string, maxDepth: number = 3, maxNodes: number = 1000): Promise<KnowledgeGraph> {
        const result: KnowledgeGraph = {
            nodes: [],
            edges: [],
            isTruncated: false,
        };

        // Find starting nodes
        let startNodes: string[] = [];
        if (nodeLabel === '*') {
            startNodes = Array.from(this.nodes.keys());
        } else {
            // Find nodes containing the label
            for (const [id, node] of this.nodes.entries()) {
                if (id.toLowerCase().includes(nodeLabel.toLowerCase()) ||
                    (node.entity_name as string)?.toLowerCase().includes(nodeLabel.toLowerCase())) {
                    startNodes.push(id);
                }
            }
        }

        if (startNodes.length === 0) {
            return result;
        }

        // BFS traversal
        const visited = new Set<string>();
        const visitedEdges = new Set<string>();
        const queue: Array<{ nodeId: string; depth: number }> = [];

        for (const startNode of startNodes.slice(0, Math.min(10, startNodes.length))) {
            queue.push({ nodeId: startNode, depth: 0 });
        }

        while (queue.length > 0 && visited.size < maxNodes) {
            const { nodeId, depth } = queue.shift()!;

            if (visited.has(nodeId)) continue;
            visited.add(nodeId);

            const node = this.nodes.get(nodeId);
            if (node) {
                result.nodes.push({
                    id: nodeId,
                    label: (node.entity_type as string) || 'unknown',
                    description: (node.description as string) || '',
                    sourceId: (node.source_id as string) || '',
                    degree: this.adjacency.get(nodeId)?.size || 0,
                    ...node,
                });
            }

            if (depth < maxDepth) {
                const neighbors = this.adjacency.get(nodeId);
                if (neighbors) {
                    for (const neighbor of neighbors) {
                        const edgeKey = this.edgeKey(nodeId, neighbor);
                        if (!visitedEdges.has(edgeKey)) {
                            visitedEdges.add(edgeKey);

                            const edge = this.edges.get(edgeKey);
                            if (edge) {
                                result.edges.push({
                                    source: nodeId,
                                    target: neighbor,
                                    weight: (edge.weight as number) || 1,
                                    description: (edge.description as string) || '',
                                    keywords: (edge.keywords as string) || '',
                                    sourceId: (edge.source_id as string) || '',
                                    ...edge,
                                });
                            }
                        }

                        if (!visited.has(neighbor)) {
                            queue.push({ nodeId: neighbor, depth: depth + 1 });
                        }
                    }
                }
            }
        }

        if (queue.length > 0) {
            result.isTruncated = true;
        }

        return result;
    }

    async getAllNodes(): Promise<GraphNode[]> {
        return Array.from(this.nodes.values());
    }

    async getAllEdges(): Promise<GraphEdge[]> {
        return Array.from(this.edges.values());
    }

    async indexDoneCallback(): Promise<void> {
        if (this.isDirty) {
            await this.persist();
        }
    }

    async drop(): Promise<{ status: string; message: string }> {
        try {
            this.nodes.clear();
            this.edges.clear();
            this.adjacency.clear();
            this.isDirty = true;
            await this.persist();
            return { status: 'success', message: 'data dropped' };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { status: 'error', message };
        }
    }

    private async persist(): Promise<void> {
        const data: GraphData = {
            nodes: Object.fromEntries(this.nodes),
            edges: Object.fromEntries(this.edges),
        };
        await writeJson(this.filePath, data);
        this.isDirty = false;
        logger.debug(`Persisted ${this.nodes.size} nodes and ${this.edges.size} edges to ${this.filePath}`);
    }
}
