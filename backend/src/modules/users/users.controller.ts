import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { pageMeta, type Pagination } from '../../utils/pagination';
import { audit } from '../../services/audit.service';
import { userRepository } from './user.repository';
import type { Role } from '../../models/roles';
import { User } from '../../models/User';
import { Pharmacy } from '../../models/Pharmacy';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { notify } from '../../services/notification.service';

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
    const q = req.query as unknown as Pagination & { role?: Role; approvalStatus?: string };
    const filter = { ...(q.role ? { role: q.role } : {}), ...(q.approvalStatus ? { approvalStatus: q.approvalStatus } : {}) };
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

  /** File d'attente des demandes (pharmacies, livreurs) avec leurs détails. */
  async requests(_req: Request, res: Response) {
    const pending = await User.find({ approvalStatus: 'pending' }).sort({ createdAt: 1 }).limit(100).lean();
    const [pharmacies, agents] = await Promise.all([
      Pharmacy.find({ _id: { $in: pending.map((u) => u.pharmacyId).filter(Boolean) } }).lean(),
      DeliveryAgent.find({ userId: { $in: pending.map((u) => u._id) } }).lean(),
    ]);
    res.json({
      data: pending.map((u) => ({
        id: String(u._id),
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt,
        pharmacy: pharmacies.find((p) => String(p._id) === String(u.pharmacyId)) ?? null,
        courier: agents.find((a) => String(a.userId) === String(u._id)) ?? null,
      })),
    });
  },

  /** Approuve ou refuse une demande. Approuver un pharmacien valide aussi sa pharmacie ; refuser la désactive. */
  async approval(req: Request, res: Response) {
    const id = String(req.params.id);
    const user = await User.findById(id);
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    if (user.approvalStatus !== 'pending') throw AppError.conflict('Cette demande a déjà été traitée');
    const approve = req.body.decision === 'approve';
    await userRepository.setApproval(id, approve ? 'approved' : 'rejected', req.body.reason);
    if (user.pharmacyId) {
      await Pharmacy.updateOne({ _id: user.pharmacyId }, { $set: approve ? { isValidated: true } : { isValidated: false, isActive: false } });
    }
    await audit({ action: approve ? 'user.approve' : 'user.reject', userId: req.auth!.id, entity: 'User', entityId: id, metadata: { role: user.role, reason: req.body.reason }, req });
    await notify.user(user._id, {
      type: approve ? 'account.approved' : 'account.rejected',
      title: approve ? 'Demande acceptée' : 'Demande refusée',
      message: approve ? 'Votre compte est validé : vous pouvez commencer.' : `Votre demande a été refusée. Motif : ${req.body.reason}`,
    });
    res.json({ data: (await User.findById(id))!.toJSON() });
  },
};
