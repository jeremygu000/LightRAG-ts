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
        llmModelFunc: async (text) => {
            // Mock LLM for testing if no API key
            if (!process.env.OPENAI_API_KEY) return `Mock answer for: ${text.substring(0, 20)}...`;
            // In real run, use default OpenAI
            return "This is a real LLM response placeholder.";
        }
    });

    // We assume data is already inserted for this test, or we insert some mock data
    await rag.initialize();

    // Insert some data for the specific test cases if needed
    // For now, we assume the user will run this against an existing index or we mock it.
    // Let's insert some context related to the golden dataset.
    const text1 = "J.K. Rowling wrote Harry Potter.";
    const text2 = "LightRAG is a RAG system using Graphs and Vectors. Local search is for details, Global search is for summaries.";
    await rag.insert([text1, text2]);

    // Load dataset
    const datasetPath = path.join(process.cwd(), 'eval', 'dataset.json');
    const dataset: EvalData[] = JSON.parse(await fs.readFile(datasetPath, 'utf-8'));

    const results: EvalResult[] = [];

    console.log(`Running evaluation on ${dataset.length} questions...`);

    for (const item of dataset) {
        const start = Date.now();
        const result = await rag.query(item.question, {
            mode: 'hybrid'
        });
        const latency = Date.now() - start;

        // In a real scenario, we extract retrived contexts from the result if available.
        // Current LightRAG returns just the string answer. 
        // We might need to modify LightRAG to return contexts for eval purposes, 
        // or just rely on the answer for now.
        // Ragas works best if we have 'contexts'.

        // Result is a QueryResult object { response: string, ... }
        // Ragas expects 'answer' as a string
        results.push({
            ...item,
            answer: result.response,
            contexts: [text1, text2], // Mock contexts for now 
            latency_ms: latency
        });
        console.log(`Processed: ${item.question}`);
    }

    const outputPath = path.join(process.cwd(), 'eval', 'results.json');
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${outputPath}`);
}

main().catch(console.error);
