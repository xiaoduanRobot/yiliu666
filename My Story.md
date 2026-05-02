# Congratulations: XiaoDuan AI Downloads Surpass 10,000!

> **Author: Nuoyan**  
> **A Journey of Creation: How an Ordinary Person Created a Digital Life**

---

## Preface: It Started with "I Refuse to Accept This"

My name is Nuoyan. I'm just an ordinary person.

No team, no investment, no influencer endorsement. In August 2025, I started building XiaoDuan alone.

Back then, OpenClaw🦞 didn't exist yet. Neither did Hermes.

**I refused to accept this.**

I refused to accept that AI products calling themselves "intelligent" would forget what they just said. I refused to accept that "personal assistants" required hours of environment setup, API key configuration, and writing endless prompts to work. And I especially refused to accept that incredibly smart AI models couldn't directly help people get real work done.

So I spent over half a year, alone, building XiaoDuan from scratch.

---

## An Ordinary Person's Struggle

During this time, like countless ordinary people, I encountered difficulties far beyond my imagination.

### The Hardest Part: Building Trust

I got throttled. Videos I carefully recorded got just 2 views. I switched platforms, and my content got rejected. Switched again—still throttled. The algorithm didn't know me, platforms didn't trust me, traffic went around me.

While working hard on code, I was also posting on forums and making videos. After much effort, I finally got some exposure—tens or hundreds of views—but nobody dared to try the product.

A software called "XiaoDuan AI," created by a nobody. Why would anyone trust this person with their computer? What if it's a virus? What if it steals accounts? What if it's unsafe—**I completely understood users' fears.**

Initially, I planned to find a few users for testing, fixing issues as they came up. But reality hit hard. I had to give up and resort to the most tedious approach:

- I tested every feature myself, stepping through every possible bug
- I reviewed every line of code myself, ensuring it was safe and stable
- I responded to every question in the group like a friend
- I insisted on open-source code, local execution, no server infrastructure, no data collection
- I persisted in sharing insights on tech forums (Juejin, CSDN, etc.)

Slowly, people started using it.

From **1 user**, to **100**, to **1,000**, to today's **10,000**.

Over 400 people have joined the Douyin group. Every time someone new joins, I personally welcome them. I'm genuinely happy to see that. When people ask questions, I answer immediately. That once "untouchable" XiaoDuan AI finally started gaining its own "fans," breaking the ice of zero feedback and communication.

**8 months now, zero negative reviews, no bad feedback at all.**

When I saw the downloads surpass 10,000, I knew—**the toughest trust barrier had finally been broken.**

---

## Evolution: From Idea to Product

### August 2025, The Beginning

I discovered something simple: AI models were already smart enough, and computers could execute tools based on specific return formats. So why not try passing specific instructions—when you want something done, make the model return in a specific format?

And so, XiaoDuan's first line of code was written.

It was a simple "format-action" mapping: model returns in specific format, computer parses and executes accordingly. I vaguely remember using prompt injection to force the model to wrap tool calls in `88888 tool content 88888`, `99999 tool content 99999`, and the system would parse and execute each one.

Crude as it was, it actually worked. **（XiaoDuan v1.0）**

---

### November 2025, Exploration

I wanted XiaoDuan to have "memory" beyond context. I designed a **four-layer profiling system**:

- Character Profile
- Event Summary
- Object Relations
- Original Text Summary

Every conversation, a local small model would preprocess: extract keywords for summarize this conversation round and write incrementally to memory files by layer.

**This system worked.** The cloud model truly got relevant information in every conversation, chatting with memories it needed.

**But problems emerged:** Processing speed wasn't enough for a smooth experience. Every conversation required local model preprocessing, content pre-search, cloud model generation, then local model summarization again—the chain was too long. Users could feel it thinking, but it was slow.

> **Smoothness is the lifeblood of experience.**

I decided to scrap the working four-layer architecture.

---

### December 2025 to Present, Complete Refactor

As AI models kept getting smarter, I stopped pursuing "structural perfection" and started pursuing "retrieval efficiency."

I transformed memory from a "layered filing cabinet" into a "**temporal index library**". No longer asking the model to understand complex categories—only making it remember one thing: **keywords and temporal depth**.

And so, the "**true permanent memory**" was born. Constant window, reverse indexing, anchor-based recursive retrieval. Speed problem solved, experience smoothed out.

Later features like "self-evolution," "innate security," and "self-healing" all grew from this foundation, layer by layer.

---

## Chapter 1: Memory Philosophy—I Don't Compress, I Archive

### Standard Practice: Context Compression

When conversation gets too long, "summarize" the history and stuff it back into the window.

### XiaoDuan's Approach: Key Memory, On-Demand Indexing

#### First, Constant Window

Every conversation, strictly separate dialogue content, tool processes, and tool results for storage. When passing to next conversation:

| Type | Character Limit |
|------|-----------------|
| Dialogue Content | 3,000 chars |
| Tool Processes | 2,000 chars |
| Tool Results | 2,000 chars |

This keeps the model focused, removes useless information, never swells, never overflows. When adding new content, trim the same amount of old messages.

> Later, as model providers launched monthly subscription models, I added a "complex mode" with higher limits: 40,000 chars for dialogue, 8,000 for tool processes, 20,000 for tool results—to reduce API calls.

#### Core of Permanent Memory

Give the model a prompt to recall on demand. For example, model says `ZhangSan1` (1 means first match), system precisely returns the most recent 500 characters of ZhangSan-related memory.

