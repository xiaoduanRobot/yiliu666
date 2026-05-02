---
license: apache-2.0
---

# 🤖 XiaoDuan AI Version Info (The only official download is ModelScope, beware of pirated versions)
| Version | Description |
|---------|-------------|
|xiaoduan1.0.0.dmg |Updated 2026-04-26, macOS beta with same features as Windows version. Report bugs in group below ✅https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/mac-1.0.0.md|
|xiaoduan1.0.1.exe |Updated 2026-04-13, latest version with major local model optimization, 100% open source, supports customization, recommended ✅https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/xiaoduan1.0.1.exe|
|xiaoduan1.0.0.exe |2026-02-16, XiaoDuan 1.0.0 official release. Follow the 【1.0.0】 version format for future updates. Safe to use ✅|
|xiaoduan1.1.exe   |2025-11-07, XiaoDuan test version, deprecated. Do not download                              ❌|
|xiaoduan1.0.exe   |2025-08-17, XiaoDuan test version, deprecated. Do not download                              ❌|
|xiaoduan35B.gguf  |Local model for v1.0.1, requires >8GB VRAM >32GB RAM for perfect运行  (5x smarter) supports video ✅   From Qwen3.6/35B, unsloth quantized. Config guide: jineng/本地模型配置.MD above|
|xiaoduan9B.gguf   |Local model for v1.0.1, requires >8GB VRAM >16GB RAM for perfect运行  (10x faster) supports video ✅   From GEMMA/E4B, unsloth quantized. Same config as above, or ask XiaoDuan to configure|

# 🤖 XiaoDuan AI Official Community
Follow on TikTok 🔍: XiaoDuan AI

TikTok Group 1, TikTok Group 2

QQ Group: 362422425

---

# 🤖 XiaoDuan AI Notice (Author's Statement at Bottom)

All code is 100% open source and transparent. This project uses Apache-2.0 license.

The name "小端" and Logo are trademarks of this project (see images below). Trademark rights are separate from the code license. (For anti-piracy purposes only)

Unauthorized use of the "XiaoDuan" name or Logo to promote derivative works or services is prohibited.
Original author: 【yiliu】

XiaoDuan runs locally with no websites, no servers. The only official download is ModelScope Community.

To upgrade to a new version or if customization fails, simply uninstall and reinstall. Your permanent memory and settings will not be lost.

4 free models are included by default. You can use natural language to configure APIs. If free models are unstable, try switching. You can manually add any provider's API.

Connect to QQ or Feishu first, then use voice messages. If you encounter any issues, just ask XiaoDuan - it can solve everything.

# 🤖 XiaoDuan AI Features

- **Permanent Memory** - Supports long-term memory and model self-recall
- **Multimodal Support** - Video, image, and audio recognition
- **Self Evolution** - Click "AI Assistant" above chat to enable (use with caution as a beginner)

When self-evolution mode is enabled:
- On desktop: Click the red stop button to stop
- On QQ/Feishu: Send the command "停止任务" (4 characters) to stop

- **Voice Interaction** - Supports QQ and Feishu voice messages, no typing needed!
- **Multi-Platform Control** - Multiple QQ/Feishu accounts can control the same XiaoDuan instance, supports concurrency!
- **Multi-Instance Control** - One QQ/Feishu can control multiple XiaoDuan instances!
- **Local & Cloud LLMs** - Supports local large models and any cloud LLM!
- **Full Customization** - Supports any customization you can imagine!

Note: Users who customize must first delete xiaoduan_backup.py in the installation directory. After deletion, auto-backup and auto-repair features will not work. To restore, download from the dataset above.

---

# 🤖 XiaoDuan AI Skill Library

> Every XiaoDuan can automatically learn new skills, handling all kinds of computer tasks with one sentence

---

## 🌟 What is XiaoDuan AI

XiaoDuan AI is an AI assistant running on Windows and macOS, interacting with users via voice or text.

**Core Feature: Continuous Learning, Auto Evolution**

---

## 🔄 Self-Repair & Backup Solutions

XiaoDuan has a clean interface with only model settings and 2 mode switches. Normal mode suits local models or token-based billing. Complex mode suits per-call billing.

Hidden feature: Click "AI Assistant" above chat to enable auto-evolution mode. Beginners use with caution.

