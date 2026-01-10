"use client";

import { useState } from "react";

const API_BASE = "http://localhost:3000";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [ingestStatus, setIngestStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"query" | "ingest">("query");

  const handleQuery = async () => {
    if (!query.trim()) return;

    const userMessage: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage.content, mode: "hybrid" }),
      });

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || data.error || "No response",
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!ingestText.trim()) return;

    setIngestStatus("Uploading...");

    try {
      const response = await fetch(`${API_BASE}/documents/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ingestText }),
      });

      const data = await response.json();
      if (data.status === "success") {
        setIngestStatus(`✅ ${data.message} (ID: ${data.doc_id})`);
        setIngestText("");
      } else {
        setIngestStatus(`❌ ${data.message || "Failed"}`);
      }
    } catch (error) {
      setIngestStatus(`❌ Error: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            LightRAG UI
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("query")}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === "query"
                  ? "bg-cyan-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Query
            </button>
            <button
              onClick={() => setActiveTab("ingest")}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === "ingest"
                  ? "bg-cyan-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Ingest
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {activeTab === "query" ? (
          <div className="flex flex-col h-[calc(100vh-140px)]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 mt-20">
                  <p className="text-lg">
                    Ask anything about your knowledge base
                  </p>
                  <p className="text-sm mt-2">Powered by LightRAG TypeScript</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl ${
                    msg.role === "user"
                      ? "bg-cyan-500/20 border border-cyan-500/30 ml-12"
                      : "bg-slate-700/50 border border-slate-600 mr-12"
                  }`}
                >
                  <p className="text-xs text-slate-400 mb-1">
                    {msg.role === "user" ? "You" : "LightRAG"}
                  </p>
                  <p className="text-slate-100 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              ))}
              {loading && (
                <div className="bg-slate-700/50 border border-slate-600 p-4 rounded-xl mr-12">
                  <p className="text-slate-400 animate-pulse">Thinking...</p>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                placeholder="Ask a question..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={handleQuery}
                disabled={loading}
                className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mt-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Ingest Document
            </h2>
            <p className="text-slate-400 mb-4">
              Add text content to your knowledge base for RAG retrieval.
            </p>
            <textarea
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="Paste your document text here..."
              rows={10}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={handleIngest}
                disabled={!ingestText.trim()}
                className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
              >
                Upload Document
              </button>
              {ingestStatus && (
                <p className="text-sm text-slate-300">{ingestStatus}</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
