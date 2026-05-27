import json
import os
import hashlib
from typing import Optional

CACHE_DIR = os.path.expanduser('~/.techboard/cache/boards')

class CacheManager:
    def __init__(self):
        os.makedirs(CACHE_DIR, exist_ok=True)
    
    def _key(self, device_id: str, file_url: str, page_index: int) -> str:
        raw = f'{device_id}_{file_url}_{page_index}'
        return hashlib.md5(raw.encode()).hexdigest()
    
    def _path(self, key: str) -> str:
        return os.path.join(CACHE_DIR, f'{key}.json')
    
    def get(self, device_id: str, file_url: str, page_index: int) -> Optional[dict]:
        path = self._path(self._key(device_id, file_url, page_index))
        if os.path.exists(path):
            with open(path, 'r') as f:
                return json.load(f)
        return None
    
    def save(self, device_id: str, file_url: str, page_index: int, data: dict):
        path = self._path(self._key(device_id, file_url, page_index))
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
    
    def invalidate(self, device_id: str, file_url: str, page_index: int):
        path = self._path(self._key(device_id, file_url, page_index))
        if os.path.exists(path):
            os.remove(path)
    
    def list_cached(self) -> list:
        files = os.listdir(CACHE_DIR)
        return [f.replace('.json', '') for f in files if f.endswith('.json')]
