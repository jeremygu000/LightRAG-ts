# LightRAG API 使用指南

本文档介绍如何使用 LightRAG TypeScript 服务器 API。

## 启动服务

```bash
# 启动依赖服务
docker-compose up -d

# 启动 API 服务器
npm run start
# Server is running on port 3000
```

## API 端点

| 端点             | 方法   | 功能     |
| :--------------- | :----- | :------- |
| `/health`        | GET    | 健康检查 |
| `/ingest`        | POST   | 文档导入 |
| `/query`         | POST   | RAG 查询 |
| `/documents/:id` | DELETE | 删除文档 |

---

## 1. 健康检查

```bash
curl http://localhost:3000/health
```

**响应：**

```json
{
  "status": "ok",
  "timestamp": "2026-01-08T22:30:06.180Z"
}
```

---

## 2. 导入文档 (Ingest)

### 请求格式

```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "text": "LightRAG is a RAG system that uses both Graphs and Vectors for information retrieval.",
        "id": "doc-lightrag-intro"
      },
      {
        "text": "GraphRAG is a method developed by Microsoft that uses community detection to generate summaries.",
        "id": "doc-graphrag-intro"
      }
    ]
  }'
```

### 参数说明

| 参数                   | 类型    | 必填 | 说明                      |
| :--------------------- | :------ | :--- | :------------------------ |
| `documents`            | Array   | ✅   | 文档数组                  |
| `documents[].text`     | string  | ✅   | 文档内容                  |
| `documents[].id`       | string  | ❌   | 文档 ID（可选，自动生成） |
| `documents[].filePath` | string  | ❌   | 文件路径（元数据）        |
| `upsert`               | boolean | ❌   | 是否更新已存在文档        |

### 成功响应

```json
{
  "message": "Processed 2 documents"
}
```

---

## 3. RAG 查询 (Query)

### 基本查询

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is LightRAG?",
    "mode": "hybrid"
  }'
```

### 启用 Rerank 和 BM25

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does GraphRAG differ from LightRAG?",
    "mode": "hybrid",
    "enableRerank": true
  }'
```

### 参数说明

| 参数           | 类型    | 默认值   | 说明                                                  |
| :------------- | :------ | :------- | :---------------------------------------------------- |
| `query`        | string  | -        | 查询问题（必填）                                      |
| `mode`         | string  | `hybrid` | 搜索模式：`local`, `global`, `hybrid`, `naive`, `mix` |
| `stream`       | boolean | `false`  | 是否流式响应                                          |
| `enableRerank` | boolean | `false`  | 是否启用重排序                                        |

### 成功响应

```json
{
  "response": "LightRAG is a RAG system that uses both Graphs and Vectors for information retrieval. It supports local search for detailed information and global search for summaries.\n\n### References\n* [1] doc-lightrag-intro",
  "context": "..."
}
```

---

## 4. 删除文档

```bash
curl -X DELETE http://localhost:3000/documents/doc-lightrag-intro
```

### 成功响应

```json
{
  "message": "Document doc-lightrag-intro deleted",
  "details": {
    "deletedChunks": 1,
    "deletedEntities": 2,
    "deletedRelations": 1
  }
}
```

---

## 搜索模式说明

| 模式     | 说明                        | 适用场景                             |
| :------- | :-------------------------- | :----------------------------------- |
| `local`  | 实体 + 1-hop 关系，详细信息 | "谁是 X？"、"X 有什么特点？"         |
| `global` | 关系向量 + 摘要，高层概念   | "A 和 B 有什么关系？"、"总结 X 领域" |
| `hybrid` | Local + Global 结合         | **推荐**，综合检索                   |
| `naive`  | 仅向量搜索                  | 简单语义匹配                         |
| `mix`    | 所有方法结合                | 最全面但最慢                         |

---

## 管理 UI

| 服务             | URL                             |
| :--------------- | :------------------------------ |
| Neo4j Browser    | http://localhost:7474           |
| Qdrant Dashboard | http://localhost:6333/dashboard |
| Redis Insight    | http://localhost:5540           |
| Kibana (ES)      | http://localhost:5601           |
