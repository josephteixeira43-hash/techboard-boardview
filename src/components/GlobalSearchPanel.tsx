"use client";
// components/search/GlobalSearchPanel.tsx
// Painel de busca global IA — estilo ZXW/Borneo

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Cpu, Zap, AlertTriangle, FileText, Activity, ChevronRight, Loader2 } from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { SearchResult } from "@/app/api/search/route";

interface GlobalSearchPanelProps {
  deviceId?: string;
  onComponentSelect?: (name: string, pageIndex?: number) => void;
  onClose?: () => void;
  initialQuery?: string;
}

const TYPE_CONFIG = {
  component:        { icon: Cpu,          label: "Componente",      color: "#00d4ff", bg: "rgba(0,212,255,0.08)" },
  electrical_part:  { icon: Zap,          label: "Part Elétrica",   color: "#ffaa00", bg: "rgba(255,170,0,0.08)" },
  troubleshooting:  { icon: AlertTriangle, label: "Troubleshooting", color: "#ff6b6b", bg: "rgba(255,107,107,0.08)" },
  schematic:        { icon: FileText,      label: "Schematic/PDF",   color: "#82aaff", bg: "rgba(130,170,255,0.08)" },
  voltage:          { icon: Activity,      label: "Tensão",          color: "#9ece6a", bg: "rgba(158,206,106,0.08)" },
};

function ResultCard({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: (r: SearchResult) => void;
}) {
  const cfg = TYPE_CONFIG[result.type];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(result)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 14px",
        background: cfg.bg,
        border: `1px solid ${cfg.color}22`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "'JetBrains Mono', monospace",
      }}
      whileHover={{
        background: `${cfg.bg.replace("0.08", "0.15")}`,
        borderColor: `${cfg.color}55`,
        x: 2,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${cfg.color}15`,
        border: `1px solid ${cfg.color}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={14} color={cfg.color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>
            {result.title}
          </span>
          <span style={{
            fontSize: 9, color: "#565f89",
            background: "#12141f", border: "1px solid #1e2030",
            padding: "1px 6px", borderRadius: 4, letterSpacing: "0.06em",
          }}>
            {cfg.label}
          </span>
          {result.pageIndex !== undefined && (
            <span style={{ fontSize: 9, color: "#565f89", marginLeft: "auto" }}>
              pág {result.pageIndex + 1}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11, color: "#a9b1d6", lineHeight: 1.5,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          margin: 0,
        }}>
          {result.description}
        </p>

        {/* Metadata chips */}
        {result.type === "component" && result.metadata.electricalLine !== "UNKNOWN" && (
          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Chip label={result.metadata.electricalLine} color="#82aaff" />
            {result.metadata.voltage && <Chip label={result.metadata.voltage} color="#9ece6a" />}
            {result.coordinates && (
              <Chip label={`x:${Math.round(result.coordinates.x)} y:${Math.round(result.coordinates.y)}`} color="#565f89" />
            )}
          </div>
        )}
        {result.type === "troubleshooting" && result.metadata.severity && (
          <div style={{ marginTop: 6 }}>
            <Chip
              label={result.metadata.severity}
              color={result.metadata.severity === "critical" ? "#f7768e" : "#ffaa00"}
            />
          </div>
        )}
      </div>

      <ChevronRight size={14} color="#565f89" style={{ flexShrink: 0, marginTop: 4 }} />
    </motion.div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, color, background: `${color}15`,
      border: `1px solid ${color}33`, padding: "1px 6px",
      borderRadius: 4, letterSpacing: "0.04em", fontFamily: "monospace",
    }}>
      {label}
    </span>
  );
}

function AISummaryCard({ summary, actions, symptoms, components }: {
  summary: string;
  actions: string[];
  symptoms: string[];
  components: string[];
}) {
  if (!summary) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "rgba(0,212,255,0.04)",
        border: "1px solid rgba(0,212,255,0.15)",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#00d4ff", boxShadow: "0 0 8px #00d4ff",
        }} />
        <span style={{ fontSize: 10, color: "#00d4ff", letterSpacing: "0.1em", fontWeight: 700 }}>
          IA ANÁLISE
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#c8d3f5", lineHeight: 1.6, margin: "0 0 10px" }}>
        {summary}
      </p>

      {actions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 9, color: "#565f89", letterSpacing: "0.08em", marginBottom: 4 }}>
            AÇÕES SUGERIDAS
          </p>
          {actions.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, color: "#9ece6a", marginBottom: 2 }}>
              <span>→</span><span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {components.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {components.map(c => <Chip key={c} label={c} color="#00d4ff" />)}
        </div>
      )}
    </motion.div>
  );
}

