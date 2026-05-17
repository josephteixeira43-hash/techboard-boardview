"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ChevronUp, ChevronDown, Clock, Zap } from "lucide-react";

interface Props {
  onSearch: (query: string) => Promise<any>;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  totalMatches: number;
  currentMatch: number;
  isSearching?: boolean;
}

const QUICK_SEARCHES = ["U5003", "C1001", "R2201", "L5000", "VBUS", "VBAT", "GND", "TP"];

export default function SearchBar({
  onSearch, onNextMatch, onPrevMatch,
  totalMatches, currentMatch, isSearching
}: Props) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("schematic-search-history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveHistory = (q: string) => {
    const newHistory = [q, ...history.filter(h => h !== q)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem("schematic-search-history", JSON.stringify(newHistory));
  };

  const handleSearch = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setShowHistory(false);
    await onSearch(searchQuery);
    saveHistory(searchQuery);
    setLoading(false);
  };

  const handleClear = () => {
    setQuery("");
    onSearch("");
  };

  return (
    <div className="relative">
      {/* Barra principal */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
        query
          ? "bg-gray-800 border-yellow-500/50 shadow-lg shadow-yellow-500/10"
          : "bg-gray-800/50 border-gray-700"
      }`}>
        <motion.div
          animate={{ rotate: loading ? 360 : 0 }}
          transition={{ duration: 1, repeat: loading ? Infinity : 0, ease: "linear" }}
        >
          <Search size={15} className={query ? "text-yellow-400" : "text-gray-500"} />
        </motion.div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
            if (e.key === "Escape") handleClear();
          }}
          placeholder="Buscar componente... (U5003, VBUS)"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none font-mono"
        />

        {/* Contador de resultados */}
        <AnimatePresence>
          {totalMatches > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1"
            >
              <span className="text-xs text-yellow-400 font-mono font-bold">
                {currentMatch + 1}/{totalMatches}
              </span>
              <button onClick={onPrevMatch} className="p-0.5 hover:text-white text-gray-500">
                <ChevronUp size={13} />
              </button>
              <button onClick={onNextMatch} className="p-0.5 hover:text-white text-gray-500">
                <ChevronDown size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {query && (
          <button onClick={handleClear} className="text-gray-500 hover:text-white">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Quick searches */}
      <div className="flex gap-1 mt-2 flex-wrap">
        {QUICK_SEARCHES.map((q) => (
          <motion.button
            key={q}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setQuery(q); handleSearch(q); }}
            className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500 hover:border-yellow-500/50 hover:text-yellow-400 transition-colors font-mono"
          >
            {q}
          </motion.button>
        ))}
      </div>

      {/* Dropdown histórico */}
      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl z-50"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
              <Clock size={12} className="text-gray-600" />
              <span className="text-xs text-gray-600">Histórico de busca</span>
            </div>
            {history.map((h, i) => (
              <motion.button
                key={i}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                onClick={() => { setQuery(h); handleSearch(h); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left"
              >
                <Zap size={12} className="text-yellow-500/50 shrink-0" />
                <span className="text-sm text-gray-400 font-mono">{h}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resultado vazio */}
      <AnimatePresence>
        {query && totalMatches === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <p className="text-xs text-red-400">Nenhum resultado para "{query}"</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
