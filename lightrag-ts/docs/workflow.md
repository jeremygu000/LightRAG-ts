# LightRAG TypeScript 工作流程详解

本文档详细描述 LightRAG 的三大核心操作流程：**Ingest（插入）**、**Update（更新）** 和 **Query（查询）**。

---

## 整体架构

```mermaid
flowchart TB
    subgraph 用户操作
        A[📄 文档输入]
        B[❓ 用户查询]
    end

    subgraph LightRAG 核心
        C[LightRAG 主类]

        subgraph 存储层
            D[(📦 JsonKVStorage<br/>文档/块/实体/关系)]
            E[(🔍 MemoryVectorStorage<br/>实体/关系/块向量)]
            F[(🕸️ MemoryGraphStorage<br/>知识图谱)]
        end

        subgraph 处理层
            G[📝 Chunking<br/>文本分块]
            H[🔬 Extraction<br/>实体提取]
            I[🎯 Query Pipeline<br/>查询管道]
        end

        subgraph LLM 层
            J[🤖 OpenAI<br/>LLM + Embedding]
        end
    end

    subgraph 输出
        K[✅ 处理完成]
        L[💬 生成响应]
    end

    A --> C
    B --> C
    C --> G
    C --> H
    C --> I
    G --> D
    H --> J
    I --> J
    H --> D
    H --> E
    H --> F
    I --> D
    I --> E
    I --> F
    C --> K
    C --> L
```

---

## 1. Ingest 流程（文档插入）

### 1.1 高层流程

```mermaid
flowchart TD
    subgraph 输入
        A[📄 原始文档<br/>string 或 string[]]
        B[⚙️ InsertOptions<br/>ids, filePaths, splitByCharacter]
    end

    subgraph 预处理阶段
        C[生成文档 ID<br/>computeMdhashId]
        D{文档是否<br/>已处理?}
        E[跳过]
        F[更新状态为<br/>processing]
    end

    subgraph 分块阶段
        G[📝 chunkingByTokenSize<br/>按 token 分块]
        H[添加文档 ID<br/>addDocIdToChunks]
        I[存储块到<br/>chunksKv]
    end

    subgraph 向量化阶段
        J[🔢 生成块嵌入<br/>embeddingFunc]
        K[存储到<br/>chunksVdb]
    end

    subgraph 实体提取阶段
        L[🤖 extractFromChunks<br/>调用 LLM]
        M[解析实体和关系]
    end

    subgraph 存储阶段
        N[合并实体描述]
        O[更新 graphStorage<br/>节点]
        P[更新 entitiesVdb<br/>向量]
        Q[合并关系描述]
        R[更新 graphStorage<br/>边]
        S[更新 relationsVdb<br/>向量]
    end

    subgraph 完成阶段
        T[更新状态为<br/>processed]
        U[commitChanges<br/>持久化]
        V[✅ 完成]
    end

    A --> C
    B --> C
    C --> D
    D -->|是| E
    D -->|否| F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
    M --> N
    N --> O
    O --> P
    M --> Q
    Q --> R
    R --> S
    P --> T
    S --> T
    T --> U
    U --> V
```

### 1.2 详细步骤说明

#### Step 1: 文档预处理

```typescript
// 输入可以是单个文档或文档数组
const documents = Array.isArray(input) ? input : [input];

// 生成唯一文档 ID
const docId = computeMdhashId(doc, "doc-");
// 输出: "doc-a1b2c3d4e5f6..."

// 检查是否已处理
const existing = await docsKv.getById(docId);
if (existing?.status === "processed") {
  // 跳过已处理的文档
  continue;
}
```

#### Step 2: 文本分块

```mermaid
flowchart LR
    A[原始文档<br/>5000 tokens] --> B[分块器<br/>chunkTokenSize=1200<br/>overlap=100]
    B --> C[Chunk 0<br/>1200 tokens]
    B --> D[Chunk 1<br/>1200 tokens]
    B --> E[Chunk 2<br/>1200 tokens]
    B --> F[Chunk 3<br/>1200 tokens]
    B --> G[Chunk 4<br/>余下 tokens]

    style C fill:#e1f5fe
    style D fill:#e1f5fe
    style E fill:#e1f5fe
    style F fill:#e1f5fe
    style G fill:#e1f5fe
```

