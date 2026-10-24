param([string]$Base = "http://127.0.0.1:8765/", [string]$Out = "C:\New folder\DiscoverCanada\work\shots", [string]$Only = "")
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
New-Item -ItemType Directory -Force $Out | Out-Null
$routes = @(
  @{ n = 'home'; r = '/' },
  @{ n = 'learn'; r = '/learn' },
  @{ n = 'chapter-govern'; r = '/learn/govern/1' },
  @{ n = 'chapter-rights'; r = '/learn/rights/0' },
  @{ n = 'cards'; r = '/cards' },
  @{ n = 'cards-session'; r = '/cards/govern' },
  @{ n = 'quiz'; r = '/quiz' },
  @{ n = 'quiz-chapter'; r = '/quiz/justice' },
  @{ n = 'mock'; r = '/quiz/mock' },
  @{ n = 'official'; r = '/quiz/official' },
  @{ n = 'book'; r = '/book/29' },
  @{ n = 'settings'; r = '/settings' },
  @{ n = 'resources'; r = '/resources' }
)
if ($Only) { $routes = $routes | Where-Object { $_.n -like $Only } }
foreach ($rt in $routes) {
  # phone: 390x844 via iframe harness (headless Chrome enforces a 500px minimum window width)
  $file = Join-Path $Out ("{0}-phone.png" -f $rt.n)
  $url = $Base + "_phone.html?" + [uri]::EscapeDataString($rt.r)
  & $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$env:TEMP\dc-chrome-phone" --window-size=390,844 --virtual-time-budget=5000 --screenshot="$file" $url 2>$null | Out-Null
  $file = Join-Path $Out ("{0}-desktop.png" -f $rt.n)
  & $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$env:TEMP\dc-chrome-desktop" --window-size=1280,900 --virtual-time-budget=5000 --screenshot="$file" ($Base + '#' + $rt.r) 2>$null | Out-Null
}
Get-ChildItem $Out | Select-Object Name, Length
