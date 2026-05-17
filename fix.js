const fs = require('fs');
const file = 'src/app/boardview/page.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'href="/" className="text-white/40 hover:text-white text-sm">',
  'href="/" className="text-white/40 hover:text-white text-sm">'
);
const botao = '<a href={/schematics/} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all"><span className="text-yellow-300 text-xs font-medium">Esquemas Eletricos</span></a>';
content = content.replace('← Voltar</a>', '← Voltar</a>\n          ' + botao);
fs.writeFileSync(file, content, 'utf8');
console.log('Feito! Linhas com schematics:');
console.log(content.split('\n').filter(l => l.includes('schematics')));
