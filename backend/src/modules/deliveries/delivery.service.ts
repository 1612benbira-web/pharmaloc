import { Delivery } from '../../models/Delivery';
import { DeliveryAgent } from '../../models/DeliveryAgent';
import { DeliveryAssignment } from '../../models/DeliveryAssignment';
import { Order } from '../../models/Order';
import { Pharmacy } from '../../models/Pharmacy';
import { AppError } from '../../utils/AppError';
import { oid } from '../../utils/ids';
import { audit } from '../../services/audit.service';
import { eventBus } from '../../events/eventBus';
import { changeStatus, checkCode, consumeOrderStock, loadOrder } from '../orders/order.service';
import type { AuthUser } from '../../middleware/auth';

export const MAX_ACTIVE_DELIVERIES = 3;

async function mine(deliveryId: string, auth: AuthUser) {
  const d = await Delivery.findById(deliveryId);
  if (!d) throw AppError.notFound('Livraison introuvable');
  if (auth.role !== 'ADMIN' && String(d.deliveryAgentId) !== auth.id) throw AppError.forbidden('Cette livraison ne vous est pas assignée');
  return d;
}

export const deliveryService = {
  async setAvailability(userId: string, data: { isAvailable?: boolean; vehicle?: string; latitude?: number; longitude?: number }) {
    const set: Record<string, unknown> = { ...data };
    if (data.latitude !== undefined && data.longitude !== undefined) set.locationUpdatedAt = new Date();
    return DeliveryAgent.findOneAndUpdate({ userId: oid(userId) }, { $set: set, $setOnInsert: { userId: oid(userId) } }, { upsert: true, new: true });
  },

  async listAvailable(userId: string) {
    const agent = await DeliveryAgent.findOne({ userId: oid(userId) }).lean();
    if (!agent?.isAvailable) return [];
    const deliveries = await Delivery.find({ status: 'searching' }).sort({ createdAt: 1 }).limit(50).lean();
    const pharmacies = await Pharmacy.find({ _id: { $in: deliveries.map((d) => d.pharmacyId) } }).select('name address neighborhood').lean();
    const orders = await Order.find({ _id: { $in: deliveries.map((d) => d.orderId) } }).select('totalAmount deliveryFee items').lean();
    return deliveries.map((d) => ({
      ...d,
      pharmacy: pharmacies.find((p) => String(p._id) === String(d.pharmacyId)),
      order: orders.find((o) => String(o._id) === String(d.orderId)),
    }));
  },

  /** Acceptation : prise atomique (un seul livreur peut obtenir la livraison). */
  async accept(deliveryId: string, auth: AuthUser) {
    const agent = await DeliveryAgent.findOne({ userId: oid(auth.id) }).lean();
    if (!agent?.isAvailable) throw AppError.conflict('Passez en disponible pour accepter une livraison');
    const active = await Delivery.countDocuments({ deliveryAgentId: oid(auth.id), status: { $in: ['assigned', 'picked_up', 'in_delivery'] } });
    if (active >= MAX_ACTIVE_DELIVERIES) throw AppError.conflict(`Maximum ${MAX_ACTIVE_DELIVERIES} livraisons en cours`);

    const delivery = await Delivery.findOneAndUpdate(
      { _id: oid(deliveryId), status: 'searching' },
      { $set: { status: 'assigned', deliveryAgentId: oid(auth.id) } },
      { new: true },
    );
    if (!delivery) throw AppError.conflict('Cette livraison n’est plus disponible');
    try {
      await changeStatus(String(delivery.orderId), 'ready', 'assigned', 'DELIVERY_AGENT');
    } catch (err) {
      await Delivery.updateOne({ _id: delivery._id }, { $set: { status: 'searching' }, $unset: { deliveryAgentId: 1 } });
      throw err;
    }
    await DeliveryAssignment.create({ deliveryId: delivery._id, orderId: delivery.orderId, agentId: oid(auth.id) });
    await audit({ action: 'delivery.accept', userId: auth.id, entity: 'Delivery', entityId: String(delivery._id) });
    return delivery;
  },

  /** Le livreur récupère la commande : c'est ici que le stock sort définitivement (vente). */
  async pickup(deliveryId: string, auth: AuthUser) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'assigned') throw AppError.conflict('La livraison n’est pas à l’état « assignée »');
    const order = await loadOrder(String(d.orderId));
    await changeStatus(String(order._id), 'assigned', 'picked_up', 'DELIVERY_AGENT');
    try {
      await consumeOrderStock(order);
    } catch (err) {
      await Order.updateOne({ _id: order._id }, { $set: { status: 'assigned' } });
      throw err;
    }
    await Order.updateOne({ _id: order._id }, { $set: { stockConsumed: true } });
    d.status = 'picked_up';
    d.pickedUpAt = new Date();
    await d.save();
    return d;
  },

  async start(deliveryId: string, auth: AuthUser) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'picked_up') throw AppError.conflict('Récupérez d’abord la commande');
    await changeStatus(String(d.orderId), 'picked_up', 'in_delivery', 'DELIVERY_AGENT');
    d.status = 'in_delivery';
    await d.save();
    return d;
  },

  async updateLocation(deliveryId: string, auth: AuthUser, latitude: number, longitude: number) {
    const d = await mine(deliveryId, auth);
    d.agentLatitude = latitude;
    d.agentLongitude = longitude;
    d.agentLocationAt = new Date();
    await d.save();
    return d;
  },

  /** Confirmation de remise au patient par code de livraison (OTP). */
  async complete(deliveryId: string, auth: AuthUser, code: string) {
    const d = await mine(deliveryId, auth);
    if (d.status !== 'in_delivery') throw AppError.conflict('La livraison n’est pas en cours');
    const order = await loadOrder(String(d.orderId));
    await checkCode(order, code);
    await changeStatus(String(order._id), 'in_delivery', 'delivered', 'DELIVERY_AGENT', { deliveredAt: new Date() });
    d.status = 'delivered';
    d.deliveredAt = new Date();
    await d.save();
    await DeliveryAssignment.updateOne({ deliveryId: d._id, agentId: oid(auth.id) }, { $set: { status: 'completed', completedAt: new Date() } });
    await audit({ action: 'delivery.complete', userId: auth.id, entity: 'Delivery', entityId: String(d._id) });
    await eventBus.emit('DELIVERY_COMPLETED', { orderId: String(order._id), deliveryId: String(d._id) });
    return d;
  },
};
