' Convenience launcher from the repo root — no terminal window.
Option Explicit

Dim fso, sh, root, desktopVbs
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
desktopVbs = root & "\apps\desktop\start-hidden.vbs"

If Not fso.FileExists(desktopVbs) Then
  MsgBox "Missing apps\desktop\start-hidden.vbs", vbCritical, "Interview Jarvis"
  WScript.Quit 1
End If

sh.Run "wscript.exe //nologo """ & desktopVbs & """", 0, False
