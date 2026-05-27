"use client";
// components/search/CommandPalette.tsx
// Command Palette estilo VSCode com Global Search IA integrado

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Cpu, Zap, AlertTriangle, FileText,
  Activity, ChevronRight, Loader2, Command, ArrowUp, ArrowDown, CornerDownLeft
} from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { SearchResult } from "@/app/api/search/route";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string;
  onSelect?: (name: string, pageIndex?: number) => void;
}

const TYPE_CONFIG = {
  component:       { icon: Cpu,           label: "Componente",    color: "#00d4ff" },
  electrical_part: { icon: Zap,           label: "Part List",     color: "#ffaa00" },
  troubleshooting: { icon: AlertTriangle, label: "Troubleshoot",  color: "#ff6b6b" },
  schematic:       { icon: FileText,      label: "PDF",           color: "#82aaff" },
  voltage:         { icon: Activity,      label: "Tensão",        color: "#9ece6a" },
};

const QUICK_TAGS = ["U5003", "VBAT", "sem carga", "PMIC", "RF", "USB", "charging", "PAM1000"];

export default function CommandPalette({
  isOpen,
  onClose,
  deviceId,
  onSelect,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const gs = useGlobalSearch();

  // Foca input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setInputValue("");
      gs.clear();
    }
  }, [isOpen]);

  // Busca com debounce
  useEffect(() => {
    if (!inputValue.trim()) { gs.clear(); return; }
    const t = setTimeout(() => gs.search(inputValue, deviceId), 300);
    return () => clearTimeout(t);
  }, [inputValue, deviceId]);

  // Reset seleção ao mudar resultados
  useEffect(() => { setSelectedIndex(0); }, [gs.results]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelect?.(result.title, result.pageIndex);
    onClose();
  }, [onSelect, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, gs.results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (gs.results[selectedIndex]) handleSelect(gs.results[selectedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [gs.results, selectedIndex, handleSelect, onClose]);

  // Scroll para item selecionado
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 9998,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: "12vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(640px, calc(100vw - 32px))",
              maxHeight: "70vh",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              background: "rgba(10, 10, 18, 0.98)",
              border: "1px solid rgba(0,212,255,0.2)",
              borderRadius: 14,
              boxShadow: `
                0 0 0 1px rgba(0,212,255,0.05),
                0 8px 64px rgba(0,0,0,0.9),
                0 0 80px rgba(0,212,255,0.06)
              `,
              overflow: "hidden",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {/* ── Input ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 18px",
              borderBottom: "1px solid rgba(0,212,255,0.08)",
              background: "rgba(0,212,255,0.02)",
            }}>
              {gs.loading
                ? <Loader2 size={18} color="#00d4ff" style={{ animation: "cp-spin 0.7s linear infinite", flexShrink: 0 }} />
                : <Search size={18} color="#00d4ff" style={{ flexShrink: 0, opacity: 0.8 }} />
              }
              <input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar componente, sintoma, CI, tensão..."
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "#e4e8ff", fontSize: 15, fontFamily: "inherit",
                  caretColor: "#00d4ff",
                }}
                autoComplete="off"
                spellCheck={false}
              />
              {inputValue && (
                <button
                  onClick={() => { setInputValue(""); gs.clear(); inputRef.current?.focus(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#565f89", padding: 4 }}
                >
                  <X size={15} />
                </button>
              )}
              <kbd style={{
                fontSize: 10, color: "#565f89",
                background: "#12141f", border: "1px solid #1e2030",
                padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em",
              }}>
                ESC
              </kbd>
            </div>

            {/* ── Quick tags ── */}
            {!inputValue && (
              <div style={{
                display: "flex", gap: 6, padding: "10px 18px",
                borderBottom: "1px solid #0d0f18",
                flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 10, color: "#565f89", alignSelf: "center", letterSpacing: "0.08em" }}>
                  SUGESTÕES:
                </span>
                {QUICK_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setInputValue(tag)}
                    style={{
                      fontSize: 10, color: "#82aaff",
                      background: "rgba(130,170,255,0.06)",
                      border: "1px solid rgba(130,170,255,0.15)",
                      padding: "3px 10px", borderRadius: 6,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(130,170,255,0.14)";
                      e.currentTarget.style.borderColor = "rgba(130,170,255,0.35)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(130,170,255,0.06)";
                      e.currentTarget.style.borderColor = "rgba(130,170,255,0.15)";
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* ── AI Summary ── */}
            {gs.aiSummary && inputValue && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{
                  padding: "10px 18px",
                  borderBottom: "1px solid rgba(0,212,255,0.06)",
                  background: "rgba(0,212,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 1,
                  }}>
                    <span style={{ fontSize: 10 }}>⬡</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "#a9b1d6", lineHeight: 1.6, margin: 0 }}>
                      {gs.aiSummary}
                    </p>
                    {gs.suggestedActions.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {gs.suggestedActions.slice(0, 3).map((a, i) => (
                          <span key={i} style={{
                            fontSize: 9, color: "#9ece6a",
                            background: "rgba(158,206,106,0.08)",
                            border: "1px solid rgba(158,206,106,0.2)",
                            padding: "2px 8px", borderRadius: 4,
                          }}>
                            → {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Results list ── */}
            <div
              ref={listRef}
              style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}
            >
              {gs.results.length > 0 ? (
                gs.results.map((result, i) => {
                  const cfg = TYPE_CONFIG[result.type];
                  const Icon = cfg.icon;
                  const isSelected = i === selectedIndex;

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                        background: isSelected ? `${cfg.color}12` : "transparent",
                        border: `1px solid ${isSelected ? cfg.color + "33" : "transparent"}`,
                        transition: "all 0.08s",
                        marginBottom: 2,
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                        background: `${cfg.color}12`,
                        border: `1px solid ${cfg.color}25`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={13} color={cfg.color} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: isSelected ? cfg.color : "#c8d3f5",
                          }}>
                            {result.title}
                          </span>
                          <span style={{
                            fontSize: 9, color: "#565f89",
                            background: "#12141f", border: "1px solid #1e2030",
                            padding: "1px 5px", borderRadius: 3,
                            letterSpacing: "0.06em",
                          }}>
                            {cfg.label}
                          </span>
                          {result.pageIndex !== undefined && (
                            <span style={{ fontSize: 9, color: "#565f89", marginLeft: "auto" }}>
                              pág {result.pageIndex + 1}
                            </span>
                          )}
                        </div>
                        {result.description && (
                          <p style={{
                            fontSize: 11, color: "#565f89", margin: "2px 0 0",
                            overflow: "hidden", whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}>
                            {result.description}
                          </p>
                        )}
                      </div>

                      {/* Enter hint */}
                      {isSelected && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          color: "#565f89", fontSize: 10, flexShrink: 0,
                        }}>
                          <CornerDownLeft size={11} />
                        </div>
                      )}
                    </motion.div>
                  );
                })
              ) : inputValue && !gs.loading ? (
                <div style={{
                  padding: "32px 0", textAlign: "center",
                  color: "#565f89", fontSize: 12,
                }}>
                  <Search size={28} color="#1e2030" style={{ margin: "0 auto 12px", display: "block" }} />
                  Nenhum resultado para "{inputValue}"
                </div>
              ) : !inputValue ? (
                <div style={{ padding: "24px 12px" }}>
                  <p style={{ fontSize: 10, color: "#565f89", letterSpacing: "0.1em", marginBottom: 12 }}>
                    AÇÕES RÁPIDAS
                  </p>
                  {[
                    { label: "Buscar componente", hint: "Ex: U5003, PAM1000" },
                    { label: "Buscar sintoma", hint: "Ex: sem carga, bootloop" },
                    { label: "Buscar tensão", hint: "Ex: VBAT, 3.8V" },
                  ].map((item, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 6,
                      color: "#a9b1d6", fontSize: 12,
                    }}>
                      <ChevronRight size={12} color="#565f89" />
                      <span>{item.label}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#565f89" }}>
                        {item.hint}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ── Footer ── */}
            {gs.results.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 16px",
                borderTop: "1px solid #0d0f18",
                background: "rgba(0,0,0,0.3)",
                fontSize: 10, color: "#565f89",
              }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Kbd>↑↓</Kbd><span>navegar</span>
                  <Kbd>↵</Kbd><span>selecionar</span>
                  <Kbd>ESC</Kbd><span>fechar</span>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  {gs.totalFound} resultado{gs.totalFound !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </motion.div>
        </>
      )}

      <style>{`
        @keyframes cp-spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2030; border-radius: 4px; }
      `}</style>
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      background: "#12141f", border: "1px solid #1e2030",
      padding: "1px 5px", borderRadius: 4,
      fontSize: 10, color: "#82aaff",
      fontFamily: "monospace",
    }}>
      {children}
    </kbd>
  );
}
