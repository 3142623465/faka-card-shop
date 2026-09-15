' 后台启动.vbs - 无黑窗口后台运行发卡网服务（自动定位脚本所在目录，可随项目整体移动）
' 双击即可启动，服务在后台运行，不显示命令行窗口
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set ws = CreateObject("WScript.Shell")
ws.CurrentDirectory = baseDir
ws.Run "node server/server.js", 0, False
