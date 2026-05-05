const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
// 引入消息队列
const MessageQueue = require('./message-queue');

// 引入 QQ 机器人
const QQBot = require('./qq-bot');

// 初始化管理器
const messageQueue = new MessageQueue();

// 监听任务状态变化，通知前端
messageQueue.onStatusChange = (status) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('task-status-change', status);
  }
};

// 加载配置文件
let appConfig = {};
let initialConfigPath;
if (app.isPackaged) {
  initialConfigPath = path.join(process.resourcesPath, 'config.json');
} else {
  initialConfigPath = path.join(__dirname, 'config.json');
}
if (fs.existsSync(initialConfigPath)) {
  try {
    appConfig = JSON.parse(fs.readFileSync(initialConfigPath, 'utf-8'));
    console.log('✅ 已加载 config.json');
  } catch (e) {
    console.error('❌ config.json 解析失败:', e.message);
  }
}

// 手动加载 .env 文件到 process.env
// 创建诊断日志文件
const debugLogPath = path.join(os.homedir(), '.xiaoduan-ai', 'debug.log');
const debugLog = [];
let logWritePending = false;
let logWriteTimer = null;
let logDirEnsured = false;

function addLog(msg) {
  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const line = `[${timestamp}] ${msg}`;
  debugLog.push(line);
  console.log(line);
  
  // 限制内存中的日志数量
  if (debugLog.length > 10000) {
    debugLog.splice(0, debugLog.length - 5000);
  }
  
  // 异步批量写入（防抖，500ms后写入）
  if (!logWritePending) {
    logWritePending = true;
    if (logWriteTimer) clearTimeout(logWriteTimer);
    logWriteTimer = setTimeout(() => {
      logWritePending = false;
      // 确保目录存在（只检查一次）
      if (!logDirEnsured) {
        try {
          const logDir = path.dirname(debugLogPath);
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          logDirEnsured = true;
        } catch (e) {
          console.error('创建日志目录失败:', e.message);
          return;
        }
      }
      fs.writeFile(debugLogPath, debugLog.join('\n'), 'utf-8', (err) => {
        if (err) console.error('写入日志失败:', err.message);
      });
    }, 500);
  }
}

// 全局错误处理，防止弹窗，并写入日志
process.on('uncaughtException', (error) => {
  const msg = `[全局错误] uncaughtException: ${error.message}\n${error.stack}`;
  console.error(msg);
  addLog(msg);
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = `[全局错误] unhandledRejection: ${reason}`;
  console.error(msg);
  addLog(msg);
});

addLog('========== 系统启动诊断 ==========');
addLog(`app.isPackaged: ${app.isPackaged}`);
addLog(`__dirname: ${__dirname}`);
addLog(`process.resourcesPath: ${process.resourcesPath}`);
addLog(`process.cwd(): ${process.cwd()}`);

// 根据打包状态选择正确的 .env 路径
let envPath;
if (app.isPackaged) {
  envPath = path.join(process.resourcesPath, '.env');
} else {
  envPath = path.join(__dirname, 'resources', '.env');
}

addLog(`尝试加载 .env 路径: ${envPath}`);
addLog(`文件是否存在: ${fs.existsSync(envPath)}`);

// 检查 resources 目录下有哪些文件
if (app.isPackaged) {
  addLog('process.resourcesPath 目录内容:');
  try {
    const resourceFiles = fs.readdirSync(process.resourcesPath);
    resourceFiles.forEach(f => addLog(`  - ${f}`));
  } catch (e) {
    addLog(`无法读取 resources 目录: ${e.message}`);
  }
}

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  addLog(`.env 文件内容长度: ${envContent.length}`);
  
  const lines = envContent.split(/\r?\n/);
  addLog(`.env 文件行数: ${lines.length}`);
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }
    
    // 支持多种格式：key=value, key = value, key: value, key : value, key= value, key =value 等
    const match = trimmedLine.match(/^([^=:]+?)\s*[:=]\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
      addLog(`设置环境变量: ${key} = ${value.substring(0, 15)}...`);
    }
  });
  
  addLog('✅ 已加载 .env 文件');
  addLog(`QQ_BOT_ENABLED: ${process.env.QQ_BOT_ENABLED || '未配置'}`);
  addLog(`QQ_BOT_APPID: ${process.env.QQ_BOT_APPID ? '已配置' : '未配置'}`);
  addLog(`QQ_BOT_SECRET: ${process.env.QQ_BOT_SECRET ? '已配置' : '未配置'}`);
} else {
  addLog(`❌ .env 文件不存在: ${envPath}`);
  addLog('尝试备用路径...');
  
  const fallbackPaths = [
    path.join(process.resourcesPath, '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, 'resources', '.env'),
    path.join(path.dirname(__dirname), '.env'),
  ];
  
  for (const fallbackPath of fallbackPaths) {
    addLog(`尝试: ${fallbackPath} -> 存在: ${fs.existsSync(fallbackPath)}`);
    if (fs.existsSync(fallbackPath)) {
      addLog(`✅ 找到 .env: ${fallbackPath}`);
      const envContent = fs.readFileSync(fallbackPath, 'utf-8');
      const lines = envContent.split(/\r?\n/);
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) return;
        
        // 支持多种格式：key=value, key = value, key: value, key : value, key= value, key =value 等
        const match = trimmedLine.match(/^([^=:]+?)\s*[:=]\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = value;
          addLog(`设置环境变量: ${key} = ${value.substring(0, 15)}...`);
        }
      });
      break;
    }
  }
}
addLog('========== 诊断结束 ==========');

// 获取 Gateway Token（优先从环境变量，其次从 config.json）
function getGatewayToken() {
  return process.env.GATEWAY_AUTH_TOKEN || appConfig.gateway?.auth?.token || '';
}

let mainWindow;
let gatewayProcess = null;
let isGatewayReady = false;
let qqBots = [];  // 支持多个 QQ 机器人
let globalRecentlyProcessedMessages = null;  // 消息去重缓存
let globalRecentlyProcessedMessagesCleanupTimer = null;  // 嶈息去重缓存清理定时器

// 全局 WebSocket 连接
let globalWs = null;
let wsConnected = false;
let pendingRequests = new Map();  // 存储待处理的请求
let runIdToReqId = new Map();  // runId -> reqId 快速查找索引
let feishuPendingMessages = new Map();  // 飞书待处理的用户消息（id -> {senderOpenId, senderName, content}）

// 已移除5分钟兜底超时限制，让请求可以无限等待（依赖模型响应超时和工具超时机制）

// 辅助函数：发送日志到前端（统一窗口检查）
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// 辅助函数：发送系统日志到前端
function sendServiceLog(message) {
  console.log('[系统日志]', message);
  sendToRenderer('service-log', message);
}

// 辅助函数：发送安装日志到前端
function sendInstallLog(message) {
  sendToRenderer('install-log', message);
}

// 辅助函数：检查调试模式
function isDebugMode() {
  return process.env.DEBUG_MODE === 'true';
}

// 过滤流式输出中的工具调用块
function filterToolBlocksMain(text) {
  if (!text) return '';
  let clean = text.replace(/```(?:json)?\s*\{[\s\S]*?"(?:name|tool)"\s*:\s*"(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)[\s\S]*?```/gi, '');
  clean = clean.replace(/\[TOOL_CALL\][\s\S]*?(?=\[TOOL_CALL\]|\n\n|$)/gi, '');
  clean = clean.replace(/^\s*\{\s*"(?:name|tool)"\s*:\s*"(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)"[^\n]*\}\s*$/gm, '');
  clean = clean.replace(/<\|?tool_call\|?>[\s\S]*?(?=<\|?tool_call\|?>|$)/gi, '');
  return clean.replace(/\n{3,}/g, '\n\n').trim();
}

