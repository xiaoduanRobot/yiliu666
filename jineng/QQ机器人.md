
小端支持多个 QQ 机器人同时运行，配置文件位于用户目录的 `.xiaoduan` 文件夹。

---

## 配置文件

### 1. qq-bots.json - 机器人配置

**路径**：`C:\Users\你的用户名\.xiaoduan\qq-bots.json`

```json
{
  "bots": [
    {
      "id": "bot_1707920000000",
      "name": "诺言",
      "appId": "1903381322",
      "secret": "你的Secret",
      "enabled": true
    },
    {
      "id": "bot_1707920000001",
      "name": "小燕子",
      "appId": "1903380725",
      "secret": "你的Secret",
      "enabled": true
    }
  ],
  "names": {
    "09A94E6F": "诺言",
    "1B2C3D4E": "小燕子"
  }
}
```

| 字段 | 说明 |
|------|------|
| `bots` | 机器人列表数组 |
| `bots[].id` | 机器人唯一标识，格式：`bot_时间戳` |
| `bots[].name` | 机器人名称，用于显示 |
| `bots[].appId` | QQ机器人 AppID |
| `bots[].secret` | QQ机器人 Secret |
| `bots[].enabled` | 是否启用 |
| `names` | **用户名称映射**（重要！） |
| `names[用户ID]` | 用户ID → 显示名称的映射 |

---

### 2. 如何设置用户名称？

当新用户在QQ上发消息给机器人时，小端会显示用户ID（如 `@09A94E6F`）。

**要显示真实名字，需要在 `qq-bots.json` 里添加 `names` 字段：**

```json
{
  "bots": [
    ...
  ],
  "names": {
    "09A94E6F": "诺言",
    "1B2C3D4E": "小燕子"
  }
}
```

**步骤：**
1. 先让用户在QQ上发一条消息给机器人
2. 在小端的系统日志里看到类似 `[QQ消息:09A94E6F]` 的日志
3. 把用户ID（如 `09A94E6F`）和名字（如 "诺言"）加到 `names` 字段里
4. 重启小端AI

---

## 配置步骤

### 1. 创建 QQ 机器人

1. 访问 [QQ机器人开放平台](https://bot.q.qq.com/)
2. 创建机器人，获取 `AppID` 和 `Secret`

### 2. 添加机器人配置

使用 `write` 工具写入 `qq-bots.json`：

```
write(
  file_path="C:\\Users\\你的用户名\\.xiaoduan\\qq-bots.json",
  content="{\n  \"bots\": [\n    {\n      \"id\": \"bot_1707920000000\",\n      \"name\": \"我的机器人\",\n      \"appId\": \"你的AppID\",\n      \"secret\": \"你的Secret\",\n      \"enabled\": true\n    }\n  ],\n  \"names\": {}\n}"
)
```

### 3. 添加用户名称

等用户发消息后，在 `names` 字段里添加映射：

```
write(
  file_path="C:\\Users\\你的用户名\\.xiaoduan\\qq-bots.json",
  content="{\n  \"bots\": [\n    ...\n  ],\n  \"names\": {\n    \"09A94E6F\": \"诺言\"\n  }\n}"
)
```

### 4. 重启应用

配置完成后需要重启小端应用，机器人才能生效。

---

## 注意事项

- 配置文件使用 JSON 格式，注意转义引号
- 用户 OpenID 是 32 位十六进制字符串，只需要前8位（如 `09A94E6F`）
- 多个机器人可以同时运行
- **当不知道用户名字时，要主动询问用户要一个名字**
- 修改 `names` 字段后必须重启小端AI才能生效
