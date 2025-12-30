/**
 * LightRAG TypeScript - Basic Usage Example
 */

import { LightRAG } from '../src/index.js';

async function main() {
    // Create LightRAG instance
    const rag = new LightRAG({
        workingDir: './example_data',
        namespace: 'demo',
        // Optional: customize entity types
        entityTypes: ['Person', 'Organization', 'Location', 'Event', 'Concept'],
        language: 'English',
    });

    try {
        // Initialize
        await rag.initialize();
        console.log('✅ LightRAG initialized');

        // Insert a sample document
        const document = `
    Albert Einstein was a German-born theoretical physicist who developed the theory of relativity,
    one of the two pillars of modern physics (alongside quantum mechanics). His work is also known
    for its influence on the philosophy of science. He is best known to the general public for his
    mass–energy equivalence formula E = mc², which has been dubbed "the world's most famous equation".
    
    Einstein received the Nobel Prize in Physics in 1921 "for his services to theoretical physics,
    and especially for his discovery of the law of the photoelectric effect", a pivotal step in the
    development of quantum theory. His intellectual achievements and originality have made the word
    "Einstein" synonymous with "genius".
    
    Einstein was born in Ulm, in the Kingdom of Württemberg in the German Empire, on 14 March 1879.
    His parents were Hermann Einstein, a salesman and engineer, and Pauline Koch. In 1880, the family
    moved to Munich, where Einstein's father and his uncle Jakob founded Elektrotechnische Fabrik
    J. Einstein & Cie, a company that manufactured electrical equipment based on direct current.
    `;

        console.log('\n📄 Inserting document...');
        await rag.insert(document, {
            filePaths: 'einstein_biography.txt',
        });
        console.log('✅ Document inserted');

        // Query examples
        console.log('\n🔍 Running queries...\n');

        // Hybrid mode (default) - combines local and global search
        const result1 = await rag.query('Who was Albert Einstein?', {
            mode: 'hybrid',
        });
        console.log('--- Hybrid Query ---');
        console.log('Q: Who was Albert Einstein?');
        console.log('A:', result1.response.substring(0, 500) + '...\n');

        // Local mode - focuses on specific entities
        const result2 = await rag.query('Where was Einstein born?', {
            mode: 'local',
        });
        console.log('--- Local Query ---');
        console.log('Q: Where was Einstein born?');
        console.log('A:', result2.response.substring(0, 500) + '...\n');

        // Naive mode - direct chunk search without KG
        const result3 = await rag.query('What prize did Einstein receive?', {
            mode: 'naive',
        });
        console.log('--- Naive Query ---');
        console.log('Q: What prize did Einstein receive?');
        console.log('A:', result3.response.substring(0, 500) + '...\n');

        // Get knowledge graph
        console.log('📊 Knowledge Graph:');
        const kg = await rag.getKnowledgeGraph('Einstein', 2, 20);
        console.log(`  Nodes: ${kg.nodes.length}`);
        console.log(`  Edges: ${kg.edges.length}`);

        if (kg.nodes.length > 0) {
            console.log('\n  Sample nodes:');
            for (const node of kg.nodes.slice(0, 5)) {
                console.log(`    - ${node.id} (${node.label})`);
            }
        }

        // Cleanup
        await rag.finalize();
        console.log('\n✅ Example complete');

    } catch (error) {
        console.error('Error:', error);
        await rag.finalize();
    }
}

// Run if executed directly
main().catch(console.error);
