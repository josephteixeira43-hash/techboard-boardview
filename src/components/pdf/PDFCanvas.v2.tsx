"use client";
import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OCRHighlight } from "@/hooks/useOCREngine";

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  highlights: OCRHighlight[];
  currentMatch: number;
  scale: number;
  currentPage: number;
  loading: boolean;
  ocrProcessing?: boolean;
  ocrProgress?: number;
  onCanvasClick?: (x: number, y: number) => void;
}

export default function PDFCanvas({
  canvasRef,
  highlights,
  currentMatch,
  scale,
  currentPage,
  loading,
  ocrProcessing,
  ocrProgress,
  onCanvasClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const rippleId = useRef(0);

  // Centraliza no match atual
  useEffect(() => {
    const current = highlights.find(h => h.isCurrent);
    if (!current || !containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const cx = current.x + current.width / 2;
    const cy = current.y + current.height / 2;

    // Dispara ripple
    const id = ++rippleId.current;
    setRipples(prev => [...prev, { x: cx, y: cy, id }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 900);

    // Pan para centralizar
    setPan({
      x: container.clientWidth / 2 - cx,
      y: container.clientHeight / 2 - cy,
    });
  }, [currentMatch, highlights]);

  // Drag
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPan({
        x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsDragging(true);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative bg-gray-950"
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {/* Grid técnico de fundo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,150,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,150,0.15) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Loading PDF */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gray-950/95 z-20"
          >
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-2 border-yellow-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-yellow-400 animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-t-cyan-400 animate-spin"
                  style={{ animationDirection: "reverse", animationDuration: "0.7s" }} />
              </div>
              <p className="text-sm text-gray-400 font-mono">Renderizando esquema...</p>
              <p className="text-xs text-gray-600 mt-1">PDF.js Engine</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR Processing */}
      <AnimatePresence>
        {ocrProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-gray-900/95 border border-yellow-500/30 shadow-xl"
          >
            <div className="w-4 h-4 border-2 border-t-yellow-400 border-yellow-500/20 rounded-full animate-spin" />
            <div>
              <p className="text-xs text-yellow-400 font-mono font-bold">OCR em progresso...</p>
              <div className="w-32 bg-gray-800 rounded-full h-1 mt-1 overflow-hidden">
                <motion.div
                  className="h-full bg-yellow-400 rounded-full"
                  style={{ width: `${ocrProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 font-mono">{ocrProgress}%</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Área de pan */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (!canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          onCanvasClick?.(e.clientX - rect.left, e.clientY - rect.top);
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: isDragging ? "none" : "transform 0.15s ease",
            position: "relative",
            display: "inline-block",
          }}
        >
          {/* Canvas PDF */}
          <canvas
            ref={canvasRef}
            className="shadow-2xl shadow-black/80 block"
            style={{ maxWidth: "none", filter: "invert(1) hue-rotate(180deg)" }}
          />

          {/* Highlights OCR */}
          <AnimatePresence>
            {highlights.map((h, i) => (
              <motion.div
                key={`${i}-${h.text}-${h.x}-${h.y}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "absolute",
                  left: h.x,
                  top: h.y,
                  width: Math.max(h.width, 24),
                  height: Math.max(h.height, 16),
                  pointerEvents: "none",
                }}
              >
                {h.isCurrent ? (
                  <motion.div
                    className="w-full h-full rounded-sm"
                    style={{
                      background: "rgba(255, 220, 0, 0.40)",
                      border: "2px solid #FFD700",
                    }}
                    animate={{
                      boxShadow: [
                        "0 0 6px #FFD700, 0 0 12px rgba(255,215,0,0.5)",
                        "0 0 18px #FFD700, 0 0 36px rgba(255,215,0,0.8)",
                        "0 0 6px #FFD700, 0 0 12px rgba(255,215,0,0.5)",
                      ],
                    }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-sm"
                    style={{
                      background: "rgba(255, 200, 0, 0.18)",
                      border: "1px solid rgba(255,200,0,0.45)",
                    }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Ripple effects */}
          <AnimatePresence>
            {ripples.map(r => (
              <motion.div
                key={r.id}
                initial={{ width: 0, height: 0, opacity: 0.9 }}
                animate={{ width: 140, height: 140, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  left: r.x,
                  top: r.y,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: "2px solid #FFD700",
                  boxShadow: "0 0 20px #FFD700",
                  pointerEvents: "none",
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
