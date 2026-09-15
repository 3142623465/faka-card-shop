' 后台启动.vbs - 无黑窗口后台运行发卡网服务
' 双击即可启动，服务在后台运行，不显示命令行窗口
Set ws = CreateObject("WScript.Shell")
ws.CurrentDirectory = "D:\faka"
ws.Run "node server/server.js", 0, False
