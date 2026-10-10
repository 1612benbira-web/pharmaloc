import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { audit } from '../../services/audit.service';
import { userRepository } from '../users/user.repository';
import { AppError } from '../../utils/AppError';
import { notify } from '../../services/notification.service';

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    await audit({ action: 'auth.register', userId: result.user.id, entity: 'User', entityId: result.user.id, req });
    res.status(201).json({ data: result });
  },

  async registerPharmacy(req: Request, res: Response) {
    const result = await authService.registerPharmacy(req.body);
    await audit({ action: 'auth.register_pharmacy', userId: result.user.id, entity: 'Pharmacy', entityId: result.pharmacyId, req });
    await notify.admins({ type: 'request.pharmacy', title: 'Nouvelle demande de pharmacie', message: `${req.body.pharmacy.name} demande à rejoindre PharmaLoc (agrément ${req.body.pharmacy.licenseNumber}).`, data: { userId: result.user.id } });
    res.status(201).json({ data: result });
  },

  async registerCourier(req: Request, res: Response) {
    const result = await authService.registerCourier(req.body);
    await audit({ action: 'auth.register_courier', userId: result.user.id, entity: 'User', entityId: result.user.id, req });
    await notify.admins({ type: 'request.courier', title: 'Nouvelle demande de livreur', message: `${req.body.firstName} ${req.body.lastName} (${req.body.vehicle}) demande à devenir livreur.`, data: { userId: result.user.id } });
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
