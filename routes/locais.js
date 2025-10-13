const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// Linha Removida que estava causando erro: const { v4: uuidv4 } = await import('uuid'); 
const path = require('path'); 

// 2. CONFIGURAÇÃO AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION, 
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME; 


// 3. CONFIGURAÇÃO MULTER (usando armazenamento em memória)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

/**
* Função utilitária para fazer upload de um buffer de arquivo para o S3
* NOTA: O uuid está sendo importado AQUI dentro para garantir que o 'await' seja válido.
*/
async function uploadToS3(fileBuffer, mimetype, originalname) {
  if (!BUCKET_NAME) {
    throw new Error('S3_BUCKET_NAME não configurado');
  }

    // CORREÇÃO FINAL: Usa importação dinâmica DENTRO da função async.
    const { v4: uuidv4 } = await import('uuid');

  // Gera um nome de arquivo único para evitar colisões
  const fileExtension = path.extname(originalname);
  const fileName = `locais/${uuidv4()}${fileExtension}`; // Agora uuidv4 está definido localmente
    
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimetype,
    // ACL (Access Control List) é a forma mais simples de tornar a imagem pública
  });

  await s3Client.send(command);

  // Constrói a URL pública do S3 (formato de URL de acesso direto)
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}


// Criar local (usuários logados)
// ALTERAÇÃO: Adicionar o middleware `upload.array('fotos')`
router.post('/locais', authMiddleware, upload.array('fotos'), async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    // Multer coloca os campos de texto em req.body
    const { nome, descricao, endereco, esporte, valorHora, disponibilidade, telefone } = req.body;
    
    // Multer coloca os arquivos em req.files
    const files = req.files; 
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma foto enviada.' });
    }

    // 1. UPLOAD PARA S3 e obtenção das URLs
    const s3Urls = [];
    for (const file of files) {
      // O file.buffer contém o arquivo na memória
      const url = await uploadToS3(file.buffer, file.mimetype, file.originalname);
      s3Urls.push(url);
    }

    const now = new Date().toISOString();

    // 2. Insere o local no BD
    // O campo `fotos` agora recebe a string JSON das URLs do S3
    const [insertedObject] = await db('locais').insert({
      nome,
      descricao,
      endereco,
      esporte,
      valor_hora: valorHora,
      disponibilidade,
      // Armazena as URLs geradas pelo S3 como uma string JSON no BD
      fotos: JSON.stringify(s3Urls), 
      telefone,
      user_id: userId,
      created_at: now,
      updated_at: now
    }).returning('id');

    const localId = insertedObject.id; 
    
    // 3. Buscar o local
    const newLocal = await db('locais').where({ id: localId }).first();
    
    res.status(201).json(newLocal);
  } catch (err) {
    console.error('Erro no upload ou criação do local:', err);
    // Em caso de erro, você pode tentar reverter uploads anteriores (opcional, mas recomendado)
    res.status(500).json({ error: 'Erro interno do servidor. Falha no upload ou BD.' });
  }
});

// Listar todos os locais
router.get('/locais', async (req, res) => {
    console.log('bateu aqui')

try {
 const locais = await db('locais').orderBy('created_at', 'desc');
 res.json(locais);
} catch (err) {
 console.error(err);
 res.status(500).json({ error: 'Erro ao buscar locais' });
}
});

// Buscar local por ID
router.get('/locais/:id', async (req, res) => {
try {
 const localId = parseInt(req.params.id);
 if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });
 
 const local = await db('locais').where({ id: localId }).first();
 if (!local) return res.status(404).json({ error: 'Local não encontrado' });
 res.json(local);
} catch (err) {
 console.error(err);
 res.status(500).json({ error: 'Erro ao buscar local' });
}
});

// Atualizar local (apenas criador do local)
router.put('/locais/:id', authMiddleware, async (req, res) => {
try {
 const localId = parseInt(req.params.id);
 if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });
 
 const userId = req.user.user_id;
 const local = await db('locais').where({ id: localId, user_id: userId }).first();
 if (!local) return res.status(404).json({ error: 'Local não encontrado ou sem permissão' });

 const updateData = { ...req.body, updated_at: new Date().toISOString() };
 if (updateData.fotos && Array.isArray(updateData.fotos)) {
 updateData.fotos = JSON.stringify(updateData.fotos);
 }
 await db('locais').where({ id: localId }).update(updateData);

 const updatedLocal = await db('locais').where({ id: localId }).first();
 res.json(updatedLocal);
} catch (err) {
 console.error(err);
 res.status(500).json({ error: 'Erro ao atualizar local' });
}
});

// Deletar local (apenas criador do local)
router.delete('/locais/:id', authMiddleware, async (req, res) => {
try {
 const localId = parseInt(req.params.id);
 if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });
 
 const userId = req.user.user_id;
 const local = await db('locais').where({ id: localId, user_id: userId }).first();
 if (!local) return res.status(404).json({ error: 'Local não encontrado ou sem permissão' });

 await db('locais').where({ id: localId }).del();
 res.json({ message: 'Local excluído com sucesso' });
} catch (err) {
 console.error(err);
 res.status(500).json({ error: 'Erro ao deletar local' });
}
});

module.exports = router;