# 修复 Browser 功能

## 触发条件

当用户反馈浏览器工具有任何异常时（如浏览器无法启动、一直安装中、白屏、验证码失败等），小端主动执行以下流程。

## 修复流程

### 步骤一：告知用户

告诉用户：

> 浏览器功能出现异常，删除缓存后可以100%恢复，但会清除之前的登录状态（如闲鱼、淘宝等网站的登录记录），重启后需要重新登录。是否继续？

### 步骤二：等待用户确认

用户同意后，执行步骤三。

### 步骤三：删除以下两个目录

**注意：必须删除以下两个目录，缺一不可**

#### Windows

1. `ms-playwright` 文件夹
   - 路径：`C:\Users\{用户名}\AppData\Local\ms-playwright`
   - 作用：Chromium 主程序，损坏或丢失会导致浏览器无法启动
2. `.xiaoduan/browser` 文件夹
   - 路径：`C:\Users\{用户名}\.xiaoduan\browser`
   - 作用：浏览器用户数据（包括登录cookies），旧数据冲突会导致浏览器异常

删除方法：使用 exec 工具执行以下命令

```cmd
# 删除 ms-playwright（需要管理员权限）
taskkill /F /IM chrome.exe /T 2>nul
rmdir /S /Q "%LOCALAPPDATA%\ms-playwright"

# 删除 browser 缓存
rmdir /S /Q "%USERPROFILE%\.xiaoduan\browser"
```

#### Mac

1. `ms-playwright` 文件夹
   - 路径：`~/Library/Caches/ms-playwright`
   - 作用：Chromium 主程序，损坏或丢失会导致浏览器无法启动
2. `.xiaoduan/browser` 文件夹
   - 路径：`~/.xiaoduan/browser`
   - 作用：浏览器用户数据（包括登录cookies），旧数据冲突会导致浏览器异常

删除方法：使用 exec 工具执行以下命令

```bash
# 删除 ms-playwright
killall Chromium 2>/dev/null || killall "Google Chrome" 2>/dev/null || true
rm -rf ~/Library/Caches/ms-playwright

# 删除 browser 缓存
rm -rf ~/.xiaoduan/browser
```

### 步骤四：通知用户

删除完成后，告诉用户：

> 已清理完成，请重启小端桌面，重启后浏览器会自动重新初始化。

## 原理

```
ms-playwright 损坏/数据冲突 → 删除后重启 → 自动从魔搭重新下载 → 恢复正常
.xiaoduan/browser 数据冲突 → 删除后重启 → 重新创建空白用户数据 → 恢复正常
两个都删 → 100%恢复
```

## 注意事项

- 两个目录必须**同时删除**，否则可能复发
- 删除后第一次打开网页可能需要重新登录目标网站
- 闲鱼等平台可能再次出现验证码（属正常现象）
- Chromium 重新下载大约需要 1-3 分钟（取决于网速）

再次启动后用户使用浏览器，可以先查看：
- Windows: `C:\Users\{用户名}\AppData\Local\ms-playwright` 是否恢复完成（看修改时间是否更新）
- Mac: `~/Library/Caches/ms-playwright` 是否恢复完成（看修改时间是否更新）

完整后正常运行 `Browser` 命令即可。
