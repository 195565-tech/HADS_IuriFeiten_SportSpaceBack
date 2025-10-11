const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Criar local (usuários logados)
router.post('/locais', authMiddleware, async (req, res) => {
 try {
  const userId = req.user.user_id;
  const { nome, descricao, endereco, esporte, valorHora, disponibilidade, fotos, telefone } = req.body;
  const now = new Date().toISOString();

  // 1. Insere o local e usa returning('id'). Knex (PostgreSQL) devolve um array de objetos: [{ id: N }]
  const [insertedObject] = await db('locais').insert({
   nome,
   descricao,
   endereco,
   esporte,
   valor_hora: valorHora,
   disponibilidade,
   // O frontend já está a enviar as fotos como JSON string ou nulo, o que está correto aqui.
   fotos: fotos, 
   telefone,
   user_id: userId,
   created_at: now,
   updated_at: now
  }).returning('id');

  // 2. CORREÇÃO: Extraímos o valor numérico do ID do objeto retornado.
  const localId = insertedObject.id; 
  
  // 3. Buscar o local (agora usando o ID numérico correto)
  const newLocal = await db('locais').where({ id: localId }).first();
  
  res.status(201).json(newLocal);
 } catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
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
