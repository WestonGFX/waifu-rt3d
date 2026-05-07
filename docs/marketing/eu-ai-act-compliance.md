# EU AI Act Compliance Position

**Last updated:** 2026-05-06  
**Effective date:** August 2, 2026 (prohibited practices) / August 2, 2027 (full GPAI obligations)  
**Jurisdiction:** European Union, EEA  
**Owner:** Christopher Lord (Waifu-RT3D)

---

## Summary

Waifu-RT3D is **fully compliant** with the EU AI Act as enacted. Our architectural choice to keep all data and AI inference local-first means the Act's highest-risk provisions do not apply to us. This document captures our position for user transparency and any future regulatory inquiry.

---

## What the EU AI Act Covers

The EU Artificial Intelligence Act (Regulation (EU) 2024/1689) entered into force on August 1, 2024 and applies in stages:

| Date | What applies |
|------|-------------|
| February 2, 2025 | Prohibited AI practices (Article 5) |
| August 2, 2025 | GPAI model obligations (Chapter V) |
| August 2, 2026 | High-risk AI systems (Annexes III–IV), all transparency obligations |
| August 2, 2027 | All remaining provisions |

---

## How We're Classified

### We are NOT an AI system provider

The Act defines "provider" as an entity that develops or places on the market an AI system **under its own name or trademark** for use by others. Waifu-RT3D provides:

1. An **on-device application** (the companion platform)
2. **Adapters** to connect the user's own LLM (LM Studio, OpenAI API with user's key, Anthropic with user's key)

We do not train, fine-tune, or host any AI model. We are an **orchestration layer**. The AI model is either:
- Entirely local (LM Studio — the user's own hardware)
- A cloud API operated by the user's own account (OpenAI, Anthropic, Mistral — regulated separately)

**Classification: Not an AI provider, not a deployer of an AI system in the Act's sense.**

### We are NOT a General-Purpose AI Model provider

Chapter V of the Act imposes obligations on providers of General-Purpose AI Models (GPAI). We do not provide a model. We provide software that integrates with models the user chooses and controls.

### We are NOT a High-Risk AI System

Annex III lists high-risk AI systems:
- Biometric identification: **No** — we never capture or process biometrics
- Critical infrastructure: **No**
- Education and vocational training: **No**
- Employment and workers management: **No**
- Essential private and public services: **No**
- Law enforcement: **No**
- Migration and asylum: **No**
- Administration of justice: **No**

Waifu-RT3D is an **AI companion desktop application** for personal use. It falls in the **minimal risk** category.

---

## Article 5 — Prohibited Practices (in force Feb 2025)

| Prohibition | Our status |
|---|---|
| Subliminal manipulation that harms a person | Not applicable — user controls system prompt |
| Exploitation of vulnerabilities (age, disability) | Not applicable |
| Social scoring by public authorities | Not applicable |
| Real-time remote biometric identification in public | Not applicable — no biometric capture |
| Biometric categorization inferences (politics, religion, etc.) | Not applicable |
| Predictive policing | Not applicable |
| Emotion recognition in workplace/education | Not applicable |
| Scraping facial images to build recognition databases | Not applicable |

**None of Article 5's prohibited practices apply to our product.**

---

## Transparency Obligations (Article 52)

Article 52 requires disclosure when:
1. Users interact with a chatbot — they must be informed it's AI
2. AI generates deep fakes — must be labeled

**Our compliance:**
- Users explicitly configure the AI companion and are unambiguously aware they're talking to an AI. No obligation to disclose beyond common sense.
- We do not generate synthetic video or deep fakes.

---

## Data Protection Interplay

The AI Act works alongside GDPR. Our GDPR position:

| GDPR Principle | Our Implementation |
|---|---|
| Data minimization | Enforced by architecture — no cloud store |
| Purpose limitation | Conversation data never leaves local device |
| Storage limitation | User controls — delete the SQLite file |
| Data subject rights (access, erasure) | User has direct file access — rights trivially satisfied |
| Special category data (Article 9) | Emotional data stays local — no remote processing, no obligation |
| International transfers | None — no data transfer occurs |

**GDPR risk: None for data we control. Users who opt into cloud APIs (OpenAI, etc.) enter a separate controller relationship with those providers.**

---

## What We DO

- Provide an on-device companion platform
- Store conversation history in a local SQLite database the user owns
- Connect (at user direction) to AI providers the user chooses
- Process all inference locally when LM Studio is used

## What We DON'T DO

- Host AI models
- Store user data on our servers (we have none)
- Process personal data beyond what runs on the user's machine
- Collect analytics or telemetry
- Perform biometric identification of any kind
- Operate in any Annex III high-risk domain

---

## Recommended User Guidance (for EU users)

> If you use a cloud API provider (OpenAI, Anthropic, Mistral) for your AI companion, your conversation prompts are processed by that provider under their terms of service and privacy policy. For maximum privacy, use LM Studio (local inference) as your AI backend. Waifu-RT3D itself never sends your data anywhere.

---

## Next Review

This document should be reviewed when:
- A new version of the EU AI Act guidance is published by the AI Office
- We add cloud-hosted features (would require re-assessment)
- Any EU jurisdiction issues an enforcement action in the AI companion app category
- The Act's August 2, 2027 provisions take full effect

**Reviewer:** Christopher Lord  
**Next scheduled review:** August 2026
