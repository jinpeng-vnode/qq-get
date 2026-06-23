import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, Button, ConfigProvider, Flex, Input, Layout, Space, Statistic, Table, Tag, Typography, message, theme } from "antd";
import { PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import zhCN from "antd/locale/zh_CN";
import "./styles.css";

const { Header, Content } = Layout;
const { Text, Title } = Typography;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function useInterval(callback: () => void, delay: number) {
  React.useEffect(() => {
    const timer = window.setInterval(callback, delay);
    return () => window.clearInterval(timer);
  }, [callback, delay]);
}

function Dashboard() {
  const [api, contextHolder] = message.useMessage();
  const [status, setStatus] = React.useState<CollectorStatus>({ running: false, pid: null, log: [] });
  const [messages, setMessages] = React.useState<QQMessage[]>([]);
  const [dataPath, setDataPath] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);

  const loadMessages = React.useCallback(async () => {
    const rows = await window.qqCollector.listMessages();
    setMessages(rows);
  }, []);

  const refreshAll = React.useCallback(async () => {
    const [nextStatus, path] = await Promise.all([
      window.qqCollector.status(),
      window.qqCollector.dataPath(),
      loadMessages(),
    ]);
    setStatus(nextStatus);
    setDataPath(path);
  }, [loadMessages]);

  React.useEffect(() => {
    refreshAll();
    return window.qqCollector.onStatus((nextStatus) => {
      setStatus(nextStatus);
      loadMessages();
    });
  }, [loadMessages, refreshAll]);

  useInterval(loadMessages, 2500);

  async function start() {
    setLoading(true);
    try {
      await window.qqCollector.start();
      const nextStatus = await window.qqCollector.status();
      setStatus(nextStatus);
      api.success("采集已启动");
    } catch (error) {
      api.error(error instanceof Error ? error.message : "启动失败");
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    try {
      await window.qqCollector.stop();
      const nextStatus = await window.qqCollector.status();
      setStatus(nextStatus);
      api.success("采集已停止");
    } catch (error) {
      api.error(error instanceof Error ? error.message : "停止失败");
    } finally {
      setLoading(false);
    }
  }

  const filteredMessages = React.useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return messages;
    return messages.filter((item) =>
      [item.groupName, item.senderName, item.content, item.rawText]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(value))
    );
  }, [messages, query]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  React.useEffect(() => {
    if (!query.trim()) {
      setCurrentPage(1);
    }
  }, [messages.length, query]);

  const columns: ColumnsType<QQMessage> = [
    {
      title: "时间",
      dataIndex: "receivedAt",
      width: 180,
      render: (value: string) => <Text type="secondary">{formatTime(value)}</Text>,
    },
    {
      title: "群",
      dataIndex: "groupName",
      width: 260,
      ellipsis: true,
      render: (value?: string | null) => value || <Text type="secondary">未知</Text>,
    },
    {
      title: "发送者",
      dataIndex: "senderName",
      width: 160,
      ellipsis: true,
      render: (value?: string | null) => value || <Text type="secondary">未知</Text>,
    },
    {
      title: "内容",
      dataIndex: "content",
      ellipsis: true,
    },
  ];

  return (
    <AntApp>
      {contextHolder}
      <Layout className="shell">
        <Header className="topbar">
          <Flex align="center" justify="space-between" gap={16}>
            <div>
              <Title level={3} className="title">QQ 通知采集</Title>
              <Text type="secondary">只读取 Windows 通知，不注入 QQ，不读数据库。</Text>
            </div>
            <Space>
              <Tag color={status.running ? "success" : "default"}>
                {status.running ? `运行中 PID ${status.pid}` : "未运行"}
              </Tag>
              <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
              {status.running ? (
                <Button danger icon={<PauseCircleOutlined />} loading={loading} onClick={stop}>停止采集</Button>
              ) : (
                <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={start}>启动采集</Button>
              )}
            </Space>
          </Flex>
        </Header>

        <Content className="content">
          <section className="metrics">
            <Statistic title="已记录通知" value={messages.length} />
            <Statistic title="当前筛选" value={filteredMessages.length} />
            <div className="path">
              <Text type="secondary">数据目录</Text>
              <Text copyable ellipsis>{dataPath}</Text>
            </div>
          </section>

          <section className="toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索群名、发送者或内容"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </section>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredMessages}
            pagination={{
              current: currentPage,
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page) => setCurrentPage(page),
            }}
            size="middle"
            scroll={{ x: 900 }}
          />

          <section className="logs">
            <Text strong>运行日志</Text>
            <div className="logBox">
              {status.log.length === 0 ? (
                <Text type="secondary">暂无日志</Text>
              ) : (
                status.log.slice(-20).map((line, index) => (
                  <div key={`${line.at}-${index}`} className={`logLine ${line.type}`}>
                    <span>{formatTime(line.at)}</span>
                    <span>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </Content>
      </Layout>
    </AntApp>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <Dashboard />
    </ConfigProvider>
  </React.StrictMode>
);