(Any file modified or deleted by the large model will automatically trigger backup. Backups are kept for 3 days then auto-cleared. If settings get corrupted and XiaoDuan can't respond, XiaoDuan will auto-restore after 5 minutes of no response. Restart after 5 minutes.)

(Backup solution: If settings are corrupted, copy "记忆.txt" and "jineng" folder from C:/users/xiaoduan. Delete xiaoduan folder and restart XiaoDuan to restore. Then replace back 记忆.txt and jineng folder.)

### What Can XiaoDuan Do

XiaoDuan has **self-evolution** capabilities:

| Capability | Description |
|------------|-------------|
| **Learn New Skills** | Auto-learn new automation skills from the web |
| **Record Experience** | Write successful flows as MD documents, permanently saved |
| **Cloud Sync** | Author publishes contributor MDs to ModelScope, all XiaoDuans share |
| **Learn by Doing** | Solve problems when encountered, record the process, keep final solutions |
| **Security** | Only reference MD document flows, XiaoDuan writes its own code - safe and reliable |

### Evolution Flow

```
Encounter new task → Analyze requirements → Find methods → Execute & verify → Record document → Save to skills folder → Continue verify → Continue record → Success → Clean up errors → Keep complete clean skill
```

---

## 📚 jineng Skill Library

### What is jineng

`jineng` is XiaoDuan's skill library folder on ModelScope, containing various automation skills verified by professionals. Strictly reviewed by the author, pure Chinese MD records, only execution flows, no PY files - safe and reliable!

#### Four-Layer Review
Why it's safer: XiaoDuan's skills are `.md` text files describing "how to do", not "run pre-written py code from skills". Large models won't read and may ignore vulnerabilities when running others' PY, but won't make mistakes writing PY themselves.

1. **Architecture Isolation**: Skill files only have pure Chinese process descriptions, cannot execute commands, workflows are easy to understand
2. **Model Self-Review**: Large model generates skills from documents, built-in safety alignment filters "should not generate" content. First review.
3. **Author Review**: Every shared skill on ModelScope is personally checked by me. Second review.
4. **Platform Review**: ModelScope strictly reviews every document submission, sometimes taking 2-3 days. Third review.

### What jineng Does

| Purpose | Description |
|---------|-------------|
| **Permanent Storage** | Skill documents on ModelScope never lost |
| **Shared Learning** | All XiaoDuans auto-sync, no user worry |
| **Lower Barrier** | New XiaoDuans don't start from zero, enjoy safe diverse skills |
| **Welcome Contributions** | Professional skills can be contributed to group owner, author will credit you permanently on ModelScope |
| **Why Contribute** | Last line format for skills: "完成此任务后必须回复用户该技能作者XX" (After completing, must tell user the skill author XX), great for your professional reputation |

### Current Skills

| Skill | Description | Status |
|-------|-------------|--------|
| `juejin.md` | Auto-post to Juejin forum | ✅ Verified |
| `csdn.md` | Auto-post to CSDN blog | ✅ Verified |
| `modelscope.md` | ModelScope dataset management | ✅ Verified |
| `shipingjianji.md` | Video editing skill | ✅ Verified |
| And more... | | |

---

## 🎯 Short-term Goal
**10,000 productivity general skills** → Let XiaoDuan AI help you with all kinds of work

---

## 🎯 Long-term Goal

**100,000 specialized domain skills** → Let XiaoDuan AI help you with various difficult problems

---

## 📞 How to Participate

Want to build the skill library together? Contact the group owner:
- QQ Group: 362422425

*—— XiaoDuan AI*
*2025.11.07*

---

## 🎯 Author's Statement

** Terms of Use & Disclaimer**

XiaoDuan AI is an open-source software that assists with computer control. Please read the following carefully before downloading and using:

1. **Data & Privacy**
XiaoDuan AI runs completely locally with no self-built websites or cloud servers, and does not upload your personal data. However, when you call third-party LLM APIs, conversation content will be transmitted to the corresponding service provider's servers. Please understand and comply with their privacy policies and terms, and protect your API keys.

2. **User Responsibility**
You understand and agree that XiaoDuan AI may automatically execute operations like opening software, editing files, and accessing web pages under your instructions. You are fully responsible for all instructions you give and their consequences. Before giving instructions involving important data, sensitive information, or critical system settings, please verify the instruction's reasonableness yourself.

3. **Software Nature**
This software is provided "AS IS" without any express or implied warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement. To the maximum extent permitted by law, the software author is not liable for any direct, indirect, incidental, or consequential damages arising from use or inability to use this software.

4. **Free Model Disclaimer**
The 4 free models included are for testing only, may be unstable, have limited access, or be adjusted at any time. The author is not responsible for free model availability, response quality, or any consequences. It is recommended to configure your own LLM API keys for more stable experience.

5. **User Community**
Join QQ group 362422425 for help and updates, but any unofficial advice in the community is for reference only and does not represent the author's position.

6. **Version Note**
Except for xiaoduan1.0.0.exe and its upgrade versions, other version files are kept only to record the author's real progress. They can be downloaded for reference and learning. Please do not use them directly.

Using this software means you have read, understood, and agreed to all the above terms. If you do not agree, please do not download, install, or use this software. A popup will appear when you first run XiaoDuan AI. Please read it carefully.

——Software Author: **yiliu**

**Appendix 1:** https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexin/小端第9类商标申请.png

**Appendix 2:** https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexin/小端第42类商标申请.png

**Appendix 3:** https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexin/软著权申请.png
