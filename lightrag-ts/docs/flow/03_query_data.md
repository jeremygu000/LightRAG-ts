# 03. 数据查询流程 (Query Data)

LightRAG 的查询引擎是其核心优势，通过结合图谱结构和向量检索，支持多跳推理和全局上下文理解。

## 核心流程图

```mermaid
graph TD
    A[Query: "Tell me about X"] --> B[关键词提取 (Keywords Extraction)]
    B --> C{Query Mode?}

    C -- Local --> D[Local Search]
    C -- Global --> E[Global Search]
    C -- Hybrid --> F[Hybrid Search]

    subgraph "Retrieval Phase"
    D --> D1[Query 向量化]
    D1 --> D2[匹配 Entities (VDB)]
    D2 --> D3[检索关联 Relations (Graph)]
    D3 --> D4[检索关联 Chunks (VDB)]

    E --> E1[Query 向量化]
    E1 --> E2[匹配 Relations (VDB)]
    E2 --> E3[匹配 Entities (VDB - Global)]
    end

    subgraph "Context Building"
    D4 --> G[构建 Context (Token Limit)]
    E3 --> G
    end

    subgraph "Generation Phase"
    G --> H[LLM 生成答案]
    H --> I[返回结果]
    end
```

## 详细步骤解析

### 1. 关键词提取 (Keywords Extraction)

**主要函数**: `extractKeywords()`, `prompts.ts`

- **目的**: 理解用户的查询意图，提取出用于检索的具体实体名称或概念。
- **LLM 调用**: 使用 `keywordsExtraction` 提示词，要求 LLM 输出：
  - **High-level keywords**: 宏观概念。
  - **Low-level keywords**: 具体实体名称。

### 2. 检索阶段 (Retrieval Phase)

根据 `QueryParam.mode` 的不同，执行不同的检索策略：

#### A. Local Search (局部搜索)

**专注细节**: 用于回答关于特定实体的具体问题（如 "谁是哈利波特的作者？"）。

1.  **Entity Matching**: 使用 Query 向量在 `entitiesVdb` 中搜索相似实体。
2.  **子图扩展**: 找到 Top-K 实体后，在 Graph 中获取它们的**一跳邻居 (1-hop neighbors)** 和关联的边。
3.  **Context**: 将命中的实体描述、关系描述组合成上下文。

#### B. Global Search (全局搜索)

**专注宏观**: 用于回答概括性问题（如 "这本书的主题是什么？"）。

1.  **Relation Matching**: 直接在 `relationsVdb` 中搜索与 Query 相关的关系。LightRAG 的创新点在于关系本身也是向量化的。
2.  **Global Context**: 聚合这些重要的关系及其两端的实体，构建全局视角。

#### C. Hybrid Search (混合搜索)

- 同时执行 Local 和 Global 搜索，然后合并两者的上下文。

#### D. Naive Search (传统 RAG)

- 仅对 `chunksVdb` 进行向量检索，不使用图谱信息。

#### E. Mix Search (混合图+块)

- 结合 Graph 信息（Knowledge Graph）和原始文本块（Text Chunks）进行检索，提供最全面的上下文。

### 3. 上下文构建 (Context Building)

**主要函数**: `buildContext()`, `truncateListByTokenSize()`

- **排序与截断**: 检索到的实体和关系通常会超过 LLM 的窗口限制。
- **Rerank (可选)**: 如果启用了 Rerank (通过 `rerank.ts`)，会调用 Cohere/Jina 等模型对检索结果进行重排序，提高相关性。
- **Token 限制**: 根据配置（如 `4000` tokens），优先保留相关性（Cosine Distance 或 Rerank Score）最高的内容。

### 4. LLM 生成 (Generation)

**主要函数**: `llmModelFunc`, `prompts.ts`

- **Prompt 组装**: 将构建好的 Context 填入 `ragResponse` 提示词模板。
- **生成**: LLM 根据提供的图谱上下文回答用户问题。
- **引用**: 响应中通常会包含参考的数据来源（如果是 Naive 模式）。

## Rerank 集成

**主要函数**: `applyRerank()`

如果在查询时启用了 rerank：

1.  **初筛**: Vector DB 返回 Top-N (例如 100) 个结果。
2.  **重排**: 调用 Rerank 模型计算 Query 与这 100 个结果的相关性分数。
3.  **截断**: 取分数最高的 Top-K (例如 10) 进入最终 Context。
    这显著提高了回答的准确性，尤其是在混合搜索模式下。
