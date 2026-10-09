import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { audit } from '../../services/audit.service';
import { userRepository } from '../users/user.repository';
import { AppError } from '../../utils/AppError';

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    await audit({ action: 'auth.register', userId: result.user.id, entity: 'User', entityId: result.user.id, req });
    res.status(201).json({ data: result });
  },

  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body);
      await audit({ action: 'auth.login', userId: result.user.id, req });
      res.json({ data: result });
    } catch (err) {
      await audit({ action: 'auth.login_failed', metadata: { email: req.body?.email }, req });
      throw err;
    }
  },

  async refresh(req: Request, res: Response) {
    res.json({ data: await authService.refresh(req.body.refreshToken) });
  },

  async logout(req: Request, res: Response) {
    await authService.logout(req.auth!.id);
    await audit({ action: 'auth.logout', userId: req.auth!.id, req });
    res.status(204).end();
  },

  async me(req: Request, res: Response) {
    const user = await userRepository.findByIdWithSecrets(req.auth!.id);
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    res.json({ data: user.toJSON() });
  },
};
