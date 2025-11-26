const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

/**
 * Rota para Criar uma nova reserva.
 */
router.post('/reservas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { localId, data, hora_inicio, hora_fim, status = 'ativa' } = req.body; 

    const local = await db('locais').where({ id: localId }).first();
    if (!local) return res.status(404).json({ error: 'Local não encontrado' });

    // Verifica conflito de horários
    const conflito = await db('reservas')
      .where({ 
        local_id: localId, 
        data_reserva: data, 
        status: 'ativa' 
      })
      .andWhere(function() {
        this.where(function() {
          this.where('hora_inicio', '<=', hora_inicio)
              .andWhere('hora_fim', '>', hora_inicio);
        }).orWhere(function() {
          this.where('hora_inicio', '<', hora_fim)
              .andWhere('hora_fim', '>=', hora_fim);
        });
      })
      .first();

    if (conflito) return res.status(409).json({ error: 'Horário já reservado' });

    const now = new Date().toISOString();

    // Calcula o valor da reserva
    const horaInicio = parseInt(hora_inicio.split(':')[0]);
    const horaFim = parseInt(hora_fim.split(':')[0]);
    const duracaoHoras = horaFim - horaInicio;
    const valorTotal = Number((local.valor_hora * duracaoHoras).toFixed(2));

    const result = await db('reservas').insert({
      local_id: localId, 
      user_id: userId, 
      data_reserva: data, 
      hora_inicio, 
      hora_fim,
      valor_total: valorTotal,
      status,
      created_at: now, 
      updated_at: now
    }).returning('id');

    const id = (result[0].id !== undefined) ? result[0].id : result[0];
    const newReserva = await db('reservas').where({ id }).first();
    
    // Gerar notificações (isolado)
    const localNome = local.nome || 'Local Desconhecido';
    const mensagemBase = `Reserva criada para ${localNome} em ${data} às ${hora_inicio}`;
    
    try {
      await db('notificacoes').insert({
        user_id: userId,
        tipo: 'reserva_criada',
        mensagem: mensagemBase,
        created_at: now
      });

      if (local.user_id) {
        await db('notificacoes').insert({
          user_id: local.user_id,
          tipo: 'nova_reserva_local',
          mensagem: `Nova reserva feita para ${localNome} em ${data} às ${hora_inicio}`,
          created_at: now
        });
      }
    } catch (notificationError) {
      console.error('ERRO AO CRIAR NOTIFICAÇÃO (ignorado):', notificationError);
    }
    
    res.status(201).json(newReserva);
  } catch (err) {
    console.error('ERRO CRÍTICO AO CRIAR RESERVA:', err);
    res.status(500).json({ error: 'Erro ao criar reserva' });
  }
});

/**
 * ✅ ROTA CORRIGIDA V2: Listar reservas
 * - Admin: vê TODAS as reservas
 * - Owner: vê apenas reservas dos seus locais
 * - User comum: vê apenas suas próprias reservas
 */
router.get('/reservas', authMiddleware, async (req, res) => {
  try {
    const { locais_ids } = req.query;
    const userType = req.user.user_type;
    const userId = req.user.user_id;

    let query = db('reservas')
      .join('locais', 'reservas.local_id', '=', 'locais.id')
      .leftJoin('users', 'reservas.user_id', '=', 'users.user_id')
      .select(
        'reservas.*',
        'locais.nome as local_nome',
        'locais.endereco as local_endereco',
        'locais.esporte as local_esporte',
        'users.nome as nome_usuario'
      );

    // ✅ Filtro baseado no tipo de usuário
    if (userType === 'admin') {
      // Admin vê TODAS as reservas (sem filtro adicional)
      // Não adiciona nenhum WHERE
    } else if (userType === 'owner') {
      // Owner vê apenas reservas dos seus locais
      if (locais_ids) {
        // Se veio locais_ids na query, usa isso
        const ids = locais_ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        if (ids.length > 0) {
          query = query.whereIn('reservas.local_id', ids);
        } else {
          // Se não tem IDs válidos, retorna vazio
          return res.json([]);
        }
      } else {
        // Se não veio locais_ids, filtra pelos locais que pertencem ao owner
        query = query.where('locais.user_id', userId);
      }
    } else {
      // User comum vê apenas suas próprias reservas
      query = query.where('reservas.user_id', userId);
    }

    const reservas = await query.orderBy('reservas.data_reserva', 'desc');
    
    res.json(reservas);
  } catch (err) {
    console.error('ERRO ao buscar reservas:', err);
    res.status(500).json({ error: 'Erro ao buscar reservas', details: err.message });
  }
});

