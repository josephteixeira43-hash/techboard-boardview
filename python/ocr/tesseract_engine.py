import pytesseract
import numpy as np
import cv2
from typing import List, Dict

class TesseractEngine:
    def __init__(self):
        # Config para PCB labels — caracteres alfanuméricos
        self.config = '--psm 11 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.'
    
    def extract_with_boxes(self, image: np.ndarray) -> List[Dict]:
        """Extrai texto com bounding boxes."""
        # Pré-processa para melhorar OCR
        processed = self._preprocess(image)
        
        data = pytesseract.image_to_data(
            processed,
            config=self.config,
            output_type=pytesseract.Output.DICT
        )
        
        results = []
        n = len(data['text'])
        for i in range(n):
            text = data['text'][i].strip()
            conf = int(data['conf'][i])
            
            if text and conf > 40 and len(text) >= 2:
                results.append({
                    'text': text,
                    'x': data['left'][i],
                    'y': data['top'][i],
                    'width': data['width'][i],
                    'height': data['height'][i],
                    'confidence': conf / 100.0,
                })
        
        return results
    
    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        """Pré-processa imagem para melhor OCR em PCBs."""
        # Inverte se fundo preto
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if len(image.shape) == 3 else image
        mean = np.mean(gray)
        if mean < 128:
            gray = cv2.bitwise_not(gray)
        
        # Upscale
        h, w = gray.shape
        gray = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        
        # Threshold
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
