import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { pageMeta, type Pagination } from '../../utils/pagination';
import { audit } from '../../services/audit.service';
import { userRepository } from './user.repository';
import type { Role } from '../../models/roles';

export const usersController = {
  /** Création d'un compte avec rôle (pharmacien, livreur, admin) par un administrateur. */
  async create(req: Request, res: Response) {
    const body = req.body;
    if (await userRepository.findByEmailWithSecrets(body.email)) {
      throw AppError.conflict('Un compte existe déjà avec cet email');
    }
    const { password, ...rest } = body;
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const user = await userRepository.create({ ...rest, passwordHash });
    await audit({
      action: 'user.create',
      userId: req.auth!.id,
      entity: 'User',
      entityId: String(user._id),
      metadata: { role: user.role },
      req,
    });
    res.status(201).json({ data: user.toJSON() });
  },

  async list(req: Request, res: Response) {
    const q = req.query as unknown as Pagination & { role?: Role };
    const filter = q.role ? { role: q.role } : {};
    const { items, total } = await userRepository.list(filter, (q.page - 1) * q.limit, q.limit);
    res.json({ data: items.map((u) => u.toJSON()), meta: pageMeta(total, q) });
  },

  async setStatus(req: Request, res: Response) {
    const id = String(req.params.id);
    if (id === req.auth!.id) throw AppError.badRequest('Vous ne pouvez pas modifier votre propre statut');
    const user = await userRepository.setActive(id, req.body.isActive);
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    await audit({
      action: req.body.isActive ? 'user.activate' : 'user.deactivate',
      userId: req.auth!.id,
      entity: 'User',
      entityId: id,
      req,
    });
    res.json({ data: user.toJSON() });
  },
};
