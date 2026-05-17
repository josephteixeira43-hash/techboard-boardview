"use client";
import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  currentPage: number;
  totalPages: number;
  scale: number;
  onClose: () => void;
  onNavigate: (x: number, y: number) => void;
}

export default function MiniMap({ canvasRef, currentPage, totalPages, scale, onClose, onNavigate }: Props) {
  const miniRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!canvasRef.current || !miniRef.current) return;
    const src = canvasRef.current;
    const mini = miniRef.current;
    const ctx = mini.getContext("2d");
    if (!ctx) return;

    const W = 220;
    const H = Math.round((src.height / src.width) * W) || 140;
    mini.width = W;
    mini.height = H;

    // Renderiza miniatura do canvas
    ctx.drawImage(src, 0, 0, W, H);

    // Overlay escuro
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);

    // Viewport indicator
    const vx = viewport.x * (W / src.width);
    const vy = viewport.y * (H / src.height);
    const vw = viewport.w * (W / src.width);
    const vh = viewport.h * (H / src.height);

    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 6;
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.fillStyle = "rgba(255,215,0,0.08)";
    ctx.fillRect(vx, vy, vw, vh);
  }, [canvasRef, viewport, currentPage, scale]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!miniRef.current || !canvasRef.current) return;
    const rect = miniRef.current.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    onNavigate(rx, ry);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: 20 }}
      className="absolute bottom-6 right-6 z-40 rounded-xl overflow-hidden border border-gray-700 shadow-2xl"
      style={{ background: "rgba(10,15,25,0.95)", backdropFilter: "blur(12px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span className="text-xs text-gray-400 font-mono">MINI MAP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">Pág. {currentPage}/{totalPages}</span>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Canvas miniatura */}
      <div className="p-2">
        <canvas
          ref={miniRef}
          onClick={handleClick}
          className="rounded cursor-crosshair block"
          style={{ width: 220 }}
        />
      </div>

      {/* Info */}
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-xs text-gray-600 font-mono">Zoom: {Math.round(scale * 100)}%</span>
        <span className="text-xs text-yellow-500/60 font-mono">Clique para navegar</span>
      </div>
    </motion.div>
  );
}
