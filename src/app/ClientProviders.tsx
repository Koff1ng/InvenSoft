'use client';

import { ReactNode } from 'react';
import { ToastAndConfirmProvider } from '@/components/ui/ToastAndConfirm';

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ToastAndConfirmProvider>
      {children}
    </ToastAndConfirmProvider>
  );
}
