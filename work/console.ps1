param([string]$Url = "http://127.0.0.1:8765/#/")
# Dump DOM + console errors through Chrome's logging (stderr) for a quick JS-error check.
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $env:TEMP "dc-chrome-log"
$log = Join-Path $env:TEMP "dc-chrome-log.txt"
if (Test-Path $log) { Remove-Item $log -Force }
& $chrome --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" --enable-logging=stderr --v=0 --virtual-time-budget=4000 --dump-dom $Url 2> $log | Select-String -Pattern '<main' -Context 0, 3 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(600, $_.Line.Length)) }
Write-Output "---- console lines mentioning error/uncaught ----"
Get-Content $log | Select-String -Pattern 'CONSOLE|Uncaught|error' -CaseSensitive:$false | Select-Object -First 20
