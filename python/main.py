#!/usr/bin/env python3
"""
Tech Board Pro — PCB OCR Worker
Recebe JSON via stdin, processa PDF/imagem, retorna JSON via stdout
"""
import sys
import json
import traceback
from extractors.pdf_extractor import PDFExtractor
from geometry.board_analyzer import BoardAnalyzer
from cache.cache_manager import CacheManager

def process(payload: dict) -> dict:
    action = payload.get('action')
    
    if action == 'extract_pdf':
        pdf_path = payload['pdf_path']
        device_id = payload.get('device_id', '')
        page_index = payload.get('page_index', 0)
        
        extractor = PDFExtractor()
        analyzer = BoardAnalyzer()
        cache = CacheManager()
        
        # Check cache
        cached = cache.get(device_id, pdf_path, page_index)
        if cached:
            return {'status': 'ok', 'source': 'cache', 'data': cached}
        
        # Extract
        image = extractor.pdf_to_image(pdf_path, page_index)
        components = analyzer.analyze(image)
        
        result = {
            'device_id': device_id,
            'page_index': page_index,
            'components': components,
            'image_size': {'width': image.shape[1], 'height': image.shape[0]},
        }
        
        cache.save(device_id, pdf_path, page_index, result)
        return {'status': 'ok', 'source': 'processed', 'data': result}
    
    elif action == 'ping':
        return {'status': 'ok', 'message': 'Python worker ready'}
    
    else:
        return {'status': 'error', 'message': f'Unknown action: {action}'}

if __name__ == '__main__':
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
        result = process(payload)
        print(json.dumps(result))
        sys.stdout.flush()
    except Exception as e:
        error = {
            'status': 'error',
            'message': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error))
        sys.stdout.flush()
