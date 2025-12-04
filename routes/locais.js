//Tudo que envolve crud de local
const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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
 * Middleware para verificar se o usuário é administrador
 * CORRIGIDO: Mudou de req.user.perfil para req.user.user_type
 */
const adminMiddleware = (req, res, next) => {
  console.log('Verificando admin:', req.user); // Debug
  
  if (!req.user || req.user.user_type !== 'admin') {
    console.log('Acesso negado. User type:', req.user?.user_type); // Debug
    return res.status(403).json({ 
      error: 'Acesso negado. Apenas administradores podem realizar esta ação.',
      user_type: req.user?.user_type 
    });
  }
  next();
};

/**
 * Função utilitária para fazer upload de um buffer de arquivo para o S3
 */
async function uploadToS3(fileBuffer, mimetype, originalname) {
  if (!BUCKET_NAME) {
    throw new Error('S3_BUCKET_NAME não configurado');
  }

  const { v4: uuidv4 } = await import('uuid');

  const fileExtension = path.extname(originalname);
  const fileName = `locais/${uuidv4()}${fileExtension}`;
    
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimetype,
  });

  await s3Client.send(command);

  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

// ============================================
// ROTAS DE APROVAÇÃO (NOVAS)
// ============================================

/**
 * GET /api/locais/pendentes
 * Retorna todos os locais aguardando aprovação
 * Apenas administradores podem acessar
 */
router.get('/locais/pendentes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('Buscando locais pendentes...'); // Debug
    
    const locaisPendentes = await db('locais')
      .where({ status_aprovacao: 'pendente' })
      .orderBy('created_at', 'desc');
    
    console.log(`Encontrados ${locaisPendentes.length} locais pendentes`); // Debug
    res.json(locaisPendentes);
  } catch (err) {
    console.error('Erro ao buscar locais pendentes:', err);
    res.status(500).json({ error: 'Erro ao buscar locais pendentes' });
  }
});

/**
 * PATCH /api/locais/:id/aprovar
 * Aprova um local, mudando seu status para 'aprovado'
 * Apenas administradores podem executar
 */
router.patch('/locais/:id/aprovar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });

    // Verifica se o local existe
    const local = await db('locais').where({ id: localId }).first();
    if (!local) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }

    // Atualiza o status para aprovado
    await db('locais')
      .where({ id: localId })
      .update({
        status_aprovacao: 'aprovado',
        updated_at: new Date().toISOString()
      });

    const localAprovado = await db('locais').where({ id: localId }).first();
    
    res.json({ 
      message: 'Local aprovado com sucesso',
      local: localAprovado 
    });
  } catch (err) {
    console.error('Erro ao aprovar local:', err);
    res.status(500).json({ error: 'Erro ao aprovar local' });
  }
});

/**
 * DELETE /api/locais/:id/reprovar
 * Remove permanentemente um local reprovado
 * Apenas administradores podem executar
 */
router.delete('/locais/:id/reprovar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });

    // Verifica se o local existe
    const local = await db('locais').where({ id: localId }).first();
    if (!local) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }

    // Remove o local do banco de dados
    await db('locais').where({ id: localId }).del();
    
    res.json({ message: 'Local reprovado e removido com sucesso' });
  } catch (err) {
    console.error('Erro ao reprovar local:', err);
    res.status(500).json({ error: 'Erro ao reprovar local' });
  }
});

// ============================================
// ROTAS EXISTENTES (MODIFICADAS)
// ============================================

/**
 * POST /api/locais
 * Criar local (usuários logados)
 * MODIFICADO: Define status_aprovacao como 'pendente' por padrão
 */
router.post('/locais', authMiddleware, upload.array('fotos'), async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    const { nome, descricao, endereco, esporte, valorHora, disponibilidade, telefone } = req.body;
    
    const files = req.files; 
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma foto enviada.' });
    }

    // 1. UPLOAD PARA S3 e obtenção das URLs
    const s3Urls = [];
    for (const file of files) {
      const url = await uploadToS3(file.buffer, file.mimetype, file.originalname);
      s3Urls.push(url);
    }

    const now = new Date().toISOString();

    // 2. Insere o local no BD com status 'pendente'
    const [insertedObject] = await db('locais').insert({
      nome,
      descricao,
      endereco,
      esporte,
      valor_hora: valorHora,
      disponibilidade,
      fotos: JSON.stringify(s3Urls), 
      telefone,
      user_id: userId,
      status_aprovacao: 'pendente', // ADICIONADO: Status inicial
      created_at: now,
      updated_at: now
    }).returning('id');

    const localId = insertedObject.id; 
    
    const newLocal = await db('locais').where({ id: localId }).first();
    
    res.status(201).json(newLocal);
  } catch (err) {
    console.error('Erro no upload ou criação do local:', err);
    res.status(500).json({ error: 'Erro interno do servidor. Falha no upload ou BD.' });
  }
});

/**
 * GET /api/locais
 * Listar todos os locais
 * MODIFICADO: Filtra por status_aprovacao baseado no perfil do usuário
 */
router.get('/locais', async (req, res) => {
  console.log('bateu aqui');

  try {
    let locais;
    
    locais = await db('locais')
      .where({ status_aprovacao: 'aprovado' })
      .orderBy('created_at', 'desc');
    
    res.json(locais);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar locais' });
  }
});

/**
 * GET /api/locais/meus
 * NOVA ROTA: Listar locais do usuário logado (independente do status)
 */
router.get('/locais/meus', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    
    const meusLocais = await db('locais')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
    
    res.json(meusLocais);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar seus locais' });
  }
});

/**
 * GET /api/locais/:id
 * Buscar local por ID
 */
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

/**
 * PUT /api/locais/:id
 * Atualizar local (apenas criador do local)
 */
router.put('/locais/:id', authMiddleware, upload.array('fotos'), async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    if (isNaN(localId)) return res.status(400).json({ error: 'ID inválido' });

    const userId = req.user.user_id;
    const local = await db('locais').where({ id: localId, user_id: userId }).first();
    if (!local) return res.status(404).json({ error: 'Local não encontrado ou sem permissão' });

    const { nome, descricao, endereco, esporte, valorHora, disponibilidade, telefone, fotosExistentes } = req.body;

    let fotos = fotosExistentes ? JSON.parse(fotosExistentes) : [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToS3(file.buffer, file.mimetype, file.originalname);
        fotos.push(url);
      }
    }

    const updateData = {
      nome,
      descricao,
      endereco,
      esporte,
      valor_hora: valorHora,
      disponibilidade,
      telefone,
      fotos: JSON.stringify(fotos),
      updated_at: new Date().toISOString()
    };

    await db('locais').where({ id: localId }).update(updateData);

    const updatedLocal = await db('locais').where({ id: localId }).first();
    res.json(updatedLocal);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar local' });
  }
});

/**
 * DELETE /api/locais/:id
 * Deletar local (apenas criador do local)
 */
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
