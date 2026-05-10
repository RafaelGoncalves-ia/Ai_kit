Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

rootPath = fso.GetParentFolderName(WScript.ScriptFullName)
electronPath = rootPath & "\kit-app\node_modules\electron\dist\electron.exe"
appPath = rootPath & "\kit-app"

If Not fso.FileExists(electronPath) Then
  MsgBox "Electron nao encontrado em:" & vbCrLf & electronPath, 16, "KIT IA"
  WScript.Quit 1
End If

On Error Resume Next
shell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
shell.Environment("USER").Remove "ELECTRON_RUN_AS_NODE"
shell.Environment("SYSTEM").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
shell.Run """" & electronPath & """ """ & appPath & """", 0, False