```typescript
const chunks = chunkingByTokenSize(tokenizer, doc, {
  chunkTokenSize: 1200, // 每块最大 token
  chunkOverlapTokenSize: 100, // 重叠 token
});
// 输出: [{ tokens: 1150, content: "...", chunkOrderIndex: 0 }, ...]
```

#### Step 3: 向量嵌入

```mermaid
flowchart LR
    A[块内容<br/>文本] --> B[OpenAI<br/>Embedding API]
    B --> C[向量<br/>1536 维]
    C --> D[存储到<br/>chunksVdb]
```

#### Step 4: 实体关系提取

```mermaid
flowchart TD
    A[块内容] --> B[构建 Prompt]
    B --> C[系统提示<br/>角色: 知识图谱专家]
    B --> D[用户提示<br/>包含实体类型和文本]
    C --> E[OpenAI<br/>Chat Completion]
    D --> E
    E --> F[解析响应]
    F --> G[实体列表]
    F --> H[关系列表]

    subgraph LLM 响应格式
        I[entity|名称|类型|描述]
        J[relation|源|目标|关键词|描述]
        K[COMPLETE]
    end

    F --> I
    F --> J
    F --> K
```

#### Step 5: 知识图谱更新

```mermaid
flowchart TB
    subgraph 实体处理
        A[实体列表] --> B[按名称分组]
        B --> C[合并描述<br/>mergeEntityDescriptions]
        C --> D[合并 sourceIds]
        D --> E[更新图节点<br/>graphStorage.upsertNode]
        E --> F[生成实体嵌入]
        F --> G[更新向量库<br/>entitiesVdb.upsert]
    end

    subgraph 关系处理
        H[关系列表] --> I[按 src-tgt 分组]
        I --> J[合并描述/关键词]
        J --> K[累加权重]
        K --> L[更新图边<br/>graphStorage.upsertEdge]
        L --> M[生成关系嵌入]
        M --> N[更新向量库<br/>relationsVdb.upsert]
    end
```

---

## 2. Update 流程（更新操作）

### 2.1 增量更新

LightRAG 使用**增量更新**策略，不会删除已有数据：

```mermaid
flowchart TD
    A[新文档] --> B{文档已存在?}
    B -->|否| C[正常 Ingest 流程]
    B -->|是| D{状态 = processed?}
    D -->|是| E[跳过<br/>不重复处理]
    D -->|否| F[重新处理<br/>覆盖旧数据]
```

### 2.2 实体描述合并

当同一实体在多个文档中出现时：

```mermaid
flowchart LR
    subgraph 已有数据
        A[实体: Einstein<br/>描述: 物理学家]
    end

    subgraph 新提取
        B[实体: Einstein<br/>描述: 相对论创立者]
    end

    subgraph 合并结果
        C[实体: Einstein<br/>描述: 物理学家 相对论创立者]
    end

    A --> C
    B --> C
```

```typescript
// 描述合并逻辑
const existingNode = await graphStorage.getNode(entityName);
await graphStorage.upsertNode(entityName, {
  description: existingNode?.description
    ? `${existingNode.description} ${newDescription}`
    : newDescription,
  source_id: mergeSourceIds(existing, new),
});
```

### 2.3 关系权重累加

```mermaid
flowchart LR
    subgraph 已有关系
        A[Einstein → Relativity<br/>weight: 1.0]
    end

    subgraph 新提取
        B[Einstein → Relativity<br/>weight: 0.5]
    end

    subgraph 合并结果
        C[Einstein → Relativity<br/>weight: 1.5]
    end

    A --> C
    B --> C
```

### 2.4 Source ID 管理

```mermaid
flowchart TD
    A[现有 source_id<br/>chunk-a, chunk-b] --> B[新增 chunk-c]
    B --> C{超过 maxIds?}
    C -->|否| D[合并: chunk-a, chunk-b, chunk-c]
    C -->|是| E[FIFO 删除最旧<br/>chunk-b, chunk-c]
```

---

## 3. Query 流程（查询操作）

### 3.1 查询模式对比