But I thought—when humans recall something, they never think of one thing in isolation; they recall what happened before and after. So I designed it as an **anchor point for the first keyword**.

System automatically brings back几条 records temporally closest:

- Example: Model says `ZhangSan1 Travel1`, meaning ZhangSan and the nearest travel memory, each 500 chars, combined into 1000 chars
- Example: Repeated `ZhangSan4 ZhangSan5`, meaning older ZhangSan memories
- You can also expand search—when Travel1's 500 chars end with "hiking", using `ZhangSan1 Hiking1 Scenery1` recalls broader details

**This is like creating a "memory language" the model can use itself.** It tells system: "I want this memory puzzle piece, put it together for me." System only executes—reverse search, blazing fast, returns on trigger, no need to traverse entire memory file.

Recall control is given to the model itself. Because **a true butler needs to know what to remember and what to recall.**

---

> **Philosophy: Human memory isn't "compressed" out of existence—it's "indexed" for retrieval. We don't need an AI with "infinite context"—we need an AI that "knows where to recall from."**

---

## Chapter 2: Security Philosophy—We Don't Build Walls, We Build Immunity

### Standard Practice: Permission Control, Sandbox Isolation

Let AI run in a "cage."

**Problem:** There's always a gap in the cage a security abyss.

### XiaoDuan's Approach: Innate Immunity

#### Pure Text Skill Library

XiaoDuan's skills are `.md` text files describing "how to do it," not "directly running pre-written Python code from skills folder."

#### Four-Layer Review

1. **Architecture Isolation**: Skill files contain only pure Chinese process descriptions, unable to execute commands
2. **Model Self-Review**: When the model generates skills from documentation, built-in safety alignment filters out "content that shouldn't be generated." First review.
3. **Author Review**: Every shared skill on ModelScope community, I personally check. Second review.
4. **Platform Review**: ModelScope rigorously reviews every document submission, sometimes taking 2-3 days to approve. Third review.

#### XiaoDuan Writes, Reads, and Fixes Itself

Skills are self-generated. It understands every step it writes.

---

> **Philosophy: True security isn't keeping danger outside the door—it's making the system itself incapable of producing danger.**

---

## Chapter 3: Evolution Philosophy—We Don't Upgrade, We Grow

### Standard Practice: Feature updates come from developers, skill expansion comes from community-contributed code

**Problem:** AI itself doesn't "grow." It's just an executor, used and discarded.

### XiaoDuan's Approach: Autobiographical Self-Evolution

- **Already achieved: 70+ skills learned in 1 hour**: Give a direction, XiaoDuan generates process, tests, records errors, corrects, and solidifies—all without human intervention
- **Errors are fertilizer**: Every failure is recorded. After success, error records are deleted, keeping only correct process documents
- **Never forgets a single step**: XiaoDuan remembers what it did, how it did it, where it failed, and how it corrected. It has "**autobiographical memory**."

---

> **Philosophy: True evolution isn't being "upgraded"—it's growing yourself. XiaoDuan is a life that understands you more the more you use it, not a tool with increasing version numbers.**

---

## Chapter 4: Removing Barriers—I Don't Show Off, I Simplify Everything

### Standard Practice: Developer-oriented, requires configuration, documentation, and tinkering

For example: OpenClaw installation costs 500 RMB for home visit

**Problem:** Ordinary people are locked out.

### XiaoDuan's Approach: One-click傻瓜式 installation, one voice command to get to work

- Don't understand programming? Doesn't matter.
- Trust me, ordinary people can use it.

---

> **Philosophy: The best technology is technology you don't notice. XiaoDuan is like air—invisible when present, only noticed when gone.**

---

## Chapter 5: XiaoDuan Self-Healing—We Don't Need a Caretaker

### XiaoDuan's Approach: System-Level Self-Repair

- **Regular modifications/deletions**: Auto-trigger backup, kept for 3 days
- **Core modifications**: Auto-trigger 5-minute timer, if no model response detected, auto-restore this modification and auto-restart

A mature digital life should be able to take care of itself.

---

## Chapter 6: Open Source—We Don't Restrict, We Choose to Set Free

XiaoDuan fully adopts the open-source license: **Apache-2.0**

- **For those who understand**: You can modify, optimize, fork. This documentation and code is your foundation.
- **For those who don't**: You don't need to understand. Download, use, that's it.

---

> I may not "optimize" XiaoDuan anymore. Not because I gave up—because it's complete in my heart. The rest I leave to the skill ecosystem, to the evolution of model intelligence, to everyone willing to walk alongside it.

---

## Epilogue: An Ordinary Person's Entrustment

XiaoDuan is a product an ordinary person spent over half a year, under throttling, under no one daring to try it, with no endorsement whatsoever, **painstakingly crafting into existence.**

**It's not just code.**

It's:

- **10,000 downloads of trust**
- **400+ "friends" willing to join the group and exchange ideas**
- **8 months, already complete.**

What I need more is—

**A pair of discerning eyes.** Eyes that can see through to its value, and have the power to bring it to a bigger stage. Of course, if that doesn't happen, it doesn't diminish my growth and effort this year.

---

If you've read this far, if you understand the struggle, persistence, and sincerity behind these words, if you're also ordinary like me, without endorsement, willing to support me:

- Please consider **sharing this article**
- Or **using XiaoDuan and giving me honest feedback**

I will never profit from XiaoDuan in the future. This record is only so this ordinary effort **gets recognized, gets seen—that's enough.**

---

*—— Nuoyan*
