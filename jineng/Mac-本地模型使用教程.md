# 小端AI - 本地模型使用教程

本教程教你如何让小端AI连接本地大模型，实现完全离线、免费、隐私的AI对话。

***

## 前置要求

### Windows
- 显卡：NVIDIA显卡，显存 ≥ 6GB（推荐8GB+）
- CUDA：已安装 CUDA 12.4（或对应版本）
- 内存：≥ 16GB

### Mac（Apple Silicon M1/M2/M3/M4）
- 芯片：M系列芯片即可，无需独立显卡
- 统一内存：≥ 16GB（推荐16GB+）
- Mac 使用 Metal 加速，无需 CUDA

### 通用
- 硬盘：根据模型大小预留空间（约 6-20GB）
- Python：3.10+（KV缓存预热需要）

***

## 一、模型（如 xiaoduan9B，35B）

适合：日常对话、写作、编程，无需显卡也能跑（但慢）

### 1. 下载 llama.cpp

#### Windows
从魔搭或GitHub下载 llama.cpp 的 Windows CUDA 版本，解压到任意目录，例如：llama-b8708-bin-win-cuda-12.4-x64.zip

```
D:\moxing\llama-server\
```

解压后里面有 `llama-server.exe`。

#### Mac
从GitHub下载 llama.cpp 的 macOS 版本，解压到任意目录，例如：

```
~/moxing/llama-server/
```

解压后里面有 `llama-server`。

### 2. 下载模型

从魔搭下载 GGUF 格式模型 `xiaoduan9B.gguf`，放到任意目录：

#### Windows
```
D:\moxing\models\xiaoduan9B.gguf
```

#### Mac
```
~/moxing/models/xiaoduan9B.gguf
```

### 3. 启动 llama-server

#### Windows
新建 `start-llm.bat`，内容如下（**路径改成你自己的**）：

```bat
@echo off
title Llama.cpp Server - xiaoduan9B
D:\moxing\llama-server\llama-server.exe ^
  -m "D:\moxing\models\xiaoduan9B.gguf" ^
  --host 127.0.0.1 ^
  --port 8080 ^
  -c 32000 ^
  -ngl 99
pause
```

双击运行，看到 `llama server listening on http://127.0.0.1:8080` 即成功。

#### Mac
新建 `start-llm.sh`，内容如下（**路径改成你自己的**）：

```bash
#!/bin/bash
~/moxing/llama-server/llama-server \
  -m ~/moxing/models/xiaoduan9B.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  -c 32000 \
  -ngl 99
```

在终端运行：`chmod +x start-llm.sh && ./start-llm.sh`

看到 `llama server listening on http://127.0.0.1:8080` 即成功。

### 4. 配置小端AI

打开小端AI配置目录下的 `xiaoduan.json`：

- Windows：`C:\Users\用户名\.xiaoduan\xiaoduan.json`
- Mac：`~/.xiaoduan/xiaoduan.json`

在 `models.providers` 中添加：

```json
"llamacpp": {
  "baseUrl": "http://127.0.0.1:8080/v1",
  "apiKey": "local",
  "api": "openai-completions",
  "models": [
    {
      "id": "xiaoduan9B",
      "name": "xiaoduan9B",
      "reasoning": false,
      "input": ["text"],
      "contextWindow": 128000,
      "maxTokens": 4096
    }
  ]
}
```

在 `agents.defaults.model` 中设置为主模型：

```json
"model": {
  "primary": "llamacpp/xiaoduan9B",
  "fallbacks": []
}
```

在 `agents.defaults.models` 中添加参数：

```json
"llamacpp/xiaoduan9B": {
  "params": {
    "temperature": 0.3
  }
}
```

### 5. 重启小端AI即可使用

***

## 二、多模态模型（如 xiaoduan35B）

适合：**看图片、看视频、听音频**，需要更大显存

### 1. 下载模型和视觉投影文件

从魔搭下载两个文件（**必须一起下载**）：

| 文件                   | 说明               | Windows示例路径                                        | Mac示例路径                                        |
| -------------------- | ---------------- | ------------------------------------------- | ------------------------------------------- |
| `xiaoduan35B.gguf`   | 语言模型本体           | `D:\AI-Models\xiaoduan35B.gguf`   | `~/AI-Models/xiaoduan35B.gguf`   |
| `xiaoduan35B02.gguf` | 视觉投影文件（让模型能看懂图片） | `D:\AI-Models\xiaoduan35B02.gguf` | `~/AI-Models/xiaoduan35B02.gguf` |

> **注意**：`xiaoduan35B02.gguf` 是视觉匹配文件，不下载则无法看图片和视频！

### 2. 启动 llama-server（多模态版）

#### Windows
新建 `start-vlm.bat`，内容如下（**路径改成你自己的**）：

