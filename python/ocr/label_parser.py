import re
from typing import List, Dict, Optional

# Padrões de labels PCB
COMPONENT_PATTERNS = [
    r'^U\d+',      # ICs: U5003, U400
    r'^C\d+',      # Capacitores: C2001
    r'^R\d+',      # Resistores: R2201
    r'^L\d+',      # Indutores: L3000
    r'^Q\d+',      # Transistores: Q1001
    r'^D\d+',      # Diodos: D2001
    r'^J\d+',      # Conectores: J100
    r'^CN\d+',     # Conectores: CN6000
    r'^PAM\d+',    # PAs RF: PAM1000
    r'^ANT\d+',    # Antenas: ANT6001
    r'^SOC\d+',    # SoCs: SOC7000
    r'^MIC\d+',    # Microfones: MIC6000
    r'^LED\d+',    # LEDs: LED5000
    r'^TP\d+',     # Test points: TP101
    r'^SW\d+',     # Switches: SW100
]

NET_PATTERNS = [
    r'VBAT', r'VCC', r'VDD', r'GND', r'VBUS',
    r'PP\d+V', r'VSYS', r'VPHY',
]

CATEGORY_MAP = {
    'U': 'IC',
    'C': 'CAPACITOR',
    'R': 'RESISTOR',
    'L': 'INDUCTOR',
    'Q': 'TRANSISTOR',
    'D': 'DIODE',
    'J': 'CONNECTOR',
    'CN': 'CONNECTOR',
    'PAM': 'RF',
    'ANT': 'RF',
    'SOC': 'CPU',
    'MIC': 'AUDIO',
    'LED': 'DISPLAY',
    'TP': 'TESTPOINT',
}

class LabelParser:
    def __init__(self):
        self.comp_regex = re.compile('|'.join(COMPONENT_PATTERNS), re.IGNORECASE)
        self.net_regex  = re.compile('|'.join(NET_PATTERNS), re.IGNORECASE)
    
    def is_component_label(self, text: str) -> bool:
        return bool(self.comp_regex.match(text.upper()))
    
    def is_net_label(self, text: str) -> bool:
        return bool(self.net_regex.search(text.upper()))
    
    def get_category(self, text: str) -> str:
        t = text.upper()
        for prefix, cat in CATEGORY_MAP.items():
            if t.startswith(prefix):
                return cat
        return 'OTHER'
    
    def filter_components(self, ocr_results: List[Dict]) -> List[Dict]:
        """Filtra apenas labels que parecem componentes PCB."""
        filtered = []
        for r in ocr_results:
            text = r['text'].upper().strip()
            if self.is_component_label(text):
                filtered.append({
                    **r,
                    'category': self.get_category(text),
                    'type': 'component',
                })
            elif self.is_net_label(text):
                filtered.append({
                    **r,
                    'category': 'NET',
                    'type': 'net',
                })
        return filtered
