# constants.ts - 配置常量

## 概述

定义 LightRAG 系统中使用的所有默认配置常量，与 Python 版本保持一致。

## 常量分类

### 1. 图字段分隔符

```typescript
export const GRAPH_FIELD_SEP = "<SEP>";
```

用于分隔实体/关系的 source_id 列表。

### 2. 查询和检索配置

| 常量名                        | 默认值 | 说明                    |
| ----------------------------- | ------ | ----------------------- |
| `DEFAULT_TOP_K`               | 40     | 检索的最大结果数        |
| `DEFAULT_CHUNK_TOP_K`         | 20     | 文本块检索数            |
| `DEFAULT_MAX_ENTITY_TOKENS`   | 6000   | 实体上下文最大 token 数 |
| `DEFAULT_MAX_RELATION_TOKENS` | 8000   | 关系上下文最大 token 数 |
| `DEFAULT_MAX_TOTAL_TOKENS`    | 30000  | 总上下文最大 token 数   |
| `DEFAULT_COSINE_THRESHOLD`    | 0.2    | 余弦相似度阈值          |

### 3. 实体提取配置

| 常量                                 | 默认值      | 说明                      |
| ------------------------------------ | ----------- | ------------------------- |
| `DEFAULT_SUMMARY_LANGUAGE`           | `'English'` | 处理语言                  |
| `DEFAULT_MAX_GLEANING`               | 1           | 最大 gleaning 迭代次数    |
| `DEFAULT_ENTITY_NAME_MAX_LENGTH`     | 256         | 实体名称最大长度          |
| `DEFAULT_FORCE_LLM_SUMMARY_ON_MERGE` | 8           | 触发 LLM 摘要的描述片段数 |

### 4. 默认实体类型

```typescript
export const DEFAULT_ENTITY_TYPES = [
  "Person",
  "Creature",
  "Organization",
  "Location",
  "Event",
  "Concept",
  "Method",
  "Content",
  "Data",
  "Artifact",
  "NaturalObject",
];
```

### 5. 分块配置

| 常量                               | 默认值 | 说明                |
| ---------------------------------- | ------ | ------------------- |
| `DEFAULT_CHUNK_TOKEN_SIZE`         | 1200   | 每个分块的 token 数 |
| `DEFAULT_CHUNK_OVERLAP_TOKEN_SIZE` | 100    | 分块重叠的 token 数 |

### 6. 提取分隔符

```typescript
export const DEFAULT_TUPLE_DELIMITER = "<|#|>"; // 字段分隔符
export const DEFAULT_COMPLETION_DELIMITER = "<|COMPLETE|>"; // 完成标记
```

## 使用示例

```typescript
import { DEFAULT_TOP_K, DEFAULT_ENTITY_TYPES } from "./constants.js";

const results = await vectorDb.query(query, DEFAULT_TOP_K);
```