```bat
@echo off
title Llama.cpp Server - xiaoduan-35B
start "" /b "D:\moxing\llama-server\llama-server.exe" -m "D:\AI-Models\xiaoduan35B.gguf" -mm "D:\AI-Models\xiaoduan35B02.gguf" --host 127.0.0.1 --port 8080 --reasoning off --swa-full -c 99999 -ngl 999 --cpu-moe --parallel 1
echo waiting for llama...
ping 127.0.0.1 -n 15 >nul
python "小端AI安装目录\resources\app\warmup.py"
pause
```

#### Mac
新建 `start-vlm.sh`，内容如下（**路径改成你自己的**）：

```bash
#!/bin/bash
~/moxing/llama-server/llama-server \
  -m ~/AI-Models/xiaoduan35B.gguf \
  -mm ~/AI-Models/xiaoduan35B02.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --reasoning off \
  --swa-full \
  -c 99999 \
  -ngl 999 \
  --cpu-moe \
  --parallel 1 &
echo "waiting for llama..."
sleep 15
python3 "小端AI安装目录/resources/app/warmup.py"
```

在终端运行：`chmod +x start-vlm.sh && ./start-vlm.sh`

# 复用KV说明（本地计算过的内容复用，大幅度提速）（[注意日志中出现Warmup] done!预热完成后再跟本地小端对话，即可复用生效）

自建warmup.py，复制以下内容，放到小端AI安装目录的 `resources/app/` 下：

```python
import requests
import json
import os
import subprocess

LLAMA_URL = "http://127.0.0.1:8080/v1/chat/completions"
TIMEOUT = 120
APP_DIR = os.path.dirname(os.path.abspath(__file__))
GATEWAY_PATH = os.path.join(APP_DIR, 'local-gateway.js')
STATE_DIR = os.path.join(os.path.expanduser('~'), '.xiaoduan')
CONFIG_PATH = os.path.join(STATE_DIR, 'xiaoduan.json')

def wait_for_llama(max_wait=60):
    print("[Warmup] waiting for llama...")
    import time
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = requests.get("http://127.0.0.1:8080/v1/models", timeout=5)
            if r.status_code == 200:
                print("[Warmup] llama ready")
                return True
        except:
            pass
        time.sleep(2)
    print("[Warmup] llama timeout")
    return False

def get_model_name():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
        primary = config.get('agents', {}).get('defaults', {}).get('model', {}).get('primary', '')
        if '/' in primary:
            return primary.split('/')[-1]
        return primary if primary else 'local-model'
    except:
        return 'local-model'

def get_temperature():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
        primary = config.get('agents', {}).get('defaults', {}).get('model', {}).get('primary', '')
        if '/' in primary:
            params = config.get('agents', {}).get('defaults', {}).get('models', {}).get(primary, {}).get('params', {})
            return params.get('temperature', 0.7)
        return 0.7
    except:
        return 0.7

def get_system_prompt():
    js_code = r"""
const path = require('path');
const fs = require('fs');
const os = require('os');
const __dirname = '%s';
const STATE_DIR = path.join(os.homedir(), '.xiaoduan');

const gatewayCode = fs.readFileSync(path.join(__dirname, 'local-gateway.js'), 'utf8');
const fnMatch = gatewayCode.match(/function getSystemPrompt[\s\S]*?^}/m);
if (!fnMatch) { process.exit(1); }
const fn = new Function(fnMatch[0] + '; return getSystemPrompt();');
console.log(fn());
    """ % APP_DIR.replace('\\', '\\\\')

    try:
        result = subprocess.run(
            ['node', '--input-type=commonjs', '-e', js_code],
            capture_output=True, text=True, encoding='utf-8',
            cwd=APP_DIR, timeout=30
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"[Warmup] node error: {result.stderr}")
            return None
    except Exception as e:
        print(f"[Warmup] exec error: {e}")
        return None

def get_core_tools():
    with open(GATEWAY_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    start_line = None
    end_line = None
    for i, line in enumerate(lines):
        if line.startswith('const CORE_TOOLS = ['):
            start_line = i
        if start_line is not None and line.startswith('];'):
            end_line = i + 1
            break

    if start_line is None or end_line is None:
        print("[Warmup] CORE_TOOLS not found in gateway")
        return []

    code = ''.join(lines[start_line:end_line])
    js_code = code + '\nconsole.log(JSON.stringify(CORE_TOOLS));'

    try:
        result = subprocess.run(
            ['node', '--input-type=commonjs', '-e', js_code],
            capture_output=True, text=True, encoding='utf-8',
            cwd=APP_DIR, timeout=30
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip())
        else:
            print(f"[Warmup] node error: {result.stderr}")
            return []
    except Exception as e:
        print(f"[Warmup] exec error: {e}")
        return []

def main():
    print("[Warmup] KV cache warmup starting...")

    if not wait_for_llama():
        print("[Warmup] skipped: llama not running")
        return

    model_name = get_model_name()
    temperature = get_temperature()
    print(f"[Warmup] model: {model_name}, temperature: {temperature}")

    system_prompt = get_system_prompt()
    if not system_prompt:
        print("[Warmup] failed to get system prompt")
        return

    core_tools = get_core_tools()
    if not core_tools:
        print("[Warmup] failed to get core tools")
        return

    print(f"[Warmup] system prompt: {len(system_prompt)} chars")
    print(f"[Warmup] tools: {len(core_tools)} count, {len(json.dumps(core_tools))} chars")

    body = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": ""}
        ],
        "temperature": temperature,
        "stream": True,
        "tools": core_tools
    }

    try:
        print("[Warmup] sending warmup request...")
        response = requests.post(LLAMA_URL, json=body, timeout=TIMEOUT)
        if response.status_code == 200:
            print("[Warmup] done!")
        else:
            print(f"[Warmup] failed: {response.status_code} - {response.text[:200]}")
    except requests.exceptions.Timeout:
        print("[Warmup] timeout (normal)")
    except Exception as e:
        print(f"[Warmup] error: {e}")

if __name__ == "__main__":
    main()
    input("\npress enter to exit...")
```

