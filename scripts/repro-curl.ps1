$ErrorActionPreference = 'Stop'
$B = 'http://localhost:3000'

$cap = Invoke-RestMethod -Uri "$B/api/auth/captcha" -Method Get
$loginBody = @{ account='admin'; password='admin123'; captchaToken=$cap.data.token; captchaCode=$cap.data.devCode } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$B/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$at = $login.data.token
Write-Host "admin login ok, token=$($at.Substring(0,8))..."

$ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$email = "cc$ts@t.com"
$cap1 = Invoke-RestMethod -Uri "$B/api/auth/captcha" -Method Get
$sndBody = @{ email=$email; scene='register'; captchaToken=$cap1.data.token; captchaCode=$cap1.data.devCode } | ConvertTo-Json
$snd = Invoke-RestMethod -Uri "$B/api/auth/send-email-code" -Method Post -ContentType 'application/json' -Body $sndBody
$cap2 = Invoke-RestMethod -Uri "$B/api/auth/captcha" -Method Get
$regBody = @{ email=$email; code=$snd.data.devCode; password='pass1234'; captchaToken=$cap2.data.token; captchaCode=$cap2.data.devCode } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$B/api/auth/register-email" -Method Post -ContentType 'application/json' -Body $regBody
Write-Host "reg ok uid=$($reg.data.user.id)"

$headers = @{ Authorization = "Bearer $at" }
$r1 = Invoke-RestMethod -Uri "$B/api/admin/stats" -Method Get -Headers $headers
Write-Host "stats ok: code=$($r1.code)"
try {
  $body = @{ name='HH'; username="hh$ts"; password='norm1234'; type='normal' } | ConvertTo-Json
  $r2 = Invoke-RestMethod -Uri "$B/api/admin/branches" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
  Write-Host "create ok: code=$($r2.code) id=$($r2.data.id)"
} catch {
  Write-Host "create FAILED: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Host "body: $($_.ErrorDetails.Message)" }
}
