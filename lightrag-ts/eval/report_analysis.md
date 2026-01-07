# RAG System Evaluation Report

## Summary
The RAG system demonstrates strong overall performance in **answer relevancy** and **context recall**, indicating that it generally retrieves comprehensive information and generates highly relevant answers. However, there are notable weaknesses in **faithfulness** and **context precision**, particularly when the retrieved context contains irrelevant or misleading documents. The system occasionally introduces external knowledge not present in the provided context—especially for well-known facts—leading to hallucinations and reduced faithfulness scores.

---

## Weakness Analysis
1. **"Who is the author of 'Harry Potter'?" (Faithfulness: 0.4)**  
   Despite correct answer generation, the model references non-existent sources like "Knowledge Graph Data" and fabricates citations (`[1] unknown`), which were not in the original context. This indicates the use of internalized parametric knowledge rather than grounding strictly in retrieved content.

2. **"How does GraphRAG differ from LightRAG?" (Faithfulness: ~0.41, Context Recall: ~0.67)**  
   Faithfulness is low because the response cites a source `[2]` ("GraphRAG uses community detection") that was indeed in the context—but the model falsely implies structured citation numbering where none exists. More critically, **context recall is only 0.67**, meaning some necessary information about differences between the two systems may have been missed, likely due to lack of explicit comparative data in retrieval.

3. **"Explain the difference between local and global search in LightRAG." (Context Precision: 0.0)**  
   Although the answer is faithful and relevant, **context precision is zero**, indicating all retrieved documents except one are noise. The system retrieved SEO-related “local search” content and unrelated literary facts, diluting signal-to-noise ratio despite accurate final output.

---

## Optimization Advice
1. **Improve Retrieval Filtering with Semantic Re-Ranking**  
   Use a cross-encoder re-ranker to filter out irrelevant contexts (e.g., filtering out SEO meanings of “local search” when querying about LightRAG). This would significantly boost **context precision** and reduce noise-induced errors.

2. **Enforce Strict Grounding and Citation Rules**  
   Implement post-processing rules to prevent models from inventing citations or referencing unavailable metadata (like “knowledge graph data”). Train the generator to say “based on the provided context” and only quote actual text snippets, improving **faithfulness**.

3. **Augment Training Data with Comparative Prompts**  
   Since comparison questions (e.g., GraphRAG vs. LightRAG) show lower recall and faithfulness, include more contrastive examples in fine-tuning data so the model learns to identify and retrieve distinguishing features across systems.

---

# RAG 系统评估报告

## 概述
该 RAG 系统在**答案相关性**和**上下文召回率**方面表现良好，表明其通常能检索到全面的信息并生成高度相关的回答。然而，在**忠实度**和**上下文精确度**方面存在明显不足，尤其是在检索到的上下文中包含无关或误导性文档时。系统偶尔会引入未在检索内容中出现的外部知识——特别是对于众所周知的事实——导致产生幻觉，降低忠实度得分。

---

## 弱点分析
1. **“《哈利·波特》的作者是谁？”（忠实度：0.4）**  
   尽管答案正确，但模型引用了上下文中不存在的来源，如“知识图谱数据”，并虚构了引用标记（`[1] unknown`）。这表明模型使用了内部参数化知识，而非严格基于检索结果进行回答。

2. **“GraphRAG 与 LightRAG 有何不同？”（忠实度：约 0.41，上下文召回率：约 0.67）**  
   忠实度低的原因是模型引用了编号为 `[2]` 的来源（“GraphRAG 使用社区检测”），虽然该信息确实在上下文中，但原始上下文并无编号结构，属于捏造引用格式。更关键的是，**上下文召回率仅为 0.67**，说明部分必要的对比信息未被检索到，可能是因为缺乏明确的系统比较数据。

3. **“解释 LightRAG 中局部搜索与全局搜索的区别。”（上下文精确度：0.0）**  
   尽管最终答案准确且忠实，但**上下文精确度为零**，表示除一条外所有检索到的文档均为噪声。系统检索到了关于 SEO 的“本地搜索”内容以及无关的文学事实，严重降低了信噪比。

---

## 优化建议
1. **通过语义重排序提升检索过滤能力**  
   使用交叉编码器（cross-encoder）对检索结果进行重排序，过滤掉无关内容（例如，在查询 LightRAG 时不返回 SEO 相关的“本地搜索”结果）。这将显著提高**上下文精确度**，减少噪声干扰。

2. **强制执行严格的依据绑定和引用规则**  
   增加后处理机制，防止模型伪造引用或引用不存在的元数据（如“知识图谱数据”）。训练生成器仅引用实际文本片段，并使用“根据提供的上下文”等表述，以提升**忠实度**。

3. **增加对比类提示的训练数据**  
   鉴于比较类问题（如 GraphRAG 与 LightRAG 对比）表现出较低的召回率和忠实度，应在微调数据中加入更多对比样例，使模型学会识别并检索系统间的差异特征。