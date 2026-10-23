Add-Type -AssemblyName System.Drawing

function New-RoundedPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $arc = New-Object System.Drawing.RectangleF($rect.X, $rect.Y, $diameter, $diameter)
  $path.AddArc($arc, 180, 90)
  $arc.X = $rect.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $rect.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $rect.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-HolyWordIcon([string]$Path, [int]$Size, [bool]$Maskable = $false) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(8, 27, 58))

  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(8, 27, 58),
    [System.Drawing.Color]::FromArgb(18, 59, 143),
    45
  )
  $graphics.FillRectangle($background, $rect)
  $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 184, 217))
  $graphics.FillEllipse($glow, [int]($Size * 0.55), [int]($Size * -0.12), [int]($Size * 0.7), [int]($Size * 0.7))

  $scale = if ($Maskable) { 0.64 } else { 0.78 }
  $panelSize = [int]($Size * $scale)
  $panelX = [int](($Size - $panelSize) / 2)
  $panelY = [int](($Size - $panelSize) / 2)
  $panelRect = New-Object System.Drawing.RectangleF($panelX, $panelY, $panelSize, $panelSize)
  $panelPath = New-RoundedPath $panelRect ([float]($panelSize * 0.2))
  $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(232, 255, 255, 255))
  $graphics.FillPath($panelBrush, $panelPath)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(244, 185, 66), [float]($Size * 0.012))
  $graphics.DrawPath($pen, $panelPath)

  $fontSize = [float]($Size * 0.28)
  $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 59, 143))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF($panelX, $panelY, $panelSize, $panelSize)
  $graphics.DrawString("HW", $font, $textBrush, $textRect, $format)

  $crossPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(201, 24, 43), [float]($Size * 0.014))
  $cx = [float]($panelX + $panelSize * 0.145)
  $cy = [float]($panelY + $panelSize * 0.14)
  $graphics.DrawLine($crossPen, $cx, $cy, [float]($cx + $panelSize * 0.18), $cy)
  $graphics.DrawLine($crossPen, [float]($cx + $panelSize * 0.09), $cy - [float]($panelSize * 0.09), [float]($cx + $panelSize * 0.09), $cy + [float]($panelSize * 0.09))

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$webIcons = Join-Path $PSScriptRoot "..\public\icons"
$mobileAssets = Join-Path $PSScriptRoot "..\..\mobile\assets"
New-Item -ItemType Directory -Force -Path $webIcons | Out-Null
New-Item -ItemType Directory -Force -Path $mobileAssets | Out-Null

New-HolyWordIcon (Join-Path $webIcons "icon-192.png") 192
New-HolyWordIcon (Join-Path $webIcons "icon-512.png") 512
New-HolyWordIcon (Join-Path $webIcons "maskable-512.png") 512 $true
New-HolyWordIcon (Join-Path $webIcons "apple-touch-icon.png") 180
New-HolyWordIcon (Join-Path $webIcons "favicon-32.png") 32
New-HolyWordIcon (Join-Path $webIcons "favicon-16.png") 16
New-HolyWordIcon (Join-Path $PSScriptRoot "..\src\app\icon.png") 512
New-HolyWordIcon (Join-Path $mobileAssets "icon.png") 1024
New-HolyWordIcon (Join-Path $mobileAssets "adaptive-icon.png") 1024 $true
New-HolyWordIcon (Join-Path $mobileAssets "splash-icon.png") 512
New-HolyWordIcon (Join-Path $mobileAssets "favicon.png") 48

Write-Output "Generated HolyWord icons."
