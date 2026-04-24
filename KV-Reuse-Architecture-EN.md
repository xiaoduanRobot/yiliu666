# Xiaoduan KV Chunk-based Incremental Reuse Architecture

> **A Vision for Flexible KV Cache Reuse Beyond Prefix Matching**

---

## 🎯 Background & Motivation

Xiaoduan AI's core architecture is built on **"Incremental Pruning"** — to maintain a constant context window and ensure smooth long-conversation experiences, the system prunes old historical information over time. However, this design encounters a structural contradiction with the underlying KV cache mechanism.

### Current Problem

State-of-the-art KV cache reuse techniques (like standard Prefix Caching) rely on **strict prefix matching** — the prerequisite for cache reuse is that the token sequence "starting from the beginning must be exactly the same."

| Problem | Description |
|---------|-------------|
| ❌ Context Prefix Changes | Once incremental pruning causes changes to the context prefix |
| ❌ KV Cache Invalid | The remaining KV cache becomes invalid due to absolute position changes or prefix mismatch |
| ❌ Triggers Prefill Recalculation | Leading to expensive Prefill recalculation |

### Personal Exploration Journey

As an independent developer, I conducted extensive local experiments:

| Attempted Approach | Result |
|--------------------|--------|
| Adjusting Prompt organization order | Limited effectiveness |
| Prefix preloading for stability | Cannot fundamentally solve the problem |
| Exploring physical splitting/merging of raw KV data | Limited by framework constraints |

Ultimately chose a **compromise solution**:

> Preload fixed-format prompts + tools during local model startup for pre-stored KV reuse
> - ✅ Static parts (prompts + tools) → Permanently reuse KV cache
> - ❌ Dynamic parts (memory, tool results, etc.) → Continue bearing recalculation costs

### Industry Gap

**This is not giving up exploration, but recognizing an industry reality from practice**: Current inference frameworks do not yet provide native, flexible KV reuse support for intelligent memory management architectures like "incremental pruning."

---

## 🎯 Core Problem Being Solved

This project aims to solve this **industry-wide challenge** through the core mechanism of **"Chunk-Naming-Indexing"**:

- ✅ Achieve **flexible**, non-prefix-dependent KV cache reuse
- ✅ When model context changes due to incremental pruning, remaining KV cache can still be **stably reused**
- ✅ No longer trigger **full recalculation** due to history removal

---

## ⚙️ Core Technical Vision

### 1️⃣ Context Chunking & Solidification

```
Long Context → Split by Token Count → Multiple Logical Chunks
```

- Each chunk, after generation, is treated as an **independently manageable KV cache unit**

### 2️⃣ Global Naming & Indexing

- Assign a **globally incrementing unique identifier** to each generated chunk (e.g., auto-incrementing ID)
- Upper-layer memory scheduler maintains a **lightweight in-memory index table**
- Index table records currently used chunk ID data

### 3️⃣ Incremental Pruning & Precise Removal

```
Memory Scheduler Issues Pruning Command
        ↓
Notify Inference Engine of Expired Chunk IDs to Prune
        ↓
Engine Releases VRAM/RAM Storage Space Based on Index
        ↓
Update Index Table
```

### 4️⃣ Selective Reuse

| Step | Operation |
|------|-----------|
| ① | Before subsequent inference requests, read required KV chunks from cached KV data layer by layer |
| ② | Efficiently complete fusion inference after **dynamic position decoding** |
| ③ | Remaining unaffected KV chunks continue to be reused for subsequent generation |

---

## ⚠️ Current Limitations & Expectations

### Current Limitations

| Limitation | Description |
|------------|-------------|
| **Lack of Framework Native Support** | vLLM, llama.cpp and other mainstream frameworks' KV Cache management inherently depends on strict prefix matching |
| **Position Encoding Mechanism** | Compatibility challenges between absolute and relative position encodings |

### Expected Directions

- 🎯 Inference engines provide a set of **intelligent, general-purpose KV Cache management APIs**
- 🔗 Enable **decoupling** between upper-layer applications and engines
- 💾 Allow memory schedulers to manage KV caches like operating files

---

## 🚀 Technical Innovation & Value

### Core Philosophy

```
Traditional Mode: Rigid Chain (Forced Prefix Matching)
        ↓ Transformation
New Mode: Flexible Building Blocks (Chunk-based Combinable Reuse)
```

### Core Logic

> **"KV Split into 100 Parts is Equally Linked to 100 Parts of Memory"**

### Implementation Effects Comparison

| Scenario | Traditional Approach | New Solution |
|----------|---------------------|--------------|
| Incremental Pruning | Full Recalculation ❌ | Minus-1-Plus-1 Sync Reuse ✅ |
| Cache Utilization Rate | Low | High |
| Memory-KV Integration | Disconnected | Intelligent Linkage |

### Value Summary

1. ✅ Fundamentally change the **"Incremental Pruning = Full Recalculation"** deadlock
2. ✅ Form true **intelligent linkage** between upper-layer memory management and lower-layer KV cache
3. ✅ Break free from **rigid dependency** on strict prefix matching
4. ✅ **Pave the way** for more complex memory scheduling strategies "Incremental Pruning" application scenario, conducting targeted optimization and development at the inference engine level:

- 💡 Provide more flexible KV cache management APIs
- 🔧 Innovate from the ground up in position encoding mechanisms

> Whichever direction, it will have far-reaching impact on the upper-layer application ecosystem.

As a humble application developer, I will continue to **explore and validate** within my capabilities.

---

## 📬 Contact & Communication

- **QQ Group**: 362422425 (Admin)
- **GitHub**: https://github.com/xiaoduanRobot/yiliu666
- **Gitee**: https://gitee.com/yiliu66/xiaoduan

---

> *This document aims to share technical vision and promote discussion and practice in AI inference efficiency optimization.*

---

## 📋 Metadata

| Field | Value |
|-------|-------|
| **Author** | Nuo Yan (yiliu666) |
| **Project** | Xiaoduan AI |
| **First Published** | November 2025 (ModelScope) |
| **License** | Apache 2.0 |
