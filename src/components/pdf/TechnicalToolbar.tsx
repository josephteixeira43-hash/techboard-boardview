"use client";
import { motion } from "framer-motion";
import {
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, Download, Map, Layers,
  AlignCenter, AlignJustify, RefreshCw
} from "lucide-react";

interface Props {
  currentPage: number;
  totalPages: number;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomWidth: () => void;
  onRotate: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageChange: (p: number) => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onMinimapToggle: () => void;
  onOverlayToggle: () => void;
  minimapOpen: boolean;
  overlayOpen: boolean;
  isFullscreen: boolean;
  fileName: string;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300];

export default function TechnicalToolbar({
  currentPage, totalPages, scale,
  onZoomIn, onZoomOut, onZoomFit, onZoomWidth, onRotate,
  onPrevPage, onNextPage, onPageChange,
  onFullscreen, onDownload, onMinimapToggle, onOverlayToggle,
  minimapOpen, overlayOpen, isFullscreen, fileName,
}: Props) {
  const zoomPct = Math.round(scale * 100);

  return (
    <div className="shrink-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-30">
      {/* Linha principal */}
      <div className="flex items-center gap-2 px-4 py-2">
        {/* Nome do arquivo */}
        <div className="flex items-center gap-2 mr-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
          <span className="text-xs text-gray-300 font-mono truncate max-w-48">{fileName}</span>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Navegação de página */}
        <div className="flex items-center gap-1">
          <ToolBtn onClick={onPrevPage} disabled={currentPage === 1} title="Página anterior">
            <ChevronLeft size={15} />
          </ToolBtn>
          <div className="flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => onPageChange(Number(e.target.value))}
              className="w-8 bg-transparent text-xs text-white text-center outline-none font-mono"
            />
            <span className="text-gray-500 text-xs">/ {totalPages}</span>
          </div>
          <ToolBtn onClick={onNextPage} disabled={currentPage === totalPages} title="Próxima página">
            <ChevronRight size={15} />
          </ToolBtn>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <ToolBtn onClick={onZoomOut} title="Zoom -">
            <ZoomOut size={15} />
          </ToolBtn>
          <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1 min-w-[60px] justify-center">
            <span className="text-xs text-yellow-400 font-mono font-bold">{zoomPct}%</span>
          </div>
          <ToolBtn onClick={onZoomIn} title="Zoom +">
            <ZoomIn size={15} />
          </ToolBtn>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Fit buttons */}
        <ToolBtn onClick={onZoomFit} title="Ajustar página">
          <AlignCenter size={15} />
        </ToolBtn>
        <ToolBtn onClick={onZoomWidth} title="Ajustar largura">
          <AlignJustify size={15} />
        </ToolBtn>
        <ToolBtn onClick={onRotate} title="Rotacionar">
          <RefreshCw size={15} />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Toggles */}
        <ToolBtn
          onClick={onMinimapToggle}
          title="Mini mapa"
          active={minimapOpen}
        >
          <Map size={15} />
        </ToolBtn>
        <ToolBtn
          onClick={onOverlayToggle}
          title="Overlays"
          active={overlayOpen}
        >
          <Layers size={15} />
        </ToolBtn>

        <div className="flex-1" />

        {/* Ações direita */}
        <ToolBtn onClick={onDownload} title="Baixar PDF">
          <Download size={15} />
        </ToolBtn>
        <ToolBtn onClick={onFullscreen} title="Tela cheia">
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </ToolBtn>
      </div>

      {/* Zoom presets */}
      <div className="flex items-center gap-1 px-4 py-1 border-t border-gray-800/50 overflow-x-auto">
        <span className="text-xs text-gray-600 shrink-0 mr-1">Zoom rápido:</span>
        {ZOOM_PRESETS.map((z) => (
          <motion.button
            key={z}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {/* handled by parent */}}
            className={`text-xs px-2 py-0.5 rounded whitespace-nowrap transition-colors shrink-0 ${
              zoomPct === z
                ? "bg-yellow-500 text-black font-bold"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {z}%
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function ToolBtn({
  children, onClick, disabled, title, active
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${
        active
          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
          : "text-gray-400 hover:text-white hover:bg-gray-800"
      }`}
    >
      {children}
    </motion.button>
  );
}
