const fs = require('fs');
const file = 'src/app/schematics/[deviceId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: muda interface para aceitar null
content = content.replace(
  'export interface SchematicFile {\n  id: string;',
  'export interface SchematicFile {\n  id: string | null;'
);

// Fix 2: também tenta com espaços diferentes
content = content.replace(
  'id: string;\n  name: string;\n  type:',
  'id: string | null;\n  name: string;\n  type:'
);

fs.writeFileSync(file, content, 'utf8');

// Verifica
const result = fs.readFileSync(file, 'utf8');
const idx = result.indexOf('id: string');
console.log('Resultado:', JSON.stringify(result.slice(idx, idx + 30)));
console.log(result.includes('id: string | null') ? '✅ Corrigido!' : '❌ Não encontrou a interface');
