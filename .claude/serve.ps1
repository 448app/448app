$ErrorActionPreference = 'Stop'
$root = 'C:\aia\448app'
$port = 3000

Add-Type -AssemblyName System.Net.Http
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.svg'='image/svg+xml';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8';
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $rel = $req.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    $full = Join-Path $root $rel
    try {
      if (Test-Path $full -PathType Leaf) {
        $ext  = [System.IO.Path]::GetExtension($full).ToLower()
        $ct   = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentType   = $ct
        $res.ContentLength64 = $bytes.Length
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "200 GET $rel ($($bytes.Length) bytes)"
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
        $res.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "404 GET $rel"
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
      Write-Host "500 ERROR: $_"
    } finally {
      # เบราว์เซอร์อาจตัดการเชื่อมต่อก่อน (ERR_CONNECTION_RESET) → Close() โยน HttpListenerException
      # ห้ามให้ล้มทั้งเซิร์ฟเวอร์ (เดิม $ErrorActionPreference = 'Stop' ทำให้สคริปต์จบด้วย exit 1)
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
