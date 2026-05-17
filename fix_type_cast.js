const fs = require('fs');
const file = 'src/app/schematics/[deviceId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Corrige o type com cast
content = content.replace(
  'type, url: data.publicUrl, device_id: deviceId',
  'type: type as "electrical_list" | "troubleshooting" | "schematic", url: data.publicUrl, device_id: deviceId'
);

// Remove o comentário // rebuild se existir
content = content.replace('\n// rebuild', '');

fs.writeFileSync(file, content, 'utf8');

if (content.includes('type as "electrical_list"')) {
  console.log('✅ Corrigido!');
} else {
  const idx = content.indexOf('type,');
  console.log('❌ Não encontrou. Contexto:', JSON.stringify(content.slice(idx - 10, idx + 80)));
}
