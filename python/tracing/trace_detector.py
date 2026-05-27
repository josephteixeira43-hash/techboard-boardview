"""Detecta trilhas no PCB via OpenCV."""
import cv2
import numpy as np
from typing import List, Dict


class TraceDetector:
    def detect(self, image: np.ndarray) -> List[Dict]:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if len(image.shape) == 3 else image
        if np.mean(gray) < 128:
            gray = cv2.bitwise_not(gray)

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 30, 100)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=1)

        lines = cv2.HoughLinesP(
            dilated, 1, np.pi / 180, threshold=50, minLineLength=30, maxLineGap=10
        )

        traces = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                traces.append({
                    'from': {'x': int(x1), 'y': int(y1)},
                    'to': {'x': int(x2), 'y': int(y2)},
                    'confidence': 0.6,
                })
        return traces
