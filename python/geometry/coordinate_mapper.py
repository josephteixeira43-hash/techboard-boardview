"""Normaliza coordenadas para espaço board (0..10000)."""
from typing import Dict, List

SCALE = 10000


class CoordinateMapper:
    @staticmethod
    def normalize_x(x: float, img_w: float) -> float:
        if img_w <= 0:
            return 0.0
        return round((x / img_w) * SCALE, 2)

    @staticmethod
    def normalize_y(y: float, img_h: float) -> float:
        if img_h <= 0:
            return 0.0
        return round((y / img_h) * SCALE, 2)

    @staticmethod
    def normalize_component(comp: dict, img_w: float, img_h: float) -> Dict:
        return {
            'name': comp['text'],
            'category': comp.get('category', 'OTHER'),
            'x': CoordinateMapper.normalize_x(comp['shape_x'], img_w),
            'y': CoordinateMapper.normalize_y(comp['shape_y'], img_h),
            'width': CoordinateMapper.normalize_x(comp['shape_width'], img_w),
            'height': CoordinateMapper.normalize_y(comp['shape_height'], img_h),
            'confidence': comp.get('confidence', 0.5),
            'layer': comp.get('layer', 'top'),
            'bbox': {
                'x': comp['shape_x'],
                'y': comp['shape_y'],
                'w': comp['shape_width'],
                'h': comp['shape_height'],
            },
        }

    @staticmethod
    def normalize_all(components: List[dict], img_w: float, img_h: float) -> List[Dict]:
        return [CoordinateMapper.normalize_component(c, img_w, img_h) for c in components]
