# update.ps1 をタスクスケジューラに登録する（MT4 を動かしているユーザーで実行）。
#   powershell -ExecutionPolicy Bypass -File windows\register-task.ps1            … 60分ごと
#   powershell -ExecutionPolicy Bypass -File windows\register-task.ps1 -Minutes 30
#   powershell -ExecutionPolicy Bypass -File windows\register-task.ps1 -Remove    … 登録解除
param(
  [int]$Minutes = 60,
  [string]$TaskName = 'worldviewer-update',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "タスク $TaskName を削除しました"
  exit 0
}
if ($Minutes -lt 10) { throw 'ニュース取得元への負担を避けるため、間隔は10分以上にしてください' }

$script = Join-Path $PSScriptRoot 'update.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""

# 毎時ちょうどを避けて、登録した時刻から2分後を起点に繰り返す
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
  -RepetitionInterval (New-TimeSpan -Minutes $Minutes)

# 優先度 7 = 「通常以下」。EA（MT4）の処理を常に優先させる
$settings = New-ScheduledTaskSettingsSet -Priority 7 -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'worldviewer: 金相場データの取得と MT4 用スコアの更新' -Force | Out-Null

Write-Host "タスク $TaskName を登録しました（${Minutes}分ごと・優先度は通常以下）"
Write-Host "ログ: $(Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\update.log')"
