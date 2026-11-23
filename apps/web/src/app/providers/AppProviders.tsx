import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router';
import { QueryProvider } from './QueryProvider';
import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <BrowserRouter>
        <AuthBootstrap />
        {children}
      </BrowserRouter>
    </QueryProvider>
  );
}
