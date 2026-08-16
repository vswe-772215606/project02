import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const stack = info.componentStack?.trim() ?? '';
    console.error(
      `[renderer-error-boundary] ${error.stack ?? error.message}${stack ? `\n${stack}` : ''}`,
    );
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    // Plain elements and tokens only, deliberately: this renders after
    // something below it has already thrown, so it must not depend on the
    // component library it is reporting the failure of.
    return (
      <div className="flex min-h-screen items-center justify-center bg-seam p-moat">
        <div className="grid w-full max-w-2xl gap-seam">
          <div className="bg-owed p-pad text-owed-foreground">
            <div className="text-[12px] font-semibold uppercase tracking-[0.09em]">
              Dastur xatosi
            </div>
            <h1 className="mt-1 text-[24px] font-semibold leading-tight">
              Sahifani yuklashda xatolik yuz berdi
            </h1>
          </div>

          <div className="bg-field p-pad">
            <p className="text-[14px] text-foreground">
              Iltimos, Windows ilovasidagi log fayllarni yuboring:
            </p>
            <div className="mt-2 bg-field-raised px-3 py-2 text-[14px]">
              %APPDATA%\Chayxana Master\logs\
            </div>
          </div>

          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words bg-selected p-pad text-[13px] leading-relaxed text-selected-foreground">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
