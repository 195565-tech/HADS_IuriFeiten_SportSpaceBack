//Crud de notificações
const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Listar notificações do usuário
router.get('/notificacoes', authMiddleware, async (req, res) => {
  try {
    const notificacoes = await db('notificacoes')
      .where({ user_id: req.user.user_id })
      .orderBy('created_at', 'desc');
    res.json(notificacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// Marcar notificação como lida
router.post('/notificacoes/:id/read', authMiddleware, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verifica se a notificação existe e pertence ao usuário
    const notification = await db('notificacoes')
      .where({ 
        id: notificationId,
        user_id: req.user.user_id 
      })
      .first();

    if (!notification) {
      return res.status(404).json({ error: 'Notificação não encontrada' });
    }

    // Atualiza o status para lida
    await db('notificacoes')
      .where({ id: notificationId })
      .update({ lida: true });

    res.json({ message: 'Notificação marcada como lida' });
  } catch (err) {
    console.error('Erro ao marcar notificação como lida:', err);
    res.status(500).json({ error: 'Erro ao marcar notificação como lida' });
  }
});

// Marcar todas as notificações como lidas
router.post('/notificacoes/read-all', authMiddleware, async (req, res) => {
  try {
    await db('notificacoes')
      .where({ user_id: req.user.user_id, lida: false })
      .update({ lida: true });

    res.json({ message: 'Todas as notificações foram marcadas como lidas' });
  } catch (err) {
    console.error('Erro ao marcar todas notificações como lidas:', err);
    res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
  }
});

module.exports = router;
