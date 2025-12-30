# utils/index.ts - 工具函数

## 概述

提供哈希计算、分词、文本处理、异步操作、文件 I/O 和数学计算等核心工具函数。

## 功能分类

### 1. 哈希函数

#### computeArgsHash

```typescript
function computeArgsHash(...args: unknown[]): string;
```

计算参数的 MD5 哈希值。

#### computeMdhashId

```typescript
function computeMdhashId(content: string, prefix: string = ""): string;
```

为内容生成带前缀的唯一 ID。

**示例**:

```typescript
const docId = computeMdhashId(document, "doc-");
// 输出: "doc-a1b2c3d4e5f6..."
```

### 2. 分词器

#### GPTTokenizer

```typescript
class GPTTokenizer implements Tokenizer {
  encode(text: string): number[]; // 文本转 token 数组
  decode(tokens: number[]): string; // token 数组转文本
}
```

#### countTokens

```typescript
function countTokens(text: string): number;
```

快速计算文本的 token 数量。

### 3. 文本处理

#### splitStringByMultiMarkers

```typescript
function splitStringByMultiMarkers(input: string, markers: string[]): string[];
```

按多个分隔符分割字符串。

#### sanitizeAndNormalizeText

```typescript
function sanitizeAndNormalizeText(
  text: string,
  removeInnerQuotes?: boolean
): string;
```

清理和规范化提取的文本：

- 移除外层引号
- 可选移除内部引号
- 规范化空白字符

#### isFloatString

```typescript
function isFloatString(value: string): boolean;
```

检查字符串是否为有效浮点数。

### 4. 列表截断

#### truncateListByTokenSize

```typescript
function truncateListByTokenSize<T>(
  items: T[],
  getContent: (item: T) => string,
  maxTokenSize: number,
  tokenizer: Tokenizer
): T[];
```

根据 token 限制截断列表。

**示例**:

```typescript
const truncated = truncateListByTokenSize(
  entities,
  (e) => JSON.stringify(e),
  6000,
  tokenizer
);
```

### 5. 异步工具

#### sleep

```typescript
function sleep(ms: number): Promise<void>;
```

#### retry

```typescript
async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T>;
```

带指数退避的重试机制。

#### parallelLimit

```typescript
async function parallelLimit<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  limit: number = 4
): Promise<R[]>;
```

带并发限制的并行执行。

### 6. 文件工具

#### ensureDir

```typescript
async function ensureDir(dirPath: string): Promise<void>;
```

确保目录存在（递归创建）。

#### readJson / writeJson

```typescript
async function readJson<T>(filePath: string): Promise<T | null>;
async function writeJson(filePath: string, data: unknown): Promise<void>;
```

JSON 文件读写。

#### fileExists

```typescript
async function fileExists(filePath: string): Promise<boolean>;
```

### 7. 数学工具

#### cosineSimilarity

```typescript
function cosineSimilarity(a: number[], b: number[]): number;
```

计算两个向量的余弦相似度。

**公式**:
$$\text{similarity} = \frac{a \cdot b}{\|a\| \times \|b\|}$$

### 8. 日志工具

#### logger

```typescript
const logger = {
  info: (msg: string, ...args: unknown[]) => void,
  warn: (msg: string, ...args: unknown[]) => void,
  error: (msg: string, ...args: unknown[]) => void,
  debug: (msg: string, ...args: unknown[]) => void,  // 需要 DEBUG 环境变量
};
```

## 使用示例

```typescript
import {
  computeMdhashId,
  GPTTokenizer,
  cosineSimilarity,
  retry,
  logger,
} from "./utils/index.js";

const tokenizer = new GPTTokenizer();
const tokens = tokenizer.encode("Hello world");
logger.info(`Token count: ${tokens.length}`);
```
