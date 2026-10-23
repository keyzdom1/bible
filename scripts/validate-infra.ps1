# Validates every Terraform root module without touching AWS: formatting,
# provider download and `terraform validate` for bootstrap + both environments.
#
#   ./scripts/validate-infra.ps1
#
# Requires the terraform CLI (>= 1.6). CI runs the same checks in ci.yml.

$ErrorActionPreference = "Stop"

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  Write-Error "terraform CLI not found. Install it first, e.g.: winget install HashiCorp.Terraform"
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  Write-Host "==> terraform fmt -check -recursive infra"
  terraform fmt -check -recursive infra
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Formatting issues found. Run: terraform fmt -recursive infra"
    exit 1
  }

  $roots = @(
    "infra/bootstrap",
    "infra/environments/dev",
    "infra/environments/prod"
  )

  foreach ($root in $roots) {
    Write-Host "==> $root init (no backend) + validate"
    terraform "-chdir=$root" init -backend=false -input=false | Out-Null
    if ($LASTEXITCODE -ne 0) { exit 1 }
    terraform "-chdir=$root" validate
    if ($LASTEXITCODE -ne 0) { exit 1 }
  }

  Write-Host "All Terraform root modules are valid."
}
finally {
  Pop-Location
}
