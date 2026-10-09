import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'PharmaLoc - Trouvez vos médicaments sans perdre de temps',
  description: 'Vérifiez les stocks des pharmacies proches de vous et faites-vous livrer.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#17806a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider><CartProvider><Header />{children}</CartProvider></AuthProvider>
        <footer className="mt-10 border-t border-brand-100 py-5 text-center text-xs text-ink/50">PharmaLoc - CADEV 2026 · Paiements en mode DEMO (aucun argent réel)</footer>
      </body>
    </html>
  );
}