// 初始化 WebSocket 连接
function initWebSocket() {
  addLog('========== WebSocket 连接开始 ==========');
  
  if (globalWs) {
    addLog('[WebSocket] 已有连接，跳过');
    return;
  }
  
  const WebSocket = require('ws');
  const gatewayUrl = 'ws://127.0.0.1:18888';
  addLog('[WebSocket] 连接地址: ' + gatewayUrl);
  
  globalWs = new WebSocket(gatewayUrl);
  
  globalWs.on('open', () => {
    addLog('[WebSocket] 连接成功');
    console.log('[全局 WebSocket] 已连接');
    
    // 发送 connect 消息
    const connectMsg = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'xiaoduan-control-ui',
          version: '1.0.0',
          platform: 'win32',
          mode: 'webchat'
        },
        role: 'operator',
        scopes: ['operator.admin'],
        caps: [],
        auth: {
          token: getGatewayToken()
        }
      }
    };
    globalWs.send(JSON.stringify(connectMsg));
  });
  
  globalWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      // 调试：打印所有 cron 相关消息
      if (msg.method?.includes('cron') || msg.event === 'cron') {
        console.log('[CRON WS]', JSON.stringify(msg).substring(0, 300));
      }

      // 【新增】检测所有 chat 事件 - streaming delta 过滤工具块后转发，final 只发完成信号
      if (msg.type === 'event' && msg.event === 'chat') {
        const payload = msg.payload;
        const isComplete = payload.state === 'final';
        // 调试日志已屏蔽
        // console.log('[CHAT事件] state:', payload.state, 'content:', payload.message?.content ? `有(${String(payload.message.content).substring(0,30)})` : '空', 'thinking:', payload.thinking ? '有' : '无');
        
        if (!isComplete && payload.state === 'streaming' && payload.message?.content) {
          const raw = payload.message.content;
          // 调试日志已屏蔽
          // console.log('[STREAMING事件] content:', raw.substring(0, 50));
          const clean = typeof raw === 'string' ? filterToolBlocksMain(raw) : '';
          if (clean && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            mainWindow.webContents.send('assistant-stream', {
              delta: clean,
              isComplete: false,
              thinking: null
            });
          }
        }

        // 处理 thinking 内容（显示到系统日志）
        if (!isComplete && payload.state === 'streaming' && payload.thinking) {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            mainWindow.webContents.send('assistant-stream', {
              delta: null,
              isComplete: false,
              thinking: payload.thinking
            });
          }
        }
        
        if (isComplete) {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            mainWindow.webContents.send('assistant-stream', {
              delta: '',
              isComplete: true,
              thinking: null
            });
          }
        }
      }



      // 【新增】处理飞书用户消息事件（让前端显示）
      if (msg.type === 'feishu.user-message') {
        console.log('[飞书用户消息]', msg.data?.message?.substring(0, 50));
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('feishu-message-received', {
            message: msg.data?.message || '',
            chatId: msg.data?.chatId || ''
          });
          sendServiceLog(`📱 [飞书消息] ${(msg.data?.message || '').substring(0, 50)}...`);
        }
        return;
      }

      // 【自我进化】处理飞书/QQ回复完成后的进化触发事件
      if (msg.type === 'event' && msg.event === 'evolution.trigger') {
        console.log('[自我进化触发] source:', msg.payload?.source);
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('evolution-trigger', { source: msg.payload?.source || 'unknown' });
        }
        return;
      }



      // 只打印重要消息（非 health 和 challenge）
      const shouldLog = msg.type !== 'event' || (msg.event !== 'health' && msg.event !== 'connect.challenge');
      
      if (shouldLog && process.env.DEBUG_MODE === 'true') {
        console.log('[WebSocket]', msg.type, msg.event || msg.method, msg.id ? `(${msg.id})` : '');
      }
      
      // 处理 connect 响应
      if (msg.type === 'res' && msg.id && msg.id.startsWith('connect-')) {
        if (msg.ok) {
          console.log('[全局 WebSocket] 连接成功');
          wsConnected = true;
          
          // 通知前端 WebSocket 已就绪
          sendToRenderer('websocket-ready');
        }
        return;
      }
      
      // 打印所有消息用于调试（仅在 DEBUG 模式）
      if (shouldLog && process.env.DEBUG_MODE === 'true') {
        console.log('[WebSocket 详细]', JSON.stringify(msg).substring(0, 200));
      }
      
      // 处理请求响应
      if (msg.type === 'res') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          console.log('[响应匹配] 找到请求 ID:', msg.id);
          
          // 如果是历史请求，直接返回结果
          if (pending.isHistory) {
            pendingRequests.delete(msg.id);
            if (msg.ok) {
              const messages = msg.payload?.messages || [];
              console.log('[加载历史] 成功:', messages.length, '条消息');
              // 打印前几条消息用于调试（仅 DEBUG 模式）
              if (messages.length > 0 && process.env.DEBUG_MODE === 'true') {
                console.log('[加载历史] 第一条:', JSON.stringify(messages[0]).substring(0, 100));
              }
              pending.resolve({ messages: messages });
            } else {
              console.log('[加载历史] 失败:', msg.error?.message);
              pending.reject(new Error(msg.error?.message || '加载历史失败'));
            }
            return;
          }
          
          // 聊天请求响应
          if (msg.ok) {
            console.log('[聊天响应] OK, runId:', msg.payload?.runId, 'output.text:', msg.payload?.output?.text?.substring(0, 100));
            // 保存 runId 用于后续事件匹配
            if (msg.payload && msg.payload.runId) {
              pending.actualRunId = msg.payload.runId;
            }
            // 直接 resolve，让前端恢复发送按钮
            pending.resolve({ reply: msg.payload?.output?.text || '' });
          } else {
            console.log('[聊天响应] 失败:', msg.error);
            pendingRequests.delete(msg.id);
            pending.reject(new Error(msg.error?.message || '请求失败'));
          }
        }
        return;
      }
      
      // 【通用】检查是否是英文系统提示
      function isEnglishSystemPrompt(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        return (
          text.includes('Current time:') || 
          text.includes('Return your summary as plain text') ||
          text.includes('it will be delivered automatically') ||
          text.includes('If the task explicitly calls for messaging') ||
          text.includes('Please use') ||
          text.includes('then use') ||
          text.includes('send to user') ||
          text.includes('deliver automatically') ||
          text.includes('Asia/Shanghai') ||
          (lowerText.includes('cron:') && text.includes('[')) ||
          text.includes('##') ||
          (text.match(/[a-zA-Z]/g) && text.match(/[a-zA-Z]/g).length > text.length * 0.5)
        );
      }

      // 【通用】过滤英文系统提示，只保留正常内容
      function filterEnglishPrompts(text) {
        if (!text) return '';
        const lines = text.split('\n');
        const filteredLines = lines.filter(line => !isEnglishSystemPrompt(line.trim()));
        return filteredLines.join('\n').trim();
      }

      // 【通用】过滤工具总结格式，不显示在前端
      function filterToolSummary(text) {
        if (!text) return '';
        return text.replace(/\[起\][\s\S]*?\[终\]/g, '').trim();
      }

      // 处理聊天事件（完全按原版逻辑）
      if (msg.type === 'event' && msg.event === 'chat') {
        const payload = msg.payload;
        

        
        // 调试：打印收到的 chat 事件
        if (payload.state === 'final' || payload.state === 'error') {
          console.log(`[收到 ${payload.state} 事件] runId: ${payload.runId}, sessionKey: ${payload.sessionKey}`);
        }
        
        // 【新增】处理 chat.inject 发送的消息（runId 以 inject- 开头）
        if (payload.runId && payload.runId.startsWith('inject-') && payload.state === 'final') {
          console.log('[处理 inject 消息] 检测到 inject 消息，直接显示到前端');
          const content = payload.message?.content;
          let finalText = '';
          
          if (Array.isArray(content)) {
            finalText = content
              .filter(block => block && block.type === 'text' && block.text)
              .map(block => block.text)
              .join('\n\n');
          } else if (typeof content === 'string') {
            finalText = content;
          }
          
          // 过滤英文系统提示
          finalText = filterEnglishPrompts(finalText);
          
          if (finalText && mainWindow && mainWindow.webContents) {
            // 直接发送到前端，使用特殊的 reqId 标识这是 inject 消息
            mainWindow.webContents.send('assistant-stream', { 
              reqId: payload.runId, 
              delta: finalText, 
              isComplete: true 
            });
          }
          return;
        }

        // 【新增】处理 cron 会话的 chat 事件 - 直接显示在前端 + 广播
        const payloadSessionKey = payload.sessionKey || '';
        if (payloadSessionKey.includes(':cron:') && payload.state === 'final') {
          console.log('[Cron 会话 chat 事件]', payload.stream || payload.state, payload.data || payload.message);
          
          const content = payload.message?.content;
          let finalText = '';
          
          if (Array.isArray(content)) {
            finalText = content
              .filter(block => block && block.type === 'text' && block.text)
              .map(block => block.text)
              .join('\n\n');
          } else if (typeof content === 'string') {
            finalText = content;
          }
          
          // 过滤英文系统提示
          finalText = filterEnglishPrompts(finalText);
          
          if (finalText && mainWindow && mainWindow.webContents) {
            // 直接发送到前端，使用特殊的 reqId 标识这是 cron 消息
            mainWindow.webContents.send('assistant-stream', { 
              reqId: 'cron-' + payload.runId, 
              delta: finalText, 
              isComplete: true 
            });
          }
          
          // 【家庭共享模式】如果有回复内容，广播给所有 QQ 用户
          console.log('[家庭共享] 检查广播条件...');
          console.log('[家庭共享] reply:', finalText ? `有内容(${finalText.length}字)` : '无内容');
          console.log('[家庭共享] qqBots:', qqBots.length, '个');
          
          if (finalText && finalText.trim() && qqBots.length > 0) {
            const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
            console.log('[家庭共享] 运行中的机器人:', runningBots.length);
            
            if (runningBots.length > 0) {
              console.log(`[家庭共享] 📢 准备广播回复给 ${runningBots.length} 个机器人`);
              
              // 异步广播，不阻塞主流程
              (async () => {
                for (const bot of runningBots) {
                  try {
                    const activeUsers = bot.getActiveUsers();
                    console.log(`[家庭共享] ${bot.name} 活跃用户数: ${activeUsers.length}`);
                    
                    if (activeUsers.length > 0) {
                      // 显示用户名字
                      const userNames = activeUsers.map(id => getUserDisplayName(id));
                      console.log(`[家庭共享] ${bot.name} 广播目标: ${userNames.join(', ')}`);
                      
                      // 格式化回复：确保以"小端："开头
                      let formattedReply = finalText;
                      if (!finalText.startsWith('小端：')) {
                        formattedReply = `小端：${finalText}`;
                      }
                      
                      const results = await bot.broadcastToUsers(activeUsers, formattedReply);
                      const successCount = results.filter(r => r.success).length;
                      console.log(`[家庭共享] ${bot.name} 广播结果: ${successCount}/${activeUsers.length} 成功`);
                      
                      if (successCount === 0 && activeUsers.length > 0) {
                        console.log(`[家庭共享] ${bot.name} 广播全部失败，尝试重连...`);
                        bot.isRunning = false;
                        setTimeout(() => bot.start(), 1000);
                      }
                    } else {
                      console.log(`[家庭共享] ${bot.name} 无需广播（没有活跃用户）`);
                    }
                  } catch (err) {
                    console.error(`[家庭共享] ${bot.name} 广播异常:`, err.message);
                  }
                }
              })().catch(err => {
                console.error('[家庭共享] 广播流程异常:', err);
              });
            } else {
              console.log('[家庭共享] ⚠️ 没有运行中的机器人，跳过广播');
              // 尝试重连所有机器人
              for (const bot of qqBots) {
                if (!bot.isRunning || !bot.ws || bot.ws.readyState !== 1) {
                  console.log(`[家庭共享] 尝试重连 ${bot.name}...`);
                  bot.start().catch(err => {
                    console.error(`[家庭共享] ${bot.name} 重连失败:`, err.message);
                  });
                }
              }
            }
          } else {
            console.log('[家庭共享] 不满足广播条件，跳过');
          }
          
          return;
        }
        
        // 【优化】使用 runId 快速索引查找，避免遍历所有请求
        let pending = null;
        let reqId = null;
        
        // 先通过 runId 索引查找
        if (payload.runId && runIdToReqId.has(payload.runId)) {
          reqId = runIdToReqId.get(payload.runId);
          pending = pendingRequests.get(reqId);
        }
        
        // 如果索引没找到，再遍历查找（兼容旧逻辑）
        if (!pending) {
          for (const [rId, p] of pendingRequests.entries()) {
            const matchRunId = p.actualRunId || p.runId;
            const pendingSessionKeyLower = (p.sessionKey || '').toLowerCase();
            const payloadSessionKeyLower = (payload.sessionKey || '').toLowerCase();
            const sessionKeyMatches = pendingSessionKeyLower === payloadSessionKeyLower || 
              payloadSessionKeyLower === `agent:${pendingSessionKeyLower}:${pendingSessionKeyLower}`;
            
            if (sessionKeyMatches && matchRunId === payload.runId) {
              reqId = rId;
              pending = p;
              // 更新索引
              if (p.actualRunId) {
                runIdToReqId.set(p.actualRunId, rId);
              }
              break;
            }
          }
        }
        
        if (!pending) {
          // console.log('[事件匹配] 未找到pending! reqId:', reqId, 'runId:', payload.runId, 'state:', payload.state);
          return;
        }
        
        // 检查是否已被取消
        if (pending.cancelled) {
          pendingRequests.delete(reqId);
          if (pending.actualRunId) {
            runIdToReqId.delete(pending.actualRunId);
          }
          return;
        }
        
        // 处理流式输出（delta 状态）
        if (payload.state === 'delta') {
          // 检查是否有工具调用或工具结果
          let hasToolCall = false;
          let hasToolResult = false;
          if (payload.message && Array.isArray(payload.message.content)) {
            hasToolCall = payload.message.content.some(block => block.type === 'toolCall');
            hasToolResult = payload.message.content.some(block => block.type === 'toolResult');
          }
          
          if (hasToolCall) {
            addLog('[工具调用检测] 检测到工具调用');
            pending.hasStreamOutput = true;
            pending.toolCallActive = true;  // 标记工具调用活跃中
          } else if (hasToolResult) {
            // 【关键修复】检测到工具结果，立即保存到内容.txt
            let hasMoreToolCalls = false;
            if (payload.message && Array.isArray(payload.message.content)) {
              hasMoreToolCalls = payload.message.content.some(block => block.type === 'toolCall');
            }

            if (!hasMoreToolCalls && pending.toolCallActive) {
              addLog('[工具调用结束] 检测到工具结果且无更多工具调用，重新设置模型超时');
              pending.toolCallActive = false;

              // 工具调用中，不设置超时
            } else if (hasMoreToolCalls) {
              addLog('[工具调用继续] 还有更多工具调用');
            }

            // 立即保存 toolResult 内容到内容.txt
            const neirongContentFile = path.join(os.homedir(), '.xiaoduan', 'agents', 'main', '内容.txt');
            try {
              const toolResultBlocks = payload.message.content.filter(block => block.type === 'toolResult');
              if (toolResultBlocks.length > 0) {
                const contentParts = toolResultBlocks.map(block => {
                  if (Array.isArray(block.content)) {
                    return block.content.map(c => c.text || c.content || '').join('');
                  } else if (typeof block.content === 'string') {
                    return block.content;
                  }
                  return '';
                }).filter(text => text.trim());
                if (contentParts.length > 0) {
                  const newContent = contentParts.join('\n---\n');
                  const dir = path.dirname(neirongContentFile);
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  let existingContent = '';
                  if (fs.existsSync(neirongContentFile)) {
                    existingContent = fs.readFileSync(neirongContentFile, 'utf-8');
                  }
                  const combined = existingContent ? existingContent + '\n---\n' + newContent : newContent;
                  const trimmed = combined.length > 80000 ? combined.slice(-80000) : combined;
                  fs.writeFileSync(neirongContentFile, trimmed, 'utf-8');
                  console.log(`[内容] 已增量更新: ${trimmed.length}字`);
                }
              }
            } catch (err) {
              console.error('[内容] 写入失败:', err);
            }
            
            pending.hasStreamOutput = true;
          }
          
          // 提取文本内容和思考内容
          let deltaText = '';
          let thinkingText = '';
          if (payload.message && Array.isArray(payload.message.content)) {
            deltaText = payload.message.content
              .filter(block => block.type === 'text' && block.text)
              .map(block => block.text)
              .join('\n\n');
            thinkingText = payload.message.content
              .filter(block => block.type === 'thinking' && block.thinking)
              .map(block => block.thinking)
              .join('\n\n');
          } else if (typeof payload.message?.content === 'string') {
            deltaText = payload.message.content;
          }
          
          // 保存思考内容
          if (thinkingText) {
            pending.thinkingBuffer = thinkingText;
          }

          // 保存流式文本
          if (deltaText) {
            pending.streamBuffer = deltaText;
          }
        }
        // 处理最终完成
        else if (payload.state === 'final') {
          console.log('[FINAL事件] 收到! pending存在:', !!pending, 'reqId:', reqId);
          // 提取最终回复
          let reply = '';
          let thinking = '';

          // 【调试】打印收到的 final 消息内容
          console.log('[FINAL事件] payload.message.content:', JSON.stringify(payload.message?.content)?.substring(0, 200));

          if (payload.message && payload.message.content) {
            if (Array.isArray(payload.message.content)) {
              reply = payload.message.content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text)
                .join('\n\n');
            } else if (typeof payload.message.content === 'string') {
              reply = payload.message.content;
            }
          }

          // 如果没有从final payload提取到reply，从buffer恢复
          if (!reply && pending.streamBuffer) {
            reply = pending.streamBuffer;
          }

          // 【调试】打印最终提取的 reply
          console.log('[DEBUG] 最终提取的 reply:', JSON.stringify(reply), `长度: ${reply?.length || 0}`);
          
          // 过滤工具总结格式，不显示在前端
          reply = filterToolSummary(reply);
          // 过滤工具调用块，确保最终回复干净
          reply = filterToolBlocksMain(reply);
          
          if (process.env.DEBUG_MODE === 'true') {
            console.log('[最终完成] 回复长度:', reply.length);
          }
          
          // 【家庭共享模式】如果有回复内容，广播给所有 QQ 用户
          console.log('[家庭共享] 检查广播条件...');
          console.log('[家庭共享] reply:', reply ? `有内容(${reply.length}字)` : '无内容');
          console.log('[家庭共享] qqBots:', qqBots.length, '个');
          
          // 从 sessionKey 提取发送者 ID（用于去重）
          const senderOpenId = pending.sessionKey?.startsWith('qq:') 
            ? pending.sessionKey.substring(3).toLowerCase() 
            : null;
          const senderDisplayName = senderOpenId ? getUserDisplayName(senderOpenId) : null;
          console.log('[家庭共享] 发送者:', senderDisplayName || '电脑端', senderOpenId ? `(${senderOpenId.substring(0, 8)}...)` : '');
          
          if (reply && reply.trim() && qqBots.length > 0) {
            const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
            console.log('[家庭共享] 运行中的机器人:', runningBots.length);
            
            if (runningBots.length > 0) {
              console.log(`[家庭共享] 📢 准备广播回复给 ${runningBots.length} 个机器人`);
              
              // 异步广播，不阻塞主流程
              (async () => {
                for (const bot of runningBots) {
                  try {
                    const activeUsers = bot.getActiveUsers();
                    // 去重发送者
                    const broadcastUsers = activeUsers.filter(id => id.toLowerCase() !== senderOpenId);
                    console.log(`[家庭共享] ${bot.name} 活跃用户数: ${activeUsers.length}, 去重后: ${broadcastUsers.length}`);
                    
                    if (broadcastUsers.length > 0) {
                      // 显示用户名字
                      const userNames = broadcastUsers.map(id => getUserDisplayName(id));
                      console.log(`[家庭共享] ${bot.name} 广播目标: ${userNames.join(', ')}`);
                      
                      // 格式化回复：确保以"小端："开头
                      let formattedReply = reply;
                      if (!reply.startsWith('小端：')) {
                        formattedReply = `小端：${reply}`;
                      }
                      
                      const results = await bot.broadcastToUsers(broadcastUsers, formattedReply);
                      const successCount = results.filter(r => r.success).length;
                      console.log(`[家庭共享] ${bot.name} 广播结果: ${successCount}/${broadcastUsers.length} 成功`);
                      
                      if (successCount === 0 && broadcastUsers.length > 0) {
                        console.log(`[家庭共享] ${bot.name} 广播全部失败，尝试重连...`);
                        bot.isRunning = false;
                        setTimeout(() => bot.start(), 1000);
                      }
                    } else {
                      console.log(`[家庭共享] ${bot.name} 无需广播（只有发送者）`);
                    }
                  } catch (err) {
                    console.error(`[家庭共享] ${bot.name} 广播异常:`, err.message);
                  }
                }
              })().catch(err => {
                console.error('[家庭共享] 广播流程异常:', err);
              });
            } else {
              console.log('[家庭共享] ⚠️ 没有运行中的机器人，跳过广播');
              // 尝试重连所有机器人
              for (const bot of qqBots) {
                if (!bot.isRunning || !bot.ws || bot.ws.readyState !== 1) {
                  console.log(`[家庭共享] 尝试重连 ${bot.name}...`);
                  bot.start().catch(err => {
                    console.error(`[家庭共享] ${bot.name} 重连失败:`, err.message);
                  });
                }
              }
            }
          } else {
            console.log('[家庭共享] 不满足广播条件，跳过');
          }
          
          // 完成请求（即使 reply 为空也要完成，否则会卡死）

          // 清理 jsonl（只保留最新100条消息对）
          try {
            const userHome = require('os').homedir();
            const sessionsDir = path.join(userHome, '.xiaoduan', 'agents', 'main', 'sessions');
            if (fs.existsSync(sessionsDir)) {
              const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
              for (const file of files) {
                const filePath = path.join(sessionsDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());
                
                // 只保留 session 头 + 最新300对消息（user + assistant = 2条）
                const maxLines = 1 + 300 * 2; // 1个头 + 300对
                if (lines.length > maxLines) {
                  // 保留 header + 最新消息（后半部分）
                  const header = lines[0];
                  const recentLines = lines.slice(-(maxLines - 1));
                  const newContent = [header, ...recentLines].join('\n') + '\n';
                  fs.writeFileSync(filePath, newContent, 'utf-8');
                  console.log('[清理] 已清理', file, '从', lines.length, '行到', maxLines, '行（保留最新消息）');
                }
              }
            }
          } catch (e) {
            console.log('[清理] 失败:', e.message);
          }

          pendingRequests.delete(reqId);
          if (pending.actualRunId) {
            runIdToReqId.delete(pending.actualRunId);
          }
          console.log('[FINAL事件] resolve回复, reply长度:', reply?.length || 0, 'reply前100字:', reply?.substring(0, 100));
          pending.resolve({ reply: reply, thinking: thinking });
        } 
        // 处理中止
        else if (payload.state === 'aborted') {
          console.log('[已中止] 任务被中止');

          // 【修复】只有当不是降级导致的中止时，才从 pendingRequests 中删除并 reject
          pendingRequests.delete(reqId);
          if (pending.actualRunId) {
            runIdToReqId.delete(pending.actualRunId);
          }
          pending.reject(new Error('任务已中止'));
        }
        // 处理错误
        else if (payload.state === 'error') {
          // 【调试】打印收到的 error 消息内容
          console.log('[DEBUG] error payload:', JSON.stringify(payload));
          console.log('[DEBUG] error payload.message:', JSON.stringify(payload.message));
          console.log('[DEBUG] error payload.errorMessage:', JSON.stringify(payload.errorMessage));

          const errorMsg = payload.errorMessage || '';
          console.log('[错误] 消息:', errorMsg);

          // 【关键修复】reject pending 请求，让前端 sendMessage 的 await 收到错误
          // 这样前端 isSending 才会重置，停止按钮才会恢复成发送
          if (pending) {
            pendingRequests.delete(reqId);
            if (pending.actualRunId) {
              runIdToReqId.delete(pending.actualRunId);
            }
            pending.reject(new Error(errorMsg || '模型调用失败'));
          }

          // 记录错误，继续处理

          // 【修改】模型响应超时或失败时触发降级（等待30秒起步，最大120秒）
          if (errorMsg.includes('模型响应超时或失败') || errorMsg.includes('没有生成文本')) {
          // 其他错误直接删除
        }
      }

      // 【修复】处理内部代理任务的 final/error/aborted 事件
      // 注意：不能简单忽略所有 agent: 开头的 sessionKey，因为主请求的 sessionKey 可能是 "main"，
      // 而内部代理任务的 sessionKey 是 "agent:main:main"，这是主请求的响应！
      if (msg.type === 'event' && msg.event === 'chat') {
        const payload = msg.payload;
        if ((payload.state === 'final' || payload.state === 'error' || payload.state === 'aborted') && 
            payload.sessionKey && payload.sessionKey.startsWith('agent:')) {
          // 检查是否有匹配的 pending 请求
          let isMatched = false;
          for (const [reqId, pending] of pendingRequests.entries()) {
            const pendingSessionKeyLower = (pending.sessionKey || '').toLowerCase();
            const payloadSessionKeyLower = (payload.sessionKey || '').toLowerCase();
            // 检查 sessionKey 是否匹配：main -> agent:main:main
            const sessionKeyMatches = pendingSessionKeyLower === payloadSessionKeyLower || 
              payloadSessionKeyLower === `agent:${pendingSessionKeyLower}:${pendingSessionKeyLower}`;
            if (sessionKeyMatches) {
              isMatched = true;
              break;
            }
          }
          if (!isMatched) {
            console.log(`[内部代理任务] 忽略: ${payload.state}, runId: ${payload.runId}, sessionKey: ${payload.sessionKey}`);
          }
        }
      }

      // 处理 cron 事件（定时任务状态更新）
      if (msg.type === 'event' && msg.event === 'cron') {
        const payload = msg.payload;
        console.log('[Cron 事件]', JSON.stringify(payload).substring(0, 300));
        // 转发到渲染进程（让 renderer.js 里的 onCronEvent 处理 summary）
        sendToRenderer('cron-event', payload);
        return;
      }

      // 处理 cron.deliver 事件（定时任务投递到 QQ）
      if (msg.type === 'event' && msg.event === 'cron.deliver') {
        const { channel, to, message: cronMsg } = msg.payload || {};
        if (channel === 'qq' && cronMsg && qqBots.length > 0) {
          const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
          const formattedMsg = cronMsg.startsWith('小端：') ? cronMsg : `小端：${cronMsg}`;
          (async () => {
            for (const bot of runningBots) {
              try {
                const activeUsers = to === 'all' ? bot.getActiveUsers() : (to ? [to] : bot.getActiveUsers());
                if (activeUsers.length > 0) {
                  await bot.broadcastToUsers(activeUsers, formattedMsg);
                  console.log(`[Cron QQ投递] ${bot.name} -> ${activeUsers.length}个用户`);
                }
              } catch (err) {
                console.error(`[Cron QQ投递] ${bot.name} 失败:`, err.message);
              }
            }
          })().catch(err => console.error('[Cron QQ投递] 异常:', err.message));
        }
        return;
      }

      // 处理 agent 事件（处理 assistant 流式输出和工具调用）
      if (msg.type === 'event' && msg.event === 'agent') {
        const payload = msg.payload;
        
        // 工具调用事件：直接转发到前端（显示在系统日志）
        if (payload.stream === 'tool') {
          sendToRenderer('agent-event', payload);
          // 同时保留原有的 service-log 逻辑
          const toolData = payload.data || {};
          const toolName = toolData.name || '未知工具';
          const phase = toolData.phase || '';
          const toolNameMap = {
            'readFile': '读取文件', 'writeFile': '写入文件', 'exec': '执行命令',
            'read': '读取文件', 'write': '写入文件', 'edit': '修改文件',
            'browser': '浏览器', 'cron': '定时任务', 'keyword': '搜索记忆',
            'neirong': '搜索内容', 'web_fetch': '获取网页'
          };
          const displayName = toolNameMap[toolName] || toolName;
          if (phase === 'start') {
            let detail = '';
            const args = toolData.args || {};
            detail = args.command || args.path || args.url || args.targetUrl || args.keywords || args.keyword || '';
            if (detail.length > 60) detail = detail.substring(0, 60) + '...';
            if (detail) detail = ': ' + detail;
            sendServiceLog(`🔧 ${displayName}${detail}`);
          } else if (phase === 'result') {
            const hasError = toolData.result && toolData.result.error;
            sendServiceLog(hasError ? `❌ ${displayName} 失败` : `✅ ${displayName} 完成`);
          }
          return;
        }
        
        // 打印所有 agent 事件帮助排查
        if (payload.stream === 'error') {
          console.log('[❌ Agent error]', JSON.stringify(payload.data));
        } else if (payload.stream === 'lifecycle') {
          console.log('[生命周期]', payload.data?.phase, payload.data?.error || '');
        } else if (payload.stream === 'tool') {
          console.log('[工具调用]', payload.data?.name, payload.data?.phase);
        } else if (payload.stream === 'assistant') {
          // console.log('[assistant stream]', JSON.stringify(payload.data).substring(0, 100));
        } else {
          // 打印所有其他 stream 类型，帮助发现新事件
          console.log('[Agent stream]', payload.stream, JSON.stringify(payload.data || {}).substring(0, 100));
        }
        
        // 【新增】处理 cron 会话的消息 - 直接显示在前端
        const payloadSessionKey = payload.sessionKey || '';
        if (payloadSessionKey.includes(':cron:')) {
          console.log('[Cron 会话消息]', payload.stream || payload.state, payload.data || payload.message);
          
          // 处理 assistant 流式输出
          if (payload.stream === 'assistant' && payload.data && payload.data.text) {
            const text = payload.data.text;
            
            // 过滤掉英文系统提示，只显示中文回复
            if (!isEnglishSystemPrompt(text) && mainWindow && mainWindow.webContents) {
              // 直接发送到前端，使用特殊的 reqId 标识这是 cron 消息
              mainWindow.webContents.send('assistant-stream', { 
                reqId: 'cron-' + payload.runId, 
                delta: text, 
                isComplete: false 
              });
            }
          }
          
          // 处理 final 事件（完整消息）
          if (payload.state === 'final' && payload.message && payload.message.content) {
            const content = payload.message.content;
            let finalText = '';
            
            if (Array.isArray(content)) {
              finalText = content
                .filter(block => block && block.type === 'text' && block.text)
                .map(block => block.text)
                .join('\n\n');
            } else if (typeof content === 'string') {
              finalText = content;
            }
            
            // 过滤英文系统提示
            finalText = filterEnglishPrompts(finalText);
            
            if (finalText && mainWindow && mainWindow.webContents) {
              // 直接发送到前端，使用特殊的 reqId 标识这是 cron 消息
              mainWindow.webContents.send('assistant-stream', { 
                reqId: 'cron-' + payload.runId, 
                delta: finalText, 
                isComplete: true 
              });
            }
            
            // 【家庭共享】广播 cron 消息给所有 QQ 用户
            console.log('[Cron 家庭共享] 检查广播条件...');
            console.log('[Cron 家庭共享] finalText:', finalText ? `有内容(${finalText.length}字)` : '无内容');
            console.log('[Cron 家庭共享] qqBots:', qqBots.length, '个');
            
            if (finalText && finalText.trim() && qqBots.length > 0) {
              const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
              console.log('[Cron 家庭共享] 运行中的机器人:', runningBots.length);
              
              if (runningBots.length > 0) {
                console.log(`[Cron 家庭共享] 📢 准备广播 cron 消息给 ${runningBots.length} 个机器人`);
                
                // 异步广播，不阻塞主流程
                (async () => {
                  for (const bot of runningBots) {
                    try {
                      const activeUsers = bot.getActiveUsers();
                      console.log(`[Cron 家庭共享] ${bot.name} 活跃用户数: ${activeUsers.length}`);
                      
                      if (activeUsers.length > 0) {
                        // 显示用户名字
                        const userNames = activeUsers.map(id => getUserDisplayName(id));
                        console.log(`[Cron 家庭共享] ${bot.name} 广播目标: ${userNames.join(', ')}`);
                        
                        // 格式化回复：确保以"小端："开头
                        let formattedReply = finalText;
                        if (!finalText.startsWith('小端：')) {
                          formattedReply = `小端：${finalText}`;
                        }
                        
                        const results = await bot.broadcastToUsers(activeUsers, formattedReply);
                        const successCount = results.filter(r => r.success).length;
                        console.log(`[Cron 家庭共享] ${bot.name} 广播结果: ${successCount}/${activeUsers.length} 成功`);
                        
                        if (successCount === 0 && activeUsers.length > 0) {
                          console.log(`[Cron 家庭共享] ${bot.name} 广播全部失败，尝试重连...`);
                          bot.isRunning = false;
                          setTimeout(() => bot.start(), 1000);
                        }
                      } else {
                        console.log(`[Cron 家庭共享] ${bot.name} 无需广播（无活跃用户）`);
                      }
                    } catch (err) {
                      console.error(`[Cron 家庭共享] ${bot.name} 广播异常:`, err.message);
                    }
                  }
                })().catch(err => {
                  console.error('[Cron 家庭共享] 广播流程异常:', err);
                });
              } else {
                console.log('[Cron 家庭共享] ⚠️ 没有运行中的机器人，跳过广播');
                // 尝试重连所有机器人
                for (const bot of qqBots) {
                  if (!bot.isRunning || !bot.ws || bot.ws.readyState !== 1) {
                    console.log(`[Cron 家庭共享] 尝试重连 ${bot.name}...`);
                    bot.start().catch(err => {
                      console.error(`[Cron 家庭共享] ${bot.name} 重连失败:`, err.message);
                    });
                  }
                }
              }
            } else {
              console.log('[Cron 家庭共享] 不满足广播条件，跳过');
            }
          }
          
          // 直接返回，不进入下面的 pending request 匹配逻辑
          return;
        }
        
        if (payload && payload.runId) {
          for (const [reqId, pending] of pendingRequests.entries()) {
            const matchRunId = pending.actualRunId || pending.runId;
            
            // 统一使用小写比较 sessionKey
            const pendingSessionKeyLower = (pending.sessionKey || '').toLowerCase();
            const payloadSessionKeyLower = (payload.sessionKey || '').toLowerCase();
            
            // 【修复】sessionKey 匹配逻辑：支持主会话匹配子会话（agent:main:main -> main）
            const sessionKeyMatches = pendingSessionKeyLower === payloadSessionKeyLower || 
              payloadSessionKeyLower === `agent:${pendingSessionKeyLower}:${pendingSessionKeyLower}`;
            
            if (sessionKeyMatches && matchRunId === payload.runId) {
              
              // 检查是否已被取消
              if (pending.cancelled) {
                return;
              }
              
              // 处理错误事件
              if (payload.stream === 'error') {
                const errorMsg = payload.data?.error || payload.data?.message || JSON.stringify(payload.data) || '未知错误';
                console.log('[❌ Agent 错误]', errorMsg);
                
                // seq gap 错误：只是警告，模型能继续执行，不需要重试
                if (payload.data?.reason === 'seq gap') {
                  addLog(`[seq gap 警告] 消息序列号不连续，但模型能继续执行`);
                  // 不标记 needRetry，让请求继续完成
                } 
                else {
                  let userMsg = `❌ 错误: ${errorMsg}`;
                  if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) userMsg = '❌ API Key 无效或已过期';
                  else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) userMsg = '❌ API 请求超时，请检查网络';
                  else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) userMsg = '❌ 无法连接到 API 服务器';
                  
                  if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('assistant-stream', { reqId: reqId, delta: userMsg, isComplete: true });
                    sendServiceLog(userMsg);
                  }
                }
              }
              
              // 处理生命周期事件
              if (payload.stream === 'lifecycle') {
                const phase = payload.data?.phase;
                console.log('[生命周期]', phase, payload.data?.error || '');
              }
              
                if (phase === 'start' && mainWindow && mainWindow.webContents) {
                  let modelInfo = payload.data?.model;
                  if (!modelInfo) {
                    modelInfo = 'custom/gemma4:26b';
                  }
                  const modelShort = modelInfo.split('/').pop() || modelInfo;
                  sendServiceLog(`🤖 AI 开始思考... [${modelShort}]`);
                } else if ((phase === 'error' || phase === 'failed') && payload.data?.error) {
                  const errDetail = payload.data.error;
                  console.log('[❌ 生命周期错误]', errDetail);

                  let userMsg = `❌ API 调用失败: ${errDetail}`;
                  if (errDetail.includes('401') || errDetail.includes('Unauthorized')) userMsg = '❌ API Key 无效或已过期，请检查配置';
                  else if (errDetail.includes('timeout') || errDetail.includes('ETIMEDOUT')) userMsg = '❌ API 请求超时，请检查网络';
                  else if (errDetail.includes('model') && errDetail.includes('not')) userMsg = '❌ 模型不可用，请检查模型配置';

                  if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('assistant-stream', { reqId: reqId, delta: userMsg, isComplete: true });
                    sendServiceLog(userMsg);
                  }
                }
              }
              
              // 处理 assistant 流式输出（已禁用，不发送到前端）
              if (payload.stream === 'assistant' && payload.data && payload.data.text) {
                const text = payload.data.text;
                
                // 处理文本（用于最终返回）
                // 如果 text 很长（>10000字），说明是完整内容，直接替换
                // 否则是增量内容，追加
                if (text.length > 10000) {
                  pending.streamBuffer = text;
                } else {
                  if (!pending.streamBuffer) {
                    pending.streamBuffer = '';
                  }
                  pending.streamBuffer += text;
                }
                pending.hasStreamOutput = true;  // 标记有流式输出
                
                // 不再发送流式更新到前端
              }
              
              // 处理工具调用（只在系统日志显示）
              if (payload.stream === 'tool') {
                pending.hasStreamOutput = true;  // 标记有工具调用
                
                const toolData = payload.data || {};
                const toolName = toolData.name || '未知工具';
                const phase = toolData.phase || '';
                
                // 只在系统日志显示（简化版）
                if (mainWindow && mainWindow.webContents) {
                  // 翻译常见工具名称
                  const toolNameMap = {
                    'readFile': '读取文件',
                    'writeFile': '写入文件',
                    'listDirectory': '列出目录',
                    'executePwsh': '执行命令',
                    'searchFiles': '搜索文件',
                    'readCode': '读取代码',
                    'editCode': '编辑代码',
                    'deleteFile': '删除文件',
                    'moveFile': '移动文件',
                    'grepSearch': '搜索内容',
                    'fsWrite': '创建文件',
                    'strReplace': '修改文件',
                    'describeImage': '识别图片',
                    'describeImageWithModel': '识别图片',
                    'cron': '定时任务'  // 新增：隐藏 cron 字样
                  };
                  
                  const displayName = toolNameMap[toolName] || toolName;
                  
                  // 【特殊处理】cron 工具：显示友好提示
                  if (toolName === 'cron') {
                    if (phase === 'start') {
                      sendServiceLog('✅ 正在进行中');
                    }
                    return;  // 不显示其他 cron 日志
                  }
                  
                  // 只在开始时显示系统日志
                  if (phase === 'start') {
                    let detail = '';
                    if (toolData.args) {
                      if (toolData.args.path) {
                        detail = `: ${toolData.args.path}`;
                      } else if (toolData.args.targetFile) {
                        detail = `: ${toolData.args.targetFile}`;
                      } else if (toolData.args.command) {
                        detail = `: ${toolData.args.command}`;
                      } else if (toolData.args.fileName) {
                        detail = `: ${toolData.args.fileName}`;
                      }
                    }
                    sendServiceLog(`🔧 ${displayName}${detail}`);
                  } else if (phase === 'result') {
                    // 显示结果
                    const hasError = toolData.result && toolData.result.error;
                    if (hasError) {
                      sendServiceLog(`❌ ${displayName} 失败`);
                    } else {
                      // 如果是图片识别，显示识别结果
                      if (toolName.includes('Image') && toolData.result && toolData.result.text) {
                        const preview = toolData.result.text.substring(0, 100);
                        sendServiceLog(`✅ ${displayName}: ${preview}...`);
                        console.log('[图片识别结果]', toolData.result.text);
                      } else {
                        sendServiceLog(`✅ ${displayName} 完成`);
                      }
                    }
                  }
                }
              }
              
              // compaction 事件静默处理，不显示给用户
              if (payload.stream === 'compaction') {
                // 静默
              }
              break;
            }
          }
        }
      }
    } catch (e) {
      addLog(`[WebSocket] 解析失败: ${e.message}`);
      console.error('[全局 WebSocket] 解析失败:', e);
    }
  });
  
  globalWs.on('error', (error) => {
    addLog('[WebSocket] 错误: ' + error.message);
    console.error('[全局 WebSocket] 错误:', error);
    wsConnected = false;
  });
  
  globalWs.on('close', () => {
    console.log('[全局 WebSocket] 已关闭，3秒后重连');
    wsConnected = false;
    globalWs = null;
    
    // 拒绝所有待处理的请求
    for (const [reqId, pending] of pendingRequests.entries()) {
      pending.reject(new Error('WebSocket 连接已关闭'));
    }
    pendingRequests.clear();
    
    // 3秒后重连
    setTimeout(() => {
      if (isGatewayReady) {
        initWebSocket();
      }
    }, 3000);
  });
}

