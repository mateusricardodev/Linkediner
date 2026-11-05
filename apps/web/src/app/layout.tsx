import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@linkediner/ui/tokens.css';
import '@linkediner/ui/base.css';

export const metadata: Metadata = {
  title: 'LinkedIner',
  description: 'Copiloto de carreira para profissionais de tecnologia.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
