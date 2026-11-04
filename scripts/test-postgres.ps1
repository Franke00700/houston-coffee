param(
  [ValidateSet("init", "start", "stop", "reset", "migrate", "seed", "test", "backup", "restore", "verify-restore", "all")]
  [string]$Action = "all"
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ToolsRoot = Join-Path $ProjectRoot ".tools"
$ArtifactRoot = Join-Path $ProjectRoot "artifacts\test-db"
$StateRoot = if ($env:HOUSTON_TEST_STATE_ROOT) { $env:HOUSTON_TEST_STATE_ROOT } else { $ArtifactRoot }
$DataRoot = Join-Path $StateRoot "primary"
$LogFile = Join-Path $StateRoot "postgres.log"
$BackupDir = Join-Path $ArtifactRoot "backup"
$BackupFile = Join-Path $BackupDir "houston_backend_test.dump"
$Port = 55432
$Owner = "houston_owner"
$Database = "houston_backend_test"
$RestoreDatabase = "houston_backend_restore_test"
$Password = if ($env:HOUSTON_TEST_DB_PASSWORD) { $env:HOUSTON_TEST_DB_PASSWORD } else { "local-test-db-only" }
$TestPassword = if ($env:HOUSTON_TEST_PASSWORD) { $env:HOUSTON_TEST_PASSWORD } else { "Test-only-password-2026" }
$DatabaseUrl = "postgresql://${Owner}:${Password}@127.0.0.1:${Port}/${Database}"

function Resolve-PgBin {
  $Candidates = @()
  if ($env:HOUSTON_PG_BIN) { $Candidates += $env:HOUSTON_PG_BIN }
  $Candidates += @(
    (Join-Path $ToolsRoot "postgresql\bin"),
    (Join-Path $ToolsRoot "pgsql\bin"),
    (Join-Path $ProjectRoot ".test\postgresql\bin"),
    (Join-Path $ProjectRoot ".test\postgresql\pgsql\bin")
  )
  $Candidates += Get-ChildItem $ToolsRoot -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "bin" }
  foreach ($Candidate in $Candidates) {
    if (Test-Path (Join-Path $Candidate "postgres.exe")) { return $Candidate }
  }
  $PortableRoot = Join-Path $ProjectRoot ".test\postgresql"
  $Discovered = Get-ChildItem $PortableRoot -Recurse -Filter "postgres.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($Discovered) { return $Discovered.DirectoryName }
  throw "Portable PostgreSQL binaries not found. Extract the official binaries so postgres.exe is under .tools\postgresql\bin or .tools\pgsql\bin."
}

$PgBin = Resolve-PgBin
$InitDb = Join-Path $PgBin "initdb.exe"
$PgCtl = Join-Path $PgBin "pg_ctl.exe"
$PgIsReady = Join-Path $PgBin "pg_isready.exe"
$Createdb = Join-Path $PgBin "createdb.exe"
$Dropdb = Join-Path $PgBin "dropdb.exe"
$Psql = Join-Path $PgBin "psql.exe"
$PgDump = Join-Path $PgBin "pg_dump.exe"
$PgRestore = Join-Path $PgBin "pg_restore.exe"
$env:PGPASSWORD = $Password
$env:PGCLIENTENCODING = "UTF8"

function Initialize-Cluster {
  New-Item -ItemType Directory -Force -Path $StateRoot, $BackupDir | Out-Null
  if (Test-Path (Join-Path $DataRoot "PG_VERSION")) { return }
  New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
  $env:TEMP = $StateRoot
  $env:TMP = $StateRoot
  $PasswordFile = Join-Path $StateRoot ("houston-pg-" + [guid]::NewGuid().ToString("N") + ".txt")
  try {
    Set-Content -LiteralPath $PasswordFile -Value $Password -NoNewline
    & $InitDb -D $DataRoot -U $Owner --pwfile=$PasswordFile --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --no-locale
    if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }
  } finally {
    Remove-Item -LiteralPath $PasswordFile -Force -ErrorAction SilentlyContinue
  }
}

function Test-ServerReady {
  & $PgIsReady -h 127.0.0.1 -p $Port -U $Owner -d postgres *> $null
  return $LASTEXITCODE -eq 0
}

function Start-Server {
  Initialize-Cluster
  if (Test-ServerReady) { return }
  & $PgCtl -D $DataRoot -l $LogFile -o "-p $Port -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0 -or -not (Test-ServerReady)) { throw "PostgreSQL did not become ready; inspect $LogFile" }
}

