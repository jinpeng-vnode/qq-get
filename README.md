# QQ 通知采集

一个基于 Windows 通知中心的 QQ 消息采集工具。

核心目标是安全、克制、低侵入：**不注入 QQ、不修改 QQ、不读取 QQ 数据库、不登录机器人、不调用 QQ 历史消息接口**。程序只读取 Windows 已经收到的系统通知，然后把通知内容保存到本地文件，方便后续搜索、整理和分析。

## 安全设计

本项目优先强调“不入侵 QQ”：

- 不注入 QQ 进程
- 不 Hook QQ
- 不加载 QQ 插件
- 不读取或解密 QQ 本地数据库
- 不模拟 QQ 协议
- 不发送消息
- 不主动拉取历史记录
- 不上传采集数据

采集链路是：

```text
QQ 正常弹出 Windows 通知
        ↓
本工具读取 Windows 通知中心
        ↓
过滤 QQ / QQNT 通知
        ↓
解析群名、发送者、内容
        ↓
按天写入本地 JSONL 文件
```

这意味着它比数据库解密、机器人框架、协议接入、客户端注入更克制。不过它仍然依赖 QQ 和 Windows 实际显示通知，因此不是完整聊天记录导出工具。

## 功能

- 桌面端 Electron 应用
- 启动/停止通知采集
- 采集状态和运行日志
- 消息表格查看
- 关键词搜索
- 分页显示，每页 10 条
- 最新消息持续插入第一页
- 数据按天轮转
- 本地 JSONL 存储
- Windows 安装包打包

## 关键词搜索

当前搜索会匹配：

- 群名
- 发送者
- 消息内容
- 原始通知文本

搜索结果会自动回到第一页，避免页码落空。后续可以继续优化为更强的关键词搜索，例如：

- 多关键词 AND / OR
- 排除词
- 高亮命中内容
- 按群名、发送者、日期过滤
- 建立本地全文索引
- 保存常用搜索条件

## 安装使用

Windows 安装包位于：

```text
release\QQ通知采集 Setup 1.0.0.exe
```

安装后打开应用，点击“启动采集”即可。

如果 Windows 没有授予通知访问权限，可以先运行：

```powershell
.\start-qq-notification-collector.bat -RequestAccess
```

然后在 Windows 中允许通知访问。

## 开发

安装依赖：

```powershell
npm install
```

开发模式，支持热更新并自动打开 Electron 窗口：

```powershell
npm run dev
```

构建前端：

```powershell
npm run build
```

生成图标：

```powershell
npm run build:icons
```

生成 Windows 安装包：

```powershell
npm run dist:win
```

## 脚本模式

只采集一次：

```powershell
.\start-qq-notification-collector.bat -Once
```

持续采集：

```powershell
.\start-qq-notification-collector.bat
```

## 数据存储

数据按天写入：

```text
data\qq-notifications-YYYY-MM-DD.jsonl
```

每一行是一条 JSON 事件：

```json
{
  "id": "QQ-65848-2026-06-23T03:16:27.7388771+00:00",
  "notificationId": 65848,
  "app": "QQ",
  "appUserModelId": "QQ",
  "receivedAt": "2026-06-23T11:16:27.7388771+08:00",
  "groupName": "群名",
  "senderName": "发送者",
  "content": "消息内容",
  "rawText": "群名 | 发送者：消息内容"
}
```

## 限制

本工具只读取 Windows 收到的通知，因此有天然限制：

- QQ 没有弹通知，就采集不到
- 群免打扰、系统专注模式、通知关闭会影响采集
- QQ 或 Windows 合并通知时，只能拿到合并后的文本
- 通知内容可能被截断
- 图片、语音、文件无法完整采集
- 历史聊天记录无法补采
- 群号、QQ 号通常无法从通知中获得

如果你需要完整历史记录、媒体文件、群成员 ID 等能力，本项目不是合适方案。本项目选择牺牲完整性，换取更低侵入和更低风险。

## 免责声明

本项目仅用于学习、研究和技术交流，不隶属于腾讯或 QQ，也未获得腾讯或 QQ 的认可、授权或赞助。

本软件按“现状”提供，不做任何明示或暗示保证。作者不保证账号安全、数据安全、通知完整性、消息准确性、服务可用性，也不保证兼容任何特定 QQ 或 Windows 版本。

使用者应自行承担使用本软件带来的一切风险和责任，包括但不限于账号风险、数据丢失、隐私问题、系统错误、第三方服务条款风险或其他后果。

请勿使用本项目采集你无权访问的数据。使用、修改或分发本项目，即表示你理解并接受上述风险。

## License

MIT. See [LICENSE](LICENSE).
