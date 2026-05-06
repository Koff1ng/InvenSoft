'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/AuthContext';
import { ToastAndConfirmProvider } from '@/components/ui/ToastAndConfirm';

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastAndConfirmProvider>
        {children}
      </ToastAndConfirmProvider>
    </AuthProvider>
  );
}
