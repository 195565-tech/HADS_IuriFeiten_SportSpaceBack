const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

/**
 * Rota para Criar uma nova reserva.
 * Trata o erro 500 isolando a criação da notificação.
 */
router.post('/reservas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;
    // O cliente está enviando a hora de início como 'hora' (ReservarLocal.tsx)
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
          // Verifica se o horário de início está dentro de uma reserva existente
          this.where('hora_inicio', '<=', hora_inicio)
              .andWhere('hora_fim', '>', hora_inicio);
        }).orWhere(function() {
          // Verifica se o horário de fim está dentro de uma reserva existente
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

    // 1. Cria a Reserva (Operação Crítica)
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

    // Knex retorna a ID inserida, geralmente como um array de números ou objetos.
    // Garantimos que 'id' seja o valor numérico da ID.
    const id = (result[0].id !== undefined) ? result[0].id : result[0];
    
    const newReserva = await db('reservas').where({ id }).first();
    
    // 2. Gerar notificações para o usuário e admin (Operação Não-Crítica - Isolada)
    const localNome = local.nome || 'Local Desconhecido';
    const mensagemBase = `Reserva criada para ${localNome} em ${data} às ${hora_inicio}`;
    
    try {
      // Notificação para o usuário que fez a reserva
      await db('notificacoes').insert({
        user_id: userId,
        tipo: 'reserva_criada',
        mensagem: mensagemBase,
        created_at: now
      });

      // Notificação para o admin do local
      if (local.user_id) {
        await db('notificacoes').insert({
          user_id: local.user_id,
          tipo: 'nova_reserva_local',
          mensagem: `Nova reserva feita para ${localNome} em ${data} às ${hora_inicio}`,
          created_at: now
        });
      }
    } catch (notificationError) {
      console.error('ERRO AO CRIAR NOTIFICAÇÃO (ignorado para sucesso da reserva):', notificationError);
    }
    
    // 3. Envia a resposta de sucesso
    res.status(201).json(newReserva);
  } catch (err) {
    // Captura erros críticos (como falha na inserção da reserva ou validação)
    console.error('ERRO CRÍTICO AO CRIAR RESERVA:', err);
    res.status(500).json({ error: 'Erro ao criar reserva' });
  }
});

// Listar reservas do usuário
router.get('/reservas', authMiddleware, async (req, res) => {
  try {
    // 1. Modifica a consulta para usar JOIN
    const reservas = await db('reservas')
      .where('reservas.user_id', req.user.user_id) // Garante que estamos filtrando pelo user_id correto
      .join('locais', 'reservas.local_id', '=', 'locais.id') // Faz o JOIN com a tabela 'locais'
      .select(
        'reservas.*', // Seleciona todos os campos da reserva
        'locais.nome as local_nome', // Adiciona o nome do local
        'locais.endereco as local_endereco', // Adiciona o endereço do local
        'locais.esporte as local_esporte' // Adiciona o esporte do local
      )
      .orderBy('data_reserva', 'desc');
      
    res.json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar reservas' });
  }
});

// Alterar reserva
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

    // Se houve mudança de status, gera notificações
    if (updateData.status && updateData.status !== statusAnterior) {
      const local = await db('locais').where({ id: reserva.local_id }).first();
      const localNome = local?.nome || `Local ID: ${reserva.local_id}`;
      const mensagemBase = `Status da reserva alterado para "${updateData.status}" - ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`;

      // Notificação para o usuário da reserva
      await db('notificacoes').insert({
        user_id: req.user.user_id,
        tipo: 'reserva_atualizada',
        mensagem: mensagemBase,
        created_at: now
      });

      // Notificação para o admin do local
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
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar reserva' });
  }
});

// Cancelar reserva
router.delete('/reservas/:id', authMiddleware, async (req, res) => {
  try {
    const reservaId = parseInt(req.params.id);
    if (isNaN(reservaId)) return res.status(400).json({ error: 'ID inválido' });
    
    const reserva = await db('reservas').where({ id: reservaId, user_id: req.user.user_id }).first();
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });

    // Guarda o status anterior para comparação
    const statusAnterior = reserva.status;
    const now = new Date().toISOString();

    await db('reservas').where({ id: reservaId }).update({ 
      status: 'cancelada', 
      updated_at: now 
    });
    
    // Se o status mudou, gera notificações
    if (statusAnterior !== 'cancelada') {
      // Busca o local para obter informações e o admin
      const local = await db('locais').where({ id: reserva.local_id }).first();
      const localNome = local?.nome || `Local ID: ${reserva.local_id}`;
      const mensagemBase = `Reserva cancelada para ${localNome} em ${reserva.data_reserva} às ${reserva.hora_inicio}`;

      // Notificação para o usuário que fez a reserva
      await db('notificacoes').insert({
        user_id: req.user.user_id,
        tipo: 'reserva_cancelada',
        mensagem: mensagemBase,
        created_at: now
      });

      // Notificação para o admin do local
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
    console.error(err);
    res.status(500).json({ error: 'Erro ao cancelar reserva' });
  }
});

// Avaliar reserva
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
    console.error(err);
    res.status(500).json({ error: 'Erro ao avaliar reserva' });
  }
});

module.exports = router;