（复制后保存为 `warmup.py` 放到小端AI安装目录的 `resources/app/` 下，提醒用户启动本地脚本后，等待 `[Warmup] done!` 出现再发送消息即可复用KV，避免计算重复内容）

参数说明：

| 参数                | 说明                                   |
| ----------------- | ------------------------------------ |
| `-m`              | 主模型路径                                |
| `-mm`             | 视觉投影文件路径（多模态必须有，即xiaoduan35B02.gguf） |
| `-c`              | 上下文长度，越大越能记更多对话                      |
| `-ngl`            | GPU层数，999=全部放显存（Mac上也是GPU/Metal加速）   |
| `--cpu-moe`       | MoE层放CPU跑，省显存                        |
| `--swa-full`      | 混合注意力模型全SWA模式（KV缓存复用必须加）             |
| `--reasoning off` | 关闭推理模式                               |

运行启动脚本，看到 `[Warmup] done!` 即成功。

### 3. 配置小端AI

在 `xiaoduan.json` 的 `models.providers` 中添加：

```json
"llamacpp": {
  "baseUrl": "http://127.0.0.1:8080/v1",
  "apiKey": "local",
  "api": "openai-completions",
  "models": [
    {
      "id": "xiaoduan35B",
      "name": "小端多模态",
      "reasoning": false,
      "input": ["text", "image"],
      "contextWindow": 99999,
      "maxTokens": 4096
    }
  ]
}
```

> **注意**：`input` 里包含 `"image"` 才能看图片和视频！

设置为主模型：

```json
"model": {
  "primary": "llamacpp/xiaoduan35B",
  "fallbacks": []
}
```

添加参数：

```json
"llamacpp/xiaoduan35B": {
  "params": {
    "temperature": 0.3
  }
}
```

同时修改图片识别模型配置（在 `tools.media.image.models` 中）：

```json
"models": [
  {
    "provider": "llamacpp",
    "model": "xiaoduan35B"
  }
]
```

### 4. 重启小端AI即可使用

现在小端可以看图片、看视频、听音频了！

***

## 三、音频/视频听声音

小端AI支持通过 **Whisper** 转录视频和音频中的语音。

<br />

### 2. 安装 Whisper

```bash
pip3 install openai-whisper
```

### 3. 完成！

重启小端AI后，发送视频或音频文件时，小端会自动：

- 用 ffmpeg 提取视频画面（看）
- 用 ffmpeg 提取音频轨道
- 用 Whisper 将语音转文字（听）

> 无需额外配置，只要 Whisper 安装成功即可。

***

## 四、常见问题

### Q: 启动 llama-server 报错 "CUDA not found"

A: Windows 需要安装对应版本的 CUDA 驱动，或下载 CPU 版本的 llama.cpp。Mac 不需要 CUDA，使用 Metal 加速。

### Q: 显存/内存不够怎么办？

A: 减小 `-ngl` 的值（如 `-ngl 20`），将部分层放CPU跑，速度会变慢但能运行。

### Q: 纯文本模型和多模态模型能同时用吗？

A: 不能，同一个端口只能运行一个模型。切换模型需要重启启动脚本。

### Q: warmup.py报错怎么办？

A: 确认Python已安装且能运行，确认小端AI安装目录下有 `local-gateway.js` 文件。

### Q: 首次对话还是慢，没有加速？

A: 确认启动脚本中warmup.py路径正确，且等待 `[Warmup] done!` 出现后再发消息。
