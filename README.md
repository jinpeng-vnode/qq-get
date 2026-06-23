# QQ notification collector

This project collects QQ messages from Windows toast notifications without injecting QQ, logging in as a bot, or reading QQ databases.

## Disclaimer

This project is provided only for learning, research, and technical exchange. It is not affiliated with, endorsed by, or sponsored by Tencent or QQ.

The software is provided "as is", without any warranty. The authors do not guarantee account safety, data safety, notification completeness, message accuracy, service availability, or compatibility with any QQ/Windows version. You are solely responsible for how you use this software and for any consequence that may arise, including but not limited to account risk, data loss, privacy issues, system errors, or violation of third-party terms.

Do not use this project to collect data you are not authorized to access. By using, modifying, or distributing this project, you agree to assume all risks and responsibilities yourself.

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

Output is written by day to:

```text
data\qq-notifications-YYYY-MM-DD.jsonl
```

Each line is one JSON event with `groupName`, `senderName`, `content`, `receivedAt`, and `rawText`.

If Windows notification access is not enabled, run:

```powershell
.\start-qq-notification-collector.bat -RequestAccess
```

Then approve notification access in Windows.

## Limits

This only captures notifications that Windows receives. If QQ or Windows groups, suppresses, truncates, or hides a notification, this collector cannot recover the missing message.

## License

MIT. See [LICENSE](LICENSE).
