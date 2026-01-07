/**
 * Run Evaluation
 *
 * This script runs LightRAG against the dataset and saves the results.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import { LightRAG } from '../src/index.js';
import { QueryParam } from '../src/types.js';

console.log('Environment Debug:');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 5)}...` : 'MISSING');
console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);


interface EvalData {
    question: string;
    ground_truth: string;
}

interface EvalResult extends EvalData {
    answer: string;
    contexts: string[];
    latency_ms: number;
}

async function main() {
    // Initialize LightRAG
    const rag = new LightRAG({
        workingDir: './lightrag_eval_data',
        // Use default LLM implementation which reads from env vars (OpenAI/Qwen)
    });

    // We assume data is already inserted for this test, or we insert some mock data
    await rag.initialize();

    // Insert some data for the specific test cases if needed
    // For now, we assume the user will run this against an existing index or we mock it.
    // Let's insert some context related to the golden dataset.
    // Let's insert some context related to the golden dataset.
    const text1 = "J.K. Rowling wrote Harry Potter.";
    const text2 = "LightRAG is a RAG system using Graphs and Vectors. Local search is for details, Global search is for summaries.";
    const text3 = "J.R.R. Tolkien wrote 'The Lord of the Rings'.";
    const text4 = "GraphRAG by Microsoft uses community detection for summaries.";
    const text5 = "Local Search in SEO helps businesses appear in local map packs.";
    const text6 = "Vector databases (like Milvus/Pinecone) are essential for similarity search.";
    const text7 = "Global warming affects global climate patterns.";

    await rag.insert([text1, text2, text3, text4, text5, text6, text7]);

    // Load dataset
    const datasetPath = path.join(process.cwd(), 'eval', 'dataset.json');
    const dataset: EvalData[] = JSON.parse(await fs.readFile(datasetPath, 'utf-8'));

    const results: EvalResult[] = [];

    console.log(`Running evaluation on ${dataset.length} questions...`);

    for (const item of dataset) {
        const start = Date.now();
        const result = await rag.query(item.question, {
            mode: 'hybrid',
            cosSimThreshold: 0.1, // Relaxed threshold for initial retrieval
            enableRerank: true,   // Enable Rerank to filter the noise
            minRerankScore: 0.01, // Very conservative rerank threshold
        });
        const latency = Date.now() - start;

        // Retrieve actual contexts from rawData
        // If rawData is missing (shouldn't be), fallback to empty or prompt context
        const retrievedContexts = result.rawData?.chunks.map(c => c.content) || [];

        // Result is a QueryResult object { response: string, ... }
        // Ragas expects 'answer' as a string
        results.push({
            ...item,
            answer: result.response as string,
            contexts: retrievedContexts.length > 0 ? retrievedContexts : [],
            latency_ms: latency
        });
        console.log(`Processed: ${item.question}`);
    }

    const outputPath = path.join(process.cwd(), 'eval', 'results.json');
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${outputPath}`);
}

main().catch(console.error);
