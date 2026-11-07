# 编译 mc-companion 的 Fabric mod
#
# JDK 优先级：PCL 自带的 17（%APPDATA%\.minecraft\runtime\java-runtime-gamma*）→ 环境变量 JAVA_HOME
# 产物：build\libs\mc-companion-<version>.jar
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Find-Jdk17 {
    $candidates = @(
        (Join-Path $env:APPDATA '.minecraft\runtime\java-runtime-gamma-snapshot'),
        (Join-Path $env:APPDATA '.minecraft\runtime\java-runtime-gamma'),
        $env:JAVA_HOME
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c 'bin\javac.exe'))) { return $c }
    }
    throw '找不到带 javac 的 JDK 17。装一个，或设置 JAVA_HOME。'
}

$jdk = Find-Jdk17
Write-Host "JDK: $jdk"

$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
$env:GRADLE_USER_HOME = Join-Path $here '.gradle-home'

$gradle = Join-Path $here 'gradle-8.7\bin\gradle.bat'
if (-not (Test-Path $gradle)) {
    throw "找不到 $gradle —— 首次构建需要 Gradle 8.7（解压到本目录即可）"
}

& $gradle build --no-daemon --console=plain @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$jar = Get-ChildItem (Join-Path $here 'build\libs') -Filter '*.jar' |
    Where-Object { $_.Name -notmatch 'sources' } | Select-Object -First 1
if ($jar) {
    $dest = Join-Path (Split-Path $here -Parent) 'dist'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $jar.FullName $dest -Force
    "产物: $($jar.Name)  $([math]::Round($jar.Length/1KB)) KB  → 已复制到 dist\"
}
