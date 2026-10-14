import { randomBytes } from 'node:crypto';

export type Operator = 'wave' | 'orange_money';
export const OPERATOR_LABEL: Record<Operator, string> = { wave: 'Wave', orange_money: 'Orange Money' };

/**
 * Contrat d'un fournisseur de VERSEMENTS (disbursement) : c'est ici qu'on branchera l'API réelle
 * de Wave / Orange Money / PayTech. `reference` sert de clé d'idempotence côté prestataire.
 */
export interface PayoutProvider {
  readonly name: string;
  readonly mode: 'DEMO' | 'LIVE';
  disburse(i: { reference: string; amount: number; operator: Operator; phone: string }): Promise<{ providerReference: string; status: 'paid' | 'failed'; error?: string }>;
}

/** Fournisseur DEMO : aucun argent ne circule, le versement « réussit » toujours. */
export const demoPayoutProvider: PayoutProvider = {
  name: 'demo',
  mode: 'DEMO',
  async disburse() {
    return { providerReference: `DEMO-PO-${randomBytes(5).toString('hex').toUpperCase()}`, status: 'paid' };
  },
};

const providers: Record<string, PayoutProvider> = { demo: demoPayoutProvider };
export const registerPayoutProvider = (p: PayoutProvider) => { providers[p.name] = p; };
/** Choisi par PAYOUT_PROVIDER (lu à chaque appel). Par défaut : demo. */
export const activePayoutProvider = (): PayoutProvider => providers[process.env.PAYOUT_PROVIDER ?? 'demo'] ?? demoPayoutProvider;

/** « +221 77 123 45 67 » -> « +221 •• ••• •• 67 » : on ne conserve jamais le numéro complet dans l'historique. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `•••• ${digits.slice(-2)}`;
}