export default function GlobalSearchPanel({
  deviceId,
  onComponentSelect,
  onClose,
  initialQuery = "",
}: GlobalSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeType, setActiveType] = useState<SearchResult["type"] | "all">("all");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const gs = useGlobalSearch();

  // Foca no input ao abrir
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    if (initialQuery) gs.search(initialQuery, deviceId);
  }, []);

  const handleInput = useCallback((val: string) => {
    setInputValue(val);
    gs.fetchSuggestions(val, deviceId);
    setShowSuggestions(true);
  }, [deviceId, gs]);

  const handleSearch = useCallback((q: string) => {
    setInputValue(q);
    setShowSuggestions(false);
    gs.search(q, deviceId);
  }, [deviceId, gs]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(inputValue);
    if (e.key === "Escape") onClose?.();
  };

  const handleResultSelect = (result: SearchResult) => {
    onComponentSelect?.(result.title, result.pageIndex);
  };

  const filteredResults = activeType === "all"
    ? gs.results
    : gs.getByType(activeType);

  const typeCounts = {
    all: gs.results.length,
    component: gs.getByType("component").length,
    electrical_part: gs.getByType("electrical_part").length,
    troubleshooting: gs.getByType("troubleshooting").length,
    schematic: gs.getByType("schematic").length,
    voltage: gs.getByType("voltage").length,
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0a0a0f",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 12px",
        borderBottom: "1px solid #1e2030",
        background: "#0d1117",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #00d4ff22, #00d4ff11)",
            border: "1px solid #00d4ff33",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Search size={13} color="#00d4ff" />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#00d4ff", letterSpacing: "0.1em" }}>
            GLOBAL SEARCH IA
          </span>
          {onClose && (
            <button onClick={onClose} style={{
              marginLeft: "auto", background: "none", border: "none",
              cursor: "pointer", color: "#565f89", padding: 4,
            }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Input */}
        <div style={{ position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#12141f", border: "1px solid #1e2030",
            borderRadius: 10, padding: "10px 14px",
            transition: "border-color 0.15s",
          }}>
            {gs.loading
              ? <Loader2 size={15} color="#00d4ff" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              : <Search size={15} color="#565f89" style={{ flexShrink: 0 }} />
            }
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar componente, sintoma, tensão, CI..."
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#c8d3f5", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            {inputValue && (
              <button onClick={() => { setInputValue(""); gs.clear(); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#565f89", padding: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Autocomplete */}
          <AnimatePresence>
            {showSuggestions && gs.suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                  background: "#0d1117", border: "1px solid #1e2030",
                  borderRadius: 8, marginTop: 4, overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
                }}
              >
                {gs.suggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => handleSearch(s)}
                    style={{
                      padding: "8px 14px", cursor: "pointer",
                      fontSize: 12, color: "#a9b1d6",
                      borderBottom: i < gs.suggestions.length - 1 ? "1px solid #12141f" : "none",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#12141f")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <Search size={11} color="#565f89" />
                    {s}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Quick tags */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["U5003", "VBAT", "sem carga", "PMIC", "RF", "USB"].map(tag => (
            <button
              key={tag}
              onClick={() => handleSearch(tag)}
              style={{
                fontSize: 10, color: "#565f89", background: "#12141f",
                border: "1px solid #1e2030", padding: "3px 8px",
                borderRadius: 6, cursor: "pointer", fontFamily: "monospace",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#00d4ff"; e.currentTarget.style.borderColor = "#00d4ff33"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#565f89"; e.currentTarget.style.borderColor = "#1e2030"; }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      {gs.results.length > 0 && (
        <div style={{
          display: "flex", gap: 4, padding: "10px 20px",
          borderBottom: "1px solid #1e2030", flexShrink: 0,
          overflowX: "auto",
        }}>
          {(["all", "component", "troubleshooting", "electrical_part", "schematic", "voltage"] as const).map(type => {
            const count = typeCounts[type];
            if (type !== "all" && count === 0) return null;
            const cfg = type === "all" ? null : TYPE_CONFIG[type];
            const isActive = activeType === type;
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  fontSize: 10, fontFamily: "monospace", letterSpacing: "0.06em",
                  whiteSpace: "nowrap", transition: "all 0.15s",
                  background: isActive ? (cfg ? `${cfg.color}18` : "rgba(0,212,255,0.12)") : "transparent",
                  border: `1px solid ${isActive ? (cfg?.color ?? "#00d4ff") + "44" : "#1e2030"}`,
                  color: isActive ? (cfg?.color ?? "#00d4ff") : "#565f89",
                }}
              >
                {type === "all" ? "TODOS" : TYPE_CONFIG[type].label.toUpperCase()}
                <span style={{
                  background: isActive ? (cfg?.color ?? "#00d4ff") + "22" : "#1e2030",
                  padding: "0 5px", borderRadius: 4, fontSize: 9,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        {/* AI Summary */}
        {gs.aiSummary && (
          <AISummaryCard
            summary={gs.aiSummary}
            actions={gs.suggestedActions}
            symptoms={gs.relatedSymptoms}
            components={gs.relatedComponents}
          />
        )}

        {/* Result cards */}
        {filteredResults.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredResults.map((r, i) => (
              <ResultCard key={i} result={r} onSelect={handleResultSelect} />
            ))}
          </div>
        ) : gs.query && !gs.loading ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "48px 0", gap: 12,
          }}>
            <Search size={32} color="#1e2030" />
            <p style={{ color: "#565f89", fontSize: 12, fontFamily: "monospace" }}>
              Nenhum resultado para "{gs.query}"
            </p>
            <p style={{ color: "#2d3561", fontSize: 11 }}>
              Tente indexar os PDFs primeiro
            </p>
          </div>
        ) : !gs.query ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "48px 0", gap: 12,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Search size={24} color="#00d4ff" style={{ opacity: 0.4 }} />
            </div>
            <p style={{ color: "#565f89", fontSize: 12, fontFamily: "monospace", textAlign: "center" }}>
              Digite para buscar em todos os documentos
            </p>
            <p style={{ color: "#2d3561", fontSize: 11, textAlign: "center" }}>
              Componentes · Troubleshooting · Schematics · Part List
            </p>
          </div>
        ) : null}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
