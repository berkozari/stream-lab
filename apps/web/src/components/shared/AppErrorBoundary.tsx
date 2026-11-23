import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('React render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center p-8 text-center">
          <div>
            <h1 className="text-2xl font-semibold">Bir arayüz hatası oluştu.</h1>
            <p className="mt-3 text-muted-foreground">Sayfayı yenileyerek tekrar deneyebilirsin.</p>
            <button
              className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Sayfayı yenile
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
