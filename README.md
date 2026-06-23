# QQ notification collector

This project collects QQ messages from Windows toast notifications without injecting QQ, logging in as a bot, or reading QQ databases.

## Desktop app

Install dependencies once:

```powershell
npm install
```

Build the renderer:

```powershell
npm run build
```

Open the Electron app:

```powershell
npm start
```

For development with hot reload:

```powershell
npm run dev
```

## Run once

```powershell
.\start-qq-notification-collector.bat -Once
```

## Keep listening

```powershell
.\start-qq-notification-collector.bat
```

Output is written to:

```text
data\qq-notifications.jsonl
```

Each line is one JSON event with `groupName`, `senderName`, `content`, `receivedAt`, and `rawText`.

If Windows notification access is not enabled, run:

```powershell
.\start-qq-notification-collector.bat -RequestAccess
```

Then approve notification access in Windows.

## Limits

This only captures notifications that Windows receives. If QQ or Windows groups, suppresses, truncates, or hides a notification, this collector cannot recover the missing message.
