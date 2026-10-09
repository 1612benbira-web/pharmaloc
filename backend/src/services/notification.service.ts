import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { logger } from '../utils/logger';

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

async function notifyMany(userIds: (string | Types.ObjectId)[], input: NotifyInput) {
  if (!userIds.length) return;
  try {
    await Notification.insertMany(userIds.map((u) => ({ ...input, userId: u })));
  } catch (err) {
    logger.error('Échec création notification', { type: input.type, error: String(err) });
  }
}

export const notify = {
  user: (userId: string | Types.ObjectId, input: NotifyInput) => notifyMany([userId], input),

  async pharmacy(pharmacyId: string | Types.ObjectId, input: NotifyInput) {
    const users = await User.find({ pharmacyId, role: 'PHARMACIST', isActive: true }).select('_id').lean();
    await notifyMany(users.map((u) => u._id), input);
  },

  async admins(input: NotifyInput) {
    const users = await User.find({ role: 'ADMIN', isActive: true }).select('_id').lean();
    await notifyMany(users.map((u) => u._id), input);
  },
};
