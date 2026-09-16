' Launch Jarvis with no console window (double-click this file).
' npm start always opens a terminal; this starts Electron.exe directly.
Option Explicit

Dim fso, sh, appDir, electronExe, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
electronExe = appDir & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(electronExe) Then
  MsgBox "Electron is not installed yet." & vbCrLf & vbCrLf & _
    "Open a terminal in apps\desktop and run:" & vbCrLf & "  npm install", _
    vbCritical, "Interview Jarvis"
  WScript.Quit 1
End If

sh.CurrentDirectory = appDir
' Window style 0 = hidden — no cmd/PowerShell window
cmd = """" & electronExe & """ ."
sh.Run cmd, 0, False
