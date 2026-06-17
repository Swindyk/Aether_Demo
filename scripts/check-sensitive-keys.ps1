param([string]$Path = ".")

$contentPatterns = @(
  'ms-[0-9a-fA-F-]{10,}',
  'tvly-[A-Za-z0-9_-]{20,}',
  'sk-[A-Za-z0-9]{20,}'
)

$apiVarPatterns = @(
  '^[ \t]*AETHER_LLM_API_KEY\s*=\s*(.+)\s*$',
  '^[ \t]*AETHER_MOTA_API_KEY\s*=\s*(.+)\s*$',
  '^[ \t]*AETHER_MODEL_API_KEY\s*=\s*(.+)\s*$',
  '^[ \t]*TAVILY_API_KEY\s*=\s*(.+)\s*$'
)

$excludeDirs = @('.git', 'node_modules', 'dist', 'build')
$allowedExtensions = @('.md', '.mdc', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.yml', '.yaml', '.txt', '.ps1', '.env', '.example')

$sep = [System.IO.Path]::DirectorySeparatorChar

$files = Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $fullPath = $_.FullName
  foreach ($dir in $excludeDirs) {
    if ($fullPath -match [regex]::Escape($sep + $dir + $sep)) { return $false }
  }

  $name = $_.Name
  $ext = $_.Extension
  if ($name -eq '.env' -or $name -like '.env.*') { return $true }
  return $ext -in $allowedExtensions
}

$hits = @()

foreach ($f in $files) {
  $content = Get-Content -Path $f.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  foreach ($pat in $contentPatterns) {
    if ($content -match $pat) {
      $hits += [PSCustomObject]@{ Path = $f.FullName; Pattern = $pat }
      break
    }
  }

  $isEnvFile = $f.Name -eq '.env' -or $f.Name -like '.env.*' -or $f.Extension -ieq '.env.example'
  if ($isEnvFile) {
    foreach ($line in Get-Content -Path $f.FullName -ErrorAction SilentlyContinue) {
      foreach ($apiPat in $apiVarPatterns) {
        if ($line -match $apiPat) {
          $value = $matches[1].Trim()
          if ($value -and -not $value.StartsWith('<')) {
            $hits += [PSCustomObject]@{
              Path = $f.FullName
              Pattern = $apiPat
            }
            break
          }
        }
      }
    }
  }
}

if ($hits.Count -eq 0) {
  Write-Host "No suspicious keys found in " $Path -ForegroundColor Green
  exit 0
}

Write-Host "Sensitive patterns found. Please review and remove secrets before commit." -ForegroundColor Yellow
$hits | Sort-Object Path | Format-Table -AutoSize
exit 1
