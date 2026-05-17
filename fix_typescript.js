const fs = require('fs');
const file = 'src/app/schematics/[deviceId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'return { id: f.id,',
  'return { id: f.id ?? f.name,'
);

if (content.includes('f.id ?? f.name')) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Corrigido!');
} else {
  console.log('❌ Não encontrou. Procurando...');
  const idx = content.indexOf('f.id');
  console.log(JSON.stringify(content.slice(idx - 10, idx + 60)));
}
