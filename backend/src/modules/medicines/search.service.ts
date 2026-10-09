import { Medicine, normalize } from '../../models/Medicine';
import { Pharmacy } from '../../models/Pharmacy';
import { Stock } from '../../models/Stock';
import { haversineKm, isOpenNow } from '../../utils/geo';

export interface SearchParams {
  q: string;
  lat?: number;
  lng?: number;
  neighborhood?: string;
  city?: string;
  onlyAvailable?: boolean;
  delivery?: boolean;
  pickup?: boolean;
  maxDistanceKm?: number;
  maxPrice?: number;
  openNow?: boolean;
  sort?: 'distance' | 'price' | 'availability';
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Recherche d'un médicament -> pharmacies qui l'ont (ou sont en rupture), avec distance,
 * livraison/retrait, prix, ouverture. La disponibilité = stock réel - unités réservées.
 */
export async function searchOffers(p: SearchParams) {
  const q = normalize(p.q);
  const rx = new RegExp(escapeRegex(q));
  const medicines = await Medicine.find({ $or: [{ nameLower: { $regex: rx } }, { genericNameLower: { $regex: rx } }, { barcode: p.q.trim() }] })
    .sort({ nameLower: 1 })
    .limit(10)
    .lean();
  if (!medicines.length) return [];

  const stocks = await Stock.find({ medicineId: { $in: medicines.map((m) => m._id) }, isListed: true }).lean();
  const pharmacies = await Pharmacy.find({ _id: { $in: [...new Set(stocks.map((s) => String(s.pharmacyId)))] }, isActive: true, isValidated: true }).lean();
  const byId = new Map(pharmacies.map((ph) => [String(ph._id), ph]));
  const hasCoords = p.lat !== undefined && p.lng !== undefined;
  const nb = p.neighborhood ? normalize(p.neighborhood) : undefined;
  const city = p.city ? normalize(p.city) : undefined;
  const now = new Date();

  return medicines.map((med) => {
    const offers = [];
    for (const s of stocks.filter((x) => String(x.medicineId) === String(med._id))) {
      const ph = byId.get(String(s.pharmacyId));
      if (!ph) continue;
      const distanceKm = hasCoords ? haversineKm(p.lat!, p.lng!, ph.latitude, ph.longitude) : undefined;
      if (!hasCoords) {
        if (nb && normalize(ph.neighborhood ?? '') !== nb) continue;
        if (city && normalize(ph.city) !== city) continue;
      }
      const inStock = s.available > 0;
      const open = isOpenNow(ph, now);
      const inRadius = distanceKm === undefined || distanceKm <= ph.deliveryRadiusKm;
      const deliveryAvailable = ph.offersDelivery && inStock && inRadius;
      const pickupAvailable = ph.offersPickup && inStock;

      if (p.onlyAvailable && !inStock) continue;
      if (p.delivery && !deliveryAvailable) continue;
      if (p.pickup && !pickupAvailable) continue;
      if (p.maxDistanceKm !== undefined && distanceKm !== undefined && distanceKm > p.maxDistanceKm) continue;
      if (p.maxPrice !== undefined && s.unitPrice > p.maxPrice) continue;
      if (p.openNow && !open) continue;

      offers.push({
        pharmacy: {
          id: String(ph._id), name: ph.name, address: ph.address, city: ph.city, neighborhood: ph.neighborhood,
          phone: ph.phone, latitude: ph.latitude, longitude: ph.longitude, deliveryFee: ph.deliveryFee, is24h: ph.is24h,
        },
        stock: {
          id: String(s._id),
          available: s.available,
          status: s.available <= 0 ? 'out_of_stock' : s.available <= s.minimumQuantity ? 'low' : 'available',
          price: s.unitPrice,
        },
        distanceKm,
        deliveryAvailable,
        pickupAvailable,
        isOpen: open,
      });
    }
    const sort = p.sort ?? (hasCoords ? 'distance' : 'availability');
    offers.sort((a, b) => {
      if (sort === 'price') return a.stock.price - b.stock.price;
      if (sort === 'distance' && a.distanceKm !== undefined && b.distanceKm !== undefined) return a.distanceKm - b.distanceKm;
      return Number(b.stock.available > 0) - Number(a.stock.available > 0) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
    });
    return {
      medicine: {
        id: String(med._id), name: med.name, genericName: med.genericName, dosage: med.dosage, form: med.form,
        manufacturer: med.manufacturer, category: med.category, prescriptionRequired: med.prescriptionRequired, description: med.description,
      },
      offers,
    };
  });
}
