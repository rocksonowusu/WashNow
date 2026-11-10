# Creates the local "washnow" database and a MySQL user that only WashNow uses,
# then saves that user's password into api/.env.
#
# It signs in with your MySQL admin account only to run the four statements
# below. It does not read, change or remove any other database or user.
# MySQL itself asks for the admin password; this script never sees it.
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1

param(
    [string]$AdminUser = 'root',
    [string]$MysqlExe = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\api\.env'

if (-not (Test-Path $MysqlExe)) { throw "mysql.exe not found at $MysqlExe. Pass -MysqlExe with the right path." }
if (-not (Test-Path $envFile)) { throw "api/.env not found. Copy api/.env.example to api/.env first." }

# Random 32-character password for the washnow user (letters and digits only).
$chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'.ToCharArray()
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

$sql = @"
CREATE DATABASE IF NOT EXISTS washnow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'washnow'@'localhost' IDENTIFIED BY '$password';
ALTER USER 'washnow'@'localhost' IDENTIFIED BY '$password';
GRANT ALL PRIVILEGES ON washnow.* TO 'washnow'@'localhost';
"@

Write-Host "Signing in to MySQL as '$AdminUser'. Type that account's password when asked."
$sql | & $MysqlExe -u $AdminUser -p --host=127.0.0.1 --port=3306
if ($LASTEXITCODE -ne 0) { throw 'MySQL rejected the sign-in or the statements. Nothing was changed in api/.env.' }

$text = [IO.File]::ReadAllText($envFile)
$text = $text -replace '(?m)^DB_USERNAME=.*$', 'DB_USERNAME=washnow'
$text = $text -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$password"
[IO.File]::WriteAllText($envFile, $text)

Write-Host 'Done. Database "washnow" and user "washnow" are ready, and api/.env has the new password.'