// 检查 Node.js 版本
function checkNodeVersion() {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    return major >= 22;
  } catch {
    return false;
  }
}



// 检测包管理器（优先 pnpm，没有就用 npm，不再自动安装）
function detectPackageManager() {
  try {
    const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return cmd;
  } catch {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
  }
}

// 解码日志（处理 Windows 乱码）
function decodeLog(buffer) {
  return buffer.toString('utf8');
}




// 检查依赖（node_modules 已打包，仅检测是否存在）
async function checkAndInstallDeps(window) {
  const mainNodeModulesPath = path.join(__dirname, 'node_modules');
  
  if (fs.existsSync(mainNodeModulesPath)) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('install-log', '✅ 基础组件已就绪');
    }
  } else {
    if (window && !window.isDestroyed()) {
      window.webContents.send('install-log', '❌ 基础组件缺失，请重新安装');
    }
  }
}

// 清理端口占用
async function killPortProcess(window, port) {
  // 静默检查和清理端口，不显示日志
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        try {
          const stdout = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
          
          if (stdout) {
            const lines = stdout.trim().split('\n');
            const pids = new Set();
            
            lines.forEach(line => {
              const match = line.trim().match(/\s+(\d+)\s*$/);
              if (match) {
                pids.add(match[1]);
              }
            });
            
            if (pids.size > 0) {
              pids.forEach(pid => {
                try {
                  execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                } catch (e) {
                  // 忽略错误
                }
              });
              setTimeout(resolve, 1000);
              return;
            }
          }
        } catch (e) {
          // 没有找到占用端口的进程
        }
      } else {
        try {
          const stdout = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
          
          if (stdout) {
            const pids = stdout.trim().split('\n');
            if (pids.length > 0 && pids[0]) {
              pids.forEach(pid => {
                try {
                  execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                } catch (e) {
                  // 忽略错误
                }
              });
              setTimeout(resolve, 1000);
              return;
            }
          }
        } catch (e) {
          // 没有找到占用端口的进程
        }
      }
      
      resolve();
    } catch (error) {
      resolve();
    }
  });
}

