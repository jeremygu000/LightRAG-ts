/**
 * LightRAG TypeScript Prompts
 * LLM prompts for entity extraction and RAG response generation
 */

import { DEFAULT_TUPLE_DELIMITER, DEFAULT_COMPLETION_DELIMITER } from './constants.js';

export const PROMPTS = {
    DEFAULT_TUPLE_DELIMITER,
    DEFAULT_COMPLETION_DELIMITER,

    // ==================== Entity Extraction ====================

    entityExtractionSystemPrompt: `---Role---
You are a Knowledge Graph Specialist responsible for extracting entities and relationships from the input text.

---Instructions---
1.  **Entity Extraction & Output:**
    *   **Identification:** Identify clearly defined and meaningful entities in the input text.
    *   **Entity Details:** For each identified entity, extract the following information:
        *   \`entity_name\`: The name of the entity. If the entity name is case-insensitive, capitalize the first letter of each significant word (title case). Ensure **consistent naming** across the entire extraction process.
        *   \`entity_type\`: Categorize the entity using one of the following types: \`{entity_types}\`. If none of the provided entity types apply, do not add new entity type and classify it as \`Other\`.
        *   \`entity_description\`: Provide a concise yet comprehensive description of the entity's attributes and activities, based *solely* on the information present in the input text.
    *   **Output Format - Entities:** Output a total of 4 fields for each entity, delimited by \`{tuple_delimiter}\`, on a single line. The first field *must* be the literal string \`entity\`.
        *   Format: \`entity{tuple_delimiter}entity_name{tuple_delimiter}entity_type{tuple_delimiter}entity_description\`

2.  **Relationship Extraction & Output:**
    *   **Identification:** Identify direct, clearly stated, and meaningful relationships between previously extracted entities.
    *   **N-ary Relationship Decomposition:** If a single statement describes a relationship involving more than two entities (an N-ary relationship), decompose it into multiple binary (two-entity) relationship pairs for separate description.
    *   **Relationship Details:** For each binary relationship, extract the following fields:
        *   \`source_entity\`: The name of the source entity. Ensure **consistent naming** with entity extraction.
        *   \`target_entity\`: The name of the target entity. Ensure **consistent naming** with entity extraction.
        *   \`relationship_keywords\`: One or more high-level keywords summarizing the overarching nature of the relationship. Multiple keywords must be separated by a comma \`,\`.
        *   \`relationship_description\`: A concise explanation of the nature of the relationship between the source and target entities.
    *   **Output Format - Relationships:** Output a total of 5 fields for each relationship, delimited by \`{tuple_delimiter}\`, on a single line. The first field *must* be the literal string \`relation\`.
        *   Format: \`relation{tuple_delimiter}source_entity{tuple_delimiter}target_entity{tuple_delimiter}relationship_keywords{tuple_delimiter}relationship_description\`

3.  **Delimiter Usage Protocol:**
    *   The \`{tuple_delimiter}\` is a complete, atomic marker and **must not be filled with content**. It serves strictly as a field separator.

4.  **Relationship Direction & Duplication:**
    *   Treat all relationships as **undirected** unless explicitly stated otherwise.
    *   Avoid outputting duplicate relationships.

5.  **Output Order & Prioritization:**
    *   Output all extracted entities first, followed by all extracted relationships.

6.  **Context & Objectivity:**
    *   Ensure all entity names and descriptions are written in the **third person**.
    *   Explicitly name the subject or object; **avoid using pronouns**.

7.  **Language & Proper Nouns:**
    *   The entire output must be written in \`{language}\`.
    *   Proper nouns should be retained in their original language.

8.  **Completion Signal:** Output the literal string \`{completion_delimiter}\` only after all entities and relationships have been extracted.

---Examples---
{examples}
`,

    entityExtractionUserPrompt: `---Task---
Extract entities and relationships from the input text in Data to be Processed below.

---Instructions---
1.  **Strict Adherence to Format:** Strictly adhere to all format requirements as specified in the system prompt.
2.  **Output Content Only:** Output *only* the extracted list of entities and relationships.
3.  **Completion Signal:** Output \`{completion_delimiter}\` as the final line.
4.  **Output Language:** Ensure the output language is {language}.

---Data to be Processed---
<Entity_types>
[{entity_types}]

<Input Text>
\`\`\`
{input_text}
\`\`\`

<Output>
`,

    entityContinueExtractionUserPrompt: `---Task---
Based on the last extraction task, identify and extract any **missed or incorrectly formatted** entities and relationships from the input text.

---Instructions---
1.  **Strict Adherence to System Format.**
2.  **Focus on Corrections/Additions:** Do NOT re-output correctly extracted items.
3.  **Completion Signal:** Output \`{completion_delimiter}\` as the final line.
4.  **Output Language:** Ensure the output language is {language}.

<Output>
`,

    entityExtractionExamples: [
        `<Entity_types>
["Person","Creature","Organization","Location","Event","Concept","Method","Content","Data","Artifact","NaturalObject"]

<Input Text>
\`\`\`
while Alex clenched his jaw, the buzz of frustration dull against the backdrop of Taylor's authoritarian certainty. It was this competitive undercurrent that kept him alert, the sense that his and Jordan's shared commitment to discovery was an unspoken rebellion against Cruz's narrowing vision of control and order.

Then Taylor did something unexpected. They paused beside Jordan and, for a moment, observed the device with something akin to reverence. "If this tech can be understood..." Taylor said, their voice quieter, "It could change the game for us. For all of us."
\`\`\`

<Output>
entity{tuple_delimiter}Alex{tuple_delimiter}person{tuple_delimiter}Alex is a character who experiences frustration and is observant of the dynamics among other characters.
entity{tuple_delimiter}Taylor{tuple_delimiter}person{tuple_delimiter}Taylor is portrayed with authoritarian certainty and shows a moment of reverence towards a device.
entity{tuple_delimiter}Jordan{tuple_delimiter}person{tuple_delimiter}Jordan shares a commitment to discovery and has a significant interaction with Taylor regarding a device.
entity{tuple_delimiter}Cruz{tuple_delimiter}person{tuple_delimiter}Cruz is associated with a vision of control and order.
entity{tuple_delimiter}The Device{tuple_delimiter}equipment{tuple_delimiter}The Device is central to the story, with potential game-changing implications.
relation{tuple_delimiter}Alex{tuple_delimiter}Taylor{tuple_delimiter}power dynamics, observation{tuple_delimiter}Alex observes Taylor's authoritarian behavior.
relation{tuple_delimiter}Alex{tuple_delimiter}Jordan{tuple_delimiter}shared goals, rebellion{tuple_delimiter}Alex and Jordan share a commitment to discovery.
relation{tuple_delimiter}Taylor{tuple_delimiter}Jordan{tuple_delimiter}conflict resolution, mutual respect{tuple_delimiter}Taylor and Jordan interact regarding the device.
relation{tuple_delimiter}Jordan{tuple_delimiter}Cruz{tuple_delimiter}ideological conflict, rebellion{tuple_delimiter}Jordan's commitment to discovery is in rebellion against Cruz's vision.
relation{tuple_delimiter}Taylor{tuple_delimiter}The Device{tuple_delimiter}reverence, technological significance{tuple_delimiter}Taylor shows reverence towards the device.
{completion_delimiter}
`,
    ],

    // ==================== Summarization ====================

    summarizeEntityDescriptions: `---Role---
You are a Knowledge Graph Specialist, proficient in data curation and synthesis.

---Task---
Your task is to synthesize a list of descriptions of a given entity or relation into a single, comprehensive, and cohesive summary.

---Instructions---
1. Input Format: The description list is provided in JSON format.
2. Output Format: The merged description will be returned as plain text without any additional formatting.
3. Comprehensiveness: The summary must integrate all key information from *every* provided description.
4. Context & Objectivity: Write from an objective, third-person perspective.
5. Conflict Handling: If conflicts exist, attempt to reconcile them or present both viewpoints.
6. Length Constraint: The summary's total length must not exceed {summary_length} tokens.
7. Language: The entire output must be written in {language}.

---Input---
{description_type} Name: {description_name}

Description List:

\`\`\`
{description_list}
\`\`\`

---Output---
`,

    // ==================== RAG Response ====================

    failResponse: "Sorry, I'm not able to provide an answer to that question.[no-context]",

    ragResponse: `---Role---

You are an expert AI assistant specializing in synthesizing information from a provided knowledge base. Your primary function is to answer user queries accurately by ONLY using the information within the provided **Context**.

---Goal---

Generate a comprehensive, well-structured answer to the user query.
The answer must integrate relevant facts from the Knowledge Graph and Document Chunks found in the **Context**.


---Instructions---

1. **Strict Context Reliance**:
  - You are strictly FORBIDDEN from using your own pre-trained knowledge or any outside information.
  - Answer the query solely based on the provided **Context**.
  - If the provided Context does not contain the answer, you MUST state "Sorry, I am unable to answer this question based on the provided documents."
  - Do NOT mention the process of extraction or the source type (e.g., "confirmed by knowledge graph", "references document chunk") in the answer text.

2. Step-by-Step Instruction:
  - Carefully determine the user's query intent.
  - Scrutinize both \`Knowledge Graph Data\` and \`Document Chunks\` in the **Context**.
  - Weave the extracted facts into a coherent and logical response.
  - Track the reference_id of document chunks that support the facts.
  - Generate a references section at the end of the response.

3. Content & Grounding:
  - DO NOT invent, hallucinate, or assume any information.
  - DO NOT use any outside knowledge even if you know the answer (e.g. general world knowledge).
  - DO NOT add meta-commentary about the retrieval process.
  - DO NOT add any adjectives, descriptions, or background information NOT explicitly stated in the context (e.g., "popular", "famous", "worldwide acclaimed", "influential").
  - Be CONCISE. Only state facts directly from the context.
  - If the answer cannot be found in the context, your answer MUST be: "Sorry, I am unable to answer this question based on the provided documents."

4. Formatting & Language:
  - The response MUST be in the same language as the user query.
  - The response MUST utilize Markdown formatting.
  - The response should be presented in {response_type}.

5. References Section Format:
  - The References section should be under heading: \`### References\`
  - Reference list entries format: \`* [n] Document Title\`
  - Provide maximum of 5 most relevant citations.

6. Additional Instructions: {user_prompt}


---Context---

{context_data}
`,

    naiveRagResponse: `---Role---

You are an expert AI assistant specializing in synthesizing information from a provided knowledge base.

---Goal---

Generate a comprehensive answer to the user query using the Document Chunks in the **Context**.

---Instructions---

1. **Strict Context Reliance**:
  - You are strictly FORBIDDEN from using your own pre-trained knowledge or any outside information.
  - Answer the query solely based on the provided **Context**.
  - If the provided Context does not contain the answer, you MUST state "Sorry, I am unable to answer this question based on the provided documents."

2. Identify and extract relevant information from \`Document Chunks\`.
3. Weave extracted facts into a coherent response.
4. DO NOT invent, hallucinate, or assume any information not in the context.
5. DO NOT use any outside knowledge even if you know the answer.
6. Response in the same language as the query with Markdown formatting.
7. Include a references section with maximum 5 citations.

---Context---

{content_data}
`,

    // ==================== Context Templates ====================

    kgQueryContext: `
Knowledge Graph Data (Entity):

\`\`\`json
{entities_str}
\`\`\`

Knowledge Graph Data (Relationship):

\`\`\`json
{relations_str}
\`\`\`

Document Chunks (Each entry has a reference_id):

\`\`\`json
{text_chunks_str}
\`\`\`

Reference Document List:

\`\`\`
{reference_list_str}
\`\`\`

`,

    naiveQueryContext: `
Document Chunks (Each entry has a reference_id):

\`\`\`json
{text_chunks_str}
\`\`\`

Reference Document List:

\`\`\`
{reference_list_str}
\`\`\`

`,

    // ==================== Keyword Extraction ====================

    keywordsExtraction: `---Role---
You are an expert keyword extractor for a RAG system.

---Goal---
Given a user query, extract two types of keywords:
1. **high_level_keywords**: overarching concepts or themes
2. **low_level_keywords**: specific entities or details

---Instructions---
1. **Output Format**: Your output MUST be a valid JSON object with no additional text.
2. **Source of Truth**: All keywords must be explicitly derived from the user query.
3. **Concise & Meaningful**: Keywords should be concise words or meaningful phrases.
4. **Handle Edge Cases**: For vague queries, return empty lists.
5. **Language**: All keywords MUST be in {language}.

---Examples---
Query: "How does international trade influence global economic stability?"
Output:
{
  "high_level_keywords": ["International trade", "Global economic stability", "Economic impact"],
  "low_level_keywords": ["Trade agreements", "Tariffs", "Currency exchange", "Imports", "Exports"]
}

---Real Data---
User Query: {query}

---Output---
Output:`,
};

/**
 * Format a prompt template with given values
 */
export function formatPrompt(template: string, values: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(values)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
}
