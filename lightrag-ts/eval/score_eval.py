import json
import os
from ragas import evaluate
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from dotenv import load_dotenv

# Load environment variables from parent directory .env
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

# Load results
with open('results.json', 'r') as f:
    results = json.load(f)

# Prepare data for Ragas
data = {
    'question': [r['question'] for r in results],
    'answer': [r['answer'] for r in results],
    'contexts': [r['contexts'] for r in results],
    'ground_truth': [r['ground_truth'] for r in results]
}

dataset = Dataset.from_dict(data)

print("Starting Ragas evaluation...")

# Run evaluation
# Note: You need OpenAI API Key set in environment variables
req_metrics = [
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall
]

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Configure Qwen/Aliyun LLM and Embeddings
# We reuse the environment variables loaded by python-dotenv (OPENAI_BASE_URL, OPENAI_API_KEY)
# But we need to explicitly set the model name from env or default to something valid for Aliyun
llm_model = os.getenv("OPENAI_MODEL", "qwen-plus")
embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-v3")

from openai import OpenAI, AsyncOpenAI

# Custom Embeddings Wrapper to handle Aliyun API strictness
# bypassing LangChain's internal logic which might send incompatible params
class AliyunOptimizedEmbeddings(OpenAIEmbeddings):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=os.environ["OPENAI_BASE_URL"])
        self.async_client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=os.environ["OPENAI_BASE_URL"])

    def _sanitize(self, texts):
        cleaned_texts = []
        for t in texts:
            if not t:
                cleaned_texts.append("unknown")
            elif isinstance(t, str):
                cleaned_texts.append(t)
            else:
                cleaned_texts.append(str(t))
        return cleaned_texts

    def embed_documents(self, texts, chunk_size=None):
        cleaned = self._sanitize(texts)
        # Direct call to OpenAI client, ignoring chunk_size for simplicity (Ragas batches handled upstream usually)
        if not cleaned:
            return []
        resp = self.client.embeddings.create(input=cleaned, model=self.model)
        return [data.embedding for data in resp.data]

    def embed_query(self, text):
        clean_text = str(text) if text else "unknown"
        resp = self.client.embeddings.create(input=[clean_text], model=self.model)
        return resp.data[0].embedding
        
    async def aembed_documents(self, texts, chunk_size=None):
        cleaned = self._sanitize(texts)
        if not cleaned:
            return []
        resp = await self.async_client.embeddings.create(input=cleaned, model=self.model)
        return [data.embedding for data in resp.data]

    async def aembed_query(self, text):
        clean_text = str(text) if text else "unknown"
        resp = await self.async_client.embeddings.create(input=[clean_text], model=self.model)
        return resp.data[0].embedding


# Wrapper to fix common JSON errors from LLM (like escaped single quotes)
class FixJsonChatOpenAI(ChatOpenAI):
    def _fix_json(self, text: str) -> str:
        if not text:
            return ""
        # Fix invalid escape for single quote: \' -> '
        # Also fix escaped newlines if they break json in some contexts, but mostly \' is the culprit
        return text.replace(r"\'", "'")

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        result = super()._generate(messages, stop, run_manager, **kwargs)
        for gen in result.generations:
            gen.text = self._fix_json(gen.text)
            if hasattr(gen, 'message'):
                gen.message.content = self._fix_json(gen.message.content)
        return result

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        result = await super()._agenerate(messages, stop, run_manager, **kwargs)
        for gen in result.generations:
            gen.text = self._fix_json(gen.text)
            if hasattr(gen, 'message'):
                gen.message.content = self._fix_json(gen.message.content)
        return result

llm = FixJsonChatOpenAI(model=llm_model, temperature=0)
embeddings = AliyunOptimizedEmbeddings(model=embedding_model)

valid_results = evaluate(
    dataset=dataset,
    metrics=req_metrics,
    llm=llm,
    embeddings=embeddings,
    raise_exceptions=False,
)

print("\nEvaluation Results:")
print(valid_results)

# Save metrics
df = valid_results.to_pandas()
df.to_csv('metrics_report.csv', index=False)
print("Metrics saved to metrics_report.csv")

# --- Automated Analysis with Qwen ---
print("\nGenerating analysis report with LLM...")

csv_content = df.to_csv(index=False)

analysis_prompt = f"""
You remain an expert Data Scientist and RAG System Evaluator.
Please analyze the following RAG evaluation metrics report (CSV format).

### Metrics Explanations:
- **Faithfulness**: 0-1. How much the answer is derived purely from context. Low score = Hallucination.
- **Answer Relevancy**: 0-1. How relevant the answer is to the question.
- **Context Precision**: 0-1. Signal-to-noise ratio in retrieved docs.
- **Context Recall**: 0-1. Whether all necessary information was retrieved.

### Report Data:
```csv
{csv_content}
```

### Task:
1.  **Summary**: Give a high-level summary of the system's performance.
2.  **Weakness Analysis**: Identify specific questions where metrics are low (e.g. Low Faithfulness) and explain why (e.g. AI added external knowledge).
3.  **Optimization Advice**: Suggest 2-3 concrete actions to improve the scores based on this data.

Please output in Markdown format.
**IMPORTANT: Provide the response in BOTH English and Chinese.**
"""

# Invoke the LLM (reuse the 'llm' instance configured above)
from langchain_core.messages import HumanMessage
try:
    response = llm.invoke([HumanMessage(content=analysis_prompt)])
    analysis = response.content

    with open('report_analysis.md', 'w') as f:
        f.write(analysis)
    print("Analysis saved to report_analysis.md")
except Exception as e:
    print(f"Error generating analysis: {e}")
