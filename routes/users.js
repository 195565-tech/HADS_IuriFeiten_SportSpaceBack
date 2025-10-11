const express = require('express');
const db = require('../db/knex');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.get('/users/me', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    let profile = await db('user_profiles').where({ user_id: userId }).first();

    if (!profile) {
      const now = new Date().toISOString();
      const [id] = await db('user_profiles').insert({
        user_id: userId,
        user_type: 'user',
        created_at: now,
        updated_at: now
      }).returning('id');

      profile = await db('user_profiles').where({ id }).first();
    }

    res.json({ ...req.user, profile });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
