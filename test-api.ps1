$ErrorActionPreference = 'Stop'
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/containers' -TimeoutSec 5 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content.Substring(0, [Math]::Min(300, $resp.Content.Length)))"
} catch {
    Write-Host "Error: $_"
}
