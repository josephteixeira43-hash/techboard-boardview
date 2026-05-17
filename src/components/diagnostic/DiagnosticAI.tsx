"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Zap, ChevronDown, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  highlights?: string[];
}

interface Props {
  deviceName: string;
  fileName: string;
  onHighlightComponent: (name: string) => void;
  onClose: () => void;
}

const QUICK = [
  { label: "Sem rede", prompt: "A12 sem sinal de rede, qual setor verificar?" },
  { label: "Não carrega", prompt: "A12 não carrega bateria, VBUS sem tensão" },
  { label: "Não liga", prompt: "A12 não liga, sem resposta ao botão power" },
  { label: "Sem áudio", prompt: "A12 sem áudio no alto-falante e fone" },
  { label: "Sem câmera", prompt: "A12 câmera não abre, erro de hardware" },
  { label: "Tela preta", prompt: "A12 tela preta mas funciona normalmente" },
];

const CATEGORY_COLORS: Record<string, string> = {
  PMIC: "#a855f7",
  RF: "#3b82f6",
  AUDIO: "#22c55e",
  CHARGER: "#ef4444",
  CPU: "#eab308",
  USB: "#06b6d4",
  CAMERA: "#f97316",
  DEFAULT: "#64748b",
};

export default function DiagnosticAI({ deviceName, fileName, onHighlightComponent, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: `Sistema ativo para **${deviceName}**.\n\nDescreva o defeito ou selecione um problema comum abaixo. Vou guiar o diagnóstico e destacar os componentes relevantes no esquema.`,
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/schematics/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          deviceName,
          fileContext: `Arquivo atual: ${fileName}. Responda com lista de componentes no formato [COMPONENTE] quando relevante.`,
        }),
      });
      const data = await res.json();
      const content = data.response || "";

      // Extrai componentes mencionados
      const compRegex = /\b([UCRLQD]\d{2,6}|U\d+|C\d+|R\d+|L\d+|TP\d+|VBUS|VBAT|VCC|GND)\b/g;
      const highlights = [...new Set(content.match(compRegex) || [])];

      setMessages([...newMessages, { role: "assistant", content, highlights }]);

      // Auto-highlight primeiro componente
      if (highlights.length > 0) {
        onHighlightComponent(highlights[0]);
      }
    } catch {
      setMessages([...newMessages, {
        role: "assistant",
        content: "Erro ao conectar com IA. Verifique GROQ_API_KEY.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-80 flex flex-col border-l border-gray-800 bg-gray-950/98"
      style={{ backdropFilter: "blur(20px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)", boxShadow: "0 0 12px rgba(255,215,0,0.4)" }}
          >
            <Bot size={14} className="text-black" />
          </motion.div>
          <div>
            <h3 className="text-xs font-bold text-white">IA Diagnóstico</h3>
            <p className="text-xs text-gray-600">Groq · Llama 3.3 70B</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded hover:bg-gray-800 text-gray-500">
            <motion.div animate={{ rotate: expanded ? 0 : 180 }}>
              <ChevronDown size={14} />
            </motion.div>
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs ${
                    msg.role === "assistant" ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-700 text-gray-400"
                  }`}>
                    {msg.role === "assistant" ? "⚡" : "👤"}
                  </div>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-gray-800/80 text-gray-200 rounded-tl-none"
                      : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-100 rounded-tr-none"
                  }`}>
                    <div dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>")
                    }} />
                    {/* Componentes destacados */}
                    {msg.highlights && msg.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-700/50">
                        {msg.highlights.slice(0, 6).map((c) => (
                          <button
                            key={c}
                            onClick={() => onHighlightComponent(c)}
                            className="text-xs px-1.5 py-0.5 rounded font-mono font-bold transition-all hover:scale-105"
                            style={{
                              background: `${CATEGORY_COLORS.DEFAULT}22`,
                              color: CATEGORY_COLORS.DEFAULT,
                              border: `1px solid ${CATEGORY_COLORS.DEFAULT}44`,
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-xs">⚡</div>
                  <div className="bg-gray-800/80 rounded-xl rounded-tl-none px-3 py-2">
                    <Loader2 size={14} className="animate-spin text-gray-500" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            <div className="px-3 py-2 border-t border-gray-800/50 overflow-x-auto shrink-0">
              <div className="flex gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => send(q.prompt)}
                    disabled={loading}
                    className="shrink-0 text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors whitespace-nowrap disabled:opacity-40 border border-gray-700 hover:border-yellow-500/30"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-gray-800 shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Descreva o defeito..."
                  rows={2}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none transition-colors"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="p-2.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                  style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}
                >
                  <Send size={14} className="text-black" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
