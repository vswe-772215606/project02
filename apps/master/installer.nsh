; Custom NSIS hooks run by electron-builder during install/uninstall.
;
; Adds a Windows Firewall inbound rule so the order desktop app and the
; mobile waiter app can reach the master's HTTP+WS server (port 4000)
; without the user having to manually open the port via PowerShell.
;
; The rule is scoped to Private and Domain network profiles (i.e. trusted
; LANs) and bound to the master executable path, so it doesn't open the
; port for any other process.

!macro customInstall
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