// 【保命】检查并重启备份脚本（每小时调用）
function checkAndRestartBackupScript() {
  const backupScriptPath = path.join(__dirname, 'xiaoduan_backup.py');
  if (!fs.existsSync(backupScriptPath)) {
    // 文件不存在，跳过（用户魔改了）
    return;
  }
  if (backupProcess && !backupProcess.killed && backupProcess.exitCode === null) {
    // py 正在运行，跳过
    return;
  }
  // py 不在运行，重新启动
  console.log('[备份] PY脚本未运行，正在重新启动...');
  startBackupScript();
}

// 【保命】启动 PY 备份脚本（独立进程）
let backupProcess = null;
function startBackupScript() {
  try {
    const backupScriptPath = path.join(__dirname, 'xiaoduan_backup.py');
    if (!fs.existsSync(backupScriptPath)) {
      console.log('[备份] PY脚本不存在，跳过');
      return;
    }

    // 尝试找到 python 命令
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    if (backupProcess) {
      try { backupProcess.kill(); } catch(e) {}
    }

    backupProcess = spawn(pythonCmd, [backupScriptPath], {
      cwd: __dirname,
      stdio: 'pipe',
      detached: false
    });

    backupProcess.stdout.on('data', (data) => {
      const log = data.toString().trim();
      if (log) console.log(`[备份PY] ${log}`);
    });

    backupProcess.stderr.on('data', (data) => {
      const log = data.toString().trim();
      if (log) console.log(`[备份PY错误] ${log}`);
    });

    backupProcess.on('close', (code) => {
      console.log(`[备份] PY脚本退出，退出码: ${code}`);
    });

    console.log(`[备份] PY脚本已启动, pid: ${backupProcess.pid}`);
  } catch (e) {
    console.error('[备份] 启动PY脚本失败:', e.message);
  }
}

