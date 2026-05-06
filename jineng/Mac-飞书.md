# feishu

## 飞书机器人配置

小端支持飞书机器人，可以接收和发送消息、图片、文件等。配置文件位于用户目录。

## 配置文件

**路径**：
- Windows：`C:\Users\用户名\.xiaoduan\xiaoduan.json`
- Mac：`~/.xiaoduan/xiaoduan.json`（即 `/Users/用户名/.xiaoduan/xiaoduan.json`）

或项目目录的 `config.json`

### 基础配置

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "open",
      "accounts": {
        "main": {
          "appId": "cli_xxx",
          "appSecret": "xxx",
          "botName": "小端AI"
        }
      }
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用飞书渠道 |
| `dmPolicy` | 私聊策略：`pairing`(配对)、`allowlist`(白名单)、`open`(开放) |
| `groupPolicy` | 群聊策略：`open`(开放)、`allowlist`(白名单)、`disabled`(禁用) |
| `appId` | 飞书应用 App ID |
| `appSecret` | 飞书应用 App Secret |
| `botName` | 机器人名称 |

## 配置步骤

### 1. 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 创建企业自建应用
3. 在「凭证与基础信息」获取 `App ID` 和 `App Secret`

### 2. 配置权限

在「权限管理」页面，批量导入以下权限：

```json
{
  "scopes": {
    "tenant": [
      "im:message",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource",
      "im:chat",
      "cardkit:card:write"
    ]
  }
}
```

### 3. 启用机器人

在「应用能力」>「机器人」页面开启机器人能力。

### 4. 配置事件订阅

在「事件订阅」页面：
1. 选择「使用长连接接收事件」
2. 添加事件：`im.message.receive_v1`

### 5. 发布应用

在「版本管理与发布」页面创建版本并发布。

### 6. 写入配置

使用 `write` 工具写入配置：

```
write(file_path="~/.xiaoduan/xiaoduan.json", content="...")
```

或者使用 `/config` 命令：

```
/config set channels.feishu.enabled true
/config set channels.feishu.accounts.main.appId "cli_xxx"
/config set channels.feishu.accounts.main.appSecret "xxx"
```

## 群组配置

```json
{
  "channels": {
    "feishu": {
      "groups": {
        "oc_xxx": {
          "enabled": true,
          "requireMention": true
        }
      }
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `oc_xxx` | 群组 ID |
| `requireMention` | 是否需要 @机器人才响应 |

## 支持的消息类型

### 接收

- ✅ 文本消息
- ✅ 图片
- ✅ 文件
- ✅ 音频
- ✅ 视频

### 发送

- ✅ 文本消息
- ✅ 图片
- ✅ 文件
- ✅ 音频

## 注意事项

- 飞书使用 WebSocket 长连接，无需公网 IP
- 配置完成后需要重启小端服务
- 群聊默认需要 @机器人才能响应
- 私聊默认需要配对授权
