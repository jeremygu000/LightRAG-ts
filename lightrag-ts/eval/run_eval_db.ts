/**
 * Run Evaluation (DB Storage: Redis, Neo4j, Qdrant)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import { LightRAG } from '../src/index.js';

console.log('Environment Debug:');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 5)}...` : 'MISSING');
console.log('Redis:', process.env.REDIS_HOST);
console.log('Qdrant:', process.env.QDRANT_URL);
console.log('Neo4j:', process.env.NEO4J_URI);

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
    // Initialize LightRAG with DB Storage
    console.log('Initializing LightRAG with DB storage...');
    const rag = new LightRAG({
        workingDir: './lightrag_eval_db_data',
        namespace: 'eval_db_v3',
        embeddingDim: 1024,
        kvStorage: 'redis',
        vectorStorage: 'qdrant',
        graphStorage: 'neo4j',
        redisConfig: {
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
            password: process.env.REDIS_PASSWORD || undefined,
        },
        qdrantConfig: {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
        },
        neo4jConfig: {
            uri: process.env.NEO4J_URI,
            user: process.env.NEO4J_USER,
            password: process.env.NEO4J_PASSWORD,
        }
    });

    // Clear existing data to ensure clean evaluation state
    console.log('Clearing previous data...');
    await rag.drop();
    await rag.initialize();

    console.log('------------------------------------------------');
    console.log('Management UIs:');
    console.log('- Neo4j Browser: http://localhost:7474');
    console.log('- Qdrant Dashboard: http://localhost:6333/dashboard');
    console.log('- RedisInsight: http://localhost:5540');
    console.log('------------------------------------------------');

    // Insert sample data
    console.log('Inserting sample data...');
    const text1 = "J.K. Rowling wrote Harry Potter.";
    const text2 = "LightRAG is a RAG system using Graphs and Vectors. Local search is for details, Global search is for summaries.";
    const text3 = "J.R.R. Tolkien wrote 'The Lord of the Rings'.";
    const text4 = "GraphRAG by Microsoft uses community detection for summaries.";
    const text5 = "Local Search in SEO helps businesses appear in local map packs.";
    const text6 = "Vector databases (like Milvus/Pinecone) are essential for similarity search.";
    const text7 = "Global warming affects global climate patterns.";

    await rag.insert([text1, text2, text3, text4, text5, text6, text7]);
    console.log('✅ Sample data inserted');

    // Load dataset
    const datasetPath = path.join(process.cwd(), 'eval', 'dataset.json');
    const dataset: EvalData[] = JSON.parse(await fs.readFile(datasetPath, 'utf-8'));

    const results: EvalResult[] = [];

    console.log(`Running evaluation on ${dataset.length} questions...`);
    for (const item of dataset) {
        const start = Date.now();
        const result = await rag.query(item.question, {
            mode: 'hybrid',
            topK: 5, // Limit topK for small dataset
            cosSimThreshold: 0.4, // Stricter similarity threshold
            enableRerank: true,
            minRerankScore: 0.4, // Stricter rerank threshold
            temperature: 0.0, // Ensure deterministic output
        });
        const latency = Date.now() - start;

        const retrievedContexts = result.rawData?.chunks.map(c => c.content) || [];

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
