param(
    [string]$OutFile = "data\qq-notifications.jsonl",
    [string]$OutDir = "",
    [int]$IntervalSeconds = 2,
    [string[]]$AppNames = @("QQ", "QQNT"),
    [switch]$Once,
    [switch]$RequestAccess
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$collectorMutex = [System.Threading.Mutex]::new($false, "Local\QQGetNotificationCollector")
$collectorMutexAcquired = $collectorMutex.WaitOne(0)
if (-not $collectorMutexAcquired) {
    [Console]::Error.WriteLine("Another QQ notification collector is already running.")
    exit 2
}

trap {
    if ($collectorMutexAcquired) {
        $collectorMutex.ReleaseMutex()
        $collectorMutex.Dispose()
    }
    break
}

function Await-WinRtOperation {
    param(
        [Parameter(Mandatory = $true)] $Operation,
        [Parameter(Mandatory = $true)] [Type] $ResultType
    )

    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" `
                -and $_.IsGenericMethodDefinition `
                -and $_.GetParameters().Count -eq 1 `
                -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
        } |
        Select-Object -First 1

    if (-not $method) {
        throw "Could not find WindowsRuntime AsTask<T> helper."
    }

    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Parse-QQNotificationText {
    param([string]$Text)

    $groupName = $null
    $senderName = $null
    $content = $Text

    $parts = $Text -split "\s+\|\s+", 2
    if ($parts.Count -eq 2) {
        $groupName = $parts[0].Trim()
        $content = $parts[1].Trim()
    }

    $senderParts = $content -split "[：:]", 2
    if ($senderParts.Count -eq 2) {
        $senderName = $senderParts[0].Trim()
        $content = $senderParts[1].Trim()
    }

    return [pscustomobject]@{
        groupName  = $groupName
        senderName = $senderName
        content    = $content
    }
}

function Get-ToastText {
    param($UserNotification)

    $binding = $UserNotification.Notification.Visual.GetBinding(
        [Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime]::ToastGeneric
    )

    $texts = @()
    if ($binding) {
        foreach ($textElement in $binding.GetTextElements()) {
            if (-not [string]::IsNullOrWhiteSpace($textElement.Text)) {
                $texts += $textElement.Text.Trim()
            }
        }
    }

    return ($texts -join " | ")
}

function Get-QQNotifications {
    param([string[]]$AllowedAppNames)

    $listener = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]::Current
    $userNotificationType = [Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $listType = [System.Collections.Generic.IReadOnlyList``1].MakeGenericType($userNotificationType)
    $kind = [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime]::Toast

    $notifications = Await-WinRtOperation -Operation ($listener.GetNotificationsAsync($kind)) -ResultType $listType
    $rows = @()

    foreach ($notification in $notifications) {
        $appName = $notification.AppInfo.DisplayInfo.DisplayName
        if ($AllowedAppNames -notcontains $appName) {
            continue
        }

        $rawText = Get-ToastText -UserNotification $notification
        if ([string]::IsNullOrWhiteSpace($rawText)) {
            continue
        }

        $parsed = Parse-QQNotificationText -Text $rawText
        $rows += [pscustomobject]@{
            id             = "$appName-$($notification.Id)-$($notification.CreationTime.ToUniversalTime().ToString("o"))"
            notificationId = $notification.Id
            app            = $appName
            appUserModelId = $notification.AppInfo.AppUserModelId
            receivedAt     = $notification.CreationTime.ToString("o")
            groupName      = $parsed.groupName
            senderName     = $parsed.senderName
            content        = $parsed.content
            rawText        = $rawText
        }
    }

    return $rows
}

function Get-OutputFile {
    if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
        $date = Get-Date -Format "yyyy-MM-dd"
        return Join-Path $OutDir "qq-notifications-$date.jsonl"
    }

    return $OutFile
}

function Ensure-OutputFile {
    param([string]$Path)

    $dir = Split-Path -Parent $Path
    if ($dir) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

function Load-SeenIds {
    param([string]$Path)

    $ids = [System.Collections.Generic.HashSet[string]]::new()
    if (Test-Path $Path) {
        Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $existing = $_ | ConvertFrom-Json
                if ($existing.id) {
                    [void]$ids.Add([string]$existing.id)
                }
            } catch {
                # Ignore malformed legacy lines.
            }
        }
    }

    return ,$ids
}

function Add-JsonLine {
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$Line
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Line + [Environment]::NewLine)
    $maxAttempts = 8

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        $stream = $null
        try {
            $stream = [System.IO.FileStream]::new(
                $Path,
                [System.IO.FileMode]::Append,
                [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::ReadWrite
            )
            $stream.Write($bytes, 0, $bytes.Length)
            return
        } catch {
            if ($attempt -eq $maxAttempts) {
                throw
            }

            Start-Sleep -Milliseconds (80 * $attempt)
        } finally {
            if ($stream) {
                $stream.Dispose()
            }
        }
    }
}

$listener = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]::Current

if ($RequestAccess) {
    $accessType = [Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $status = Await-WinRtOperation -Operation ($listener.RequestAccessAsync()) -ResultType $accessType
    Write-Host "Notification access: $status"
}

$accessStatus = $listener.GetAccessStatus()
if ($accessStatus.ToString() -ne "Allowed") {
    Write-Error "Notification access is $accessStatus. Re-run with -RequestAccess, then approve notification access in Windows."
    exit 1
}

$currentOutFile = Get-OutputFile
Ensure-OutputFile -Path $currentOutFile
$seen = Load-SeenIds -Path $currentOutFile

Write-Host "Listening for QQ notifications. Output: $currentOutFile"
Write-Host "Apps: $($AppNames -join ', ')"

do {
    $nextOutFile = Get-OutputFile
    if ($nextOutFile -ne $currentOutFile) {
        $currentOutFile = $nextOutFile
        Ensure-OutputFile -Path $currentOutFile
        $seen = Load-SeenIds -Path $currentOutFile
        Write-Host "Rotated output: $currentOutFile"
    }

    $rows = Get-QQNotifications -AllowedAppNames $AppNames
    $newCount = 0

    foreach ($row in $rows) {
        if ($seen.Add([string]$row.id)) {
            $json = $row | ConvertTo-Json -Depth 8 -Compress
            Add-JsonLine -Path $currentOutFile -Line $json
            $newCount++
            Write-Host "Captured: $($row.rawText)"
        }
    }

    if ($Once) {
        Write-Host "Found $newCount new notification(s)."
        break
    }

    Start-Sleep -Seconds $IntervalSeconds
} while ($true)

if ($collectorMutexAcquired) {
    $collectorMutex.ReleaseMutex()
    $collectorMutex.Dispose()
}
