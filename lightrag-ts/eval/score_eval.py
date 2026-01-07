import json
import os
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset

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

valid_results = evaluate(
    dataset=dataset,
    metrics=req_metrics,
)

print("\nEvaluation Results:")
print(valid_results)

# Save metrics
df = valid_results.to_pandas()
df.to_csv('eval/metrics_report.csv', index=False)
print("Metrics saved to eval/metrics_report.csv")
