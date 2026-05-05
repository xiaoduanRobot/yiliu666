const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusDiv = document.getElementById('status');
const logContent = document.getElementById('logContent');
const logHeader = document.getElementById('logHeader');
const apiConfigView = document.getElementById('apiConfigView');
const apiFormOverlay = document.getElementById('apiFormOverlay');
const apiFormCancel = document.getElementById('apiFormCancel');
const apiFormSave = document.getElementById('apiFormSave');

let showApiConfig = false;
let apiConfigList = [];
let editingModel = null;

let isServiceReady = false;
let isSending = false;
let selectedImages = [];
let imagePreviewDiv = null;
let loadingDiv = null;
let currentStreamingDiv = null;  // 当前的流式消息容器
let currentStreamContent = null;  // 当前的流式内容 div
let currentThinkingDiv = null;    // 当前的thinking消息容器
let currentThinkingContent = null;// 当前的thinking内容 div
let showThinking = false;          // 是否显示thinking过程（默认关闭，输出到系统日志）
let isUserScrolledUp = false;     // 用户是否上滑了（上滑后取消自动滚动）

// 监听用户滚动
messagesDiv.addEventListener('scroll', () => {
  const isNearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 50;
  isUserScrolledUp = !isNearBottom;
});

// 工具名称中文映射
const TOOL_NAME_MAP = {
  exec: '执行命令', read: '读取文件', write: '写入文件', edit: '修改文件',
  browser: '浏览器', cron: '定时任务', keyword: '搜索记忆', neirong: '搜索内容', web_fetch: '获取网页'
};

