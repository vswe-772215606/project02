; Custom NSIS hooks run by electron-builder during install/uninstall.
;
; 1. Adds a Windows Firewall inbound rule so the order desktop app and the
;    mobile waiter app can reach the master's HTTP+WS server (port 4000)
;    without the user having to manually open the port via PowerShell.
;    The rule is scoped to Private and Domain network profiles (i.e.
;    trusted LANs) and bound to the master executable path.
;
; 2. Offers to wipe the existing database when an old install is detected.
;    The chayxana-master Electron app stores its SQLite database under
;    %APPDATA%\Chayxana Master\data\master.sqlite via app.getPath('userData').
;    On a clean-slate redeploy the operator might want to start fresh
;    (e.g. setting up at a new location, or recovering from corruption).
;    Since admins are already going through UAC at this point, just ask
;    once via a MessageBox — opt-in, default "No" so an accidental Enter
;    doesn't destroy a working database.

!macro customInstall
  ; ─── Database cleanup prompt ────────────────────────────────────────
  ; Only ask if a db file actually exists; first installs skip the prompt.
  StrCpy $0 "$APPDATA\${PRODUCT_NAME}\data\master.sqlite"
  ${If} ${FileExists} "$0"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Eski Chayxana Master ma'lumotlar bazasi topildi:$\r$\n$0$\r$\n$\r$\nBarcha buyurtmalar, chiqimlar, mahsulot va retseptlar o'chirilsinmi?$\r$\n$\r$\nDIQQAT: bu amalni qaytarib bo'lmaydi. Tozalashdan oldin zaxira nusxa olishni tavsiya qilamiz." \
      /SD IDNO \
      IDNO skip_db_wipe
    DetailPrint "Wiping existing master database at $0..."
    Delete "$0"
    Delete "$0-journal"
    Delete "$0-shm"
    Delete "$0-wal"
    ; Also clear the file logs from previous sessions so support diagnostics
    ; start fresh — these are large and confusing after a wipe.
    Delete "$APPDATA\${PRODUCT_NAME}\*.log"
    ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\data\master.sqlite"
      DetailPrint "Database wipe FAILED. App may be running."
    ${Else}
      DetailPrint "Database wiped successfully — app will seed a fresh schema on next launch."
    ${EndIf}
    skip_db_wipe:
  ${EndIf}

  ; ─── Windows Firewall rule ──────────────────────────────────────────
  DetailPrint "Adding Windows Firewall rule for Chayxana Master (TCP 4000)..."

  ; Remove any pre-existing rule with the same name so the install is idempotent
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Chayxana Master (TCP 4000)"'
  Pop $0

  ; Inbound rule on TCP 4000 for this exact .exe, Private+Domain profiles only
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Chayxana Master (TCP 4000)" dir=in action=allow protocol=TCP localport=4000 profile=private,domain program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes description="Chayxana POS: order and mobile apps on the LAN talk to master here."'
  Pop $0

  ${If} $0 == 0
    DetailPrint "Firewall rule added successfully."
  ${Else}
    DetailPrint "Firewall rule add failed (exit code $0). LAN clients may not reach master until the port is opened manually."
  ${EndIf}
!macroend

!macro customUnInstall
  DetailPrint "Removing Windows Firewall rule for Chayxana Master..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Chayxana Master (TCP 4000)"'
  Pop $0
!macroend
