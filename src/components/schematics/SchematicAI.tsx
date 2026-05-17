"use client";

import { useState, useRef, useEffect } from "react";
import { SchematicFile } from "@/app/schematics/[deviceId]/page";
import { X, Send, Loader2, Bot, User, Zap } from "lucide-react";

interface Props {
  deviceName: string;
  selectedFile: SchematicFile | null;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "Quais componentes verificar primeiro?",
  "Sintomas de curto no circuito de carga",
  "Como medir tensão no IC de carga?",
  "Diagrama de alimentação da tela",
  "Problema de sinal sem rede",
];

export default function SchematicAI({ deviceName, selectedFile, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Olá! Sou o assistente de diagnóstico para o **${deviceName}**. ${
        selectedFile
          ? `Estou analisando o documento **${selectedFile.name}**.`
          : ""
      }\n\nPosso te ajudar a:\n- Identificar componentes no esquema\n- Guiar troubleshooting passo a passo\n- Explicar circuitos e tensões esperadas\n- Diagnóstico de falhas comuns\n\nQual problema você está investigando?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const userText = text || input.trim();
    if (!userText || loading) return;

    setInput("");
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/schematics/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          deviceName,
          fileContext: selectedFile
            ? `Documento atual: ${selectedFile.name} (tipo: ${selectedFile.type})`
            : "",
        }),
      });

      const data = await res.json();
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.response },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Erro ao conectar com a IA. Verifique a chave Groq nas variáveis de ambiente.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
            <Bot size={14} className="text-yellow-400" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white">IA Diagnóstico</h3>
            <p className="text-xs text-gray-500">Groq · Llama 3</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Context badge */}
      {selectedFile && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
          <Zap size={12} className="text-blue-400 shrink-0" />
          <span className="text-xs text-blue-300 truncate">
            Contexto: {selectedFile.name}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center ${
                msg.role === "assistant"
                  ? "bg-yellow-500/20 border border-yellow-500/30"
                  : "bg-gray-700"
              }`}
            >
              {msg.role === "assistant" ? (
                <Bot size={12} className="text-yellow-400" />
              ) : (
                <User size={12} className="text-gray-400" />
              )}
            </div>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === "assistant"
                  ? "bg-gray-800 text-gray-200 rounded-tl-none"
                  : "bg-yellow-500/15 border border-yellow-500/20 text-yellow-100 rounded-tr-none"
              }`}
              dangerouslySetInnerHTML={{
                __html: msg.content
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br/>"),
              }}
            />
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-yellow-400" />
            </div>
            <div className="bg-gray-800 rounded-xl rounded-tl-none px-3 py-2">
              <Loader2 size={14} className="animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-3 py-2 border-t border-gray-800 overflow-x-auto">
        <div className="flex gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              disabled={loading}
              className="shrink-0 text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors whitespace-nowrap disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-800">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva o problema..."
            rows={2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 resize-none transition-colors"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="p-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={14} className="text-black" />
          </button>
        </div>
        <p className="text-xs text-gray-700 mt-1 text-center">
          Enter para enviar · Shift+Enter nova linha
        </p>
      </div>
    </div>
  );
}
