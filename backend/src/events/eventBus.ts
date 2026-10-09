import { logger } from '../utils/logger';

export interface EventMap {
  /** Marchandise reçue d'un fournisseur */
  DELIVERY_RECEIVED: { supplierDeliveryId: string; pharmacyId: string; stockIds: string[]; userId: string; reference: string };
  /** Le patient a validé sa commande (stock réservé) */
  ORDER_CONFIRMED: { orderId: string };
  ORDER_CANCELLED: { orderId: string; by: string; reason?: string };
  /** Changement de statut d'une commande (notifications patient / pharmacie) */
  ORDER_STATUS_CHANGED: { orderId: string; from: string; to: string };
  /** Livraison terminée chez le patient (ou retrait effectué) */
  DELIVERY_COMPLETED: { orderId: string; deliveryId?: string };
  PAYMENT_CONFIRMED: { orderId: string; paymentId: string };
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => Promise<void> | void;

/**
 * Bus d'événements interne (en mémoire). Les handlers sont exécutés séquentiellement ;
 * l'échec d'un handler est journalisé mais ne casse ni l'émetteur ni les autres handlers.
 */
class EventBus {
  private handlers: { [K in keyof EventMap]?: Handler<K>[] } = {};

  on<K extends keyof EventMap>(event: K, handler: Handler<K>): void {
    (this.handlers[event] ??= [] as never).push(handler as never);
  }

  async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void> {
    for (const h of (this.handlers[event] ?? []) as Handler<K>[]) {
      try {
        await h(payload);
      } catch (err) {
        logger.error('Handler événement en échec', { event, error: String(err) });
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}

export const eventBus = new EventBus();
