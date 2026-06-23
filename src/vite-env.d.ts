/// <reference types="vite/client" />

type CollectorLog = {
  type: "info" | "stdout" | "stderr";
  text: string;
  at: string;
};

type CollectorStatus = {
  running: boolean;
  pid: number | null;
  log: CollectorLog[];
};

type QQMessage = {
  id: string;
  notificationId: number;
  app: string;
  appUserModelId: string;
  receivedAt: string;
  groupName?: string | null;
  senderName?: string | null;
  content: string;
  rawText: string;
};

interface Window {
  qqCollector: {
    start: () => Promise<{ ok: boolean; running: boolean }>;
    stop: () => Promise<{ ok: boolean; running: boolean }>;
    status: () => Promise<CollectorStatus>;
    listMessages: () => Promise<QQMessage[]>;
    dataPath: () => Promise<string>;
    onStatus: (callback: (status: CollectorStatus) => void) => () => void;
  };
}
