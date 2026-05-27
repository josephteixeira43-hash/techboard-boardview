'use client';

/**
 * OCRPanel.tsx
 * Painel de OCR com preview antes/depois e controles — TechBoard Pro
 *
 * Uso:
 *   <OCRPanel pdfPage={page} onResult={(text) => console.log(text)} />
 *   <OCRPanel canvas={myCanvas} onResult={(text) => console.log(text)} />
 */

import React, { useState, useEffect, useRef } from 'react';
import { useOCR } from '@/hooks/useOCR';
import { PreprocessOptions } from '@/lib/ocrPreprocessor';

interface OCRPanelProps {
  /** Página PDF.js (PDFPageProxy) */
  pdfPage?: any;
  /** Canvas HTML alternativo */
  canvas?: HTMLCanvasElement;
  /** Callback com o texto extraído */
  onResult?: (text: string, confidence: number) => void;
  /** Exibe painel de configurações avançadas */
  showSettings?: boolean;
}

export default function OCRPanel({
  pdfPage,
  canvas,
  onResult,
  showSettings = true,
}: OCRPanelProps) {
  const [preprocessOptions, setPreprocessOptions] = useState<PreprocessOptions>({
    removeHighlights: true,
    binarize: true,
    binarizeThreshold: 128,
    enhanceContrast: true,
    contrastFactor: 1.8,
    upscale: 2,
    denoise: false,
  });

  const [originalURL, setOriginalURL] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const prevGenRef = useRef(false);

  const {
    runOCR,
    generatePreview,
    isProcessing,
    progress,
    progressLabel,
    result,
    previewURL,
    error,
    reset,
  } = useOCR({ preprocessOptions });

  // Captura imagem original para comparação
  useEffect(() => {
    const capture = async () => {
      if (pdfPage) {
        const viewport = pdfPage.getViewport({ scale: 1.0 });
        const c = document.createElement('canvas');
        c.width = viewport.width;
        c.height = viewport.height;
        await pdfPage.render({ canvasContext: c.getContext('2d')!, viewport }).promise;
        setOriginalURL(c.toDataURL('image/png'));
      } else if (canvas) {
        setOriginalURL(canvas.toDataURL('image/png'));
      }
    };
    capture();
  }, [pdfPage, canvas]);

  // Gera preview quando opções mudam
  useEffect(() => {
    if (!pdfPage && !canvas) return;
    if (prevGenRef.current) return;
    const timer = setTimeout(() => {
      generatePreview(pdfPage ?? canvas!, !!pdfPage);
    }, 300);
    return () => clearTimeout(timer);
  }, [preprocessOptions, pdfPage, canvas, generatePreview]);

  const handleRun = async () => {
    prevGenRef.current = true;
    const src = pdfPage ?? canvas;
    if (!src) return;
    await runOCR(src, !!pdfPage);
    if (result) onResult?.(result.text, result.confidence);
  };

  useEffect(() => {
    if (result) onResult?.(result.text, result.confidence);
  }, [result, onResult]);

  const updateOpt = <K extends keyof PreprocessOptions>(key: K, value: PreprocessOptions[K]) => {
    prevGenRef.current = false;
    setPreprocessOptions((prev) => ({ ...prev, [key]: value }));
    reset();
  };

  return (
    <div className="ocr-panel">
      <style>{`
        .ocr-panel {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          background: #0a0a0f;
          border: 1px solid #1e2030;
          border-radius: 12px;
          overflow: hidden;
          color: #c8d3f5;
          width: 100%;
        }
        .ocr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: #0d1117;
          border-bottom: 1px solid #1e2030;
        }
        .ocr-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #82aaff;
          text-transform: uppercase;
        }
        .ocr-badge {
          font-size: 10px;
          background: #1a1f35;
          border: 1px solid #2d3561;
          color: #7aa2f7;
          padding: 2px 8px;
          border-radius: 20px;
        }
        .ocr-body { padding: 16px 18px; }

        /* Preview comparativo */
        .preview-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .preview-box {
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #1e2030;
        }
        .preview-label {
          font-size: 10px;
          color: #565f89;
          padding: 6px 10px;
          background: #0d1117;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .preview-box img {
          width: 100%;
          display: block;
          max-height: 180px;
          object-fit: contain;
          background: #fff;
        }
        .preview-empty {
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2d3561;
          font-size: 12px;
          background: #0d1117;
        }

        /* Controles */
        .controls-section { margin-bottom: 16px; }
        .control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #12141f;
        }
        .control-label {
          font-size: 12px;
          color: #a9b1d6;
        }
        .control-desc {
          font-size: 10px;
          color: #565f89;
          margin-top: 2px;
        }
        .toggle {
          position: relative;
          width: 36px;
          height: 20px;
          cursor: pointer;
        }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .toggle-slider {
          position: absolute;
          inset: 0;
          background: #1a1f35;
          border-radius: 20px;
          border: 1px solid #2d3561;
          transition: 0.2s;
        }
        .toggle-slider::before {
          content: '';
          position: absolute;
          width: 14px; height: 14px;
          left: 2px; top: 2px;
          background: #565f89;
          border-radius: 50%;
          transition: 0.2s;
        }
        .toggle input:checked + .toggle-slider { background: #1e3a5f; border-color: #82aaff; }
        .toggle input:checked + .toggle-slider::before {
          background: #82aaff;
          transform: translateX(16px);
        }
        .slider-input { width: 100%; margin-top: 4px; accent-color: #82aaff; }
        .slider-val {
          font-size: 11px;
          color: #82aaff;
          min-width: 32px;
          text-align: right;
        }
        .advanced-toggle {
          font-size: 11px;
          color: #565f89;
          cursor: pointer;
          padding: 6px 0;
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          width: 100%;
          text-align: left;
        }
        .advanced-toggle:hover { color: #82aaff; }

        /* Progress */
        .progress-bar-wrap {
          background: #0d1117;
          border-radius: 6px;
          height: 6px;
          margin: 12px 0 6px;
          overflow: hidden;
          border: 1px solid #1e2030;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #82aaff, #7dcfff);
          border-radius: 6px;
          transition: width 0.3s ease;
          box-shadow: 0 0 8px rgba(130,170,255,0.4);
        }
        .progress-label {
          font-size: 11px;
          color: #565f89;
          margin-bottom: 10px;
        }

        /* Resultado */
        .result-box {
          margin-top: 14px;
          background: #0d1117;
          border: 1px solid #1e2030;
          border-radius: 8px;
          overflow: hidden;
        }
        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #1e2030;
        }
        .result-title { font-size: 11px; color: #565f89; text-transform: uppercase; letter-spacing: 0.06em; }
        .confidence-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 20px;
        }
        .confidence-high { background: #1a2f1a; color: #9ece6a; border: 1px solid #2d4a1a; }
        .confidence-mid  { background: #2f2a1a; color: #e0af68; border: 1px solid #4a3a1a; }
        .confidence-low  { background: #2f1a1a; color: #f7768e; border: 1px solid #4a1a1a; }
        .result-text {
          padding: 12px;
          font-size: 12px;
          line-height: 1.7;
          color: #c8d3f5;
          white-space: pre-wrap;
          max-height: 220px;
          overflow-y: auto;
        }
        .result-text::-webkit-scrollbar { width: 4px; }
        .result-text::-webkit-scrollbar-track { background: #0d1117; }
        .result-text::-webkit-scrollbar-thumb { background: #2d3561; border-radius: 4px; }

        /* Botões */
        .btn-row { display: flex; gap: 8px; margin-top: 14px; }
        .btn {
          flex: 1;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: 0.05em;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }
        .btn-primary {
          background: linear-gradient(135deg, #1e3a5f, #2d5a8f);
          color: #82aaff;
          border: 1px solid #3d6a9f;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #2d5a8f, #3d7abf);
          box-shadow: 0 0 16px rgba(130,170,255,0.2);
        }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-secondary {
          background: #12141f;
          color: #565f89;
          border: 1px solid #1e2030;
        }
        .btn-secondary:hover { color: #a9b1d6; border-color: #2d3561; }

        .error-box {
          margin-top: 10px;
          padding: 10px 12px;
          background: #1f0d0d;
          border: 1px solid #4a1a1a;
          border-radius: 8px;
          font-size: 12px;
          color: #f7768e;
        }
      `}</style>

      <div className="ocr-header">
        <span className="ocr-title">⬡ OCR Engine</span>
        <span className="ocr-badge">TechBoard Pro</span>
      </div>

      <div className="ocr-body">

        {/* Preview comparativo */}
        <div className="preview-grid">
          <div className="preview-box">
            <div className="preview-label">Original</div>
            {originalURL
              ? <img src={originalURL} alt="Original" />
              : <div className="preview-empty">sem imagem</div>
            }
          </div>
          <div className="preview-box">
            <div className="preview-label">Pré-processado</div>
            {previewURL
              ? <img src={previewURL} alt="Processado" />
              : <div className="preview-empty">aguardando...</div>
            }
          </div>
        </div>

        {/* Controles básicos */}
        <div className="controls-section">
          <div className="control-row">
            <div>
              <div className="control-label">Remover highlights coloridos</div>
              <div className="control-desc">Apaga marcações amarelas, vermelhas, verdes, azuis</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={preprocessOptions.removeHighlights}
                onChange={(e) => updateOpt('removeHighlights', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Binarização (P&B)</div>
              <div className="control-desc">Converte para preto e branco puro</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={preprocessOptions.binarize}
                onChange={(e) => updateOpt('binarize', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Avançado */}
          {showSettings && (
            <>
              <button
                className="advanced-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <span>{showAdvanced ? '▾' : '▸'}</span>
                Configurações avançadas
              </button>

              {showAdvanced && (
                <>
                  <div className="control-row">
                    <div>
                      <div className="control-label">Threshold de binarização</div>
                      <div className="control-desc">Pixels abaixo = preto, acima = branco</div>
                    </div>
                    <span className="slider-val">{preprocessOptions.binarizeThreshold}</span>
                  </div>
                  <input
                    type="range" min={60} max={200} step={1}
                    value={preprocessOptions.binarizeThreshold}
                    onChange={(e) => updateOpt('binarizeThreshold', Number(e.target.value))}
                    className="slider-input"
                  />

                  <div className="control-row" style={{ marginTop: 8 }}>
                    <div>
                      <div className="control-label">Fator de contraste</div>
                      <div className="control-desc">1.0 = neutro · 2.5 = máximo</div>
                    </div>
                    <span className="slider-val">{preprocessOptions.contrastFactor?.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min={1.0} max={3.0} step={0.1}
                    value={preprocessOptions.contrastFactor}
                    onChange={(e) => updateOpt('contrastFactor', Number(e.target.value))}
                    className="slider-input"
                  />

                  <div className="control-row" style={{ marginTop: 8 }}>
                    <div>
                      <div className="control-label">Upscale</div>
                      <div className="control-desc">Aumenta resolução para OCR (1–4x)</div>
                    </div>
                    <span className="slider-val">{preprocessOptions.upscale}x</span>
                  </div>
                  <input
                    type="range" min={1} max={4} step={1}
                    value={preprocessOptions.upscale}
                    onChange={(e) => updateOpt('upscale', Number(e.target.value))}
                    className="slider-input"
                  />

                  <div className="control-row" style={{ marginTop: 8 }}>
                    <div>
                      <div className="control-label">Denoise (blur leve)</div>
                      <div className="control-desc">Reduz ruído em imagens granuladas</div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={preprocessOptions.denoise}
                        onChange={(e) => updateOpt('denoise', e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Progresso */}
        {isProcessing && (
          <>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-label">{progressLabel} {progress}%</div>
          </>
        )}

        {/* Erro */}
        {error && <div className="error-box">⚠ {error}</div>}

        {/* Resultado */}
        {result && (
          <div className="result-box">
            <div className="result-header">
              <span className="result-title">Texto extraído</span>
              <span className={`confidence-badge ${
                result.confidence > 80 ? 'confidence-high'
                : result.confidence > 55 ? 'confidence-mid'
                : 'confidence-low'
              }`}>
                {result.confidence.toFixed(0)}% confiança
              </span>
            </div>
            <div className="result-text">{result.text || '(nenhum texto detectado)'}</div>
          </div>
        )}

        {/* Botões */}
        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={isProcessing || (!pdfPage && !canvas)}
          >
            {isProcessing ? `Processando... ${progress}%` : '▶ Executar OCR'}
          </button>
          <button className="btn btn-secondary" onClick={reset}>
            ↺ Limpar
          </button>
        </div>

      </div>
    </div>
  );
}