```mermaid
flowchart TB
    subgraph 查询模式
        A[local<br/>本地实体搜索]
        B[global<br/>全局关系搜索]
        C[hybrid<br/>混合模式]
        D[naive<br/>纯向量搜索]
        E[mix<br/>所有来源]
    end

    subgraph 数据源
        F[(实体向量库)]
        G[(关系向量库)]
        H[(块向量库)]
        I[知识图谱]
    end

    A --> F
    A --> I
    B --> F
    B --> G
    B --> I
    C --> F
    C --> G
    C --> I
    D --> H
    E --> F
    E --> G
    E --> H
    E --> I
```

### 3.2 完整查询流程

```mermaid
flowchart TD
    subgraph 阶段1: 关键词提取
        A[用户查询] --> B[extractKeywords<br/>调用 LLM]
        B --> C[high_level_keywords<br/>宏观概念]
        B --> D[low_level_keywords<br/>具体实体]
    end

    subgraph 阶段2: 多源搜索
        E[构建搜索查询<br/>keywords + query]

        subgraph 实体搜索
            F[entitiesVdb.query]
            G[获取节点详情]
            H[按度数排序]
        end

        subgraph 关系搜索
            I[getNodeEdges]
            J[获取边详情]
            K[按权重排序]
        end

        subgraph 块搜索
            L[chunksVdb.query]
            M[获取块内容]
        end

        subgraph 实体块提取
            N[解析 source_id]
            O[chunksKv.getByIds]
        end
    end

    subgraph 阶段3: 上下文构建
        P[去重合并结果]
        Q[按 token 限制截断<br/>实体: 6000, 关系: 8000]
        R[构建引用列表]
        S[格式化为 JSON]
    end

    subgraph 阶段4: 响应生成
        T[构建系统提示<br/>RAG Response Prompt]
        U[添加历史对话]
        V[调用 LLM<br/>生成响应]
        W[返回结果<br/>response + context + rawData]
    end

    A --> B
    C --> E
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    E --> L
    L --> M
    H --> N
    N --> O
    H --> P
    K --> P
    M --> P
    O --> P
    P --> Q
    Q --> R
    R --> S
    S --> T
    T --> U
    U --> V
    V --> W
```

### 3.3 阶段详解

#### 阶段 1: 关键词提取

```mermaid
sequenceDiagram
    participant U as 用户
    participant Q as Query Pipeline
    participant L as LLM

    U->>Q: "国际贸易如何影响经济?"
    Q->>L: 关键词提取 Prompt
    L-->>Q: JSON 响应
    Note over Q: high_level: ["国际贸易", "经济影响"]
    Note over Q: low_level: ["关税", "进出口"]
```

#### 阶段 2: 多源搜索

```mermaid
flowchart LR
    subgraph 输入
        A[搜索查询<br/>国际贸易 + 关税 + ...]
    end

    subgraph 并行搜索
        B[实体向量搜索<br/>topK=40]
        C[关系边遍历]
        D[块向量搜索<br/>topK=20]
    end

    subgraph 结果
        E[相关实体<br/>+ 度数排序]
        F[相关关系<br/>+ 权重排序]
        G[相关块<br/>+ 相似度排序]
    end

    A --> B
    A --> D
    B --> E
    E --> C
    C --> F
    D --> G
```

#### 阶段 3: 上下文构建

```mermaid
flowchart TD
    subgraph 输入
        A[实体列表]
        B[关系列表]
        C[块列表]
    end

    subgraph Token 限制截断
        D[实体截断<br/>maxEntityTokens: 6000]
        E[关系截断<br/>maxRelationTokens: 8000]
        F[块截断<br/>剩余空间]
    end

    subgraph 格式化
        G[实体 JSON]
        H[关系 JSON]
        I[块 JSON + 引用 ID]
        J[引用列表]
    end

    subgraph 输出
        K[完整上下文字符串]
    end

    A --> D
    B --> E
    C --> F
    D --> G
    E --> H
    F --> I
    I --> J
    G --> K
    H --> K
    I --> K
    J --> K
```

**上下文结构示例**:

```
Knowledge Graph Data (Entity):
[{"name": "Einstein", "type": "person", "description": "..."}]

Knowledge Graph Data (Relationship):
[{"source": "Einstein", "target": "Relativity", "description": "..."}]

Document Chunks (Each entry has a reference_id):
[{"reference_id": 1, "content": "..."}]

Reference Document List:
[1] einstein.txt
[2] physics.txt
```