// 全局监听流式输出（只注册一次）
window.electronAPI.onAssistantStream((data) => {
  if (data.isComplete) {
    currentStreamingDiv = null;
    currentStreamContent = null;
    currentThinkingDiv = null;
    currentThinkingContent = null;
    return;
  }

  if (data.thinking) {
    addLog('🤔 ' + data.thinking.slice(0, 200) + (data.thinking.length > 200 ? '...' : ''));
  }

  if (data.delta) {
    // 先过滤掉工具调用块，只留纯文字
    const clean = stripToolSummaryTags(data.delta);
    if (!clean) return;
    if (currentStreamContent) {
      if (currentStreamContent.textContent === '正在思考...') {
        currentStreamContent.textContent = clean;
      } else {
        currentStreamContent.textContent += clean;
      }
    } else {
      currentStreamingDiv = document.createElement('div');
      currentStreamingDiv.id = 'streaming-message';
      currentStreamContent = document.createElement('div');
      currentStreamContent.className = 'message-content';
      currentStreamContent.textContent = clean;
      currentStreamingDiv.appendChild(currentStreamContent);
      messagesDiv.appendChild(currentStreamingDiv);
    }
    if (!isUserScrolledUp) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
});

// 监听 agent 事件：工具调用过程 → 系统日志，不进聊天框
window.electronAPI.onAgentEvent && window.electronAPI.onAgentEvent((payload) => {
  if (payload.stream !== 'tool') return;
  const d = payload.data || {};
  const name = TOOL_NAME_MAP[d.name] || d.name || '工具';
  if (d.phase === 'start') {
    let detail = '';
    if (d.args) {
      detail = d.args.command || d.args.path || d.args.url || d.args.targetUrl || d.args.keywords || d.args.keyword || '';
      if (detail.length > 60) detail = detail.substring(0, 60) + '...';
      if (detail) detail = ': ' + detail;
    }
    addLog(`🔧 ${name}${detail}`);
  } else if (d.phase === 'result') {
    if (d.result && d.result.error) {
      addLog(`❌ ${name} 失败: ${String(d.result.error).substring(0, 100)}`);
    } else {
      addLog(`✅ ${name} 完成`);
    }
  }
});

window.electronAPI.onToolCall && window.electronAPI.onToolCall(() => {});

// 【新增】监听 QQ 消息（显示在聊天框）
window.electronAPI.onQQMessageReceived((data) => {
  addMessage(`📱 ${data.message}`, 'user');
});

// 【新增】监听飞书用户消息（显示在聊天框）
window.electronAPI.onFeishuMessage((data) => {
  addMessage(`📱 [飞书] ${data.message}`, 'user');
});

// 【新增】监听飞书回复（显示在聊天框）
window.electronAPI.onFeishuReplySent((data) => {
  addMessage(data.message, 'assistant');
});

// 【新增】监听 QQ 回复（显示在聊天框）
window.electronAPI.onQQReplySent((data) => {
  // 提取回复内容（去掉"小端：@xxx "前缀）
  let replyText = data.message;
  if (replyText.startsWith('小端：')) {
    replyText = replyText.replace(/^小端：@\S+\s*/, '');
  }
  addMessage(replyText, 'assistant');
});

// 【新增】监听 cron 事件
window.electronAPI.onCronEvent((payload) => {
  // 不在这里处理
});

// 【新增】监听飞书/QQ回复完成后的自我进化触发
window.electronAPI.onEvolutionTrigger((data) => {
  addLog(`🧬 自我进化：收到${data.source || '外部'}回复完成信号`);
  triggerEvolutionIfEnabled();
});

// 添加日志
function addLog(message, type = 'info') {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContent.appendChild(logEntry);
  logContent.scrollTop = logContent.scrollHeight;
}

// 屏蔽工具总结标记 + JSON工具调用块
function stripToolSummaryTags(text) {
  if (!text) return text;
  let cleaned = text.replace(/\[起\]/g, '').replace(/\[终\]/g, '');
  // 过滤 ```json {...} ``` 工具调用块
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"(?:name|tool)"\s*:\s*"(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)[\s\S]*?```/gi, '');
  // 过滤裸 JSON 工具调用行（单行）
  cleaned = cleaned.replace(/^\s*\{\s*"(?:name|tool)"\s*:\s*"(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)"[^\n]*\}\s*$/gm, '');
  // 过滤 [TOOL_CALL] 块
  cleaned = cleaned.replace(/\[TOOL_CALL\][\s\S]*?(?=\[TOOL_CALL\]|$)/gi, '');
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

// 添加消息
function addMessage(content, role, isToolCall = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  // 如果是工具调用，添加特殊样式
  if (isToolCall) {
    messageDiv.classList.add('tool-message');
  }

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // 清理消息内容
  let cleanContent = content;
  // 0. 屏蔽工具总结标记 [起][终]
  cleanContent = stripToolSummaryTags(cleanContent);
  // 1. 移除 System: 开头的行
  cleanContent = cleanContent.split('\n')
    .filter(line => !line.trim().startsWith('System:'))
    .join('\n');
  // 2. 移除时间戳 [Fri 2026-03-13 19:55 GMT+8]
  cleanContent = cleanContent.replace(/\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*/g, '');
  // 3. 移除 message_id
  cleanContent = cleanContent.replace(/\[message_id:\s*[^\]]+\]\s*/g, '');
  // 4. 移除多余的空行
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

  contentDiv.textContent = cleanContent;

  messageDiv.appendChild(contentDiv);
  messagesDiv.appendChild(messageDiv);
  if (!isUserScrolledUp) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  return messageDiv;
}

// 更新状态
function updateStatus(message, ready = false) {
  statusDiv.textContent = message;
  statusDiv.className = ready ? 'status ready' : 'status';
  
  if (ready) {
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

// 用户手动停止后的冷却截止时间，此期间内不触发自我进化
let manualStopUntil = 0;

// 自我进化触发函数（定义在最前，供 sendMessage 调用）
function triggerEvolutionIfEnabled() {
  if (typeof evolutionEnabled === 'undefined' || !evolutionEnabled) return;
  // 用户手动停止后30秒内不触发自我进化（防止停止后又被自动继续）
  if (Date.now() < manualStopUntil) {
    addLog('🧬 自我进化：用户刚停止过，冷却中，跳过');
    return;
  }
  clearTimeout(evolutionTimer);
  evolutionTimer = setTimeout(() => {
    if (!evolutionEnabled || !isServiceReady || isSending) return;
    if (Date.now() < manualStopUntil) {
      addLog('🧬 自我进化：冷却中，跳过');
      return;
    }
    messageInput.value = '继续';
    addLog('🧬 自我进化：自动发送"继续"');
    sendMessage();
  }, 2000);
}

// 发送消息
async function sendMessage() {
  const message = messageInput.value.trim();
  if ((!message && selectedImages.length === 0) || isSending || !isServiceReady) return;
  
  isSending = true;
  sendButton.disabled = false;  // 保持启用，但变成停止按钮
  sendButton.textContent = '⏸️ 停止';
  sendButton.classList.add('stop-button');
  messageInput.disabled = true;
  
  // 显示用户消息
  if (message) {
    addMessage(message, 'user');
  } else if (selectedImages.length > 0) {
    // 有图片但没有文字，显示占位
    addMessage('[发送了图片]', 'user');
  }
  
  // 转换图片为 base64
  const imageData = [];
  if (selectedImages.length > 0) {
    for (const file of selectedImages) {
      const base64 = await fileToBase64(file);
      imageData.push({
        name: file.name,
        type: file.type,
        data: base64
      });
    }
  }
  
  const userMessage = message;  // 保存用户消息
  messageInput.value = '';
  
  // 用户发送新消息，恢复自动滚动
  isUserScrolledUp = false;
  
  // 重置thinking变量
  currentThinkingDiv = null;
  currentThinkingContent = null;
  
  // 添加"正在思考..."消息容器（不显示流式过程）
  currentStreamingDiv = document.createElement('div');
  currentStreamingDiv.id = 'streaming-message';
  currentStreamContent = document.createElement('div');
  currentStreamContent.className = 'message-content';
  currentStreamContent.textContent = '正在思考...';
  currentStreamingDiv.appendChild(currentStreamContent);
  messagesDiv.appendChild(currentStreamingDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  let cancelled = false;
  
  try {
    const response = await window.electronAPI.sendMessage(userMessage || '请分析这张图片', imageData);
    
    console.log('[前端收到resolve]', 'reply:', response?.reply ? `有(${response.reply.substring(0, 50)})` : '空', 'currentStreamContent:', currentStreamContent ? '存在' : 'null');
    
    // 检查是否已被取消
    if (!isSending) {
      cancelled = true;
      return;
    }
    
    // 处理thinking内容 - 输出到系统日志
    if (response.thinking) {
      addLog('🤔 思考: ' + response.thinking.slice(0, 500) + (response.thinking.length > 500 ? '...' : ''));
    }
    
    // 流式显示已完成，用最终回复替换（流式可能不完整）
    if (currentStreamContent && currentStreamingDiv) {
      if (response.reply && response.reply.trim()) {
        currentStreamContent.textContent = stripToolSummaryTags(response.reply);
      } else if (currentStreamContent.textContent === '正在思考...') {
        // 没有回复，移除"正在思考..."
        if (currentStreamingDiv.parentNode) {
          messagesDiv.removeChild(currentStreamingDiv);
        }
        // 任务完成，无文本输出
      }
      currentStreamingDiv = null;
      currentStreamContent = null;
    }
    
    // 清理thinking变量
    currentThinkingDiv = null;
    currentThinkingContent = null;
    
    // 清空图片选择
    selectedImages = [];
    if (imagePreviewDiv) {
      imagePreviewDiv.remove();
      imagePreviewDiv = null;
    }
  } catch (error) {
    // 检查是否已被取消
    if (!isSending) {
      cancelled = true;
      return;
    }
    
    if (currentStreamingDiv && currentStreamingDiv.parentNode) {
      const existingText = currentStreamContent?.textContent?.trim();
      if (existingText && existingText !== '正在思考...') {
        currentStreamingDiv = null;
        currentStreamContent = null;
      } else {
        messagesDiv.removeChild(currentStreamingDiv);
        currentStreamingDiv = null;
        currentStreamContent = null;
      }
    }
    if (currentThinkingDiv && currentThinkingDiv.parentNode) {
      messagesDiv.removeChild(currentThinkingDiv);
      currentThinkingDiv = null;
      currentThinkingContent = null;
    }
    
    if (error.message !== '用户取消' && error.message !== '任务已停止') {
      addMessage('抱歉，处理消息时出错: ' + error.message, 'assistant');
      addLog(`❌ 错误: ${error.message}`);
      // 模型调用失败时，自我进化模式自动继续（复用同一个触发函数）
      triggerEvolutionIfEnabled();
    } else {
      // 用户主动取消或任务被停止，标记为取消，阻止 finally 触发进化
      cancelled = true;
      addLog('⏸️ 已停止当前任务');
    }
  } finally {
    // 无论成功、失败还是取消，都要清空图片和恢复状态
    selectedImages = [];
    if (imagePreviewDiv) {
      imagePreviewDiv.remove();
      imagePreviewDiv = null;
    }
    
    // 只有在没有被取消的情况下才恢复状态
    if (!cancelled) {
      isSending = false;
      sendButton.textContent = '发送';
      sendButton.classList.remove('stop-button');
      if (isServiceReady) {
        sendButton.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
      }
      // 自我进化：正常完成后触发
      triggerEvolutionIfEnabled();
    }
  }
}

// 停止当前任务
async function stopCurrentTask() {
  if (!isSending) return;
  
  addLog('⏸️ 正在停止任务...');
  
  // 设置冷却期：30秒内不触发自我进化
  manualStopUntil = Date.now() + 30000;
  // 清除可能已存在的进化定时器
  clearTimeout(evolutionTimer);
  
  try {
    await window.electronAPI.cancelMessage();
    addLog('✅ 任务已停止');
  } catch (error) {
    addLog(`❌ 停止失败: ${error.message}`);
  }
  
  // 强制恢复状态
  if (currentStreamingDiv && currentStreamingDiv.parentNode) {
    const existingText = currentStreamContent?.textContent?.trim();
    if (existingText && existingText !== '正在思考...') {
      currentStreamingDiv = null;
      currentStreamContent = null;
    } else {
      messagesDiv.removeChild(currentStreamingDiv);
      currentStreamingDiv = null;
      currentStreamContent = null;
    }
  }
  if (currentThinkingDiv && currentThinkingDiv.parentNode) {
    messagesDiv.removeChild(currentThinkingDiv);
    currentThinkingDiv = null;
    currentThinkingContent = null;
  }
  
  isSending = false;
  sendButton.textContent = '发送';
  sendButton.classList.remove('stop-button');
  sendButton.disabled = false;
  messageInput.disabled = false;
  messageInput.focus();
}

// 文件转 base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 事件监听
sendButton.addEventListener('click', () => {
  if (isSending) {
    stopCurrentTask();
  } else {
    sendMessage();
  }
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// 监听安装日志
window.electronAPI.onInstallLog((log) => {
  addLog(log);
});

// 监听服务日志（去掉 [LocalGateway] 前缀）
window.electronAPI.onServiceLog((log) => {
  addLog(log.replace(/\[LocalGateway\]\s*/g, ''));
});

// 监听任务状态变化 - 显示/隐藏停止按钮
window.electronAPI.onTaskStatusChange((status) => {
  const hasTask = status.processingCount > 0 || status.queueLength > 0;
  if (hasTask) {
    // 有任务在运行或在队列里，显示停止按钮
    isSending = true;
    sendButton.textContent = '停止';
    sendButton.classList.add('stop-button');
  } else {
    // 没有任务，恢复发送按钮
    isSending = false;
    sendButton.textContent = '发送';
    sendButton.classList.remove('stop-button');
  }
});

// 监听服务就绪
window.electronAPI.onServiceReady(() => {
  isServiceReady = true;
  updateStatus('⏳ 等待连接就绪...', false);
  addLog('🎉 服务已启动', 'success');
});

// 加载聊天历史的函数
async function loadChatHistory() {
  try {
    // 保存系统日志的滚动位置，避免被重置
    const logScrollTop = logContent.scrollTop;
    
    const result = await window.electronAPI.loadChatHistory();
    const messages = result.messages || [];
    
    // 清空现有消息
    messagesDiv.innerHTML = '';
    
    if (messages.length > 0) {
      // 只显示最新 100 条
      const recentMessages = messages.slice(-100);
      
      // 显示历史消息
      recentMessages.forEach((msg) => {
        if (msg.role === 'user') {
          const { text, thinking } = extractTextFromContent(msg);
          // 过滤掉 System: 开头的消息（定时任务发给大模型的提示词）
          if (text && !text.trim().startsWith('System:')) {
            addMessage(text, 'user');
          }
        } else if (msg.role === 'assistant') {
          const { text, thinking } = extractTextFromContent(msg);
          addMessageWithThinking(text, 'assistant', thinking);
        }
      });
    }
    
    // 恢复系统日志的滚动位置
    logContent.scrollTop = logScrollTop;
  } catch (error) {
    addLog(`⚠️ 加载历史失败: ${error.message}`);
  }
}

// 监听需要刷新历史以显示thinking的事件
window.electronAPI.onRefreshHistoryForThinking(async () => {
  // 刷新历史以显示thinking
  setTimeout(() => {
    loadChatHistory();
  }, 300);
});

// 监听 WebSocket 就绪（加载历史）
window.electronAPI.onWebSocketReady(async () => {
  updateStatus('✅ 小端AI 已就绪，开始对话吧！', true);
  
  // 延迟加载聊天历史，确保 WebSocket 完全就绪
  setTimeout(() => {
    loadChatHistory();
  }, 1000);
  
  // 不再需要每60秒刷新聊天历史了，因为定时任务的回复通过cron事件的summary直接发送
});

// 检查是否是英文系统提示
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
    text.includes('A scheduled reminder has been triggered') ||
    text.includes('Please relay this reminder') ||
    (lowerText.includes('cron:') && text.includes('[')) ||
    text.includes('##') ||
    (text.match(/[a-zA-Z]/g) && text.match(/[a-zA-Z]/g).length > text.length * 0.3)
  );
}

// 过滤英文系统提示，只保留正常内容
function filterEnglishPrompts(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => !isEnglishSystemPrompt(line.trim()));
  return filteredLines.join('\n').trim();
}

// 从消息内容中提取文本和thinking
function extractTextFromContent(msg) {
  let text = '';
  let thinking = '';

  if (typeof msg === 'string') {
    text = msg;
  } else if (msg.content) {
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter(block => block && block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n\n');
      thinking = msg.content
        .filter(block => block && block.type === 'thinking' && block.thinking)
        .map(block => block.thinking)
        .join('\n\n');
    }
  } else if (Array.isArray(msg)) {
    text = msg
      .filter(block => block && block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n\n');
    thinking = msg
      .filter(block => block && block.type === 'thinking' && block.thinking)
      .map(block => block.thinking)
      .join('\n\n');
  }

  // 清理消息内容
  // 1. 过滤英文系统提示
  text = filterEnglishPrompts(text);
  // 2. 移除时间戳 [Wed 2026-03-18 08:57 GMT+8]
  text = text.replace(/\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]/g, '');
  // 3. 移除 message_id
  text = text.replace(/\[message_id:\s*[^\]]+\]/g, '');
  // 4. 移除多余的空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { text, thinking };
}

// 添加消息，支持thinking
function addMessageWithThinking(content, role, thinking = null) {
  // thinking 输出到系统日志
  if (thinking) {
    addLog('🤔 思考: ' + thinking.slice(0, 500) + (thinking.length > 500 ? '...' : ''));
  }
  if (content) {
    return addMessage(content, role);
  }
  return null;
}

// 从消息内容中只提取文本（兼容旧代码）
function extractOnlyTextFromContent(msg) {
  const result = extractTextFromContent(msg);
  let text = result.text || '';
  
  // 清理消息内容
  // 1. 移除 System: 开头的行
  text = text.split('\n')
    .filter(line => !line.trim().startsWith('System:'))
    .join('\n');
  
  // 2. 移除时间戳 [Fri 2026-03-13 19:55 GMT+8]
  text = text.replace(/\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*/g, '');
  
  // 3. 移除 message_id
  text = text.replace(/\[message_id:\s*[^\]]+\]\s*/g, '');
  
  // 4. 移除多余的空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  
  return text;
}

// 显示图片预览
function showImagePreview(files) {
  if (imagePreviewDiv) {
    imagePreviewDiv.remove();
  }
  
  imagePreviewDiv = document.createElement('div');
  imagePreviewDiv.className = 'image-preview';
  
  files.forEach((file, index) => {
    if (file.type.startsWith('video/')) {
      // 视频显示为图标
      const container = document.createElement('div');
      container.style.cssText = 'position:relative;display:inline-block;';
      
      const icon = document.createElement('div');
      icon.innerHTML = '🎬';
      icon.style.cssText = 'font-size:40px;cursor:pointer;';
      icon.title = file.name;
      
      const removeBtn = document.createElement('span');
      removeBtn.innerHTML = '×';
      removeBtn.style.cssText = 'position:absolute;top:-5px;right:0;font-size:20px;color:red;cursor:pointer;';
      removeBtn.onclick = () => {
        selectedImages.splice(index, 1);
        showImagePreview(selectedImages);
      };
      
      container.appendChild(icon);
      container.appendChild(removeBtn);
      imagePreviewDiv.appendChild(container);
    } else {
      // 图片正常显示
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.title = file.name;
      img.onclick = () => {
        selectedImages.splice(index, 1);
        showImagePreview(selectedImages);
      };
      imagePreviewDiv.appendChild(img);
    }
  });
  
  const inputArea = document.querySelector('.input-area');
  inputArea.parentNode.insertBefore(imagePreviewDiv, inputArea);
}

// 处理粘贴事件
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  const imageFiles = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  
  if (imageFiles.length > 0) {
    selectedImages.push(...imageFiles);
    showImagePreview(selectedImages);
    addLog(`📎 已粘贴 ${imageFiles.length} 张图片`);
  }
});

