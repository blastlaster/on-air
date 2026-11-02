; After an update, the installer starts On Air itself, as soon as the new files are in.
; electron-builder's own restart (through the Start-menu shortcut, by Explorer) has quietly
; not happened on some PCs. If both happen, the second start just shows the first one.
!macro customInstall
  ${if} ${isUpdated}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --updated'
  ${endIf}
!macroend