// 启动服务
async function startGatewayService(window, pkgManager) {
  addLog('========== 启动小端AI服务 ==========');

  // 确保 .xiaoduan 目录存在
  const userHome = require('os').homedir();
  const xiaoduanDir = path.join(userHome, '.xiaoduan');
  if (!fs.existsSync(xiaoduanDir)) {
    fs.mkdirSync(xiaoduanDir, { recursive: true });
  }

  // 检查配置文件，不存在则从项目/extraResources 复制
  const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
  const appConfigPath = path.join(__dirname, 'config.json');
  const resourcesConfigPath = path.join(process.resourcesPath, 'config.json');
  let templateConfig = null;

  if (fs.existsSync(appConfigPath)) {
    templateConfig = appConfigPath;
  } else if (fs.existsSync(resourcesConfigPath)) {
    templateConfig = resourcesConfigPath;
  }

  if (fs.existsSync(userConfigPath)) {
    console.log('✅ 已加载 xiaoduan.json');
    if (window && !window.isDestroyed()) {
      window.webContents.send('service-log', '✅ 配置文件已就绪');
    }
  } else if (templateConfig) {
    const configDir = path.join(userHome, '.xiaoduan');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    const content = fs.readFileSync(templateConfig, 'utf-8');
    fs.writeFileSync(userConfigPath, content, 'utf-8');
    console.log('✅ 已从模板复制 xiaoduan.json');
    if (window && !window.isDestroyed()) {
      window.webContents.send('service-log', '✅ 已生成配置文件: ' + userConfigPath);
    }
  } else {
    if (window && !window.isDestroyed()) {
      window.webContents.send('service-log', '⚠️ 配置文件不存在: ' + userConfigPath);
    }
  }

  // 复制帮助文档到 ~/.xiaoduan/jineng/（不影响其他功能）
  const helpFiles = ['Mac-飞书.md', 'Mac-QQ机器人.md', 'Mac-Python3安装指南.md', 'Mac-修复Browser功能.md', 'Mac-本地模型使用教程.md'];
  const helpDestDir = path.join(userHome, '.xiaoduan', 'jineng');
  for (const filename of helpFiles) {
    const srcPath = path.join(__dirname, filename);
    const destPath = path.join(helpDestDir, filename);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      try {
        if (!fs.existsSync(helpDestDir)) fs.mkdirSync(helpDestDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ 已复制帮助文档: ${filename}`);
      } catch (e) {}
    }
  }

  if (window && !window.isDestroyed()) {
    window.webContents.send('service-log', '⚙️ 正在启动小端AI服务...');
  }

  try {
    // 使用本地 Gateway 服务
    const gatewayPath = path.join(__dirname, 'local-gateway.js');

    // ELECTRON_RUN_AS_NODE=1 让 Electron 以纯 Node.js 模式运行，不初始化 Electron 框架
    // 这样就不会再创建窗口、跑诊断等
    gatewayProcess = spawn(process.execPath, [gatewayPath], {
      cwd: __dirname,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    addLog(`✅ 本地Gateway已启动, pid: ${gatewayProcess.pid}`);

    // 【启动前】检测并自动安装 Python（如未安装），同时检测Chromium
    (function ensurePythonOnStartup() {
      const isMac = process.platform === 'darwin';
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      // Chromium 检测立即开始（不依赖Python）
      ensureChromiumOnStartup();
      const testResult = spawn(pythonCmd, ['--version'], { stdio: 'pipe', windowsHide: true });
      let output = '';
      testResult.stdout.on('data', (data) => { output += data.toString(); });
      testResult.stderr.on('data', (data) => { output += data.toString(); });
      testResult.on('error', (e) => {
        if (e.code === 'ENOENT') {
          doDownloadAndInstallPython();
        }
      });
      testResult.on('close', (code) => {
        if (code === 0) {
          const versionMatch = output.match(/Python (\d+)\.(\d+)/);
          if (versionMatch) {
            const major = parseInt(versionMatch[1]);
            const minor = parseInt(versionMatch[2]);
            if (major === 3 && minor >= 11) {
              console.log('[Python] 检测到已安装Python', output.trim());
              startBackupScript();
              return;
            }
          }
        }
        if (isMac && (!output.includes('Python 3.11') && !output.includes('Python 3.1'))) {
          console.log('[Python] Python版本不符合要求或未正确安装，将下载安装 Python 3.11...');
          doDownloadAndInstallPython();
        } else if (code !== 0) {
          doDownloadAndInstallPython();
        }
      });
      function doDownloadAndInstallPython() {
        if (isMac) {
          console.log('[Python] 未检测到Python3，正在从魔搭下载安装...');
          const tempDir = path.join(os.homedir(), 'Library', 'Caches', 'xiaoduan', 'python');
          const installerPath = path.join(tempDir, 'python-3.11.9-macos11.pkg');
          const installerUrl = 'https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexinmac/python-3.11.9-macos11.pkg';
          try {
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const dl = spawn('curl', ['-o', installerPath, '-L', installerUrl], { stdio: 'ignore', shell: true });
            dl.on('close', (dlCode) => {
              if (dlCode === 0) {
                console.log('[Python] 下载完成，正在安装...');
                const install = spawn('sudo', ['installer', '-pkg', installerPath, '-target', '/'], { stdio: 'inherit', shell: true });
                install.on('close', (code) => {
                  if (code === 0) {
                    console.log('[Python] 安装完成');
                    try { fs.unlinkSync(installerPath); } catch (e) {}
                    startBackupScript();
                  } else {
                    console.log('[Python] 安装需要管理员权限，请在终端运行: sudo installer -pkg "' + installerPath + '" -target /"');
                    try { fs.unlinkSync(installerPath); } catch (e) {}
                  }
                });
              } else {
                console.error('[Python] 下载失败');
              }
            });
          } catch (e) {
            console.error('[Python] 安装准备失败:', e.message);
          }
          return;
        }
        console.log('[Python] 未检测到Python，正在下载安装程序...');
        const tempDir = path.join(process.env.APPDATA || '', '..', 'Local', 'xiaoduan', 'python');
        const installerPath = path.join(tempDir, 'python-3.11.9-amd64.exe');
        const installerUrl = 'https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexin/python-3.11.9-amd64.exe';
        try {
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const dl = spawn('curl', ['-o', installerPath, '-L', installerUrl], { stdio: 'ignore', shell: true, windowsHide: true });
          dl.on('close', (dlCode) => {
            if (dlCode === 0) {
              console.log('[Python] 下载完成，正在静默安装...');
              const install = spawn(installerPath, ['/quiet', 'InstallAllUsers=1', 'PrependPath=1'], { stdio: 'ignore', windowsHide: true, detached: true });
              install.on('close', () => {
                console.log('[Python] 安装完成（可能需要数分钟才能在PATH中生效）');
                try { fs.unlinkSync(installerPath); } catch (e) {}
                startBackupScript();
              });
            } else {
              console.error('[Python] 下载失败');
            }
          });
        } catch (e) {
          console.error('[Python] 安装准备失败:', e.message);
        }
      }
    })();

    // 【浏览器】启动时检测Chromium，不存在则自动从魔搭下载
    function ensureChromiumOnStartup() {
      const isMac = process.platform === 'darwin';
      const pwPath = isMac
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(process.env.APPDATA || '', '..', 'Local', 'ms-playwright');

      // 检查 Playwright Chromium 是否存在
      function checkPlaywrightChromium() {
        if (!fs.existsSync(pwPath)) return null;
        try {
          const dirs = fs.readdirSync(pwPath);
          for (const dir of dirs) {
            if (isMac) {
              const macExe1 = path.join(pwPath, dir, 'chromium-XXXX', 'chrome-mac', 'Chromium.app', 'Contents', 'Mac', 'Chromium');
              if (fs.existsSync(macExe1)) return macExe1;
              const macExe2 = path.join(pwPath, dir, 'chromium-XXXX', 'chromium-XXXX', 'chrome-mac', 'Chromium.app', 'Contents', 'Mac', 'Chromium');
              if (fs.existsSync(macExe2)) return macExe2;
            } else {
              const exe1 = path.join(pwPath, dir, 'chrome-win', 'chrome.exe');
              if (fs.existsSync(exe1)) return exe1;
              const exe2 = path.join(pwPath, dir, 'chrome.exe');
              if (fs.existsSync(exe2)) return exe2;
            }
          }
        } catch (e) {}
        return null;
      }

      // 找 Playwright Chromium
      function findChromiumExe() {
        const pwChromium = checkPlaywrightChromium();
        if (pwChromium) return pwChromium;
        return null;
      }

      const chromiumExe = findChromiumExe();
      if (chromiumExe) {
        console.log('[浏览器] 检测到已有Chromium:', chromiumExe);
        return;
      }
      console.log('[浏览器] 未检测到Playwright Chromium，正在从魔搭下载...');
      const tempDir = isMac
        ? path.join(os.homedir(), 'Library', 'Caches', 'xiaoduan', 'browser')
        : path.join(process.env.APPDATA || '', '..', 'Local', 'xiaoduan', 'browser');
      const zipPath = isMac ? path.join(tempDir, 'chrome-mac-arm64.zip') : path.join(tempDir, 'chrome-win64.zip');
      const zipUrl = isMac
        ? 'https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/chrome-mac-arm64.zip'
        : 'https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/chrome-win64.zip';
      try {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const dl = spawn('curl', ['-o', zipPath, '-L', zipUrl], { stdio: 'ignore', shell: true });
        dl.on('close', (code) => {
          if (code === 0) {
            console.log('[浏览器] 下载完成，开始安装...');
            try {
              if (isMac) {
                // Mac: 解压 zip 到 ms-playwright 目录（Playwright 查找的路径）
                const chromiumDir = path.join(pwPath, 'chromium-1194');
                if (fs.existsSync(chromiumDir)) execSync(`rm -rf "${chromiumDir}"`, { stdio: 'pipe' });
                fs.mkdirSync(chromiumDir, { recursive: true });
                execSync(`unzip -o "${zipPath}" -d "${pwPath}"`, { stdio: 'pipe', timeout: 120000 });
                console.log('[浏览器] Chromium 已安装到 Playwright 缓存');
              } else {
                execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${pwPath}' -Force"`, { stdio: 'pipe', timeout: 180000, windowsHide: true });
              }
              console.log('[浏览器] 安装完成');
              try { fs.unlinkSync(zipPath); } catch (e) {}
            } catch (e) {
              console.error('[浏览器] 安装失败:', e.message);
            }
          } else {
            console.error('[浏览器] 下载失败，curl返回码:', code);
          }
        });
      } catch (e) {
        console.error('[浏览器] Chromium准备失败:', e.message);
      }
    }

    // 【保命】每小时检测 py 是否需要重启
    setInterval(checkAndRestartBackupScript, 60 * 60 * 1000);

    gatewayProcess.stdout.on('data', (data) => {
      const log = decodeLog(data);

      // 捕获飞书记忆日志
      if (log.includes('[飞书记忆]')) {
        const match = log.match(/\[飞书记忆\] id:(\S+) senderOpenId:(\S+) senderName:([^ ]+) chatId:(\S+) content:(.+)/);
        if (match) {
          const memoryId = match[1];
          const senderOpenId = match[2];
          const senderName = match[3];
          const chatId = match[4];
          const content = match[5];
          feishuPendingMessages.set(memoryId, { senderOpenId, senderName, chatId, content });
          // 5分钟后自动清理
          setTimeout(() => {
            feishuPendingMessages.delete(memoryId);
          }, 5 * 60 * 1000);

          // 【新增】发送飞书用户消息到前端显示
          if (mainWindow && mainWindow.webContents) {
            const displayName = senderName || '飞书用户';
            mainWindow.webContents.send('feishu-message-received', {
              type: 'feishu',
              sender: displayName,
              message: content,
              timestamp: Date.now()
            });
          }
        }
      }

      // 调试：检测是否有cron日志
      if (log.includes('cron')) {
        console.log('[CRON DEBUG]', log.substring(0, 500));
      }

      // 过滤日志：只保留中文内容、错误信息和关键进度
      // 注意：不要过滤 "Loading" 等关键日志，否则无法诊断启动问题
      const lines = log.split('\n');
      lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;
        
        // 跳过 ANSI 转义码和进度条动画
        if (/\[2K|\[1A|\[G|⠏|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(trimmed)) {
          return;
        }
        
        // 跳过 Gathering information 进度提示
        if (trimmed.includes('Gathering information') || 
            trimmed.includes('Processing')) {
          return;
        }
        
        // 跳过停止后的孤立消息清理提示（正常现象）
        if (trimmed.includes('Removed orphaned user message') ||
            trimmed.includes('consecutive user turns')) {
          return;
        }
        
        // 屏蔽无意义的系统日志
        if (trimmed.includes('任务完成但没有生成文本') ||
            trimmed.includes('正在整理对话历史') ||
            trimmed.includes('[heartbeat]') ||
            trimmed.includes('[飞书记忆捕获]') ||
            trimmed.includes('[飞书用户消息]') ||
            trimmed.includes('[飞书记忆]') ||
            trimmed.includes('Developer Console') ||
            trimmed.includes('Events and Callbacks') ||
            trimmed.includes('Mode of event') ||
            trimmed.includes('event/callback subscription') ||
            trimmed.includes('persistent connection') ||
            trimmed.includes('Receive events')) {
          return;
        }
        
        // 显示调试日志
        if (trimmed.includes('[调试]') || trimmed.includes('[超时调试]')) {
          addLog('[前端显示] ' + trimmed);
          if (window && window.webContents) {
            window.webContents.send('service-log', '🔍 ' + trimmed.substring(0, 200));
          }
        } else if (trimmed.length > 0) {
        
        // 跳过聊天内容（包含 HEARTBEAT_OK 或常见聊天词汇）
        if (trimmed.includes('HEARTBEAT_OK') ||
            trimmed.includes('哈哈') ||
            trimmed.includes('😊') ||
            trimmed.includes('😄') ||
            trimmed.includes('💪') ||
            /[你我他她它们的吗呢啊]$/.test(trimmed)) {
          return;
        }
        }
        
        // 允许 cron 相关日志（优先检查）
        if (trimmed.includes('cron')) {
          // 允许通过，不过滤
        } else {
          // 跳过纯英文技术日志
          if (/^[\x00-\u007F\s]*$/.test(trimmed) && 
              !trimmed.includes('error') && 
              !trimmed.includes('Error')) {
            return;
          }
        }
        
        // 跳过 WebSocket 连接日志
        if (trimmed.includes('[ws]') || 
            trimmed.includes('conn=') ||
            trimmed.includes('remote=')) {
          return;
        }
        
        // 跳过时间戳开头的纯技术日志（除非包含 cron）
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed) &&
            !trimmed.includes('错误') &&
            !trimmed.includes('失败') &&
            !trimmed.includes('降级') &&
            !trimmed.includes('Error') &&
            !trimmed.includes('cron')) {
          return;
        }
        
        // 只发送有意义的日志
        if (trimmed.length > 0 && window && !window.isDestroyed()) {
          window.webContents.send('service-log', trimmed);
        }
      });
      
      // 检测服务是否就绪
      if (log.includes('Gateway') || log.includes('listening') || log.includes('18888') || log.includes('started') || log.includes('Listening')) {
        if (!isGatewayReady) {
          addLog('[服务就绪] 检测到服务启动日志');
          isGatewayReady = true;
          if (window && !window.isDestroyed()) {
            window.webContents.send('service-ready');
            window.webContents.send('service-log', '✅ 小端AI 已就绪，开始对话吧！');
          }
          
          // 初始化 WebSocket 连接
          setTimeout(() => {
            initWebSocket();
            // 启动 QQ 机器人（如果已配置）
            startQQBotIfEnabled();
          }, 1000);
        }
      }
    });
    
    gatewayProcess.stderr.on('data', (data) => {
      const msg = decodeLog(data);
      addLog(`[步骤B-Node stderr] ${msg.substring(0, 150)}`);
      
      const lines = msg.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        // 屏蔽无意义的日志
        if (trimmed.includes('任务完成但没有生成文本') ||
            trimmed.includes('正在整理对话历史') ||
            trimmed.includes('Removed orphaned user message') ||
            trimmed.includes('consecutive user turns') ||
            trimmed.includes('session_status failed') ||
            trimmed.includes('[diagnostic]') ||
            trimmed.includes('[WARN]') ||
            trimmed.includes('[heartbeat]') ||
            trimmed.includes('cache_util_win') ||
            trimmed.includes('disk_cache') ||
            trimmed.includes('gpu_disk_cache') ||
            trimmed.includes('Unable to move the cache') ||
            trimmed.includes('Unable to create cache') ||
            trimmed.includes('Cache Creation failed') ||
            trimmed.includes('ELECTRON_RUN_AS_NODE')) {
          return;
        }
        // 只转发真正的错误信息到前端
        if ((trimmed.includes('Error') || trimmed.includes('error') || trimmed.includes('失败') || trimmed.includes('FATAL')) &&
            window && !window.isDestroyed()) {
          window.webContents.send('service-log', '⚠️ ' + trimmed.substring(0, 200));
        }
      });
    });
    
    gatewayProcess.on('error', (error) => {
      addLog(`[服务错误] 启动失败: ${error.message}`);
      if (window && !window.isDestroyed()) {
        window.webContents.send('service-log', '❌ 服务启动错误: ' + error.message);
      }
    });
    
    gatewayProcess.on('close', (code) => {
      addLog(`[服务停止] 退出码: ${code}`);
      isGatewayReady = false;
      if (window && !window.isDestroyed()) {
        window.webContents.send('service-log', `⚠️ 服务已停止 (退出码: ${code})`);
      }
      // 退出码1 = 保命逻辑触发核心恢复，自动重启服务
      if (code === 1) {
        addLog('[保命重启] 核心文件已恢复，3秒后自动重启服务...');
        if (window && !window.isDestroyed()) {
          window.webContents.send('service-log', '🔄 核心文件已恢复，正在自动重启...');
        }
        setTimeout(() => {
          startGatewayService(window, pkgManager);
        }, 3000);
      }
    });
    
  } catch (error) {
    addLog(`[启动异常] ${error.message}\n${error.stack}`);
    if (window && !window.isDestroyed()) {
      window.webContents.send('service-log', '❌ 启动失败: ' + error.message);
    }
  }
}

// 获取用户显示名称
function getUserDisplayName(userOpenId) {
  // 尝试从 qq-bots.json 加载用户名称（优先使用这个，只用一个文件）
  try {
    const userHome = os.homedir();
    const userDataDir = path.join(userHome, '.xiaoduan');
    const qqBotsPath = path.join(userDataDir, 'qq-bots.json');

    if (fs.existsSync(qqBotsPath)) {
      const botsData = JSON.parse(fs.readFileSync(qqBotsPath, 'utf-8'));
      
      // 检查是否有用户名称映射（names 字段）
      if (botsData.names) {
        // 1. 先精确匹配（支持32位十六进制和bot_xxxxx两种格式）
        if (botsData.names[userOpenId]) {
          return botsData.names[userOpenId];
        }
        
        // 2. 按前8位匹配（支持32位十六进制格式，也支持只配置前8位）
        const shortId = userOpenId.substring(0, 8);
        for (const [id, name] of Object.entries(botsData.names)) {
          // 如果配置的ID只有8位，直接匹配
          if (id.length === 8 && id === shortId) {
            return name;
          }
          // 如果配置的是完整32位ID，匹配前8位
          if (id.startsWith(shortId) || shortId === id.substring(0, 8)) {
            return name;
          }
        }
        
        // 3. 匹配bot_xxxxx格式（用户可能用bot_开头的ID设置名字）
        for (const [id, name] of Object.entries(botsData.names)) {
          if (id.startsWith('bot_')) {
            // 如果用户ID的前8位和bot_后面的数字匹配
            const botNum = id.replace('bot_', '');
            if (userOpenId.includes(botNum) || shortId === botNum.substring(0, 8)) {
              return name;
            }
          }
        }
      }
      
      // 尝试从 qq-bots.json 获取默认排序名称
      const userIndex = botsData.users?.indexOf(userOpenId);
      if (userIndex !== -1 && userIndex !== undefined) {
        return `用户${String.fromCharCode(65 + userIndex)}`; // A, B, C, D, E...
      }
    }
    
    // 兼容旧的 qq-users.json 文件（如果 qq-bots.json 里没有 names 字段）
    const qqUsersPath = path.join(resourcesDir, 'qq-users.json');
    if (fs.existsSync(qqUsersPath)) {
      const usersData = JSON.parse(fs.readFileSync(qqUsersPath, 'utf-8'));
      
      if (usersData.names) {
        // 1. 先精确匹配
        if (usersData.names[userOpenId]) {
          return usersData.names[userOpenId];
        }
        
        // 2. 按前8位匹配（支持32位十六进制格式，也支持只配置前8位）
        const shortId = userOpenId.substring(0, 8);
        for (const [id, name] of Object.entries(usersData.names)) {
          // 如果配置的ID只有8位，直接匹配
          if (id.length === 8 && id === shortId) {
            return name;
          }
          // 如果配置的是完整32位ID，匹配前8位
          if (id.startsWith(shortId) || shortId === id.substring(0, 8)) {
            return name;
          }
        }
      }
    }
  } catch (err) {
    addLog(`[getUserDisplayName] 获取用户名称失败: ${err.message}`);
    console.error('[getUserDisplayName] 获取用户名称失败:', err.message);
  }
  
  // 默认返回 OpenID 前8位
  return userOpenId.substring(0, 8);
}

