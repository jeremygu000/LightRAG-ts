# storage/base.ts - 存储接口定义

## 概述

定义 LightRAG 三种存储后端的抽象接口：KV 存储、向量存储和图存储。

## 接口定义

### 1. BaseKVStorage<T>

键值存储接口，用于存储文档状态、文本块等结构化数据。

```typescript
interface BaseKVStorage<T = Record<string, unknown>> {
  initialize(): Promise<void>; // 初始化存储
  finalize(): Promise<void>; // 清理/持久化
  getById(id: string): Promise<T | null>; // 按 ID 获取
  getByIds(ids: string[]): Promise<T[]>; // 批量获取
  filterKeys(keys: Set<string>): Promise<Set<string>>; // 过滤不存在的键
  upsert(data: Record<string, T>): Promise<void>; // 插入/更新
  delete(ids: string[]): Promise<void>; // 删除
  isEmpty(): Promise<boolean>; // 检查是否为空
  indexDoneCallback(): Promise<void>; // 索引完成回调
  drop(): Promise<{ status: string; message: string }>; // 删除所有数据
}
```

**生命周期**:

```
initialize() → upsert/getById/... → indexDoneCallback() → finalize()
```

### 2. BaseVectorStorage

向量存储接口，用于相似度搜索。

```typescript
interface BaseVectorStorage {
  initialize(): Promise<void>;
  finalize(): Promise<void>;

  // 核心查询方法
  query(
    query: string,
    topK: number,
    queryEmbedding?: number[]
  ): Promise<VectorQueryResult[]>;

  // 数据操作
  upsert(data: Record<string, VectorData>): Promise<void>;
  delete(ids: string[]): Promise<void>;
  deleteEntity(entityName: string): Promise<void>;
  deleteEntityRelation(entityName: string): Promise<void>;

  getById(id: string): Promise<VectorData | null>;
  getByIds(ids: string[]): Promise<VectorData[]>;

  indexDoneCallback(): Promise<void>;
  drop(): Promise<{ status: string; message: string }>;
}
```

**VectorData 结构**:

```typescript
interface VectorData {
  id: string;
  embedding: number[]; // 向量嵌入
  content?: string; // 原始内容
  metadata?: Record<string, unknown>;
}
```

**VectorQueryResult 结构**:

```typescript
interface VectorQueryResult {
  id: string;
  score: number; // 相似度分数
  data: VectorData;
}
```

### 3. BaseGraphStorage

图存储接口，用于知识图谱操作。

```typescript
interface BaseGraphStorage {
  // 初始化
  initialize(): Promise<void>;
  finalize(): Promise<void>;

  // 节点操作
  hasNode(nodeId: string): Promise<boolean>;
  getNode(nodeId: string): Promise<GraphNode | null>;
  upsertNode(nodeId: string, nodeData: GraphNode): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;
  nodeDegree(nodeId: string): Promise<number>;

  // 边操作
  hasEdge(srcId: string, tgtId: string): Promise<boolean>;
  getEdge(srcId: string, tgtId: string): Promise<GraphEdge | null>;
  upsertEdge(srcId: string, tgtId: string, edgeData: GraphEdge): Promise<void>;
  getNodeEdges(nodeId: string): Promise<Array<[string, string]> | null>;

  // 批量操作
  getNodesBatch(nodeIds: string[]): Promise<Map<string, GraphNode>>;
  nodeDegreesBatch(nodeIds: string[]): Promise<Map<string, number>>;
  getEdgesBatch(
    pairs: Array<{ src: string; tgt: string }>
  ): Promise<Map<string, GraphEdge>>;

  // 图遍历
  getKnowledgeGraph(
    nodeLabel: string,
    maxDepth?: number,
    maxNodes?: number
  ): Promise<KnowledgeGraph>;

  getAllNodes(): Promise<GraphNode[]>;
  getAllEdges(): Promise<GraphEdge[]>;
  getAllLabels(): Promise<string[]>;

  // 删除
  removeNodes(nodes: string[]): Promise<void>;
  removeEdges(edges: Array<[string, string]>): Promise<void>;
  drop(): Promise<{ status: string; message: string }>;
}
```

### 4. StorageConfig

存储配置接口。

```typescript
interface StorageConfig {
  workingDir: string; // 工作目录
  namespace: string; // 命名空间
  embeddingFunc?: (texts: string[]) => Promise<number[][]>;
  embeddingDim?: number;
}
```

## 类型定义

```typescript
type GraphNode = Record<string, unknown>;
type GraphEdge = Record<string, unknown>;

interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  isTruncated?: boolean;
}
```

## 使用示例

```typescript
import type {
  BaseKVStorage,
  BaseVectorStorage,
  BaseGraphStorage,
} from "./storage/base.js";

// 实现自定义存储
class MyKVStorage implements BaseKVStorage<MyData> {
  async initialize() {
    /* ... */
  }
  async getById(id: string) {
    /* ... */
  }
  // ...其他方法
}
```
