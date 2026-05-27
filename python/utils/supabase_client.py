"""Salva resultados no Supabase via REST API."""
import os
from typing import List, Dict, Optional

import requests


class SupabaseClient:
    def __init__(self):
        self.url = os.environ.get('SUPABASE_URL') or os.environ.get(
            'NEXT_PUBLIC_SUPABASE_URL', ''
        )
        self.key = os.environ.get('SUPABASE_KEY') or os.environ.get(
            'NEXT_PUBLIC_SUPABASE_ANON_KEY', ''
        )

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _headers(self) -> dict:
        return {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
        }

    def upsert_components(self, components: List[Dict], device_id: str) -> Optional[dict]:
        if not self.configured:
            return None

        updates = []
        for comp in components:
            layer = comp.get('layer', 'top')
            updates.append({
                'device_id': device_id,
                'name': comp['name'],
                'category': comp.get('category', 'OTHER'),
                'x_top': comp['x'] if layer == 'top' else None,
                'y_top': comp['y'] if layer == 'top' else None,
                'x_bottom': comp['x'] if layer == 'bottom' else None,
                'y_bottom': comp['y'] if layer == 'bottom' else None,
            })

        endpoint = f'{self.url.rstrip("/")}/rest/v1/components'
        resp = requests.post(endpoint, json=updates, headers=self._headers())
        resp.raise_for_status()
        return resp.json() if resp.text else None

    def save_ocr_cache(
        self,
        device_id: str,
        page_index: int,
        components: list,
        file_url: str = '',
        raw_text: str = '',
        confidence: float = 0.0,
    ) -> Optional[dict]:
        if not self.configured:
            return None

        payload = {
            'device_id': device_id,
            'file_url': file_url,
            'page_index': page_index,
            'components': components,
            'raw_text': raw_text,
            'confidence': confidence,
        }
        endpoint = f'{self.url.rstrip("/")}/rest/v1/ocr_cache'
        resp = requests.post(endpoint, json=payload, headers=self._headers())
        resp.raise_for_status()
        return resp.json() if resp.text else None

    def save_board_geometry(
        self, device_id: str, components: List[Dict]
    ) -> Optional[dict]:
        if not self.configured:
            return None

        rows = []
        for comp in components:
            rows.append({
                'device_id': device_id,
                'component_name': comp['name'],
                'x': comp['x'],
                'y': comp['y'],
                'width': comp.get('width', 0),
                'height': comp.get('height', 0),
                'layer': comp.get('layer', 'top'),
                'confidence': comp.get('confidence', 0.5),
                'bbox': comp.get('bbox'),
                'source': 'ocr',
            })

        endpoint = f'{self.url.rstrip("/")}/rest/v1/board_geometry'
        resp = requests.post(endpoint, json=rows, headers=self._headers())
        resp.raise_for_status()
        return resp.json() if resp.text else None
