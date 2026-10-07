# worldviewer のデータを取得し、EA が読むスコアを MT4 の共通フォルダにコピーする。
# タスクスケジューラから定期実行する（登録は register-task.ps1）。手動実行も可:
#   powershell -ExecutionPolicy Bypass -File windows\update.ps1
param(
  # MT4 の共通フォルダ（EA から FILE_COMMON で読める場所）
  [string]$Mt4CommonFiles = (Join-Path $env:APPDATA 'MetaQuotes\Terminal\Common\Files')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repo 'logs'
$log = Join-Path $logDir 'update.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# ログが 1MB を超えたら1世代だけ残して切り替える
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Move-Item -Force $log "$log.1" }
function Write-Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Encoding UTF8 $log }

# 外部コマンドを実行し、出力をログへ。失敗したら例外にする
function Invoke-Step($name, [scriptblock]$cmd) {
  Write-Log "--- $name"
  # git や npm は進捗を標準エラーに出すため、ここでは止めずに終了コードで判定する
  $ErrorActionPreference = 'Continue'
  $out = & $cmd 2>&1
  $out | ForEach-Object { Write-Log "  $_" }
  if ($LASTEXITCODE -ne 0) { throw "$name が失敗しました（終了コード $LASTEXITCODE）" }
}

try {
  Set-Location $repo
  Write-Log '=== 更新開始'

  # GitHub 側の自動更新が金価格の履歴をコミットするので、手元の変更は捨ててから取り込む
  Invoke-Step 'git checkout' { git checkout -- public/data/gold-history.json }
  Invoke-Step 'git pull' { git pull --ff-only }

  # 依存パッケージ: 初回と package-lock.json が変わったときだけ入れ直す
  $lockHash = (Get-FileHash package-lock.json).Hash
  $stamp = Join-Path $repo 'node_modules\.lock-hash'
  if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $lockHash) {
    Invoke-Step 'npm ci' { npm ci --no-audit --no-fund }
    Set-Content -Path $stamp -Value $lockHash
  }

  Invoke-Step 'gold' { node scripts/update-gold.mjs }
  Invoke-Step 'fetch' { node scripts/fetch-data.mjs }

  # EA 用ファイルを MT4 の共通フォルダへ（書きかけを読まれないよう一時名で書いてから置き換える）
  New-Item -ItemType Directory -Force -Path $Mt4CommonFiles | Out-Null
  foreach ($f in 'gold-score.csv', 'score-history.csv') {
    $src = Join-Path $repo "public\data\$f"
    if (Test-Path $src) {
      $tmp = Join-Path $Mt4CommonFiles "$f.tmp"
      Copy-Item -Force $src $tmp
      Move-Item -Force $tmp (Join-Path $Mt4CommonFiles $f)
      Write-Log "copied $f -> $Mt4CommonFiles"
    }
  }
  Write-Log '=== 更新完了'
}
catch {
  Write-Log "!!! エラー: $_"
  exit 1
}
