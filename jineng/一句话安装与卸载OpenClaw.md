# OpenClaw安装与卸载

## 一句话安装

```powershell
npm install -g openclaw@latest --registry=https://registry.npmmirror.com
```

## 前置要求

- Node.js >= 22.14.0
- npm（已内置于Node.js）

## 完整安装流程

### 第一步：检查环境

```powershell
node --version && npm --version
```

确保Node版本 >= 22.14.0

### 第二步：安装OpenClaw

```powershell
npm install -g openclaw@latest --registry=https://registry.npmmirror.com
```

使用淘宝镜像加速国内下载

### 第三步：创建命令启动器（关键！）

**如果安装后命令找不到**，需要手动创建`.cmd`文件：

```powershell
# 创建openclaw.cmd
@echo off
node "%~dp0node_modules\openclaw\dist\index.js" %*
```

保存到：`%APPDATA%\npm\openclaw.cmd`

### 第四步：验证安装

```powershell
openclaw --version
```

成功输出：
```
OpenClaw 2026.5.4 (325df3e)
```

## 配置与启动（让OpenClaw真正能用）

### 第五步：健康检查（可选）

```powershell
openclaw doctor
```

查看配置缺失项

### 第六步：设置网关模式（重要！）

```powershell
openclaw config set gateway.mode local
```

⚠️ **不设置此步，启动网关会报错：gateway.mode is unset; gateway start will be blocked**

### 第七步：启动网关

```powershell
openclaw gateway --port 18789
```

成功标志：
```
[gateway] ready
[gateway] http server listening
[gateway] Browser control listening on http://127.0.0.1:18791/
```

### 第八步：打开控制面板

**方式1：命令行获取带令牌的URL（推荐）**
```powershell
openclaw dashboard
```
自动打开浏览器并复制token URL

**方式2：手动连接**
1. 浏览器打开 `http://127.0.0.1:18789/`
2. 在Control UI中填入WebSocket URL和Token

## 常见问题排查

### 问题1：ENOTEMPTY错误

**原因**：上次安装超时，残留目录未清理干净

**解决**：
```powershell
rd /s /q "%APPDATA%\npm\node_modules\openclaw"
npm install -g openclaw@latest --registry=https://registry.npmmirror.com
```

### 问题2：命令找不到 'openclaw'

**原因**：npm全局bin目录不在PATH，或package.json缺少bin字段

**解决**：按"第三步"手动创建openclaw.cmd

### 问题3：PATH未生效

**解决**：重新打开终端，或手动添加：
```powershell
setx PATH "%PATH%;%APPDATA%\npm" /M
```

### 问题4：网关启动报错 "gateway.mode is unset"

**原因**：未设置网关模式

**解决**：
```powershell
openclaw config set gateway.mode local
```

### 问题5：Dashboard显示 "unauthorized: gateway token missing"

**原因**：需要获取带令牌的URL才能连接

**解决**：
```powershell
openclaw dashboard
```
浏览器会自动打开带token的完整URL

## 常用命令

```powershell
openclaw --help          # 查看帮助
openclaw doctor          # 健康检查
openclaw config set xxx  # 配置项
openclaw gateway         # 启动网关
openclaw dashboard       # 获取控制面板URL（含token）
openclaw chat            # 打开本地聊天界面
openclaw setup           # 初始化配置
openclaw configure       # 交互式配置
openclaw status          # 查看状态
```

## 验证结果

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| 版本 | `openclaw --version` | 显示版本号 |
| 帮助 | `openclaw --help` | 显示命令列表 |
| 健康检查 | `openclaw doctor` | 显示检查结果 |
| 网关状态 | `openclaw status` | 显示Dashboard URL和Token |
| 控制面板 | `openclaw dashboard` | 自动打开浏览器 |

## 关键路径

- 安装目录：`%APPDATA%\npm\node_modules\openclaw`
- 命令入口：`%APPDATA%\npm\openclaw.cmd`
- 配置文件：`~/.openclaw/`
- 状态目录：`~/.openclaw/state/`
- 日志文件：`%TEMP%\openclaw\openclaw-YYYY-MM-DD.log`

## 控制面板信息

- Dashboard地址：`http://127.0.0.1:18789/`
- 浏览器控制：`http://127.0.0.1:18791/`
- 默认端口：18789

---

## 一句话卸载

```powershell
# 1. 停止网关（如果正在运行）
taskkill /f /im node.exe

# 2. 卸载npm包
npm uninstall -g openclaw

# 3. 删除命令启动器
del "%APPDATA%\npm\openclaw.cmd"

# 4. 清理残留数据（可选，删除配置和数据）
rd /s /q "%USERPROFILE%\.openclaw"
```

## 卸载说明

| 步骤 | 命令 | 说明 |
|------|------|------|
| 停止网关 | `taskkill /f /im node.exe` | 强制结束所有Node进程（会同时停止网关） |
| 卸载npm | `npm uninstall -g openclaw` | 卸载npm全局包 |
| 删除启动器 | `del "%APPDATA%\npm\openclaw.cmd"` | 删除手动创建的cmd文件 |
| 清理数据 | `rd /s /q "%USERPROFILE%\.openclaw"` | 删除用户配置和数据（包含sessions、credentials等） |

⚠️ **清理数据会删除所有配置、会话记录和凭证**，如需保留请先备份`.openclaw`文件夹。

## 完全清理（重新开始）

如果想完全重装，清理所有残留：

```powershell
# 停止并卸载
taskkill /f /im node.exe
npm uninstall -g openclaw

# 清理所有残留
rd /s /q "%APPDATA%\npm\node_modules\openclaw"
rd /s /q "%USERPROFILE%\.openclaw"
del "%APPDATA%\npm\openclaw.cmd"
```
