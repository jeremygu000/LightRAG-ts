# types.ts - 类型定义

## 概述

定义 LightRAG 系统中所有核心 TypeScript 接口和类型。

## 类型分类

### 1. 查询类型

#### QueryMode

```typescript
type QueryMode = "local" | "global" | "hybrid" | "naive" | "mix" | "bypass";
```

| 模式     | 说明                       |
| -------- | -------------------------- |
| `local`  | 专注于具体实体的本地搜索   |
| `global` | 基于关系的全局搜索         |
| `hybrid` | 结合 local + global        |
| `naive`  | 直接向量搜索（无知识图谱） |
| `mix`    | 结合所有模式               |
| `bypass` | 跳过 RAG，直接返回失败响应 |

#### QueryParam

```typescript
interface QueryParam {
  mode: QueryMode;
  onlyNeedContext?: boolean; // 只返回上下文，不生成响应
  onlyNeedPrompt?: boolean; // 只返回 prompt，不生成响应
  topK?: number; // 检索结果数量
  stream?: boolean; // 流式输出
  conversationHistory?: ChatMessage[]; // 历史对话
  // ...更多参数
}
```

### 2. 文档/分块类型

#### TextChunk

```typescript
interface TextChunk {
  tokens: number; // 分块的 token 数
  content: string; // 文本内容
  fullDocId: string; // 所属文档 ID
  chunkOrderIndex: number; // 在文档中的顺序
}
```

#### DocumentStatus

```typescript
interface DocumentStatus {
  contentSummary: string; // 前 100 字符预览
  contentLength: number; // 文档总长度
  filePath: string; // 文件路径
  status: "pending" | "processing" | "processed" | "failed";
  createdAt: string; // 创建时间 (ISO)
  chunksCount?: number; // 分块数量
  errorMsg?: string; // 错误信息
}
```

### 3. 实体/关系类型

#### Entity

```typescript
interface Entity {
  entityName: string; // 实体名称（标题大小写）
  entityType: string; // 实体类型
  description: string; // 描述
  sourceId: string; // 来源分块 ID
  filePath: string; // 来源文件路径
}
```

#### Relation

```typescript
interface Relation {
  srcId: string; // 源实体 ID
  tgtId: string; // 目标实体 ID
  weight: number; // 关系权重
  description: string; // 关系描述
  keywords: string; // 关系关键词
  sourceId: string; // 来源分块 ID
}
```

### 4. 知识图谱类型

#### KnowledgeGraph

```typescript
interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  isTruncated?: boolean; // 是否被截断
}
```

### 5. 函数类型

#### LLMFunction

```typescript
type LLMFunction = (
  prompt: string,
  options?: {
    systemPrompt?: string;
    historyMessages?: ChatMessage[];
    stream?: boolean;
  }
) => Promise<string>;
```

#### EmbeddingFunction

```typescript
type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;
```

### 6. 配置类型

#### LightRAGConfig

```typescript
interface LightRAGConfig {
  workingDir?: string; // 工作目录
  namespace?: string; // 命名空间
  llmModelFunc?: LLMFunction; // LLM 函数
  embeddingFunc?: EmbeddingFunction; // 嵌入函数
  chunkTokenSize?: number; // 分块大小
  topK?: number; // 检索数量
  entityTypes?: string[]; // 实体类型列表
  language?: string; // 语言
}
```

## 使用示例

```typescript
import type { QueryParam, TextChunk, Entity } from "./types.js";

const param: QueryParam = {
  mode: "hybrid",
  topK: 20,
};
```
