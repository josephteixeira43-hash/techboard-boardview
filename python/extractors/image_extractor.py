"""Imagem → componentes OCR via BoardAnalyzer."""
import numpy as np
from PIL import Image
from typing import List, Dict

from geometry.board_analyzer import BoardAnalyzer


class ImageExtractor:
    def __init__(self):
        self.analyzer = BoardAnalyzer()

    def image_path_to_array(self, image_path: str) -> np.ndarray:
        img = Image.open(image_path).convert('RGB')
        return np.array(img)

    def extract(self, image_path: str) -> List[Dict]:
        image = self.image_path_to_array(image_path)
        return self.analyzer.analyze(image)
