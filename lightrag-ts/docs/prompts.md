# prompts.ts - LLM 提示词模板

## 概述

包含 LightRAG 用于实体提取、摘要、RAG 响应和关键词提取的所有 LLM 提示词模板。

## 提示词分类

### 1. 实体提取提示词

#### entityExtractionSystemPrompt

**角色**: 知识图谱专家
**任务**: 从输入文本中提取实体和关系

**输出格式**:

```
entity<|#|>实体名称<|#|>实体类型<|#|>实体描述
relation<|#|>源实体<|#|>目标实体<|#|>关系关键词<|#|>关系描述
<|COMPLETE|>
```

**关键规则**:

1. 实体名称使用标题大小写
2. 实体类型必须从预定义列表中选择
3. 关系是无向的，避免重复
4. 使用第三人称，避免代词

#### entityExtractionUserPrompt

```typescript
---Task---
从以下文本中提取实体和关系：
<Entity_types>
[{entity_types}]
<Input Text>
{input_text}
```

### 2. 摘要提示词

#### summarizeEntityDescriptions

**任务**: 将多个描述片段合并为一个连贯的摘要

**输入格式**: JSONL 格式的描述列表
**输出**: 纯文本摘要

**规则**:

- 整合所有关键信息
- 使用第三人称客观视角
- 处理冲突信息时尝试调和
- 长度不超过指定 token 数

### 3. RAG 响应提示词

#### ragResponse

**角色**: 专家 AI 助手
**任务**: 基于知识库生成回答

**上下文结构**:

- 知识图谱数据（实体）
- 知识图谱数据（关系）
- 文档块
- 参考文档列表

**输出规则**:

1. 只使用提供的上下文
2. 使用 Markdown 格式
3. 添加引用（最多 5 个）
4. 使用与查询相同的语言

#### naiveRagResponse

简化版 RAG 响应，仅使用文档块，不使用知识图谱。

### 4. 关键词提取提示词

#### keywordsExtraction

**任务**: 从查询中提取两类关键词

**输出格式** (JSON):

```json
{
  "high_level_keywords": ["宏观概念"],
  "low_level_keywords": ["具体实体"]
}
```

### 5. 上下文模板

#### kgQueryContext

组合实体、关系、文档块的完整上下文模板。

#### naiveQueryContext

仅包含文档块的简化上下文模板。

## 工具函数

### formatPrompt

```typescript
function formatPrompt(template: string, values: Record<string, string>): string;
```

用占位符替换填充模板。

## 使用示例

```typescript
import { PROMPTS, formatPrompt } from "./prompts.js";

const prompt = formatPrompt(PROMPTS.keywordsExtraction, {
  query: "什么是人工智能？",
  language: "Chinese",
});
```
