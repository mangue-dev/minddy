[CmdletBinding()]
param(
  [switch]$InstallStore,
  [string]$StoreDirectory
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$resolvedStoreDirectory = if ([string]::IsNullOrWhiteSpace($StoreDirectory)) {
  Join-Path $root "desktop/release/windows-store"
} else {
  $StoreDirectory
}
$identityName = $env:MINDDY_WINDOWS_STORE_IDENTITY_NAME
$publisher = $env:MINDDY_WINDOWS_STORE_PUBLISHER
$wnsAppId = $env:MINDDY_WINDOWS_WNS_APP_ID
$wnsEnabled = -not [string]::IsNullOrWhiteSpace($wnsAppId)
$temporaryDirectory = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }

if ([string]::IsNullOrWhiteSpace($identityName) -or [string]::IsNullOrWhiteSpace($publisher)) {
  throw "MINDDY_WINDOWS_STORE_IDENTITY_NAME and MINDDY_WINDOWS_STORE_PUBLISHER are required."
}

$msixPackages = @(Get-ChildItem $resolvedStoreDirectory -Filter "*.msix")
if ($msixPackages.Count -ne 2) {
  throw "Expected exactly two Store MSIX packages, found $($msixPackages.Count)."
}
foreach ($architecture in @("x64", "arm64")) {
  if (-not ($msixPackages.Name -match "-windows-$architecture-store\.msix$")) {
    throw "The $architecture Store MSIX package is missing."
  }
}

$makeAppx = Get-Command makeappx.exe -ErrorAction SilentlyContinue
if (-not $makeAppx) {
  $makeAppx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Filter makeappx.exe -Recurse |
    Sort-Object FullName -Descending |
    Select-Object -First 1
}
if (-not $makeAppx) {
  throw "makeappx.exe was not found. Install the Windows SDK."
}
$makeAppxPath = if ($makeAppx.Source) { $makeAppx.Source } else { $makeAppx.FullName }

foreach ($package in $msixPackages) {
  $unpackDirectory = Join-Path $temporaryDirectory "minddy-msix-$($package.BaseName)"
  Remove-Item $unpackDirectory -Recurse -Force -ErrorAction SilentlyContinue
  & $makeAppxPath unpack /p $package.FullName /d $unpackDirectory /o | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "makeappx could not unpack $($package.Name)." }

  [xml]$appxManifest = Get-Content -Raw (Join-Path $unpackDirectory "AppxManifest.xml")
  $namespace = New-Object System.Xml.XmlNamespaceManager($appxManifest.NameTable)
  $namespace.AddNamespace("f", "http://schemas.microsoft.com/appx/manifest/foundation/windows10")
  $namespace.AddNamespace("uap", "http://schemas.microsoft.com/appx/manifest/uap/windows10")
  $namespace.AddNamespace("com", "http://schemas.microsoft.com/appx/manifest/com/windows10")
  $namespace.AddNamespace("rescap", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities")
  $identity = $appxManifest.SelectSingleNode("/f:Package/f:Identity", $namespace)
  if ($identity.Name -ne $identityName -or $identity.Publisher -ne $publisher) {
    throw "$($package.Name) does not carry the configured Partner Center identity."
  }
  if (-not $appxManifest.SelectSingleNode("//uap:Protocol[@Name='minddy']", $namespace)) {
    throw "$($package.Name) does not register the minddy protocol."
  }
  if (-not $appxManifest.SelectSingleNode("//rescap:Capability[@Name='runFullTrust']", $namespace)) {
    throw "$($package.Name) does not declare runFullTrust."
  }
  $storeUpdateHelper = Join-Path $unpackDirectory "resources/store-update/minddy-store-update.exe"
  if (-not (Test-Path $storeUpdateHelper)) {
    throw "$($package.Name) does not contain the Microsoft Store update helper."
  }
  $pushClass = $appxManifest.SelectSingleNode("//com:Extension[@Category='windows.comServer']//com:Class", $namespace)
  $pushHelper = Join-Path $unpackDirectory "resources/wns/minddy-wns.exe"
  if ($wnsEnabled) {
    if (-not $pushClass -or $pushClass.Id -ne $wnsAppId) {
      throw "$($package.Name) does not register the configured WNS COM activator."
    }
    if (-not (Test-Path $pushHelper)) {
      throw "$($package.Name) does not contain the WNS native helper."
    }
  } elseif ($pushClass -or (Test-Path $pushHelper)) {
    throw "$($package.Name) contains WNS components although WNS is not configured."
  }
}

if ($InstallStore) {
  $x64Package = $msixPackages | Where-Object Name -Match "-windows-x64-store\.msix$" | Select-Object -First 1
  Add-AppxPackage $x64Package.FullName
  $installed = Get-AppxPackage -Name $identityName
  if (-not $installed) { throw "The Store test package was not installed." }
  Start-Process "minddy://open?next=%2F"
  Start-Sleep -Seconds 5
  if (-not (Get-Process minddy -ErrorAction SilentlyContinue)) {
    throw "The installed Store package did not launch from minddy://."
  }
  Get-Process minddy -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-AppxPackage -Package $installed.PackageFullName
  if (Get-AppxPackage -Name $identityName) { throw "The Store test package remains after uninstall." }
}

Write-Host "Windows Store artifacts passed validation."