function Stop-Server {
  if (-not (Test-Path (Join-Path $DataRoot "PG_VERSION"))) { return }
  if (Test-ServerReady) {
    & $PgCtl -D $DataRoot -w -m fast stop
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl stop failed with exit code $LASTEXITCODE" }
  }
}

function Reset-Database {
  Start-Server
  & $Dropdb -h 127.0.0.1 -p $Port -U $Owner --if-exists $Database
  if ($LASTEXITCODE -ne 0) { throw "dropdb failed with exit code $LASTEXITCODE" }
  & $Createdb -h 127.0.0.1 -p $Port -U $Owner $Database
  if ($LASTEXITCODE -ne 0) { throw "createdb failed with exit code $LASTEXITCODE" }
}

function Invoke-Migrations {
  $env:DATABASE_URL = $DatabaseUrl
  $env:DIRECT_URL = $DatabaseUrl
  Push-Location $ProjectRoot
  try { & pnpm db:generate; if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }; & pnpm db:migrate; if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" } }
  finally { Pop-Location }
}

function Invoke-TestSeed {
  $env:DATABASE_URL = $DatabaseUrl
  $env:DIRECT_URL = $DatabaseUrl
  $env:HOUSTON_TEST_PASSWORD = $TestPassword
  $env:BUSINESS_TIME_ZONE = "Europe/Moscow"
  Push-Location $ProjectRoot
  try { & pnpm db:seed:test; if ($LASTEXITCODE -ne 0) { throw "test seed failed" } }
  finally { Pop-Location }
}

function Invoke-IntegrationTest {
  $env:DATABASE_URL = $DatabaseUrl
  $env:DIRECT_URL = $DatabaseUrl
  $env:BUSINESS_TIME_ZONE = "Europe/Moscow"
  Push-Location $ProjectRoot
  try { & pnpm test:db; if ($LASTEXITCODE -ne 0) { throw "database integration test failed" } }
  finally { Pop-Location }
}

function Backup-TestDatabase {
  Start-Server
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  & $PgDump -h 127.0.0.1 -p $Port -U $Owner --format=custom --no-owner --file=$BackupFile $Database
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $BackupFile)) { throw "pg_dump failed" }
}

function Restore-TestDatabase {
  Start-Server
  if (-not (Test-Path $BackupFile)) { throw "Backup not found: $BackupFile" }
  & $Dropdb -h 127.0.0.1 -p $Port -U $Owner --if-exists $RestoreDatabase
  if ($LASTEXITCODE -ne 0) { throw "drop restore database failed" }
  & $Createdb -h 127.0.0.1 -p $Port -U $Owner $RestoreDatabase
  if ($LASTEXITCODE -ne 0) { throw "create restore database failed" }
  & $PgRestore -h 127.0.0.1 -p $Port -U $Owner --no-owner --exit-on-error --dbname=$RestoreDatabase $BackupFile
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }
}

function Verify-Restore {
  $Sql = @"
SELECT json_build_object(
  'products', (SELECT count(*) FROM "Product"),
  'orders', (SELECT count(*) FROM "Order"),
  'staff', (SELECT count(*) FROM "StaffUser"),
  'settings', (SELECT count(*) FROM "SiteSettings"),
  'audit', (SELECT count(*) FROM "AuditEvent")
)::text;
"@
  $Result = & $Psql -h 127.0.0.1 -p $Port -U $Owner -d $RestoreDatabase -v ON_ERROR_STOP=1 -Atc $Sql
  if ($LASTEXITCODE -ne 0) { throw "restore verification query failed" }
  $Counts = $Result | ConvertFrom-Json
  foreach ($Name in @("products", "orders", "staff", "settings", "audit")) {
    if ([int]$Counts.$Name -lt 1) { throw "restore verification failed: $Name is empty" }
  }
  $Result
}

switch ($Action) {
  "init" { Initialize-Cluster }
  "start" { Start-Server }
  "stop" { Stop-Server }
  "reset" { Reset-Database }
  "migrate" { Start-Server; Invoke-Migrations }
  "seed" { Start-Server; Invoke-TestSeed }
  "test" { Start-Server; Invoke-IntegrationTest }
  "backup" { Backup-TestDatabase }
  "restore" { Restore-TestDatabase }
  "verify-restore" { Start-Server; Verify-Restore }
  "all" {
    Start-Server
    Reset-Database
    Invoke-Migrations
    Invoke-TestSeed
    Invoke-IntegrationTest
    Backup-TestDatabase
    Restore-TestDatabase
    Verify-Restore
  }
}

Write-Host "Houston PostgreSQL test action '$Action' completed."
