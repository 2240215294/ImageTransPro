Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Path to electron.exe
electronExe = scriptDir & "\node_modules\electron\dist\electron.exe"

' Check if electron.exe exists
If Not fso.FileExists(electronExe) Then
    MsgBox "electron.exe not found! Please run 'npm install' first.", 48, "ImageTrans Pro"
    WScript.Quit 1
End If

' Check if dist is built
If Not fso.FileExists(scriptDir & "\dist\index.html") Then
    ' Try to build
    WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npx vite build", 0, True
End If

' Launch Electron (0 = hidden window, False = don't wait)
WshShell.Run """" & electronExe & """ """ & scriptDir & """", 1, False
