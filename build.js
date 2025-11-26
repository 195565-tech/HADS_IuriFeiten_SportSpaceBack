const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Instala o archiver se ainda não estiver instalado
if (!fs.existsSync(path.join(__dirname, 'node_modules', 'archiver'))) {
  console.log('Instalando dependências de build...');
  require('child_process').execSync('npm install archiver --save-dev', { stdio: 'inherit' });
}

const output = fs.createWriteStream(path.join(__dirname, 'lambda.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 }
});

output.on('close', () => {
  console.log(`✅ Arquivo lambda.zip criado (${archive.pointer()} bytes)`);
  console.log('📦 Arquivos incluídos:');
  console.log('   - index.js, app.js, package.json');
  console.log('   - routes/, middleware/, db/, utils/');
  console.log('   - node_modules/');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Adiciona os arquivos necessários
const filesToInclude = [
  'index.js',
  'app.js',
  'package.json',
  'package-lock.json',
  'knexfile.js'
];

const foldersToInclude = [
  'routes',
  'middleware',
  'db',
  'utils'  // ✅ CORRIGIDO: Pasta utils adicionada
];

// Adiciona arquivos individuais
filesToInclude.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    archive.file(path.join(__dirname, file), { name: file });
    console.log(`✓ Adicionado: ${file}`);
  } else {
    console.warn(`⚠ Arquivo não encontrado: ${file}`);
  }
});

// Adiciona pastas
foldersToInclude.forEach(folder => {
  if (fs.existsSync(path.join(__dirname, folder))) {
    archive.directory(path.join(__dirname, folder), folder);
    console.log(`✓ Adicionado: ${folder}/`);
  } else {
    console.warn(`⚠ Pasta não encontrada: ${folder}/`);
  }
});

// Adiciona node_modules (apenas produção)
if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
  archive.directory(path.join(__dirname, 'node_modules'), 'node_modules');
  console.log('✓ Adicionado: node_modules/');
} else {
  console.error('❌ Pasta node_modules não encontrada! Execute: npm install');
}

archive.finalize();