// 处理拖拽事件
messagesDiv.addEventListener('dragover', (e) => {
  e.preventDefault();
  messagesDiv.classList.add('drag-over');
});

messagesDiv.addEventListener('dragleave', () => {
  messagesDiv.classList.remove('drag-over');
});

messagesDiv.addEventListener('drop', (e) => {
  e.preventDefault();
  messagesDiv.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files).filter(f => 
    f.type.startsWith('image/') || f.type.startsWith('video/')
  );
  if (files.length > 0) {
    selectedImages.push(...files);
    showImagePreview(selectedImages);
    addLog(`📎 已拖入 ${files.length} 个文件（图片/视频）`);
  }
});

// 切换显示/隐藏 API 配置界面
let toggleInitialized = false;

async function toggleApiConfig() {
  showApiConfig = !showApiConfig;
  if (showApiConfig) {
    document.getElementById('logHeaderTitle').textContent = '📋 设置';
    logContent.style.display = 'none';
    apiConfigView.style.display = 'flex';
    logHeader.classList.add('show-config');

    // 第一次加载时，先加载配置再创建开关
    if (!toggleInitialized) {
      const config = await window.electronAPI.loadUserConfig();
      complexTaskEnabled = config?.complexTaskEnabled || false;
      toggleInitialized = true;
      const headerToggleArea = document.getElementById('headerToggleArea');
      if (headerToggleArea) {
        const toggle = createTaskToggle();
        toggle.style.margin = '0';
        toggle.style.background = 'transparent';
        headerToggleArea.appendChild(toggle);
      }
      await loadApiConfigList();
    } else {
      // 非第一次，只更新 checkbox 显示状态，不更新变量
      const checkbox = document.getElementById('complexTaskToggle');
      if (checkbox) {
        checkbox.checked = complexTaskEnabled;
      }
      await loadApiConfigList();
    }
  } else {
    document.getElementById('logHeaderTitle').textContent = '⚙️ 设置';
    logContent.style.display = 'block';
    apiConfigView.style.display = 'none';
    logHeader.classList.remove('show-config');
  }
}

