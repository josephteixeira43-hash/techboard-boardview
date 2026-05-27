import cv2
import numpy as np
from typing import List, Dict
from ocr.tesseract_engine import TesseractEngine
from ocr.label_parser import LabelParser

class BoardAnalyzer:
    def __init__(self):
        self.ocr = TesseractEngine()
        self.parser = LabelParser()
    
    def analyze(self, image: np.ndarray) -> List[Dict]:
        """Pipeline completo: imagem → lista de componentes com coordenadas."""
        h, w = image.shape[:2]
        
        # 1. OCR — extrai labels com posição
        raw_results = self.ocr.extract_with_boxes(image)
        
        # 2. Filtra labels PCB
        components = self.parser.filter_components(raw_results)
        
        # 3. Detecta shapes OpenCV
        shapes = self._detect_shapes(image)
        
        # 4. Associa label ao shape mais próximo
        enriched = self._associate_labels_to_shapes(components, shapes, w, h)
        
        # 5. Normaliza coordenadas (0..1)
        normalized = self._normalize_coordinates(enriched, w, h)
        
        return normalized
    
    def _detect_shapes(self, image: np.ndarray) -> List[Dict]:
        """Detecta shapes retangulares (ICs) e circulares (vias) no PCB."""
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if len(image.shape) == 3 else image
        
        # Inverte se fundo preto
        if np.mean(gray) < 128:
            gray = cv2.bitwise_not(gray)
        
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        edges = cv2.Canny(blurred, 50, 150)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        shapes = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 200:  # ignora shapes muito pequenos
                continue
            
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = w / h if h > 0 else 1
            
            # Classifica tipo
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            
            if len(approx) == 4:
                shape_type = 'ic' if aspect > 0.5 else 'connector'
            elif len(approx) > 8:
                shape_type = 'via'
            else:
                shape_type = 'unknown'
            
            shapes.append({
                'x': x, 'y': y,
                'width': w, 'height': h,
                'area': area,
                'type': shape_type,
            })
        
        return shapes
    
    def _associate_labels_to_shapes(self, labels, shapes, img_w, img_h):
        """Associa cada label OCR ao shape mais próximo."""
        enriched = []
        for label in labels:
            lx = label['x'] + label['width'] / 2
            ly = label['y'] + label['height'] / 2
            
            best_shape = None
            best_dist = float('inf')
            
            for shape in shapes:
                sx = shape['x'] + shape['width'] / 2
                sy = shape['y'] + shape['height'] / 2
                dist = ((lx - sx) ** 2 + (ly - sy) ** 2) ** 0.5
                
                if dist < best_dist and dist < 80:  # max 80px de distância
                    best_dist = dist
                    best_shape = shape
            
            if best_shape:
                enriched.append({
                    **label,
                    'shape_x': best_shape['x'],
                    'shape_y': best_shape['y'],
                    'shape_width': best_shape['width'],
                    'shape_height': best_shape['height'],
                    'shape_type': best_shape['type'],
                })
            else:
                # Usa posição do label como coordenada
                enriched.append({
                    **label,
                    'shape_x': label['x'],
                    'shape_y': label['y'],
                    'shape_width': label['width'],
                    'shape_height': label['height'],
                    'shape_type': 'label_only',
                })
        
        return enriched
    
    def _normalize_coordinates(self, components, img_w, img_h):
        """Normaliza coordenadas para espaço 0..10000 (compatível com Supabase)."""
        SCALE = 10000
        normalized = []
        for comp in components:
            normalized.append({
                'name': comp['text'],
                'category': comp.get('category', 'OTHER'),
                'x': round((comp['shape_x'] / img_w) * SCALE, 2),
                'y': round((comp['shape_y'] / img_h) * SCALE, 2),
                'width': round((comp['shape_width'] / img_w) * SCALE, 2),
                'height': round((comp['shape_height'] / img_h) * SCALE, 2),
                'confidence': comp.get('confidence', 0.5),
                'layer': 'top',
                'bbox': {
                    'x': comp['shape_x'], 'y': comp['shape_y'],
                    'w': comp['shape_width'], 'h': comp['shape_height'],
                },
            })
        return normalized
