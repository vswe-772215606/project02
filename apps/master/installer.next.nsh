; Custom NSIS hooks for the SIDE-BY-SIDE build ("Chayxana Master (Yangi)").
;
; Differs from installer.nsh in exactly three ways, all deliberate:
;
; 1. Port 4100, not 4000. The production till holds 4000; two servers cannot
;    bind the same port, and the app now fails loudly rather than hanging if
;    one tries (src/main/index.ts, the httpServer 'error' handler).
;
; 2. NO database-wipe prompt. installer.nsh offers to delete the database on
;    upgrade; a trial install sitting beside a live till must never offer to
;    delete anything. Its own database starts empty anyway — it lives under a
;    different userData directory (see src/main/app-identity.ts), so there is
;    nothing here to clean up on a first install.
;
; 3. APP_PACKAGE_NAME is redefined, right below. electron-builder passes it as
;    package.json `name` with "/" turned into "\" — "@chayxana\master" — and
;    its uninstaller.nsh runs `RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"` when
;    app data is to be removed (nsis.deleteAppDataOnUninstall, or the
;    uninstaller started with --delete-app-data). %APPDATA%\@chayxana\master is
;    the LIVE TILL's database directory: both variants share package.json
;    `name` because it IS the production database path and cannot change.
;    Neither trigger is on (electron-builder.next.js refuses to build if the
;    first one is), but with this override the trial's uninstaller does not
;    know the production path at all — if app data is ever deleted, it is the
;    trial's own userData, the name src/main/app-identity.ts gives it.
;    This file is part of electron-builder's common script header, so the
;    override is in force for the uninstaller build as well as the installer.
;
; What this file does NOT change: which install it upgrades. electron-builder
; looks an old version up under the Uninstall registry key derived from
; appId (com.chayxana.master.next ⇒ its own GUID), so a re-run of this
; installer finds and replaces only a previous "(Yangi)" install. The
; production app sits under com.chayxana.master's key and is never addressed.
; "Failed to uninstall old application files" from this installer therefore
; means the previous TRIAL copy could not be removed — usually because it, or
; something holding its files (the app itself, an Explorer window on its
; folder, an antivirus scan), was still open.
;
; The firewall rule is named after ${PRODUCT_NAME}, which electron-builder
; expands to "Chayxana Master (Yangi)". That matters on uninstall: a rule named
; after the production app would be deleted out from under the till when this
; trial is removed.

!undef APP_PACKAGE_NAME
!define APP_PACKAGE_NAME "chayxana-master-next"

!macro customInstall
  DetailPrint "Adding Windows Firewall rule for ${PRODUCT_NAME} (TCP 4100)..."

  ; Idempotent: drop any rule of the same name from a previous install first.
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME} (TCP 4100)"'
  Pop $0

  ; Inbound on TCP 4100 for this exact .exe, trusted network profiles only.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME} (TCP 4100)" dir=in action=allow protocol=TCP localport=4100 profile=private,domain program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes description="Chayxana POS (yangi versiya, sinov): order va mobil ilovalar shu yerga ulanadi."'
  Pop $0

  ${If} $0 == 0
    DetailPrint "Firewall rule added successfully."
  ${Else}
    DetailPrint "Firewall rule add failed (exit code $0). LAN clients may not reach this build until port 4100 is opened manually."
  ${EndIf}
!macroend

!macro customUnInstall
  DetailPrint "Removing Windows Firewall rule for ${PRODUCT_NAME}..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME} (TCP 4100)"'
  Pop $0
!macroend
