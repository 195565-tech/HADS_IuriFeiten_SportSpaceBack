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
  'db'
];

// Adiciona arquivos individuais
filesToInclude.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    archive.file(path.join(__dirname, file), { name: file });
  }
});

// Adiciona pastas
foldersToInclude.forEach(folder => {
  if (fs.existsSync(path.join(__dirname, folder))) {
    archive.directory(path.join(__dirname, folder), folder);
  }
});

// Adiciona node_modules (apenas produção)
archive.directory(path.join(__dirname, 'node_modules'), 'node_modules');

archive.finalize();