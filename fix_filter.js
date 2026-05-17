const fs = require('fs');
const file = 'src/components/pdf/PDFCanvas.v2.tsx';
let content = fs.readFileSync(file, 'utf8');

// Adiciona filtro de inversão no canvas
content = content.replace(
  'style={{ maxWidth: "none" }}',
  'style={{ maxWidth: "none", filter: "invert(1) hue-rotate(180deg)" }}'
);

// Verifica se foi aplicado
if (content.includes('invert')) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Filtro aplicado com sucesso!');
} else {
  // Tenta encontrar o trecho exato
  const idx = content.indexOf('maxWidth');
  console.log('❌ Não encontrou. Trecho ao redor:', JSON.stringify(content.slice(idx - 20, idx + 60)));
}