/**
 * Alterar reserva
 */
router.put('/reservas/:id', authMiddleware, async (req, res) => {
  try {
    const reservaId = parseInt(req.params.id);
    if (isNaN(reservaId)) return res.status(400).json({ error: 'ID inválido' });
    
    const reserva = await db('reservas').where({ id: reservaId, user_id: req.user.user_id }).first();
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

    const statusAnterior = reserva.status;
    const now = new Date().toISOString();
    const updateData = { ...req.body, updated_at: now };
    
    await db('reservas').where({ id: reservaId }).update(updateData);
    const updatedReserva = await db('reservas').where({ id: reservaId }).first();

    if (updateData.status && updateData.status !== statusAnterior) {
      const local = await db('locais').where({ id: reserva.local_id }).first();
      const localNome = local?.nome || `Local ID: ${reserva.local_id}`;
      const mensagemBase = `Status da reserva alterado para "${updateData.status}" - ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`;

      await db('notificacoes').insert({
        user_id: req.user.user_id,
        tipo: 'reserva_atualizada',
        mensagem: mensagemBase,
        created_at: now
      });

      if (local?.user_id) {
        await db('notificacoes').insert({
          user_id: local.user_id,
          tipo: 'reserva_atualizada_local',
          mensagem: `Status de uma reserva foi alterado para "${updateData.status}" - ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`,
          created_at: now
        });
      }
    }

    res.json(updatedReserva);
  } catch (err) {
    console.error('ERRO ao alterar reserva:', err);
    res.status(500).json({ error: 'Erro ao alterar reserva' });
  }
});

/**
 * Cancelar reserva
 */
router.delete('/reservas/:id', authMiddleware, async (req, res) => {
  try {
    const reservaId = parseInt(req.params.id);
    if (isNaN(reservaId)) return res.status(400).json({ error: 'ID inválido' });
    
    const reserva = await db('reservas').where({ id: reservaId, user_id: req.user.user_id }).first();
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

    const statusAnterior = reserva.status;
    const now = new Date().toISOString();

    await db('reservas').where({ id: reservaId }).update({ 
      status: 'cancelada', 
      updated_at: now 
    });
    
    if (statusAnterior !== 'cancelada') {
      const local = await db('locais').where({ id: reserva.local_id }).first();
      const localNome = local?.nome || `Local ID: ${reserva.local_id}`;
      const mensagemBase = `Reserva cancelada para ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`;

      await db('notificacoes').insert({
        user_id: req.user.user_id,
        tipo: 'reserva_cancelada',
        mensagem: mensagemBase,
        created_at: now
      });

      if (local?.user_id) {
        await db('notificacoes').insert({
          user_id: local.user_id,
          tipo: 'reserva_cancelada_local',
          mensagem: `Uma reserva foi cancelada para ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`,
          created_at: now
        });
      }
    }
    
    res.json({ message: 'Reserva cancelada com sucesso' });
  } catch (err) {
    console.error('ERRO ao cancelar reserva:', err);
    res.status(500).json({ error: 'Erro ao cancelar reserva' });
  }
});

/**
 * Avaliar reserva
 */
router.post('/reservas/:id/avaliar', authMiddleware, async (req, res) => {
  try {
    const reservaId = parseInt(req.params.id);
    if (isNaN(reservaId)) return res.status(400).json({ error: 'ID inválido' });
    
    const { avaliacao } = req.body;
    const reserva = await db('reservas').where({ id: reservaId, user_id: req.user.user_id }).first();
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

    await db('reservas').where({ id: reservaId }).update({ 
      avaliacao, 
      updated_at: new Date().toISOString() 
    });

    res.json({ message: 'Avaliação adicionada com sucesso' });
  } catch (err) {
    console.error('ERRO ao avaliar reserva:', err);
    res.status(500).json({ error: 'Erro ao avaliar reserva' });
  }
});

module.exports = router;
