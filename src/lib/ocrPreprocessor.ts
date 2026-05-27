/**
 * ocrPreprocessor.ts
 * Pré-processamento de imagem para OCR — TechBoard Pro
 *
 * Remove marcações coloridas (amarelo, vermelho, verde, azul, laranja, rosa)
 * e binariza a imagem para maximizar a precisão do Tesseract.js
 */

export interface PreprocessOptions {
  /** Remove highlights coloridos (padrão: true) */
  removeHighlights?: boolean;
  /** Binariza a imagem (preto/branco puro) para OCR (padrão: true) */
  binarize?: boolean;
  /** Threshold de binarização 0–255 (padrão: 128) */
  binarizeThreshold?: number;
  /** Aumenta contraste antes de binarizar (padrão: true) */
  enhanceContrast?: boolean;
  /** Fator de contraste 1.0 = neutro, 2.0 = forte (padrão: 1.8) */
  contrastFactor?: number;
  /** Escala de upscale para melhorar OCR em imagens pequenas (padrão: 2) */
  upscale?: number;
  /** Aplica blur leve para reduzir ruído antes da binarização (padrão: false) */
  denoise?: boolean;
}

const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  removeHighlights: true,
  binarize: true,
  binarizeThreshold: 128,
  enhanceContrast: true,
  contrastFactor: 1.8,
  upscale: 2,
  denoise: false,
};

/**
 * Detecta se um pixel é uma marcação colorida (highlight).
 * Retorna true se o pixel deve ser apagado (virar branco).
 */
function isHighlightPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = max / 255;

  // Precisa ser saturado (colorido) e não muito escuro (não é texto)
  if (saturation < 0.25 || brightness < 0.35) return false;

  // Amarelo / laranja
  if (r > 180 && g > 140 && b < 100) return true;

  // Vermelho / rosa
  if (r > 180 && g < 130 && b < 160 && r > g * 1.4) return true;

  // Verde / lima
  if (g > 160 && r < 160 && b < 130 && g > b * 1.4) return true;

  // Azul / ciano
  if (b > 160 && r < 130 && g < 180 && b > r * 1.4) return true;

  // Rosa / magenta
  if (r > 160 && b > 140 && g < 120) return true;

  // Laranja forte
  if (r > 200 && g > 100 && g < 170 && b < 80) return true;

  return false;
}

/**
 * Ajusta contraste de um canal único (0–255).
 */
function applyContrast(value: number, factor: number): number {
  const adjusted = factor * (value - 128) + 128;
  return Math.min(255, Math.max(0, Math.round(adjusted)));
}

/**
 * Pré-processa um canvas para OCR.
 * Retorna um novo canvas com a imagem tratada.
 */
export async function preprocessCanvasForOCR(
  sourceCanvas: HTMLCanvasElement,
  options: PreprocessOptions = {}
): Promise<HTMLCanvasElement> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const scale = opts.upscale;
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width * scale;
  outputCanvas.height = sourceCanvas.height * scale;

  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true })!;

  // Upscale com interpolação nítida para texto
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Remove marcações coloridas → branco
    if (opts.removeHighlights && isHighlightPixel(r, g, b)) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      continue;
    }

    // 2. Aumenta contraste
    if (opts.enhanceContrast) {
      r = applyContrast(r, opts.contrastFactor);
      g = applyContrast(g, opts.contrastFactor);
      b = applyContrast(b, opts.contrastFactor);
    }

    // 3. Converte para escala de cinza (luminância)
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // 4. Binarização (texto preto, fundo branco)
    if (opts.binarize) {
      const bin = gray < opts.binarizeThreshold ? 0 : 255;
      data[i] = bin;
      data[i + 1] = bin;
      data[i + 2] = bin;
    } else {
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Denoise leve com blur (opcional, ajuda em imagens ruidosas)
  if (opts.denoise) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = outputCanvas.width;
    tempCanvas.height = outputCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.filter = 'blur(0.5px)';
    tempCtx.drawImage(outputCanvas, 0, 0);
    return tempCanvas;
  }

  return outputCanvas;
}

/**
 * Converte uma página PDF.js (PDFPageProxy) em canvas pré-processado para OCR.
 *
 * @param pdfPage  — página retornada por pdf.getPage(n)
 * @param scale    — escala de renderização (padrão 2.0 = 144 dpi)
 * @param options  — opções de pré-processamento
 */
export async function preprocessPDFPageForOCR(
  pdfPage: any,
  scale = 2.0,
  options: PreprocessOptions = {}
): Promise<HTMLCanvasElement> {
  const viewport = pdfPage.getViewport({ scale });

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = viewport.width;
  renderCanvas.height = viewport.height;

  const ctx = renderCanvas.getContext('2d')!;

  await pdfPage.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return preprocessCanvasForOCR(renderCanvas, options);
}

/**
 * Retorna um dataURL da imagem pré-processada (útil para debug / preview).
 */
export async function getPreviewDataURL(
  sourceCanvas: HTMLCanvasElement,
  options: PreprocessOptions = {}
): Promise<string> {
  const processed = await preprocessCanvasForOCR(sourceCanvas, options);
  return processed.toDataURL('image/png');
}
