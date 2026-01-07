# LightRAG TypeScript 项目分析与优化路线图

本文档对当前的 TypeScript 实现进行深入分析，重点评估其架构优势、现有局限性以及针对 RAG 准确性（Accuracy）的优化建议。

## 1. 现状评估 (Current Assessment)

LightRAG 作为一个基于图形+向量的混合检索系统，在处理长上下文和全局问题上展现了独特优势。

### 🟢 核心优势 (Strengths)

1.  **全局理解能力 (Global Understanding)**:

    - 通过构建知识图谱（Entity-Relation Graph），系统能够从宏观角度理解文档集合。
    - 支持 `Global Search` 模式，能有效回答 "总结本书主旨"、"分析人物关系演变" 等传统 Naive RAG 难以处理的高层语义问题。

2.  **混合检索架构 (Hybrid Architecture)**:

    - **Graph Mode**: 处理跨文档的逻辑关联和多跳推理。
    - **Vector Mode**: 处理具体的细节匹配。
    - **Mix Mode**: 结合两者优势，提供更全面的上下文覆盖。

3.  **数据流完整性 (Robust Pipeline)**:
    - **Gleaning (拾遗)**: 实现了实体的二次提取机制，有效减少 LLM 遗漏。
    - **增量更新**: 基于 Content Hash 的去重机制，避免重复计算。
    - **Rerank 集成**: 已支持 Cohere/Jina/Aliyun Rerank，显著提升了检索精度。

### 🟡 现有局限与瓶颈 (Weaknesses)

尽管架构先进，但在实际生产场景中，针对**精准问答**（Accuracy）仍有提升空间：

1.  **查询能力受限 (Limited Query Understanding)**:

    - 目前的 `extractKeywords` 仅做简单的关键词提取，缺乏对用户意图的深度解析。
    - 缺失 **Query Rewrite (查询重写)**：对于模糊指代（如 "它"）、多义词或口语化提问，检索效果会大打折扣。
    - 缺失 **HyDE (假设性文档嵌入)**：直接用 Query 检索容易导致语义漂移。

2.  **切分策略单一 (Naive Chunking)**:

    - 当前主要依赖 `chunkingByTokenSize` (固定窗口 + 重叠)。
    - **问题**：容易切断语义完整的段落（如 Markdown 表格、代码块、长句子），导致 LLM 在阅读及生成时上下文断裂。
    - **后果**：如果是基于 Naive Search，切碎的上下文可能导致 "幻觉"。

3.  **细粒度事实检索 (Fine-grained Retrieval)**:

    - 图谱更擅长 "关系" 和 "概念"，但对 "具体数值"、"时间点" 等细粒度事实的捕获能力不如纯文本向量检索。
    - 如果用户问 "2023 年 Q3 的营收是多少"，如果该数字未被提取为实体属性，Graph Search 可能会漏掉。

4.  **缺乏反馈机制 (No Feedback Loop)**:
    - 系统目前是单向的（Insert -> Query），没有利用用户的反馈来优化图谱或向量索引。

---

## 2. 优化建议 (Optimization Roadmap)

针对上述问题，提出以下具体的优化方案，按优先级排序。

### 🚀 Phase A: 查询预处理优化 (Query Pre-processing) - _High Priority_

在检索发生前，增强对 Query 的理解。

1.  **Query Rewrite / Expansion**:

    - **机制**: 在提取关键词前，先调用 LLM 改写 Query。
    - **Prompt**: "基于以下历史对话，将用户的最新问题改写为独立、完整的查询语句。"
    - **效果**: 解决指代不明和上下文缺失问题。

2.  **HyDE (Hypothetical Document Embeddings)**:
    - **机制**: 让 LLM 先生成一个"假设的完美答案"，然后用这个答案去检索文档，而不是用原始问题。
    - **效果**: 显著提高召回率（Recall），特别是当问题和答案在词汇上不重叠时。

### 🚀 Phase B: 切分策略增强 (Advanced Chunking) - _High Priority_

改进 `chunking.ts`，从 token-based 转向 semantic-based。

1.  **Structure-Aware Chunking (结构感知)**:

    - **Markdown**: 识别 `# Header`、`- List`、`Code Block`，尽量保证同一结构内的内容在同一个 Chunk。
    - **Recursive**: 优先按段落切分，段落过长再按句子切分，最后才按 Token 强制截断。

2.  **Semantic Splitter (语义切分)**:
    - 计算相邻句子的 Embedding Cosine Similarity。如果相似度骤降，说明话题发生了转移，在此处切分。

### 🚀 Phase C: 检索策略微调 (Retrieval Tuning)

1.  **Hybrid Weights Tuning**:

    - 目前 `Hybrid Search` 对 Graph 和 Vector 的结果是简单合并。
    - **建议**: 引入加权机制。对于 "Who/When/What specific" 类问题，提高 Vector Chunk 的权重；对于 "Why/How/Summarize" 类问题，提高 Graph Relation 的权重。

2.  **Metadata Filtering**:
    - 在 `QueryParam` 中增加 `metadata_filter`。
    - 支持按 `file_path`、`timestamp`、`author` 过滤，缩小检索范围，提高准确率。

### 🚀 Phase D: 防幻觉架构 (Anti-Hallucination)

虽然已更新 Prompt，但架构层面可以做得更多。

1.  **Citation Enforcement (强制引用)**:

    - 修改 Prompt，要求 LLM 在生成的每一句话后面必须标注 `[ref: doc_id]`。
    - 后处理检查：如果回答中没有引用，或者引用了不存在的文档，强制标记为 Low Confidence。

2.  **Self-Correction (自修正)**:
    - 生成回答后，再调用一次小模型（如 GPT-4o-mini）进行验证："这个回答是否完全基于提供的 Context？如果有外部知识，请删除。"

---

## 3. 推荐实施路径

1.  **立即执行**: 完善 `Chunking` 模块，支持 Markdown 结构感知。这是提升 RAG 质量最基础的一步。
2.  **短期计划**: 实现 `Query Rewrite` 中间件，拦截并优化用户输入。
3.  **中期计划**: 引入 `Hybrid Search` 的动态权重调整。

这篇报告详细分析了 LightRAG-ts 的现状，并给出了具体可执行的提升 RAG 准确性的方案。
