import { useEffect } from 'react';
import { Download } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { INSTALLING_OVERLAY, updaterBannerModel } from '@/lib/updater-view';
import { useAuthStore } from '@/stores/auth.store';
import { useUpdaterStore } from '@/stores/updater.store';

/**
 * The update bar and the dialog behind it.
 *
 * Mounted once, in `AppShell`, directly under `ConnectionBanner`. It renders
 * nothing at all in five of the eight updater states — see
 * `lib/updater-view.ts` for which and why — and nothing ever when there is no
 * preload, so the gallery and the browser-run renderer are unaffected.
 */
export function UpdateBanner() {
  const state = useUpdaterStore((s) => s.state);
  const prompt = useUpdaterStore((s) => s.prompt);
  const promptOpen = useUpdaterStore((s) => s.promptOpen);
  const snoozedUntil = useUpdaterStore((s) => s.snoozedUntil);
  const installPending = useUpdaterStore((s) => s.installPending);
  const autoPrompt = useUpdaterStore((s) => s.autoPrompt);
  const openPrompt = useUpdaterStore((s) => s.openPrompt);
  const dismissPrompt = useUpdaterStore((s) => s.dismissPrompt);
  const confirmInstall = useUpdaterStore((s) => s.confirmInstall);
  const actionError = useUpdaterStore((s) => s.actionError);
  const user = useAuthStore((s) => s.user);

  const status = state.status;

  // Ask once the update is on disk — but never over a login screen, and never
  // during a snooze. When the snooze runs out the question comes back on its
  // own: the operator said "later", not "no".
  useEffect(() => {
    if (!user || status !== 'ready') return;
    const wait = snoozedUntil === null ? 0 : snoozedUntil - Date.now();
    if (wait <= 0) {
      void autoPrompt();
      return;
    }
    const timer = window.setTimeout(() => {
      void autoPrompt();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [user, status, snoozedUntil, autoPrompt]);

  const banner = updaterBannerModel(state);

  return (
    <>
      {/* A refused install, said out loud. The operator pressed the button that
          closes the till for two minutes and the dialog vanished; without this
          they are left believing a restart is coming. Sits above the bar so it
          is read first, and clears itself on the next successful action. */}
      {actionError === null ? null : (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 bg-owed px-pad py-1.5 text-[13px] font-semibold text-owed-foreground"
        >
          <span className="truncate">{actionError}</span>
        </div>
      )}
      {banner === null ? null : banner.actionable ? (
        // The bar is the button. A button inside a bar would push the bar past
        // the 56px this panel can spare, and Blocks C1's floor for a real
        // target is 48px. Pressing it re-opens the dialog rather than
        // installing — one tap must never restart the till.
        <button
          type="button"
          onClick={() => void openPrompt()}
          className="press-block focus-block flex min-h-control w-full shrink-0 items-center justify-center gap-2 bg-live px-pad text-[15px] font-semibold text-live-foreground"
        >
          <Download className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          <span className="truncate">{banner.text}</span>
        </button>
      ) : (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 bg-field-raised px-pad py-1.5 text-[13px] font-semibold text-muted-foreground"
        >
          <Download className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="tabular-nums">{banner.text}</span>
        </div>
      )}

      <AlertDialog
        open={promptOpen && prompt !== null}
        onOpenChange={(open) => {
          if (!open) dismissPrompt();
        }}
      >
        {prompt ? (
          <AlertDialogContent className="max-w-[560px] gap-seam border-0 bg-seam p-seam">
            <AlertDialogHeader className="space-y-0 bg-field-raised px-pad py-2.5 text-left">
              <AlertDialogTitle className="text-[17px] font-semibold text-foreground">
                {prompt.title}
              </AlertDialogTitle>
            </AlertDialogHeader>
            {/* The body arrives composed from the main process, open-order
                count included, and is re-read every time this opens. Blank
                lines separate its three paragraphs, so it renders pre-line. */}
            <AlertDialogDescription className="max-h-[46vh] overflow-auto whitespace-pre-line bg-field p-pad text-[14px] leading-[1.5] text-foreground">
              {prompt.body}
            </AlertDialogDescription>
            {/* 16px moat: the confirm here closes the till for two minutes, so
                it gets the same clearance the system gives a destructive
                action. */}
            <AlertDialogFooter className="flex-row justify-end gap-moat space-x-0 bg-field p-pad sm:space-x-0">
              <AlertDialogCancel className="mt-0 min-w-[140px]" disabled={installPending}>
                {prompt.cancelLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                className="h-action min-w-[200px] px-6"
                disabled={installPending}
                onClick={(event) => {
                  event.preventDefault();
                  void confirmInstall();
                }}
              >
                {prompt.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

/**
 * The blocking screen shown from the moment the install is accepted.
 *
 * Without it the operator taps confirm and then clicks into a UI whose server
 * is being torn down under it, and concludes the till has crashed. Mounted
 * last in `AppShell` so it covers the rail as well as the work area.
 */
export function UpdateInstallingOverlay() {
  const status = useUpdaterStore((s) => s.state.status);
  if (status !== 'installing') return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={INSTALLING_OVERLAY.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-seam p-pad"
    >
      <div className="w-full max-w-[560px] bg-field p-pad">
        <div className="text-[17px] font-semibold">{INSTALLING_OVERLAY.title}</div>
        <div className="mt-3 flex flex-col gap-2">
          {INSTALLING_OVERLAY.lines.map((line) => (
            <p key={line} className="text-[14px] leading-[1.5]">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
