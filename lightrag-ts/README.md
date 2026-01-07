# LightRAG for TypeScript

TypeScript implementation of [LightRAG](https://github.com/HKUDS/LightRAG).

> "LightRAG: Simple and Fast Retrieval-Augmented Generation"

This project implements the full LightRAG pipeline in TypeScript, including:

- **Data Ingestion**: Chunking, embedding, and incremental updates.
- **Knowledge Graph**: Entity and relationship extraction using LLMs.
- **Hybrid Search**: Local, Global, and Hybrid search modes combining graph and vector retrieval.
- **Rerank**: Integration with Cohere, Jina, and Aliyun rerankers.

## 🛠 Prerequisites

- **Node.js**: >= 18.0.0
- **Python**: >= 3.9 (Required for evaluation only)
- **uv**: Python package manager (Recommended for evaluation)
- **OpenAI API Key**: Required for LLM and Embeddings.

## 📦 Installation

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/jeremygu000/LightRAG-ts.git
    cd lightrag-ts
    ```

2.  **Install Node.js dependencies**:

    ```bash
    npm install
    ```

3.  **Set up Environment Variables**:
    Create a `.env` file or export variables directly:
    ```bash
    export OPENAI_API_KEY="sk-..."
    # Optional: For rerank
    export COHERE_API_KEY="..."
    ```

## 🚀 Usage

Run the basic example to see LightRAG in action:

```bash
npm run example
```

This will:

1.  Initialize LightRAG in `./example_data`.
2.  Ingest a sample document (Einstein's biography).
3.  Perform Hybrid, Local, and Naive search queries.
4.  Display the results.

## 🧪 Running Tests

Run the unit test suite (using Vitest):

```bash
npm run test
```

Current test coverage:

- Utils & Chunking
- Storage (KV, Vector, Graph)
- Rerank Module

## 📊 RAG Evaluation (Ragas)

We provide a built-in evaluation pipeline using `Ragas` (Python) to measure:

- **Faithfulness**
- **Answer Relevancy**
- **Context Precision**
- **Context Recall**

### Evaluation Prerequisites

Ensure you have `uv` installed for Python dependency management:

```bash
pip install uv
```

### Running Evaluation

Run the full evaluation pipeline with a single command:

```bash
npm run eval
```

This command automatically:

1.  **Generates Evaluation Data** (`eval:gen`): Creates a synthetic dataset.
2.  **Runs Inference** (`eval:run`): Queries LightRAG using the dataset.
3.  **Calculates Scores** (`eval:score`): Uses Ragas (in a virtual env managed by `uv`) to score the results.

### Manual Steps

If you prefer to run steps individually:

```bash
# 1. Generate Data
npm run eval:gen

# 2. Run LightRAG Inference
npm run eval:run

# 3. Score with Ragas
npm run eval:score
```

HTML/CSV reports will be generated in the `eval/` directory.

## 📂 Documentation

- [Initial Data Ingestion Flow](docs/flow/01_initial_data_ingestion.md)
- [Update & Delete Data Flow](docs/flow/02_update_data.md)
- [Query Data Flow](docs/flow/03_query_data.md)
- [Optimization Roadmap](docs/roadmap_and_optimization.md)

## 📄 License

MIT
