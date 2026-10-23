[CmdletBinding()]
param(
  [string]$SuperUser = "postgres",
  [string]$Database = "holyword",
  [string]$Username = "holyword",
  [string]$Password = "holyword"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql was not found. Install PostgreSQL 16 and add its bin folder to PATH."
}

Write-Host "Checking PostgreSQL role '$Username'..."
$role = & psql -U $SuperUser -tAc "SELECT 1 FROM pg_roles WHERE rolname='$Username'"
if ($LASTEXITCODE -ne 0) { throw "Could not connect to PostgreSQL as '$SuperUser'." }

if ($role.Trim() -ne "1") {
  Write-Host "Creating role '$Username'..."
  & psql -U $SuperUser -v ON_ERROR_STOP=1 -c "CREATE ROLE $Username LOGIN PASSWORD '$Password';"
  if ($LASTEXITCODE -ne 0) { throw "Failed to create role '$Username'." }
}

Write-Host "Checking database '$Database'..."
$database = & psql -U $SuperUser -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
if ($database.Trim() -ne "1") {
  Write-Host "Creating database '$Database'..."
  & psql -U $SuperUser -v ON_ERROR_STOP=1 -c "CREATE DATABASE $Database OWNER $Username;"
  if ($LASTEXITCODE -ne 0) { throw "Failed to create database '$Database'." }
}

Write-Host ""
Write-Host "Database ready."
Write-Host "DATABASE_URL=postgres://$Username`:$Password@localhost:5432/$Database"
