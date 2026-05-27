import fitz  # pymupdf
import numpy as np
from PIL import Image

class PDFExtractor:
    def __init__(self, dpi: int = 200):
        self.dpi = dpi
    
    def pdf_to_image(self, pdf_path: str, page_index: int = 0) -> np.ndarray:
        """Converte página do PDF para imagem numpy."""
        doc = fitz.open(pdf_path)
        page = doc[page_index]
        mat = fitz.Matrix(self.dpi / 72, self.dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        doc.close()
        return np.array(img)
    
    def pdf_page_count(self, pdf_path: str) -> int:
        doc = fitz.open(pdf_path)
        count = len(doc)
        doc.close()
        return count