// 复杂任务开关状态
let complexTaskEnabled = false;

function createTaskToggle() {
  const container = document.createElement('div');
  container.className = 'task-toggle-container';

  const label = document.createElement('span');
  label.className = 'task-toggle-label';
  label.textContent = '复杂任务';

  const toggle = document.createElement('label');
  toggle.className = 'task-toggle-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = complexTaskEnabled;
  checkbox.id = 'complexTaskToggle';

  const slider = document.createElement('span');
  slider.className = 'task-toggle-slider';

  toggle.appendChild(checkbox);
  toggle.appendChild(slider);

  checkbox.addEventListener('change', (e) => {
    complexTaskEnabled = !complexTaskEnabled;
    addLog(complexTaskEnabled ? '✅ 复杂任务已开启' : 'ℹ️ 复杂任务已关闭');
    window.electronAPI.saveUserConfig({ complexTaskEnabled });
  });

  container.appendChild(label);
  container.appendChild(toggle);

  return container;
}

// 加载 API 配置列表
async function loadApiConfigList() {
  try {
    const scrollTop = apiConfigView.scrollTop;
    apiConfigView.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">加载中...</div>';
    const config = await window.electronAPI.loadUserConfig();
    const providers = config?.models?.providers || {};
    const primaryModel = config?.agents?.defaults?.model?.primary;
    const fallbacks = config?.agents?.defaults?.model?.fallbacks || [];

    // 注意：complexTaskEnabled 的加载和更新在 toggleApiConfig 中处理
    // 这里只更新 checkbox 的显示状态
    const checkbox = document.getElementById('complexTaskToggle');
    if (checkbox) {
      checkbox.checked = complexTaskEnabled;
    }

    apiConfigView.innerHTML = '';

    const allModels = [];
    Object.keys(providers).forEach((providerName) => {
      const provider = providers[providerName];
      const models = provider?.models || [];
      
      models.forEach((model) => {
        allModels.push({
          providerName,
          provider,
          model,
          key: `${providerName}/${model.id}`
        });
      });
    });
    
    const modelOrder = [];
    if (primaryModel) modelOrder.push(primaryModel);
    fallbacks.forEach(fb => {
      if (!modelOrder.includes(fb)) modelOrder.push(fb);
    });
    allModels.forEach(m => {
      if (!modelOrder.includes(m.key)) modelOrder.push(m.key);
    });
    
    const orderedModels = modelOrder.map(key => allModels.find(m => m.key === key)).filter(Boolean);
    
    orderedModels.forEach(({ providerName, provider, model }, index) => {
      const key = `${providerName}/${model.id}`;
      const isCurrent = key === primaryModel;
      
      const itemDiv = document.createElement('div');
      itemDiv.className = 'api-item';
      
      if (isCurrent) {
        itemDiv.style.border = '2px solid #667eea';
        itemDiv.style.background = '#f0f4ff';
      }
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'api-item-name';
      if (isCurrent) {
        nameDiv.innerHTML = `<strong>${model.name || model.id}</strong> <span style="color: #667eea; font-size: 0.8em; font-weight: normal;">(当前)</span><br><span style="font-size: 0.8em; color: #888;">${providerName}</span>`;
      } else {
        nameDiv.innerHTML = `<strong>${model.name || model.id}</strong><br><span style="font-size: 0.8em; color: #888;">${providerName}</span>`;
      }
      
      const upIcon = document.createElement('span');
      upIcon.textContent = '↑';
      upIcon.style.color = '#28a745';
      upIcon.style.fontSize = '1.2em';
      upIcon.style.marginRight = '10px';
      
      if (index === 0) {
        upIcon.style.opacity = '0.3';
      } else {
        upIcon.style.cursor = 'pointer';
        upIcon.onclick = (e) => { e.stopPropagation(); moveModelUp(index, orderedModels, primaryModel, fallbacks); };
      }
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'api-item-delete';
      deleteBtn.textContent = '删除';
      deleteBtn.onclick = (e) => { e.stopPropagation(); deleteApiModel(providerName, model.id); };
      
      itemDiv.appendChild(nameDiv);
      itemDiv.appendChild(upIcon);
      itemDiv.appendChild(deleteBtn);
      
      itemDiv.style.cursor = 'pointer';
      itemDiv.onclick = () => showEditApiForm(providerName, provider, model);
      
      apiConfigView.appendChild(itemDiv);
      
      if (index === 0) {
        const addBtn = document.createElement('button');
        addBtn.className = 'add-api-btn';
        addBtn.textContent = '添加模型';
        addBtn.onclick = showAddApiForm;
        apiConfigView.appendChild(addBtn);
      }
    });
    apiConfigView.scrollTop = scrollTop;
  } catch (error) {
    apiConfigView.innerHTML = `<div style="text-align: center; padding: 20px; color: #ff6b6b;">加载失败: ${error.message}</div>`;
  }
}

