import { LightRAG } from '../src/index.js';
import * as dotenv from 'dotenv';
import { logger } from '../src/utils/index.js';

dotenv.config();

/**
 * Demo: Neo4j Graph Storage
 * 
 * Prerequisites:
 * 1. Start Neo4j: docker-compose up -d
 * 2. Configure .env with NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 */
async function main() {
    logger.setLevel('INFO');

    console.log('Initializing LightRAG with Neo4j storage...');

    const rag = new LightRAG({
        workingDir: './lightrag_data_neo4j',
        graphStorage: 'neo4j',
        logLevel: 'INFO',
        neo4jConfig: {
            uri: process.env.NEO4J_URI,
            user: process.env.NEO4J_USER,
            password: process.env.NEO4J_PASSWORD,
        }
    });

    await rag.initialize();

    const text = `
    Neo4j is a graph database management system developed by Neo4j, Inc.
    It is an ACID-compliant transactional database with native graph storage and processing.
    LightRAG can now use Neo4j to store its knowledge graph.
    `;

    console.log('Inserting document...');
    await rag.insert(text, { ids: ['neo4j-demo-doc'] });

    console.log('Document inserted. Querying...');

    // Perform a naive query to check basic retrieval
    const result = await rag.query('What is Neo4j?', {
        mode: 'hybrid',
        topK: 5
    });

    console.log('\nResponse:\n', result.response);

    console.log('\nVerification:');
    console.log('1. Go to http://localhost:7474');
    console.log('2. Login with your credentials');
    console.log('3. Run Cypher: MATCH (n:Entity) RETURN n LIMIT 25');
    console.log('   You should see nodes like "Neo4j", "Graph Database", etc.');
}

main().catch(console.error);
