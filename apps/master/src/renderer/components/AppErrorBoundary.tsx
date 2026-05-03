import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const stack = info.componentStack.trim();
    console.error(
      `[renderer-error-boundary] ${error.stack ?? error.message}${stack ? `\n${stack}` : ''}`,
    );
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-red-600">
            Runtime Error
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            Sahifani yuklashda xatolik yuz berdi
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Iltimos, Windows ilovasidagi log fayllarni yuboring:
            <span className="block mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
              %APPDATA%\Chayxana Master\logs\
            </span>
          </p>
          <pre className="mt-5 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-red-200">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