#### 阶段 4: 响应生成

```mermaid
sequenceDiagram
    participant P as Pipeline
    participant L as LLM
    participant U as 用户

    P->>L: System Prompt (RAG 指令 + 上下文)
    P->>L: History Messages (对话历史)
    P->>L: User Message (原始查询)
    L-->>P: 生成的响应 (Markdown + 引用)
    P-->>U: QueryResult {response, context, rawData}
```

### 3.4 不同模式的数据流

#### Local 模式

```mermaid
flowchart LR
    A[查询] --> B[实体向量搜索]
    B --> C[获取实体详情]
    C --> D[通过 source_id<br/>获取块]
    D --> E[构建上下文]
    E --> F[LLM 响应]
```

#### Global 模式

```mermaid
flowchart LR
    A[查询] --> B[实体向量搜索]
    B --> C[获取相关边]
    C --> D[边详情 + 权重]
    D --> E[构建上下文]
    E --> F[LLM 响应]
```

#### Hybrid 模式

```mermaid
flowchart LR
    A[查询] --> B[实体搜索]
    A --> C[关系遍历]
    A --> D[块获取]
    B --> E[合并去重]
    C --> E
    D --> E
    E --> F[构建上下文]
    F --> G[LLM 响应]
```

#### Naive 模式

```mermaid
flowchart LR
    A[查询] --> B[块向量搜索]
    B --> C[返回相似块]
    C --> D[构建简单上下文]
    D --> E[LLM 响应]
```

---

## 4. 数据持久化

### 4.1 存储结构

```mermaid
flowchart TB
    subgraph 文件系统
        A[workingDir/namespace/]
        B[docs.json<br/>文档状态]
        C[chunks.json<br/>文本块]
        D[entities_kv.json<br/>实体 KV]
        E[relations_kv.json<br/>关系 KV]
        F[entities_vdb.json<br/>实体向量]
        G[relations_vdb.json<br/>关系向量]
        H[chunks_vdb.json<br/>块向量]
        I[graph.json<br/>知识图谱]
        J[llm_cache.json<br/>LLM 缓存]
    end

    A --> B
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    A --> H
    A --> I
    A --> J
```

### 4.2 持久化时机

```mermaid
sequenceDiagram
    participant O as 操作
    participant S as 存储
    participant F as 文件系统

    O->>S: upsert/delete
    Note over S: isDirty = true
    O->>S: indexDoneCallback()
    S->>F: 写入 JSON 文件
    Note over S: isDirty = false
    O->>S: finalize()
    S->>F: 最终持久化
```

---

## 5. 错误处理

### 5.1 Ingest 错误处理

```mermaid
flowchart TD
    A[处理文档] --> B{成功?}
    B -->|是| C[状态: processed]
    B -->|否| D[捕获错误]
    D --> E[状态: failed]
    E --> F[记录 errorMsg]
    F --> G[继续处理下一文档]
```

### 5.2 Query 错误处理

```mermaid
flowchart TD
    A[执行查询] --> B{有结果?}
    B -->|是| C[正常响应]
    B -->|否| D[返回 failResponse]
    D --> E["Sorry, I'm not able to..."]
```

---

## 6. 完整示例

```typescript
import LightRAG from "lightrag-ts";

async function example() {
  // 1. 初始化
  const rag = new LightRAG({
    workingDir: "./data",
    namespace: "demo",
    entityTypes: ["Person", "Concept", "Event"],
  });
  await rag.initialize();

  // 2. Ingest
  await rag.insert(
    `
    爱因斯坦在1905年发表了狭义相对论。
    这一理论彻底改变了物理学的基础。
  `,
    { filePaths: "physics.txt" }
  );

  // 3. Query
  const result = await rag.query("相对论是什么时候提出的?", {
    mode: "hybrid",
    topK: 10,
  });
  console.log(result.response);

  // 4. 获取图谱
  const kg = await rag.getKnowledgeGraph("爱因斯坦", 2);
  console.log(`${kg.nodes.length} 节点, ${kg.edges.length} 边`);

  // 5. 清理
  await rag.finalize();
}
```
