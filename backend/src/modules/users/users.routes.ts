import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { usersController } from './users.controller';
import { approvalSchema, createUserSchema, idParams, listUsersQuery, setStatusSchema } from './users.validators';

export const usersRoutes = Router();

// Toutes les routes /api/users sont réservées à l'administrateur (contrôle côté serveur)
usersRoutes.use(authenticate, authorize('ADMIN'));

usersRoutes.post('/', validate({ body: createUserSchema }), asyncHandler(usersController.create));
usersRoutes.get('/', validate({ query: listUsersQuery }), asyncHandler(usersController.list));
usersRoutes.patch(
  '/:id/status',
  validate({ params: idParams, body: setStatusSchema }),
  asyncHandler(usersController.setStatus),
);
usersRoutes.get('/requests', asyncHandler(usersController.requests));
usersRoutes.post('/:id/approval', validate({ params: idParams, body: approvalSchema }), asyncHandler(usersController.approval));
