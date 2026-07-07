# L1-TASK-001 QQ 通知采集 架构概览

## 项目定位

基于 Windows 通知中心的 QQ 消息采集桌面工具。核心原则：不注入、不 Hook、不读数据库、不模拟协议，只读取系统已有通知。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 42 | 主进程管理窗口、托盘、采集进程 |
| 前端渲染 | React 19 + TypeScript | 单页应用，Vite 构建 |
| UI 组件库 | Ant Design 6 | antd 组件 + @ant-design/icons |
| 采集引擎 | PowerShell 脚本 | 读取 Windows 通知中心 API |
| 数据存储 | 本地 JSONL 文件 | 按天轮转，无数据库依赖 |
| 打包分发 | electron-builder | NSIS 安装包，仅 Windows x64 |

## 架构分层

```
┌─────────────────────────────────────────────┐
│              Electron 主进程                  │
│  (electron/main.cjs)                        │
│                                             │
│  ┌───────────┐  ┌──────────┐  ┌─────────┐  │
│  │ 窗口管理   │  │ 托盘管理  │  │ IPC 通道 │  │
│  └───────────┘  └──────────┘  └─────────┘  │
│         │                           │       │
│  ┌──────┴──────────────────────────┴────┐  │
│  │        采集进程管理器                   │  │
│  │  (spawn PowerShell 子进程)            │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
        │ IPC (contextBridge)         │ spawn
        ▼                             ▼
┌───────────────────┐    ┌────────────────────┐
│   渲染进程 (React) │    │  PowerShell 采集器   │
│   src/main.tsx    │    │  scripts/qq-*.ps1  │
│                   │    │                    │
│  - 采集控制面板    │    │  - 读取通知中心      │
│  - 消息表格       │    │  - 过滤 QQ 通知     │
│  - 关键词搜索     │    │  - 解析群名/发送者   │
│  - 运行日志       │    │  - 写入 JSONL       │
└───────────────────┘    └────────────────────┘
                                    │
                                    ▼
                         ┌────────────────────┐
                         │  data/ (JSONL 文件)  │
                         │  按天轮转存储        │
                         └────────────────────┘
```

## 核心模块

### 1. 主进程 (electron/main.cjs)

- 窗口生命周期管理（单实例锁、最小化到托盘）
- 系统托盘（状态显示、快捷菜单）
- 采集子进程管理（启动/停止/自动重启，最多 5 次）
- IPC 通道暴露 4 个 handler：
  - `collector:start` — 启动采集
  - `collector:stop` — 停止采集
  - `collector:status` — 获取运行状态 + 日志
  - `messages:list` — 读取全部消息
  - `messages:path` — 获取数据目录路径

### 2. 预加载脚本 (electron/preload.cjs)

- contextBridge 安全暴露 IPC 接口给渲染进程
- 隔离 Node.js 能力，防止渲染进程直接访问系统

### 3. 采集器 (scripts/qq-notification-collector.ps1)

- 调用 Windows UWP 通知 API
- 过滤 AppUserModelId 为 QQ/QQNT 的通知
- 解析通知文本格式：`群名 | 发送者：内容`
- 每 2 秒轮询一次
- 输出 JSONL 到 data/ 目录
- 支持 `-Once` 单次采集模式

### 4. 渲染进程 (src/)

- React 19 单页应用
- 功能：采集控制、消息浏览、关键词搜索、分页、日志查看
- 搜索语法：空格=AND、`-`=排除、`""`=短语

## 数据流

```
Windows 通知中心
      │ (PowerShell 读取)
      ▼
通知原始数据 {app, text, receivedAt}
      │ (脚本解析)
      ▼
结构化 JSON {id, groupName, senderName, content, rawText}
      │ (追加写入)
      ▼
data/qq-notifications-YYYY-MM-DD.jsonl
      │ (主进程读取)
      ▼
IPC → 渲染进程 → 表格展示
```

## 文件结构

```
qq-get/
├── electron/
│   ├── main.cjs          # 主进程入口
│   └── preload.cjs       # 预加载桥接
├── src/
│   ├── main.tsx          # React 应用入口
│   ├── styles.css        # 全局样式
│   └── vite-env.d.ts     # Vite 类型声明
├── scripts/
│   ├── qq-notification-collector.ps1  # 采集脚本
│   ├── build-icons.cjs   # 图标生成
│   └── dev.cjs           # 开发启动脚本
├── build/                # 应用图标资源
├── assets/               # SVG 源图标
├── data/                 # 运行时数据（.gitignore）
├── design/               # 架构设计文档
├── docs/                 # 项目文档
├── index.html            # Vite HTML 入口
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
└── package.json          # 项目配置
```

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 采集方式 | 读取系统通知 | 零侵入，不触碰 QQ 进程/数据 |
| 数据格式 | JSONL | 追加写入友好，无锁冲突 |
| 采集引擎 | PowerShell | 原生访问 Windows UWP API，无需额外依赖 |
| 进程模型 | 主进程 spawn 子进程 | 采集崩溃不影响 UI |
| 存储策略 | 按天轮转 | 单文件不会无限增长 |
| 读写冲突 | 重试机制（5 次） | 采集器写入时渲染进程可能同时读取 |

## 约束与限制

- 仅支持 Windows（依赖 Windows 通知中心 API）
- QQ 未弹通知则无法采集
- 通知内容可能被系统截断或合并
- 无法获取群号/QQ 号（通知不含此信息）
- 无法补采历史消息
