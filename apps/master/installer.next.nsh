; Custom NSIS hooks for the SIDE-BY-SIDE build ("Chayxana Master (Yangi)").
;
; Differs from installer.nsh in exactly two ways, both deliberate:
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
; The firewall rule is named after ${PRODUCT_NAME}, which electron-builder
; expands to "Chayxana Master (Yangi)". That matters on uninstall: a rule named
; after the production app would be deleted out from under the till when this
; trial is removed.

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
