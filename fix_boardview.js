const fs = require('fs');
const file = 'src/app/boardview/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const botao = `<a href={\`/schematics/\${deviceId}\`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all"><span className="text-yellow-300 text-xs font-medium">Esquemas Eletricos</span></a>`;

const antes = '← Voltar\r\n        </a>';
const depois = '← Voltar\r\n        </a>\r\n        ' + botao;

if (content.includes(antes)) {
  content = content.replace(antes, depois);
  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Botão adicionado com sucesso!');
} else {
  console.log('❌ Texto não encontrado. Conteúdo ao redor do Voltar:');
  const i = content.indexOf('Voltar');
  console.log(JSON.stringify(content.slice(i - 80, i + 120)));
}
