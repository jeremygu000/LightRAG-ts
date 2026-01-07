import 'dotenv/config';
import { LightRAG } from '../src/index.js';

async function main() {
    const rag = new LightRAG({
        workingDir: './lightrag_eval_data', // Re-use eval data
    });

    console.log("Initializing LightRAG...");
    await rag.initialize();

    const query = "Explain the difference between local and global search in LightRAG.";
    console.log(`\n-----------------------------------`);
    console.log(`Querying: "${query}"`);
    console.log(`Mode: Streaming + Hybrid + Rerank`);
    console.log(`-----------------------------------\n`);

    const startTime = Date.now();
    let firstTokenTime = 0;

    const result = await rag.query(query, {
        mode: 'hybrid',
        stream: true,
        enableRerank: true,
        minRerankScore: 0.01,
    });

    if (typeof result.response === 'string') {
        console.log("Response (Not Streamed):", result.response);
    } else {
        process.stdout.write("Response: ");
        let count = 0;
        for await (const chunk of result.response) {
            if (count === 0) {
                firstTokenTime = Date.now();
                const ttft = firstTokenTime - startTime;
                // Print TTFT on a new line then continue prompt
                process.stdout.write(`\n\n[Time To First Token: ${ttft}ms]\n\n`);
            }
            process.stdout.write(chunk);
            count++;
        }
        console.log("\n\n-----------------------------------");
        const totalTime = Date.now() - startTime;
        console.log(`Total Latency: ${totalTime}ms`);
    }
}

main().catch(console.error);
