/**
 * Generate Evaluation Dataset
 *
 * This script creates a synthetic dataset or loads a manual one for RAG evaluation.
 * For this initial version, we will hardcode a small Golden Dataset.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';

interface EvalData {
    question: string;
    ground_truth: string;
}

const GOLDEN_DATASET: EvalData[] = [
    {
        question: "Who is the author of 'Harry Potter'?",
        ground_truth: "J.K. Rowling is the author of the Harry Potter series."
    },
    {
        question: "What is LightRAG?",
        ground_truth: "LightRAG is a Retrieval-Augmented Generation system that combines Knowledge Graph and Vector Search for better context understanding."
    },
    {
        question: "Explain the difference between local and global search in LightRAG.",
        ground_truth: "Local search focuses on specific entities and details using vector search and 1-hop graph neighbors. Global search focuses on broader topics using relation vectors and aggregated entity information."
    },
    {
        question: "Who wrote 'The Lord of the Rings'?",
        ground_truth: "J.R.R. Tolkien wrote 'The Lord of the Rings'."
    },
    {
        question: "How does GraphRAG differ from LightRAG?",
        ground_truth: "GraphRAG is a system by Microsoft that uses community detection. LightRAG uses a dual-level retrieval (local/global) system. Key difference is LightRAG's ability to handle incremental updates and fast retrieval without heavy community clustering."
    },
    {
        question: "What is 'Local Search' in the context of SEO?",
        ground_truth: "In SEO, Local Search refers to optimizing a website to be found in local search results, typically for brick-and-mortar businesses."
    }
];

async function main() {
    const outputPath = path.join(process.cwd(), 'eval', 'dataset.json');
    await fs.writeFile(outputPath, JSON.stringify(GOLDEN_DATASET, null, 2));
    console.log(`Dataset generated at ${outputPath}`);
}

main().catch(console.error);