// 上移模型
async function moveModelUp(index, orderedModels, primaryModel, fallbacks) {
  if (index === 0) return;
  
  try {
    const config = await window.electronAPI.loadUserConfig();
    let newPrimary = primaryModel;
    let newFallbacks = [...fallbacks];
    
    const currentKey = orderedModels[index].key;
    const aboveKey = orderedModels[index - 1].key;
    
    // 确保当前和上面的模型都在 fallbacks 里
    if (!newFallbacks.includes(currentKey)) {
      newFallbacks.push(currentKey);
    }
    if (!newFallbacks.includes(aboveKey)) {
      newFallbacks.push(aboveKey);
    }
    
    if (currentKey === primaryModel) {
      newPrimary = aboveKey;
      newFallbacks = newFallbacks.filter(fb => fb !== aboveKey);
      newFallbacks.unshift(currentKey);
    } else if (aboveKey === primaryModel) {
      newPrimary = currentKey;
      newFallbacks = newFallbacks.filter(fb => fb !== currentKey);
      newFallbacks.unshift(aboveKey);
    } else {
      const currentIdx = newFallbacks.indexOf(currentKey);
      const aboveIdx = newFallbacks.indexOf(aboveKey);
      if (currentIdx !== -1 && aboveIdx !== -1) {
        [newFallbacks[currentIdx], newFallbacks[aboveIdx]] = [newFallbacks[aboveIdx], newFallbacks[currentIdx]];
      }
    }
    
    await window.electronAPI.saveModelOrder(newPrimary, newFallbacks);
    loadApiConfigList();
    addLog('✅ 模型顺序已调整');
  } catch (error) {
    alert('调整顺序失败: ' + error.message);
  }
}

