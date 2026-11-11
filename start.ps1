$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node backend/server.mjs