// 启动 QQ 机器人（支持多个）
function startQQBotIfEnabled() {
  addLog('========== QQ机器人启动诊断 ==========');
  addLog('[QQ机器人] 检查配置...');
  
  // 根据打包状态选择正确的路径
  const userHome = os.homedir();
  const userDataDir = path.join(userHome, '.xiaoduan');
  const qqBotsPath = path.join(userDataDir, 'qq-bots.json');

  addLog(`[QQ机器人] 配置路径: ${qqBotsPath}`);
  addLog(`[QQ机器人] 文件存在: ${fs.existsSync(qqBotsPath)}`);
  
  let bots = [];
  
  if (fs.existsSync(qqBotsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(qqBotsPath, 'utf-8'));
      bots = data.bots || [];
      addLog(`[QQ机器人] 从 qq-bots.json 读取到 ${bots.length} 个机器人配置`);
    } catch (err) {
      addLog(`[QQ机器人] 读取 qq-bots.json 失败: ${err.message}`);
    }
  }
  
  if (bots.length === 0 && process.env.QQ_BOT_APPID && process.env.QQ_BOT_SECRET) {
    bots.push({
      id: 'legacy',
      name: '默认机器人',
      appId: process.env.QQ_BOT_APPID,
      secret: process.env.QQ_BOT_SECRET,
      enabled: true
    });
    addLog('[QQ机器人] 从环境变量读取到 1 个机器人配置（兼容模式）');
  }
  
  if (bots.length === 0) {
    addLog('[QQ机器人] ❌ 未找到任何机器人配置');
    addLog('========== QQ机器人诊断结束 ==========');
    return;
  }
  
  const enabledBots = bots.filter(b => b.enabled !== false);
  addLog(`[QQ机器人] 共 ${bots.length} 个机器人，${enabledBots.length} 个已启用`);
  
  for (const botConfig of enabledBots) {
    if (!botConfig.appId || !botConfig.secret) {
      addLog(`[QQ机器人] ❌ ${botConfig.name} 配置不完整，跳过`);
      continue;
    }
    
    addLog(`[QQ机器人] 启动 ${botConfig.name} (AppID: ${botConfig.appId.substring(0, 8)}...)`);

    try {
      const bot = new QQBot(botConfig.appId, botConfig.secret);
      bot.name = botConfig.name;
      bot.id = botConfig.id;

      bot.onMessage(async (message, originalMsg) => {
        try {
          const userOpenId = originalMsg.author?.user_openid || 'unknown';
          const receiveTime = Date.now();
          const messageId = originalMsg.id || `${userOpenId}-${message}-${receiveTime}`;
          
          // 【消息去重】检查是否已经处理过这条消息
          const dedupeKey = `${userOpenId}:${message}`;
          if (globalRecentlyProcessedMessages && globalRecentlyProcessedMessages.has(dedupeKey)) {
            console.log(`[QQ机器人:${bot.name}] 跳过重复消息: ${message.substring(0, 20)}...`);
            return;
          }
          
          // 记录已处理的消息（保留 5 秒，限制最大缓存大小 1000）
          if (!globalRecentlyProcessedMessages) {
            globalRecentlyProcessedMessages = new Map();
            // 启动定期清理（每 5 秒清理过期记录）
            if (!globalRecentlyProcessedMessagesCleanupTimer) {
              globalRecentlyProcessedMessagesCleanupTimer = setInterval(() => {
                const now = Date.now();
                let cleaned = 0;
                for (const [key, time] of globalRecentlyProcessedMessages) {
                  if (now - time > 5000) {
                    globalRecentlyProcessedMessages.delete(key);
                    cleaned++;
                  }
                }
                if (cleaned > 0) {
                  console.log(`[消息去重] 清理了 ${cleaned} 个过期记录`);
                }
              }, 5000);
            }
          }
          
          // 检查缓存大小
          if (globalRecentlyProcessedMessages.size > 1000) {
            const entries = Array.from(globalRecentlyProcessedMessages.entries());
            globalRecentlyProcessedMessages.clear();
            // 保留最新的 500 条
            const toKeep = entries.slice(-500);
            toKeep.forEach(([key, time]) => {
              globalRecentlyProcessedMessages.set(key, time);
            });
            console.log(`[消息去重] 缓存已满，清理后保留 ${globalRecentlyProcessedMessages.size} 条`);
          }
          
          globalRecentlyProcessedMessages.set(dedupeKey, Date.now());
          
          // 为每个用户分配独立的 sessionKey
          const sessionKey = `qq:${userOpenId}`;
          
          // 获取用户显示名称
          const userDisplayName = getUserDisplayName(userOpenId);
          
          addLog(`[QQ机器人:${bot.name}] 收到消息: ${message}`);
          console.log(`[QQ机器人:${bot.name}] 收到消息: ${message} (用户: ${userDisplayName}, sessionKey: ${sessionKey})`);
          
          // 下载所有附件（图片/视频/音频，并行下载）
          const images = [];
          const videoAudioAttachments = [];
          if (originalMsg.attachments && originalMsg.attachments.length > 0) {
            console.log(`[QQ机器人:${bot.name}] 检测到 ${originalMsg.attachments.length} 个附件`);
            
            // 并行下载所有附件
            const downloadPromises = originalMsg.attachments
              .filter(att => att.content_type && (att.content_type.startsWith('image/') || att.content_type.startsWith('video/') || att.content_type.startsWith('audio/')))
              .map(async (att) => {
                try {
                  const fileUrl = att.url;
                  console.log(`[QQ机器人:${bot.name}] 下载附件: ${att.content_type} ${fileUrl}`);
                  
                  const axios = require('axios');
                  const response = await axios.get(fileUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                      'Authorization': `QQBot ${bot.token}`
                    },
                    timeout: 30000  // 视频/音频可能较大，30秒超时
                  });
                  
                  const base64 = Buffer.from(response.data).toString('base64');
                  console.log(`[QQ机器人:${bot.name}] 下载成功: ${att.content_type} (${response.data.length} bytes)`);
                  return {
                    mimeType: att.content_type,
                    content: base64,
                    name: att.filename || att.content_type.split('/')[0]
                  };
                } catch (err) {
                  console.error(`[QQ机器人:${bot.name}] 下载附件失败:`, err.message);
                  return null;
                }
              });
            
            // 等待所有下载完成
            const downloadResults = await Promise.all(downloadPromises);
            for (const result of downloadResults.filter(r => r !== null)) {
              if (result.mimeType.startsWith('image/')) {
                images.push(result);
              } else {
                videoAudioAttachments.push(result);
              }
            }
          }
          
          // 通知前端收到消息
          const logMsg = images.length > 0
            ? `📱 [QQ消息:${userDisplayName}] ${message.substring(0, 50)}${message.length > 50 ? '...' : ''} [${images.length}张图片]`
            : `📱 [QQ消息:${userDisplayName}] ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`;
          sendServiceLog(logMsg);
          sendToRenderer('qq-message-received', {
            message: message,
            from: userDisplayName,
            sessionKey: sessionKey
          });
          
          // 【广播消息】收到 QQ 消息时，广播给其他用户（去重发送者）
          const broadcastMsg = `${userDisplayName}：${message}`;
          const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
          
          for (const bot of runningBots) {
            try {
              const activeUsers = bot.getActiveUsers();
              // 去重发送者
              const broadcastUsers = activeUsers.filter(id => id.toLowerCase() !== userOpenId.toLowerCase());
              
              if (broadcastUsers.length > 0) {
                const userNames = broadcastUsers.map(id => getUserDisplayName(id));
                console.log(`[消息广播] ${bot.name} 广播给: ${userNames.join(', ')}`);
                await bot.broadcastToUsers(broadcastUsers, broadcastMsg);
              }
            } catch (err) {
              console.error(`[消息广播] ${bot.name} 广播失败:`, err.message);
            }
          }
          
          // 检查 Gateway 连接
          if (!globalWs || !wsConnected) {
            console.error(`[QQ机器人:${bot.name}] Gateway 未连接`);
            return;
          }
          
          // 所有请求都直接处理，不再排队
          // 并发 >= 5 时自动降级到备用模型
          messageQueue.startProcessing();
          
          try {
            const response = await sendMessageToGateway(message, sessionKey, images);
            console.log(`[QQ机器人:${bot.name}] AI回复给 ${userDisplayName}: ${response.substring(0, 50)}...`);
            
            // 格式化回复：确保以"小端：@发送者"开头
            let formattedResponse = response;
            if (!response.startsWith('小端：')) {
              formattedResponse = `小端：@${userDisplayName} ${response}`;
            }
            
            // 发送回复到 QQ
            await bot.sendMessageToUser(userOpenId, formattedResponse);
            
            if (mainWindow && mainWindow.webContents) {
              sendServiceLog(`🤖 [AI回复→${userDisplayName}] ${formattedResponse.substring(0, 100)}${formattedResponse.length > 100 ? '...' : ''}`);
              // 【自我进化】QQ回复完成后，通知前端触发自我进化
              mainWindow.webContents.send('evolution-trigger', { source: 'qq' });
            }
          } finally {
            messageQueue.endProcessing();
          }
          
        } catch (error) {
          addLog(`[QQ机器人:${bot.name}] 处理消息失败: ${error.message}\n${error.stack}`);
          console.error(`[QQ机器人:${bot.name}] 处理消息失败:`, error);
          if (mainWindow && mainWindow.webContents) {
            sendServiceLog(`❌ [QQ机器人:${bot.name}] 处理失败: ${error.message}`);
          }
          return '抱歉，处理消息时出错了，请稍后再试。';
        }
      });
      
      bot.start().then(() => {
        console.log(`[QQ机器人:${bot.name}] ✅ 启动成功`);
        addLog(`[QQ机器人:${bot.name}] ✅ 启动成功`);
      }).catch(err => {
        console.error(`[QQ机器人:${bot.name}] ❌ 启动失败:`, err.message);
        addLog(`[QQ机器人:${bot.name}] ❌ 启动失败: ${err.message}`);
      });
      
      qqBots.push(bot);
      
    } catch (error) {
      console.error(`[QQ机器人] 初始化 ${botConfig.name} 失败:`, error);
      addLog(`[QQ机器人] 初始化 ${botConfig.name} 失败: ${error.message}`);
    }
  }
  
  addLog(`[QQ机器人] 共启动 ${qqBots.length} 个机器人`);
  addLog('========== QQ机器人诊断结束 ==========');
}

