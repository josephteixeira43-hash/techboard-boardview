"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { SchematicFile } from "@/app/schematics/[deviceId]/page";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Minus,
  Plus,
} from "lucide-react";

interface Props {
  file: SchematicFile;
  searchTerm: string;
  onSearchChange: (v: string) => void;
}

// Labels de tipo
const TYPE_LABELS: Record<SchematicFile["type"], string> = {
  electrical_list: "⚡ Lista Elétrica",
  troubleshooting: "🔧 Troubleshooting",
  schematic: "📐 Esquema",
};

const TYPE_COLORS: Record<SchematicFile["type"], string> = {
  electrical_list: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  troubleshooting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  schematic: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function SchematicViewer({ file, searchTerm, onSearchChange }: Props) {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reseta ao trocar de arquivo
  useEffect(() => {
    setLoading(true);
    setZoom(100);
    setPage(1);
  }, [file.url]);

  // URL do PDF com parâmetros de controle
  const buildPdfUrl = useCallback(() => {
    const params = new URLSearchParams({
      toolbar: "1",
      navpanes: "0",
      scrollbar: "1",
      view: "FitH",
      page: String(page),
      zoom: String(zoom),
    });
    return `${file.url}#${params.toString()}`;
  }, [file.url, page, zoom]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 300));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const handleZoomReset = () => setZoom(100);

  const handleFullscreen = () => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setFullscreen(!fullscreen);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = `${file.name}.pdf`;
    a.target = "_blank";
    a.click();
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-gray-950"
    >
      {/* Toolbar do viewer */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        {/* Info do arquivo */}
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{file.name}</h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[file.type]}`}
            >
              {TYPE_LABELS[file.type]}
            </span>
          </div>
        </div>

        {/* Controles centrais */}
        <div className="flex items-center gap-1">
          {/* Navegação de página */}
          <div className="flex items-center gap-1 mr-3">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} className="text-gray-400" />
            </button>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              Pág. {page}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded hover:bg-gray-800 transition-colors"
            >
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:text-white text-gray-400 transition-colors"
            >
              <Minus size={14} />
            </button>
            <span className="text-xs text-gray-300 w-12 text-center font-mono">
              {zoom}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:text-white text-gray-400 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={handleZoomReset}
            title="Reset zoom"
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors ml-1"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Ações direita */}
        <div className="flex items-center gap-1">
          {/* Busca mobile */}
          <div className="flex md:hidden items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            <Search size={13} className="text-gray-500" />
            <input
              type="text"
              placeholder="Componente..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-gray-500 outline-none w-28"
            />
          </div>

          <button
            onClick={handleDownload}
            title="Baixar PDF"
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleFullscreen}
            title="Tela cheia"
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Zoom presets rápidos */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-900/50 border-b border-gray-800/50 shrink-0 overflow-x-auto">
        {[50, 75, 100, 125, 150, 200].map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`text-xs px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
              zoom === z
                ? "bg-yellow-500 text-black font-semibold"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {z}%
          </button>
        ))}
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button
          onClick={() => setZoom(100)}
          className="text-xs px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Ajustar
        </button>
      </div>

      {/* Area do PDF */}
      <div className="flex-1 overflow-auto bg-gray-950 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Carregando esquema...</p>
            </div>
          </div>
        )}

        <div
          className="min-h-full flex items-start justify-center p-6"
          style={{ minWidth: "fit-content" }}
        >
          <div
            className="relative shadow-2xl rounded-lg overflow-hidden"
            style={{
              width: `${zoom}%`,
              maxWidth: zoom > 100 ? "none" : "100%",
              transition: "width 0.2s ease",
            }}
          >
            <iframe
              ref={iframeRef}
              key={`${file.url}-${page}`}
              src={buildPdfUrl()}
              className="w-full border-0"
              style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
              onLoad={() => setLoading(false)}
              title={file.name}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-t border-gray-800 shrink-0">
        <span className="text-xs text-gray-600">
          Samsung Galaxy A12 (SM-A125F)
        </span>
        <div className="flex items-center gap-3">
          {searchTerm && (
            <span className="text-xs text-yellow-400">
              🔍 Buscando: "{searchTerm}"
            </span>
          )}
          <span className="text-xs text-gray-600">Zoom: {zoom}%</span>
        </div>
      </div>
    </div>
  );
}
