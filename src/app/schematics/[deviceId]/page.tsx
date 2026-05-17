"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Bot, Cpu } from "lucide-react";
import dynamic from "next/dynamic";

import { usePDFEngine } from "@/hooks/usePDFEngine";
import { useOCREngine } from "@/hooks/useOCREngine";
import TechnicalToolbar from "@/components/pdf/TechnicalToolbar";
import PDFCanvas from "@/components/pdf/PDFCanvas.v2";
import SearchBar from "@/components/search/SearchBar";
import ComponentSidebar, { SchematicFile } from "@/components/ui/ComponentSidebar";

const MiniMap = dynamic(() => import("@/components/minimap/MiniMap"), { ssr: false });
const DiagnosticAI = dynamic(() => import("@/components/diagnostic/DiagnosticAI"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SchematicsProPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const [files, setFiles] = useState<SchematicFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<SchematicFile | null>(null);
  const [deviceName, setDeviceName] = useState("Samsung Galaxy A12");
  const [filesLoading, setFilesLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<any>(null);
  const [ocrReady, setOcrReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    canvasRef, totalPages, currentPage, setCurrentPage,
    scale, setScale, loading, error,
    zoomIn, zoomOut, zoomFit, zoomWidth, rotate, nextPage, prevPage,
  } = usePDFEngine(selectedFile?.url || null);

  const {
    processing: ocrProcessing,
    progress: ocrProgress,
    highlights,
    currentMatch,
    ocrResults,
    runOCR,
    searchOCR,
    goToMatch,
    clearHighlights,
  } = useOCREngine();

  useEffect(() => { fetchDeviceAndFiles(); }, [deviceId]);

  // Roda OCR automaticamente após página renderizar
  useEffect(() => {
    if (!canvasRef.current || loading || !selectedFile) return;
    const timer = setTimeout(async () => {
      await runOCR(canvasRef.current!, currentPage, selectedFile.url);
      setOcrReady(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [currentPage, loading, selectedFile]);

  async function fetchDeviceAndFiles() {
    setFilesLoading(true);
    const { data: device } = await supabase
      .from("devices").select("name, model").eq("id", deviceId).single();
    if (device) setDeviceName(`${device.name} ${device.model}`);

    const { data: storageFiles } = await supabase.storage
      .from("schematics").list(`${deviceId}/`, { limit: 100 });

    if (storageFiles && storageFiles.length > 0) {
      const mapped = storageFiles
        .filter(f => f.name.endsWith(".pdf"))
        .map(f => {
          const { data } = supabase.storage.from("schematics").getPublicUrl(`${deviceId}/${f.name}`);
          const type = f.name.toLowerCase().includes("troubleshoot") ? "troubleshooting"
            : f.name.toLowerCase().includes("electrical") || f.name.toLowerCase().includes("part")
            ? "electrical_list" : "schematic";
          return { id: f.id || f.name, name: f.name.replace(".pdf", "").replace(/_/g, " "), type: type as "electrical_list" | "troubleshooting" | "schematic", url: data.publicUrl, device_id: deviceId };
        });
      setFiles(mapped);
      if (mapped.length > 0) setSelectedFile(mapped[0]);
    }
    setFilesLoading(false);
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { clearHighlights(); return; }
    if (!canvasRef.current) return;

    // Se OCR não rodou ainda nessa página, roda agora
    if (!ocrReady && selectedFile) {
      await runOCR(canvasRef.current, currentPage, selectedFile.url);
    }

    const canvas = canvasRef.current;
    searchOCR(query, ocrResults, currentPage, canvas.width, canvas.height, scale);
  }, [ocrResults, currentPage, scale, ocrReady, selectedFile, runOCR, searchOCR, clearHighlights, canvasRef]);

  const handleHighlightComponent = useCallback(async (name: string) => {
    if (canvasRef.current && selectedFile) {
      if (!ocrReady) await runOCR(canvasRef.current, currentPage, selectedFile.url);
      searchOCR(name, ocrResults, currentPage, canvasRef.current.width, canvasRef.current.height, scale);
    }
  }, [ocrResults, currentPage, scale, ocrReady, selectedFile, runOCR, searchOCR, canvasRef]);

  const handleFullscreen = () => {
    if (!isFullscreen) { containerRef.current?.requestFullscreen?.(); setIsFullscreen(true); }
    else { document.exitFullscreen?.(); setIsFullscreen(false); }
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const a = document.createElement("a");
    a.href = selectedFile.url; a.download = `${selectedFile.name}.pdf`; a.target = "_blank"; a.click();
  };

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>

      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-30"
        style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.012) 2px, rgba(0,255,100,0.012) 4px)" }} />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 z-40 shrink-0 bg-gray-900/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-800">
            <ArrowLeft size={16} className="text-gray-400" />
          </motion.button>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ boxShadow: ["0 0 8px rgba(255,215,0,0.3)", "0 0 20px rgba(255,215,0,0.7)", "0 0 8px rgba(255,215,0,0.3)"] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #FFD700, #FF6B00)" }}>
              <Zap size={14} className="text-black" />
            </motion.div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">Esquemas Elétricos</h1>
              <p className="text-xs text-gray-500 mt-0.5">{deviceName}</p>
            </div>
          </div>
        </div>

        {/* Search centralizada */}
        <div className="flex-1 max-w-md mx-6">
          <SearchBar
            onSearch={handleSearch}
            onNextMatch={() => goToMatch(currentMatch + 1, highlights.length)}
            onPrevMatch={() => goToMatch(currentMatch - 1, highlights.length)}
            totalMatches={highlights.length}
            currentMatch={currentMatch}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Badge OCR */}
          <AnimatePresence>
            {ocrReady && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
                <Cpu size={12} className="text-green-400" />
                <span className="text-xs text-green-400 font-mono">OCR ativo</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* IA button */}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setAiOpen(!aiOpen)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              aiOpen ? "bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/30"
                : "bg-gray-800 text-gray-300 border-gray-700 hover:border-yellow-500/50"}`}>
            <Bot size={14} />
            <span className="hidden sm:inline">IA Diagnóstico</span>
          </motion.button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ComponentSidebar
          files={files} selectedFile={selectedFile} onSelect={(f) => { setSelectedFile(f); setOcrReady(false); }}
          loading={filesLoading} deviceId={deviceId} onFilesUpdated={fetchDeviceAndFiles}
          selectedComponent={selectedComponent} onClearComponent={() => setSelectedComponent(null)}
        />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {selectedFile ? (
            <>
              <TechnicalToolbar
                currentPage={currentPage} totalPages={totalPages} scale={scale}
                onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomFit={zoomFit} onZoomWidth={zoomWidth}
                onRotate={rotate} onPrevPage={prevPage} onNextPage={nextPage}
                onPageChange={setCurrentPage} onFullscreen={handleFullscreen} onDownload={handleDownload}
                onMinimapToggle={() => setMinimapOpen(!minimapOpen)} onOverlayToggle={() => {}}
                minimapOpen={minimapOpen} overlayOpen={false} isFullscreen={isFullscreen}
                fileName={selectedFile.name}
              />

              <PDFCanvas
                canvasRef={canvasRef} highlights={highlights} currentMatch={currentMatch}
                scale={scale} currentPage={currentPage} loading={loading}
                ocrProcessing={ocrProcessing} ocrProgress={ocrProgress}
                onCanvasClick={(x, y) => console.log("Click:", x, y)}
              />

              {/* MiniMap */}
              <AnimatePresence>
                {minimapOpen && (
                  <MiniMap canvasRef={canvasRef} currentPage={currentPage} totalPages={totalPages}
                    scale={scale} onClose={() => setMinimapOpen(false)}
                    onNavigate={(rx, ry) => console.log("Nav:", rx, ry)} />
                )}
              </AnimatePresence>

              {/* Status bar */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/80 border-t border-gray-800/50 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 font-mono">{deviceName}</span>
                  {highlights.length > 0 && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-xs text-yellow-400 font-mono">
                      ⚡ {highlights.length} ocorrências
                    </motion.span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 font-mono">PDF.js + OCR</span>
                  <span className="text-xs text-gray-700 font-mono">{Math.round(scale * 100)}%</span>
                  <span className="text-xs text-gray-700 font-mono">Pág {currentPage}/{totalPages}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }} className="text-6xl mb-4">📐</motion.div>
                <p className="text-gray-600 font-mono text-sm">Selecione um esquema na barra lateral</p>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {aiOpen && (
            <DiagnosticAI deviceName={deviceName} fileName={selectedFile?.name || ""}
              onHighlightComponent={handleHighlightComponent} onClose={() => setAiOpen(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}