// 异步处理队列（5并发）
async function processQueueAsync() {
  // 只处理一条消息，避免并发计数混乱
  if (!messageQueue.canProcess() || messageQueue.getLength() === 0) {
    return;
  }
  
  const item = messageQueue.queue.shift();
  if (!item) return;
  
  messageQueue.startProcessing();
  
  try {
    const sessionKey = normalizeSessionKey(item.sessionKey) || 'main';
    const userDisplayName = item.userDisplayName || 'QQ';
    const response = await sendMessageToGateway(item.text, sessionKey, item.attachments);
    console.log(`[消息队列] 处理完成 (${userDisplayName}): ${response.substring(0, 50)}...`);
    
    // 发送回复到 QQ
    if (item.bot && item.userOpenId) {
      await item.bot.sendMessageToUser(item.userOpenId, response);
    }
    
    if (mainWindow && mainWindow.webContents) {
      sendServiceLog(`🤖 [队列回复→${userDisplayName}] ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
      // 【自我进化】队列回复完成后，通知前端触发自我进化
      mainWindow.webContents.send('evolution-trigger', { source: 'qq' });
    }
  } catch (error) {
    addLog(`[消息队列] 处理失败: ${error.message}\n${error.stack}`);
    console.error('[消息队列] 处理失败:', error);
  } finally {
    messageQueue.endProcessing();
    
    // 继续处理队列中的下一条
    if (messageQueue.getLength() > 0) {
      setImmediate(() => processQueueAsync());
    }
  }
}

// 发送消息到 Gateway（供 QQ 机器人使用）
function sendMessageToGateway(message, sessionKey = 'main', images = []) {
  return new Promise((resolve, reject) => {
    const reqId = `chat-${Date.now()}`;
    const idempotencyKey = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const currentConcurrent = messageQueue.getProcessingCount();
    addLog(`[QQ消息处理] sessionKey: ${sessionKey}, 并发: ${currentConcurrent}/5`);
    
    // 读取用户配置的模型：优先用户目录的 xiaoduan.json，其次项目的 config.json
    let userPrimaryModel = 'zhipu/glm-4.7-flash';  // 默认值
    try {
      const userHome = require('os').homedir();
      const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
      if (fs.existsSync(userConfigPath)) {
        const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
        if (userConfig.agents?.defaults?.model?.primary) {
          userPrimaryModel = userConfig.agents.defaults.model.primary;
          addLog(`[模型] 使用: ${userPrimaryModel}`);
        }
      }
    } catch (e) {
      addLog(`[模型] 读取配置失败: ${e.message}`);
    }
    
    pendingRequests.set(reqId, {
      resolve: (result) => {
        addLog(`[QQ消息处理] 收到回复: ${result.reply?.substring(0, 30)}...`);
        resolve(result.reply || '抱歉，我没有回复。');
      },
      reject: (error) => {
        addLog(`[QQ消息处理] 请求失败: ${error.message}`);
        reject(error);
      },
      sessionKey: sessionKey,
      runId: idempotencyKey,
      actualRunId: null,
      finalReply: '',
      originalMessage: message,
      originalImages: images,
      startTime: Date.now(),
      hasStreamOutput: false,
      thinkingBuffer: '',
      retryCount: 0
    });
    
    // 构建消息参数
    const chatParams = {
      sessionKey: sessionKey,
      message: message || '',
      deliver: false,  // 触发 AI 回复
      idempotencyKey: idempotencyKey
    };
    
    // 【新增】处理图片/视频/音频附件
    const allAttachments = [];
    if (images && images.length > 0) {
      for (const img of images) {
        allAttachments.push({
          type: 'image',
          mimeType: img.mimeType || 'image/png',
          content: img.content  // base64 内容
        });
      }
    }
    if (typeof videoAudioAttachments !== 'undefined' && videoAudioAttachments && videoAudioAttachments.length > 0) {
      for (const att of videoAudioAttachments) {
        allAttachments.push({
          type: att.mimeType.startsWith('video/') ? 'video' : 'audio',
          mimeType: att.mimeType,
          content: att.content,
          name: att.name
        });
      }
    }
    if (allAttachments.length > 0) {
      chatParams.attachments = allAttachments;
      const imgCount = allAttachments.filter(a => a.mimeType.startsWith('image/')).length;
      const vidCount = allAttachments.filter(a => a.mimeType.startsWith('video/')).length;
      const audCount = allAttachments.filter(a => a.mimeType.startsWith('audio/')).length;
      addLog(`[QQ消息处理] 已添加 ${imgCount}张图片 ${vidCount}个视频 ${audCount}个音频`);
    }
    
    // 发送消息
    const chatMsg = {
      type: 'req',
      id: reqId,
      method: 'chat.send',
      params: chatParams
    };
    
    try {
      if (globalWs && globalWs.readyState === 1) {
        // 【修复】发送消息前用 primary 更新 sessions，确保每次都从默认模型开始
        const patchReqId = `patch-${Date.now()}`;
        const patchMsg = {
          type: 'req',
          id: patchReqId,
          method: 'sessions.patch',
          params: {
            key: sessionKey,
            model: userPrimaryModel
          }
        };
        globalWs.send(JSON.stringify(patchMsg));
        addLog(`[模型同步] 用 primary 更新 sessions: ${userPrimaryModel}`);
        
        // 等待 100ms 让 core 处理完 patch，然后再发送 chat.send
        setTimeout(() => {
          if (globalWs && globalWs.readyState === 1) {
            globalWs.send(JSON.stringify(chatMsg));
            addLog(`[QQ消息处理] 已发送请求, reqId: ${reqId}`);
          }
        }, 100);
      } else {
        addLog(`[QQ消息处理] WebSocket 未连接，readyState: ${globalWs?.readyState}`);
        reject(new Error('WebSocket 未连接'));
      }
    } catch (err) {
      addLog(`[QQ消息处理] 发送失败: ${err.message}`);
      reject(err);
    }
  });
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: '小端AI',
    icon: path.join(__dirname, 'tubiao.ico'),
    backgroundColor: '#1a1a1a',
    show: false,
    autoHideMenuBar: true  // 隐藏菜单栏
  });
  
  // 完全移除菜单栏
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  
  mainWindow.loadFile('index.html');
  
  // 注入 gatewayUrl 到 localStorage
  mainWindow.webContents.once('did-finish-load', () => {
    const gatewayUrl = 'ws://127.0.0.1:18888';
    mainWindow.webContents.executeJavaScript(`
      try {
        const settings = JSON.parse(localStorage.getItem('ui-settings') || '{}');
        settings.gatewayUrl = '${gatewayUrl}';
        localStorage.setItem('ui-settings', JSON.stringify(settings));
        console.log('[UI] Gateway URL 已设置: ${gatewayUrl}');
      } catch(e) {
        console.error('[UI] 设置 Gateway URL 失败:', e);
      }
    `);
  });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 初始化应用
async function initialize() {
  addLog('========== 应用初始化开始 ==========');
  
  addLog('[步骤1] 创建窗口...');
  createWindow();
  addLog('[步骤1] 窗口创建完成');
  
  // 等待窗口加载完成
  await new Promise(resolve => {
    mainWindow.webContents.once('did-finish-load', resolve);
  });
  addLog('[步骤2] 窗口加载完成');
  
  // 检查是否首次运行
  const userHome = require('os').homedir();
  const firstRunFlagPath = path.join(userHome, '.xiaoduan', '.first_run_done');
  const isFirstRun = !fs.existsSync(firstRunFlagPath);
  addLog(`[步骤3] 首次运行: ${isFirstRun}`);
  
  if (isFirstRun) {
    // 发送事件给前端显示自定义弹窗
    sendToRenderer('show-notice');
    
    // 创建标记文件
    try {
      const xiaoduanDir = path.join(userHome, '.xiaoduan');
      if (!fs.existsSync(xiaoduanDir)) {
        fs.mkdirSync(xiaoduanDir, { recursive: true });
      }
      fs.writeFileSync(firstRunFlagPath, new Date().toISOString(), 'utf-8');
    } catch (err) {
      console.error('创建首次运行标记失败:', err);
    }
  }
  
  // 快速开发模式：跳过服务启动
  if (process.env.DEV_MODE === 'fast') {
    sendInstallLog('⚡ 快速开发模式：跳过服务启动');
    sendInstallLog('💡 请确保服务已在其他终端运行');

    setTimeout(() => {
      isGatewayReady = true;
      sendToRenderer('service-ready');
      sendToRenderer('service-log', '✅ 开发模式已就绪');
    }, 1000);
    return;
  }

  // 自动检测包管理器
  const pkgManager = detectPackageManager();
  
  // 检查并安装依赖
  try {
    await checkAndInstallDeps(mainWindow);
  } catch (error) {
    mainWindow.webContents.send('install-log', '❌ 初始化失败: ' + error.message);
    dialog.showErrorBox('初始化失败', error.message);
    return;
  }
  
  // 启动服务
  await killPortProcess(mainWindow, 18888);
  startGatewayService(mainWindow, pkgManager);
}

// 裁剪过大的 session 文件
function trimLargeSessionFiles() {
  const sessionsDir = path.join(os.homedir(), '.xiaoduan', 'agents', 'main', 'sessions');
  const MAX_SIZE_BYTES = 100000 * 1024; // 100000KB
  
  if (!fs.existsSync(sessionsDir)) {
    return;
  }
  
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    let trimmedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.size > MAX_SIZE_BYTES) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        // 保留 header 行（第一行）
        const headerLine = lines[0];
        const messageLines = lines.slice(1);
        
        // 从后往前保留，直到总大小小于限制
        let totalSize = Buffer.byteLength(headerLine + '\n', 'utf-8');
        const keptLines = [];
        
        for (let i = messageLines.length - 1; i >= 0; i--) {
          const lineSize = Buffer.byteLength(messageLines[i] + '\n', 'utf-8');
          if (totalSize + lineSize <= MAX_SIZE_BYTES) {
            keptLines.unshift(messageLines[i]);
            totalSize += lineSize;
          } else {
            break;
          }
        }
        
        // 写回文件
        const newContent = headerLine + '\n' + keptLines.join('\n') + (keptLines.length > 0 ? '\n' : '');
        fs.writeFileSync(filePath, newContent, 'utf-8');
        trimmedCount++;
        console.log(`[Session裁剪] ${file}: ${(stat.size / 1024).toFixed(1)}KB → ${(totalSize / 1024).toFixed(1)}KB`);
      }
    }
    
    if (trimmedCount > 0) {
      console.log(`[Session裁剪] 共裁剪 ${trimmedCount} 个文件`);
    }
  } catch (err) {
    console.error('[Session裁剪] 失败:', err.message);
  }
}

// 应用生命周期
app.whenReady().then(() => {
  // 【第一步】下载最新PY备份脚本（Mac版本从hexinmac下载）
  const backupScriptPath = path.join(__dirname, 'xiaoduan_backup.py');
  if (fs.existsSync(backupScriptPath)) {
    const remoteUrl = 'https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexinmac/xiaoduan_backup.py';
    try {
      execSync(`curl -s -L -o "${backupScriptPath}" "${remoteUrl}"`, { timeout: 30000 });
      console.log('[启动] 已下载最新PY备份脚本');
    } catch (e) {
      console.log('[启动] 下载PY备份脚本失败，使用现有版本');
    }
  }

  trimLargeSessionFiles();
  initialize();
  
  // 每100小时自动清理一次
  const CLEAN_INTERVAL_MS = 100 * 60 * 60 * 1000; // 100小时
  setInterval(trimLargeSessionFiles, CLEAN_INTERVAL_MS);
});

// 强制杀死所有 node 进程（除了当前进程）
function killAllNodeProcesses() {
  try {
    if (process.platform === 'win32') {
      // Windows: 杀死所有 node.exe 进程（除了当前进程）
      const currentPid = process.pid;
      try {
        const output = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8' });
        const lines = output.split('\n');
        const pidsToKill = [];
        
        lines.forEach(line => {
          const match = line.match(/"node\.exe","(\d+)"/);
          if (match) {
            const pid = parseInt(match[1]);
            if (pid !== currentPid) {
              pidsToKill.push(pid);
            }
          }
        });
        
        // 批量杀进程
        pidsToKill.forEach(pid => {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`已杀死 node 进程: ${pid}`);
          } catch (e) {
            // 忽略错误
          }
        });
        
        // 最后杀掉当前进程（如果是开发模式）
        if (pidsToKill.length > 0) {
          setTimeout(() => {
            process.exit(0);
          }, 500);
        }
      } catch (e) {
        // 没有找到 node 进程
      }
    } else {
      // Unix/Linux/Mac
      try {
        const currentPid = process.pid;
        const output = execSync('ps aux | grep node', { encoding: 'utf8' });
        const lines = output.split('\n');
        lines.forEach(line => {
          const match = line.match(/\s+(\d+)\s+/);
          if (match && !line.includes('grep')) {
            const pid = parseInt(match[1]);
            if (pid !== currentPid) {
              try {
                execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                console.log(`已杀死 node 进程: ${pid}`);
              } catch (e) {
                // 忽略错误
              }
            }
          }
        });
      } catch (e) {
        // 没有找到 node 进程
      }
    }
  } catch (error) {
    console.error('清理 node 进程失败:', error);
  }
}

app.on('window-all-closed', () => {
  console.log('正在关闭应用...');
  
  // 设置强制退出标记
  global.isQuitting = true;
  
  // 停止 QQ 机器人
  if (qqBots.length > 0) {
    console.log(`正在关闭 ${qqBots.length} 个 QQ 机器人...`);
    for (const bot of qqBots) {
      try {
        bot.stop();
        console.log(`已关闭 QQ 机器人: ${bot.name}`);
      } catch (e) {
        console.error(`关闭 QQ 机器人 ${bot.name} 失败:`, e);
      }
    }
    qqBots = [];
  }
  
  // 关闭 WebSocket
  if (globalWs) {
    try {
      globalWs.close();
      globalWs = null;
    } catch (e) {
      console.error('关闭 WebSocket 失败:', e);
    }
  }
  
  // 杀死 Gateway 进程（Windows 特殊处理）
  if (gatewayProcess) {
    console.log('正在关闭 Gateway 进程...');
    try {
      if (process.platform === 'win32') {
        const pid = gatewayProcess.pid;
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        console.log(`已强制杀死进程树: ${pid}`);
      } else {
        gatewayProcess.kill('SIGKILL');
      }
      gatewayProcess = null;
    } catch (e) {
      console.error('关闭 Gateway 进程失败:', e);
    }
  }
  
  // 清理端口占用
  try {
    if (process.platform === 'win32') {
      execSync('netstat -ano | findstr :18888', { encoding: 'utf8' }).split('\n').forEach(line => {
        const match = line.match(/LISTENING\s+(\d+)/);
        if (match) {
          try {
            execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' });
          } catch (e) {}
        }
      });
    } else {
      execSync('lsof -ti :18888 | xargs -r kill -9', { stdio: 'ignore' });
    }
  } catch (e) {
    // 端口未占用
  }
  
  // 强制退出所有 Electron 进程
  setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' });
      } else {
        execSync('pkill -9 electron', { stdio: 'ignore' });
      }
    } catch (e) {}
    app.quit();
    process.exit(0);
  }, 1000);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', (event) => {
  if (!global.isQuitting) {
    event.preventDefault();
    console.log('应用即将退出...');
    
    // 停止 QQ 机器人
    for (const bot of qqBots) {
      try {
        bot.stop();
      } catch (e) {
        console.error(`关闭 QQ 机器人 ${bot.name} 失败:`, e);
      }
    }
    qqBots = [];
    
    // 强制杀死 Gateway 进程
    if (gatewayProcess) {
      try {
        if (process.platform === 'win32') {
          const pid = gatewayProcess.pid;
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        } else {
          gatewayProcess.kill('SIGKILL');
        }
      } catch (e) {
        console.error('强制关闭 Gateway 进程失败:', e);
      }
    }
    
    global.isQuitting = true;
    app.quit();
  }
});

// 这是修复后的 IPC 处理代码
// 替换 main.js 中从 "// IPC 处理" 开始到文件末尾的部分

// 统一 sessionKey 格式
function normalizeSessionKey(key) {
  if (!key || key === 'main') {
    return 'agent:main:main';
  }
  if (key.startsWith('agent:')) {
    return key;
  }
  return `agent:${key}:${key}`;
}

// IPC 处理 - 使用全局 WebSocket 连接
ipcMain.handle('send-message', async (_event, message, images = [], sessionKey = 'main') => {
  // 统一 sessionKey 格式
  sessionKey = normalizeSessionKey(sessionKey);
  console.log('\n========== 开始发送消息 ==========');
  console.log('[1. 用户输入] 文本:', message);
  console.log('[1. 用户输入] 图片数量:', images.length);
  console.log('[1. 用户输入] 会话:', sessionKey);

  // 【广播消息】电脑端发送消息时，广播给所有 QQ 用户（不去重）
  if (sessionKey === 'main' && qqBots.length > 0) {
    const broadcastMsg = `电脑端：${message}`;
    const runningBots = qqBots.filter(b => b.isRunning && b.ws && b.ws.readyState === 1);
    
    (async () => {
      for (const bot of runningBots) {
        try {
          const activeUsers = bot.getActiveUsers();
          
          if (activeUsers.length > 0) {
            const userNames = activeUsers.map(id => getUserDisplayName(id));
            console.log(`[消息广播-电脑端] ${bot.name} 广播给: ${userNames.join(', ')}`);
            await bot.broadcastToUsers(activeUsers, broadcastMsg);
          }
        } catch (err) {
          console.error(`[消息广播-电脑端] ${bot.name} 广播失败:`, err.message);
        }
      }
    })().catch(err => {
      console.error('[消息广播-电脑端] 广播异常:', err);
    });
  }
  
  try {
    if (!globalWs || !wsConnected) {
      console.log('[❌ 失败] WebSocket 未连接');
      throw new Error('WebSocket 未连接');
    }
    console.log('[✓ 检查通过] WebSocket 已连接');
    
    // 如果正在处理消息，加入队列
    if (messageQueue.isProcessing()) {
      const queueItem = messageQueue.enqueue(message, images);
      console.log('[消息队列] 消息已加入队列:', queueItem.id);
      
      // 通知前端更新队列显示
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('queue-update', messageQueue.getQueue());
      }
      
      return { queued: true, queueId: queueItem.id };
    }
    
    messageQueue.setProcessing(true);
    
    return new Promise((resolve, reject) => {
      const reqId = `chat-${Date.now()}`;
      const idempotencyKey = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 构建消息参数（按原版：deliver: false）
      const chatParams = {
        sessionKey: sessionKey,
        message: message || '',  // 允许空消息（只发图片）
        deliver: false,  // 原版使用 false
        idempotencyKey: idempotencyKey
      };
      
      // 处理图片/视频/音频
      if (images && images.length > 0) {
        chatParams.attachments = images.map(img => {
          const mimeType = img.type || 'image/png';
          let type = 'image';
          if (mimeType.startsWith('video/')) type = 'video';
          else if (mimeType.startsWith('audio/')) type = 'audio';
          return {
            type,
            mimeType,
            content: img.data.includes(',') ? img.data.split(',')[1] : img.data
          };
        });
        const imgCount = chatParams.attachments.filter(a => a.mimeType.startsWith('image/')).length;
        const vidCount = chatParams.attachments.filter(a => a.mimeType.startsWith('video/')).length;
        const audCount = chatParams.attachments.filter(a => a.mimeType.startsWith('audio/')).length;
        console.log('[2. 构建请求] 已添加', imgCount, '张图片', vidCount, '个视频', audCount, '个音频');
        if (chatParams.attachments.length > 0) {
          console.log('[2. 附件详情] mimeType:', chatParams.attachments[0].mimeType);
          console.log('[2. 附件详情] content 长度:', chatParams.attachments[0].content.length);
        }
      }
      
      console.log('[2. 构建请求] sessionKey:', sessionKey);
      console.log('[2. 构建请求] reqId:', reqId);
      
      // 读取用户配置的模型：优先用户目录的 xiaoduan.json
      let userPrimaryModel = 'custom/gemma4:26b';  // 默认值
      try {
        const userHome = require('os').homedir();
        const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
        if (fs.existsSync(userConfigPath)) {
          const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
          if (userConfig.agents?.defaults?.model?.primary) {
            userPrimaryModel = userConfig.agents.defaults.model.primary;
            console.log(`[模型] 使用: ${userPrimaryModel}`);
          }
        }
      } catch (e) {
        console.log(`[模型] 读取配置失败: ${e.message}`);
      }
      
      pendingRequests.set(reqId, {
        resolve: (result) => {
          console.log('[✓ 完成] 返回结果给前端');
          console.log('========== 消息处理结束 ==========\n');
          
          messageQueue.setProcessing(false);
          
          setTimeout(() => {
            if (messageQueue.getLength() > 0) {
              messageQueue.processNext().catch(err => {
                console.error('[消息队列] 处理失败:', err);
              });
            }
          }, 500);
          
          resolve(result);
        },
        reject: (error) => {
          console.log('[❌ 失败]', error.message);
          console.log('========== 消息处理结束 ==========\n');
          messageQueue.setProcessing(false);
          reject(error);
        },
        sessionKey: sessionKey,
        runId: idempotencyKey,
        actualRunId: null,
        originalMessage: message,
        startTime: Date.now(),
        cancelled: false,
        hasStreamOutput: false,
        thinkingBuffer: '',
        retryCount: 0,
        idempotencyKey: idempotencyKey,
        toolCallActive: false
      });
      
      // 【修复】发送消息前用 primary 更新 sessions，确保每次都从默认模型开始
      const patchReqId = `patch-${Date.now()}`;
      const patchMsg = {
        type: 'req',
        id: patchReqId,
        method: 'sessions.patch',
        params: {
          key: sessionKey,
          model: userPrimaryModel
        }
      };
      console.log('[模型同步] 用 primary 更新 sessions:', userPrimaryModel);
      globalWs.send(JSON.stringify(patchMsg));
      
      // 发送消息（延迟 100ms 让 core 处理完 patch）
      const chatMsg = {
        type: 'req',
        id: reqId,
        method: 'chat.send',
        params: chatParams
      };
      
      setTimeout(() => {
        console.log('[3. 发送到服务器] 正在发送 WebSocket 消息...');
        globalWs.send(JSON.stringify(chatMsg));
        console.log('[3. 发送到服务器] ✓ 已发送');
      }, 100);
    });
  } catch (error) {
    addLog(`[消息处理异常] ${error.message}\n${error.stack}`);
    console.log('[❌ 异常]', error.message);
    console.log('========== 消息处理结束 ==========\n');
    messageQueue.setProcessing(false);
    throw new Error(error.message);
  }
});

// 中断当前请求
ipcMain.handle('cancel-message', async () => {
  console.log('[中断请求] 用户请求停止');
  
  // 找到正在处理的请求
  for (const [reqId, pending] of pendingRequests.entries()) {
    if (!pending.isHistory) {
      console.log('[中断请求] 取消请求:', reqId);
      
      const runId = pending.actualRunId || pending.runId || reqId;
      const sessionKey = pending.sessionKey || 'main';

      // 标记为已取消，阻止后续事件处理
      pending.cancelled = true;
      
      // 通知 core 中止，等 aborted 事件回来再放开队列
      if (globalWs && globalWs.readyState === 1) {
        const abortMsg = {
          type: 'req',
          id: `abort-${Date.now()}`,
          method: 'chat.abort',
          params: { sessionKey, runId }
        };
        globalWs.send(JSON.stringify(abortMsg));
        console.log('[中断请求] 已发送 chat.abort, runId:', runId);
      }

      // 立即拒绝 Promise（前端不再等待）
      if (pending.reject) {
        pending.reject(new Error('用户取消'));
      }



      pendingRequests.delete(reqId);

      // 延迟 800ms 再放开队列，给 core 足够时间处理 abort
      setTimeout(() => {
        messageQueue.setProcessing(false);
        console.log('[中断请求] 队列已释放');
      }, 800);

      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('service-log', '⏸️ [已停止] 用户中断了当前任务');
      }
      
      return { success: true, message: '已停止当前任务' };
    }
  }
  
  // 没有 pending 请求时也发一个 abort，清理 core 端可能残留的状态
  if (globalWs && globalWs.readyState === 1) {
    const abortMsg = {
      type: 'req',
      id: `abort-${Date.now()}`,
      method: 'chat.abort',
      params: { sessionKey: 'main' }
    };
    globalWs.send(JSON.stringify(abortMsg));
    console.log('[中断请求] 发送全局 abort 清理 core 状态');
  }
  messageQueue.setProcessing(false);
  
  return { success: false, message: '没有正在进行的任务' };
});

// 提取消息文本的辅助函数
function extractTextFromMessage(message) {
  console.log('[extractTextFromMessage] 输入类型:', typeof message);
  
  if (!message) {
    console.log('[extractTextFromMessage] 消息为空');
    return '';
  }
  
  // 安全地转换为字符串用于日志
  try {
    const msgStr = JSON.stringify(message);
    console.log('[extractTextFromMessage] 消息内容:', msgStr.substring(0, 200));
  } catch (e) {
    console.log('[extractTextFromMessage] 无法序列化消息');
  }
  
  if (typeof message === 'string') {
    console.log('[extractTextFromMessage] 字符串类型');
    return message;
  }
  
  if (Array.isArray(message.content)) {
    const text = message.content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n\n');
    console.log('[extractTextFromMessage] 数组内容提取');
    return text;
  }
  
  if (message.content && typeof message.content === 'string') {
    console.log('[extractTextFromMessage] content字符串');
    return message.content;
  }
  
  console.log('[extractTextFromMessage] 无法提取文本');
  return '';
}

ipcMain.handle('check-service', async () => {
  return isGatewayReady;
});

// 加载聊天历史 - 读取记忆文件
ipcMain.handle('load-chat-history', async (_event, sessionKey = 'main') => {
  sessionKey = normalizeSessionKey(sessionKey);
  try {
    const userHome = require('os').homedir();
    const memoryDir = path.join(userHome, '.xiaoduan', 'agents', 'main', '记忆');
    const memoryFile = path.join(memoryDir, '记忆.txt');

    // 检查文件是否存在
    if (!fs.existsSync(memoryFile)) {
      return { messages: [] };
    }

    // 读取记忆文件
    const content = fs.readFileSync(memoryFile, 'utf-8');
    const cleanContent = content.replace(/<think[\s\S]*?<\/think>/gi, '');

    const messages = [];
    const MAX_HISTORY = 100;

    const msgRegex = /^\[.*?\]\s*(用户|助手):\s*/gm;
    let match;
    const parts = [];
    while ((match = msgRegex.exec(cleanContent)) !== null) {
      parts.push({ role: match[1] === '用户' ? 'user' : 'assistant', start: match.index, headerEnd: match.index + match[0].length });
    }
    for (let i = 0; i < parts.length; i++) {
      const start = parts[i].headerEnd;
      const end = i + 1 < parts.length ? parts[i + 1].start : cleanContent.length;
      const text = cleanContent.substring(start, end).trim();
      if (text) messages.push({ role: parts[i].role, content: text });
    }

    const recent = messages.slice(-MAX_HISTORY);

    return { messages: recent };

  } catch (error) {
    console.log('[加载历史] 异常:', error.message);
    return { messages: [] };
  }
});

// 会话管理 IPC 处理器
ipcMain.handle('get-sessions', async () => {
  return sessionManager.getAllSessions();
});

ipcMain.handle('create-session', async () => {
  const session = sessionManager.createSession();
  return session;
});

ipcMain.handle('delete-session', async (_event, sessionKey) => {
  sessionManager.deleteSession(sessionKey);
  return { success: true };
});

ipcMain.handle('switch-session', async (_event, sessionKey) => {
  sessionManager.setCurrentSession(sessionKey);
  return { success: true };
});

ipcMain.handle('update-session-title', async (_event, sessionKey, title) => {
  sessionManager.updateSessionTitle(sessionKey, title);
  return { success: true };
});

ipcMain.handle('set-reasoning-level', async (_event, sessionKey, level) => {
  sessionManager.setReasoningLevel(sessionKey, level);
  return { success: true };
});

// 消息队列 IPC 处理器
ipcMain.handle('get-queue', async () => {
  return messageQueue.getQueue();
});

ipcMain.handle('remove-queue-item', async (_event, id) => {
  messageQueue.remove(id);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('queue-update', messageQueue.getQueue());
  }
  return { success: true };
});

// 读取用户配置
ipcMain.handle('load-user-config', async () => {
  try {
    const userHome = require('os').homedir();
    const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
    if (fs.existsSync(userConfigPath)) {
      const content = fs.readFileSync(userConfigPath, 'utf-8');
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    console.error('读取用户配置失败:', error);
    throw error;
  }
});

// 保存用户配置
ipcMain.handle('save-user-config', async (_event, configUpdates) => {
  try {
    const userHome = require('os').homedir();
    const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
    let userConfig = {};

    if (fs.existsSync(userConfigPath)) {
      const content = fs.readFileSync(userConfigPath, 'utf-8');
      userConfig = JSON.parse(content);
    }

    Object.assign(userConfig, configUpdates);

    fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
    console.log('[配置] 已保存:', configUpdates);
    return { success: true };
  } catch (error) {
    console.error('保存用户配置失败:', error);
    throw error;
  }
});

// 保存用户 API 配置
ipcMain.handle('save-user-api-config', async (_event, providerName, config) => {
  try {
    const userHome = require('os').homedir();
    const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
    let userConfig = {};
    
    if (fs.existsSync(userConfigPath)) {
      const content = fs.readFileSync(userConfigPath, 'utf-8');
      userConfig = JSON.parse(content);
    }
    
    if (!userConfig.models) userConfig.models = {};
    if (!userConfig.models.providers) userConfig.models.providers = {};
    if (!userConfig.agents) userConfig.agents = {};
    if (!userConfig.agents.defaults) userConfig.agents.defaults = {};
    if (!userConfig.agents.defaults.model) userConfig.agents.defaults.model = {};
    if (!userConfig.agents.defaults.model.fallbacks) userConfig.agents.defaults.model.fallbacks = [];
    
    const oldPrimary = userConfig.agents.defaults.model.primary;
    const newModelKey = `${providerName}/${config.modelName}`;
    
    userConfig.models.providers[providerName] = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      api: 'openai-completions',
      models: [
        {
          id: config.modelName,
          name: config.modelName,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0 },
          contextWindow: 128000,
          maxTokens: 4096
        }
      ]
    };
    
    userConfig.agents.defaults.model.primary = newModelKey;
    if (oldPrimary && oldPrimary !== newModelKey) {
      userConfig.agents.defaults.model.fallbacks = [oldPrimary, ...userConfig.agents.defaults.model.fallbacks.filter(fb => fb !== oldPrimary)];
    }
    
    fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
    console.log('API 配置已保存并设为当前模型:', providerName, newModelKey);
    return { success: true };
  } catch (error) {
    console.error('保存 API 配置失败:', error);
    throw error;
  }
});

// 删除用户 API 模型
ipcMain.handle('delete-user-api-model', async (_event, providerName, modelId) => {
  try {
    const userHome = require('os').homedir();
    const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
    if (!fs.existsSync(userConfigPath)) {
      return { success: true };
    }
    
    const content = fs.readFileSync(userConfigPath, 'utf-8');
    const userConfig = JSON.parse(content);
    const deletedModelKey = `${providerName}/${modelId}`;
    
    const isPrimaryDeleted = userConfig?.agents?.defaults?.model?.primary === deletedModelKey;
    
    if (userConfig.models && userConfig.models.providers && userConfig.models.providers[providerName]) {
      const provider = userConfig.models.providers[providerName];
      if (provider.models) {
        provider.models = provider.models.filter(model => model.id !== modelId);
        
        if (provider.models.length === 0) {
          delete userConfig.models.providers[providerName];
        }
      }
    }
    
    if (isPrimaryDeleted) {
      if (!userConfig.agents) userConfig.agents = {};
      if (!userConfig.agents.defaults) userConfig.agents.defaults = {};
      if (!userConfig.agents.defaults.model) userConfig.agents.defaults.model = {};
      if (!userConfig.agents.defaults.model.fallbacks) userConfig.agents.defaults.model.fallbacks = [];
      
      const fallbacks = userConfig.agents.defaults.model.fallbacks;
      if (fallbacks.length > 0) {
        userConfig.agents.defaults.model.primary = fallbacks[0];
        userConfig.agents.defaults.model.fallbacks = fallbacks.slice(1);
      }
    } else {
      if (userConfig?.agents?.defaults?.model?.fallbacks) {
        userConfig.agents.defaults.model.fallbacks = userConfig.agents.defaults.model.fallbacks.filter(
          fb => fb !== deletedModelKey
        );
      }
    }
    
    fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
    console.log('API 模型已删除:', providerName, modelId);
    return { success: true };
  } catch (error) {
    console.error('删除 API 模型失败:', error);
    throw error;
  }
});

// 保存模型顺序
ipcMain.handle('save-model-order', async (_event, primary, fallbacks) => {
  try {
    const userHome = require('os').homedir();
    const userConfigPath = path.join(userHome, '.xiaoduan', 'xiaoduan.json');
    if (!fs.existsSync(userConfigPath)) {
      return { success: false };
    }
    
    const content = fs.readFileSync(userConfigPath, 'utf-8');
    const userConfig = JSON.parse(content);
    
    if (!userConfig.agents) userConfig.agents = {};
    if (!userConfig.agents.defaults) userConfig.agents.defaults = {};
    if (!userConfig.agents.defaults.model) userConfig.agents.defaults.model = {};
    
    userConfig.agents.defaults.model.primary = primary;
    userConfig.agents.defaults.model.fallbacks = fallbacks;
    
    fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
    console.log('模型顺序已保存:', primary, fallbacks);
    return { success: true };
  } catch (error) {
    console.error('保存模型顺序失败:', error);
    throw error;
  }
});
