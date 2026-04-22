const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message, images, sessionKey) => ipcRenderer.invoke('send-message', message, images, sessionKey),
  cancelMessage: () => ipcRenderer.invoke('cancel-message'),
  checkService: () => ipcRenderer.invoke('check-service'),
  loadChatHistory: () => ipcRenderer.invoke('load-chat-history'),
  
  // 会话管理
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: () => ipcRenderer.invoke('create-session'),
  deleteSession: (sessionKey) => ipcRenderer.invoke('delete-session', sessionKey),
  switchSession: (sessionKey) => ipcRenderer.invoke('switch-session', sessionKey),
  updateSessionTitle: (sessionKey, title) => ipcRenderer.invoke('update-session-title', sessionKey, title),
  setReasoningLevel: (sessionKey, level) => ipcRenderer.invoke('set-reasoning-level', sessionKey, level),
  
  // 消息队列
  getQueue: () => ipcRenderer.invoke('get-queue'),
  removeQueueItem: (id) => ipcRenderer.invoke('remove-queue-item', id),
  
  // API 配置管理
  loadUserConfig: () => ipcRenderer.invoke('load-user-config'),
  saveUserConfig: (config) => ipcRenderer.invoke('save-user-config', config),
  saveUserApiConfig: (providerName, config) => ipcRenderer.invoke('save-user-api-config', providerName, config),
  deleteUserApiModel: (providerName, modelId) => ipcRenderer.invoke('delete-user-api-model', providerName, modelId),
  saveModelOrder: (primary, fallbacks) => ipcRenderer.invoke('save-model-order', primary, fallbacks),
  
  onInstallLog: (callback) => ipcRenderer.on('install-log', (event, log) => callback(log)),
  onServiceLog: (callback) => ipcRenderer.on('service-log', (event, log) => callback(log)),
  onServiceReady: (callback) => ipcRenderer.on('service-ready', () => callback()),
  onWebSocketReady: (callback) => ipcRenderer.on('websocket-ready', () => callback()),
  onWorkStatus: (callback) => ipcRenderer.on('work-status', (event, data) => callback(data)),
  onCompaction: (callback) => ipcRenderer.on('compaction', (event, data) => callback(data)),
  onQueueUpdate: (callback) => ipcRenderer.on('queue-update', (event, data) => callback(data)),
  onReloadHistory: (callback) => ipcRenderer.on('reload-history', () => callback()),
  onRefreshHistoryForThinking: (callback) => ipcRenderer.on('refresh-history-for-thinking', () => callback()),
  onAssistantStream: (callback) => ipcRenderer.on('assistant-stream', (event, data) => callback(data)),
  onToolCall: (callback) => ipcRenderer.on('tool-call', (event, data) => callback(data)),
  onAgentEvent: (callback) => ipcRenderer.on('agent-event', (event, data) => callback(data)),
  
  // QQ 消息同步
  onQQMessageReceived: (callback) => ipcRenderer.on('qq-message-received', (event, data) => callback(data)),
  onQQReplySent: (callback) => ipcRenderer.on('qq-reply-sent', (event, data) => callback(data)),

  // 飞书消息同步
  onFeishuMessage: (callback) => ipcRenderer.on('feishu-message-received', (event, data) => callback(data)),
  onFeishuReplySent: (callback) => ipcRenderer.on('feishu-reply-sent', (event, data) => callback(data)),

  // 定时任务事件
  onCronEvent: (callback) => ipcRenderer.on('cron-event', (event, data) => callback(data)),

  // 自我进化触发（飞书/QQ回复完成后）
  onEvolutionTrigger: (callback) => ipcRenderer.on('evolution-trigger', (event, data) => callback(data)),
  
  // 任务状态变化
  onTaskStatusChange: (callback) => ipcRenderer.on('task-status-change', (event, data) => callback(data)),
  
  // 使用须知弹窗
  onShowNotice: (callback) => ipcRenderer.on('show-notice', () => callback())
});
