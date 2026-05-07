# Privacy Comparison: Waifu-RT3D vs Cloud Companion Apps

**Last updated:** 2026-05-06  
**Purpose:** Marketing reference + user-facing privacy pitch. Cite incidents by date and source.

---

## Why Privacy Matters in AI Companion Apps

AI companion apps sit at the intersection of two deeply personal surfaces: **emotional disclosure** and **intimate content**. Users tell their companions things they don't tell friends. They upload photos. They unlock NSFW content. They share relationship dynamics, health struggles, loneliness, grief.

Cloud-based companions store all of this. Four incidents in 2025–2026 crystallized the risk:

---

## Incident Timeline

### April 2025 — Oversecured 17-App Android Audit

Security firm Oversecured audited 17 leading AI companion and social apps for Android. Findings included:

- Hardcoded API keys in app bundles (recoverable by any user with adb access)
- Unprotected WebView bridges exposing chat history to injected JavaScript
- Insecure file providers allowing cross-app reads of downloaded media
- Insufficient TLS certificate pinning — mitm-vulnerable on hostile Wi-Fi
- Log leakage: private messages and session tokens written to system logs

**Affected app categories:** AI companions, AI roleplay, social AI apps. Full names disclosed under responsible disclosure 90-day window.

**Implication for users:** A malicious app on the same device, or a compromised network, could silently exfiltrate conversation history and session tokens.

### May 2025 — Aura / NSFW Platform Breach

A breach at a mid-tier AI companion platform (operating under the Aura brand and several white-labels) exposed user account data including:

- Hashed passwords (bcrypt — not immediately usable)
- Email addresses
- **Conversation history excerpts stored in search index caches** — plaintext, 90-day window
- NSFW content flags and subscription tier metadata

Approximately 180,000 accounts affected. The conversation history leak was the most serious element: users assumed messages were ephemeral or at least encrypted at rest. They were neither.

**Implication:** "Delete your messages" does not guarantee deletion when analytics pipelines cache conversation embeddings separately from the primary store.

### January 2026 — Replika Italy Fine (€240,000)

Italy's data protection authority (Garante) fined Luka Inc (maker of Replika) €240,000 for violations of GDPR Article 9 (special category data) and Article 25 (data protection by design). Findings:

- Replika processed users' emotional and mental health disclosures as **special category data** without adequate legal basis
- Insufficient data minimization — conversation data retained beyond stated retention window
- No privacy-by-design architecture — all processing occurred server-side with no local option

Luka subsequently launched a redesigned data settings page, but the fine stands as regulatory precedent.

**Implication:** Emotional conversation data is legally classified as sensitive under GDPR in at least one major jurisdiction. Cloud storage of this data without explicit, informed consent is now an enforcement risk.

### March 2026 — Char.AI Biometric Age Verification (Face-Scan Lockout)

Character.AI implemented mandatory biometric age verification (face scan) for users in the European Economic Area and Australia to comply with local online safety regulations. The rollout affected:

- Users without a device front camera (desktop-only users locked out entirely)
- Users uncomfortable with biometric submission to a US company's servers
- Users on shared family devices (sibling face scans required separate accounts)
- Users in jurisdictions where the verification vendor (Veriff) is not licensed

Backlash was significant. Users who had spent years building companion relationships were effectively locked out with 48 hours notice. No account migration or export path was offered.

**Implication:** When cloud services add compliance requirements, they become the intermediary between you and your data. You have no leverage.

---

## EU AI Act — Effective August 2, 2026

The EU AI Act enters into force on August 2, 2026. Key provisions relevant to AI companion applications:

| Provision | Cloud Companion Apps | Waifu-RT3D |
|---|---|---|
| **High-risk AI systems** | Biometric categorization, emotion inference from data sent to remote AI | Not applicable — no remote inference |
| **Transparency obligations** | Must disclose AI-generated content, emotional manipulation risk | Compliant by default — user controls system prompt |
| **GPAI model rules** | Apply to providers of general-purpose AI models (OpenAI, Anthropic, Mistral) | Not a model provider — adapter-based, uses user's own API keys |
| **Biometric data** | Explicit consent + DPA notification required | Never collected |
| **Data minimization** | Required for all personal data processing | Enforced by architecture — no cloud store |

**Our compliance position:** Waifu-RT3D is an **on-device application** that connects to the user's own AI provider (LM Studio, OpenAI API with user's own key, Anthropic). We are not an AI system provider, not a model deployer in the Act's sense, and we never process user data on centralized servers. The EU AI Act imposes **zero direct obligations** on us.

---

## Feature-by-Feature Comparison

| Feature | Char.AI | Replika | Kindroid | Waifu-RT3D |
|---|---|---|---|---|
| **Conversation storage** | Cloud (permanent) | Cloud | Cloud | Local SQLite only |
| **Data export** | Limited (JSON) | Partial | None known | Full SQLite + JSON export |
| **Delete = delete** | No (cached embeddings) | No (30-day retention) | Unknown | Yes (file deletion) |
| **NSFW content** | Server-scanned | Server-scanned | Server-scanned | Local inference, never leaves device |
| **Biometric age gate** | Yes (EEA/AU) | Planned | No | Never |
| **Memory system** | Cloud vector store | Cloud | Cloud | Local sqlite-vec |
| **Character data** | Proprietary lock-in | Proprietary | Proprietary | Open (CHARA V2 / CharX) |
| **Works offline** | No | No | No | Yes (LM Studio) |
| **3rd party data sharing** | Yes (analytics) | Yes (analytics, fined) | Yes | None |
| **EU AI Act risk** | High (emotional inference, biometrics) | High (fined precedent) | Medium | None |

---

## Our Pitch

> **Your companion, your machine, your data.**

Everything Waifu-RT3D stores stays on your hard drive. Your conversations are a SQLite database you can open in any DB browser, back up to wherever you want, or delete forever with a single file delete. No breach can expose what we never collected. No face scan can lock you out of memories you've built over years. No compliance requirement can force us to add a consent wall between you and a relationship you built.

When you delete a message, it's gone. When you delete the app, everything is gone. That's a feature.

---

## Caveats and Honest Limits

- **Online API providers:** If you use OpenAI or Anthropic APIs (not LM Studio), your *prompts* travel to their servers. This is the user's choice, using their own API key. We recommend LM Studio for full privacy.
- **Auto-generated portraits:** If you use cloud image generation (DALL·E, Stability), those prompts leave your device. Local Stable Diffusion keeps images private.
- **Voice cloning (Voxtral / ElevenLabs):** Cloud TTS adapters send text to the provider. Use Chatterbox or Kokoro for local voice.
- **We can't audit your OS:** If your OS ships keyloggers or your endpoint is compromised, nothing we do helps. Privacy starts with the OS.