// 显示添加 API 表单
function showAddApiForm() {
  editingModel = null;
  document.querySelector('.api-form-header').textContent = '添加模型';
  document.getElementById('apiBaseUrl').value = '';
  document.getElementById('apiKey').value = '';
  document.getElementById('modelName').value = '';
  apiFormOverlay.style.display = 'flex';
}

// 显示编辑 API 表单
function showEditApiForm(providerName, provider, model) {
  editingModel = { providerName, provider, model };
  document.querySelector('.api-form-header').textContent = '修改模型';
  document.getElementById('apiBaseUrl').value = provider?.baseUrl || '';
  document.getElementById('apiKey').value = provider?.apiKey || '';
  document.getElementById('modelName').value = model?.id || '';
  apiFormOverlay.style.display = 'flex';
}

// 隐藏添加 API 表单
function hideAddApiForm() {
  apiFormOverlay.style.display = 'none';
  editingModel = null;
}

// 保存 API 配置
async function saveApiConfig() {
  const baseUrl = document.getElementById('apiBaseUrl').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const modelName = document.getElementById('modelName').value.trim();
  
  if (!baseUrl || !apiKey || !modelName) {
    alert('请填写完整信息！');
    return;
  }
  
  try {
    if (editingModel) {
      await window.electronAPI.deleteUserApiModel(editingModel.providerName, editingModel.model.id);
    }
    
    const providerName = modelName.replace(/[^a-zA-Z0-9_-]/g, '');
    await window.electronAPI.saveUserApiConfig(providerName, {
      baseUrl,
      apiKey,
      modelName
    });
    
    hideAddApiForm();
    loadApiConfigList();
    addLog(editingModel ? '✅ 模型配置已修改' : '✅ API 配置已保存');
    editingModel = null;
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// 删除 API 模型
async function deleteApiModel(providerName, modelId) {
  if (!confirm(`确定要删除 ${modelId} 吗？`)) {
    return;
  }
  
  try {
    await window.electronAPI.deleteUserApiModel(providerName, modelId);
    loadApiConfigList();
    addLog(`✅ 已删除 ${modelId}`);
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
}

// 事件监听 - 切换 API 配置
logHeader.addEventListener('click', toggleApiConfig);
apiFormCancel.addEventListener('click', hideAddApiForm);
apiFormSave.addEventListener('click', saveApiConfig);

// 初始化
addLog('🚀 小端AI 启动中...');

// 监听显示使用须知弹窗
window.electronAPI.onShowNotice(() => {
  const overlay = document.getElementById('noticeOverlay');
  const btn = document.getElementById('noticeBtn');
  
  if (overlay && btn) {
    overlay.style.display = 'flex';
    
    btn.onclick = () => {
      overlay.style.display = 'none';
    };
  }
});


// ========== 自我进化模式 ==========
let evolutionEnabled = false;
let evolutionTimer = null;

// 标题点击打开弹窗
const subtitleBtn = document.getElementById('subtitleBtn');
if (subtitleBtn) {
  subtitleBtn.addEventListener('click', () => {
    document.getElementById('evolutionOverlay').style.display = 'flex';
  });
}

// 开关逻辑
const evolutionToggle = document.getElementById('evolutionToggle');
if (evolutionToggle) {
  evolutionToggle.addEventListener('change', () => {
    evolutionEnabled = evolutionToggle.checked;
    const slider = document.getElementById('evolutionSlider');
    const knob = document.getElementById('evolutionKnob');
    const status = document.getElementById('evolutionStatus');
    if (evolutionEnabled) {
      slider.style.background = '#28a745';
      knob.style.transform = 'translateX(24px)';
      status.textContent = '当前：已开启 — 大模型回复后将自动发送"继续"';
      status.style.color = '#28a745';
      addLog('🧬 自我进化模式已开启');
    } else {
      slider.style.background = '#ccc';
      knob.style.transform = 'translateX(0)';
      status.textContent = '当前：已关闭';
      status.style.color = '#888';
      addLog('⏹️ 自我进化模式已关闭');
    }
  });
}
