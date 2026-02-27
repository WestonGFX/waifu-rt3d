# AI Image Generation Guide

Waifu-RT3D supports two local image generation backends: **ComfyUI** (recommended)
and **Easy Diffusion**. Both run entirely on your machine — no API keys, no
cloud, no cost per image.

---

## Quick overview

| Feature | ComfyUI | Easy Diffusion |
|---------|---------|---------------|
| Default port | 8188 | 9000 |
| Workflow format | JSON graph (node-based) | REST API, simple params |
| Video generation | ✅ (Wan 2.2) | ❌ |
| LAN network use | ✅ | ✅ |
| GPU requirement | NVIDIA or Apple Silicon | NVIDIA or Apple Silicon |
| Setup complexity | Medium | Easy |
| Works with RTX 5080 | ✅ (fast, use z-image-turbo) | ✅ |

---

## Part 1: ComfyUI

### How it works in this app

When you generate an image (via chat `generate_image` tool, or Settings > AI Art),
the app:

1. Loads `backend/config/comfyui_bg_workflow.json`
2. Injects your prompt, checkpoint, width/height/steps
3. POSTs the workflow to ComfyUI's `/prompt` endpoint
4. Polls `/history/{job_id}` until the job completes
5. Downloads the output image from ComfyUI's `/view` endpoint
6. Saves it to `backend/storage/images/` and returns the URL

No plugins or custom nodes required — just a standard ComfyUI install with
your checkpoint loaded.

### Step 1: Install ComfyUI

```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -r requirements.txt
```

Or use the official ComfyUI Desktop installer (Windows/Mac):
https://github.com/Comfy-Org/desktop/releases

### Step 2: Get a checkpoint

The default workflow is tuned for **z-image-turbo** — an anime-style turbo
model that generates a 512×512 image in ~9 steps (~1 second on RTX 5080).

Download: https://huggingface.co/Lykon/z-image-turbo/tree/main

Put the `.safetensors` file in `ComfyUI/models/checkpoints/`.

Other good options for anime:
- **Anything V5** — classic anime, 20 steps
- **PonyDiffusionXL** — very anime/furry, 25 steps, needs SDXL workflow
- **FLUX.1-dev** — state of the art, ~20 steps, needs a different workflow (see below)

### Step 3: Start ComfyUI

```bash
cd ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

`--listen 0.0.0.0` exposes ComfyUI on your LAN so you can access it from the
app even if they're on different ports. You can omit it if both are local.

### Step 4: Configure in the app

Go to **Settings → AI Art**:

| Setting | Value |
|---------|-------|
| Image Generator | `ComfyUI` |
| Image Gen URL | `http://localhost:8188` (or your LAN IP) |
| Default Checkpoint | `z-image-turbo` (filename without .safetensors) |
| Inference Steps | `9` for z-image-turbo · `20` for FLUX · `25` for SDXL |
| Width / Height | `512` for turbo · `1024` for SDXL/FLUX |

Click **Recheck** — you should see ● Online.

### Step 5: Enable in chat (tool use)

For the character to generate images **during conversation**, tool use must be
enabled. In Settings → Brain:
- Enable **Tool Use** (or **Agent Mode**)

The character will call `generate_image` when the conversation context
warrants it (e.g. "draw me a cat"). The image appears inline in the chat bubble.

### Using a different checkpoint / workflow

The `comfyui_bg_workflow.json` template uses these ComfyUI node IDs:

| Node | ID | Purpose |
|------|----|---------|
| `CheckpointLoaderSimple` | `4` | Loads the checkpoint |
| `CLIPTextEncode` (positive) | `6` | Your prompt goes here |
| `CLIPTextEncode` (negative) | `7` | Negative prompt |
| `KSampler` | `3` | Steps, sampler |
| `EmptyLatentImage` | `5` | Width × Height |

**For SDXL or FLUX:** Export a working workflow from ComfyUI as JSON
(use the API format: *Settings → Enable Dev Mode Options → Save (API Format)*),
then replace `backend/config/comfyui_bg_workflow.json` with it.
Make sure the node IDs for prompt, checkpoint, and latent size match the constants
at the top of `backend/image_gen/adapters/comfyui.py`, or update those constants
to match your workflow.

### Writing good prompts for anime backgrounds

```
# Scene background:
"anime bedroom, cozy aesthetic, fairy lights, bookshelf, warm lighting,
 soft colors, lofi vibes, high detail"

# Negative (built into the default workflow):
"lowres, blurry, artifacts, watermark, text, logo"
```

---

## Part 2: Easy Diffusion

Easy Diffusion is a self-contained Stable Diffusion desktop app with a
built-in web server. It's simpler than ComfyUI: no workflow JSON needed.

### Setup

1. Download from https://easydiffusion.github.io/
2. Install and launch Easy Diffusion
3. In Easy Diffusion → Settings → Server → enable **Allow Network Access**
4. Note the URL shown (usually `http://localhost:9000` or your LAN IP)
5. Switch to the **beta channel** for the richer `/api/render` API:
   - Easy Diffusion → Check for Updates → Switch to Beta
   - (The stable channel works too via the legacy `/app/txt2img` endpoint,
     but beta has better error reporting and async status tracking)

### Configure in the app

Go to **Settings → AI Art**:

| Setting | Value |
|---------|-------|
| Image Generator | `Easy Diffusion` |
| Image Gen URL | `http://localhost:9000` (or LAN IP like `http://192.168.1.50:9000`) |
| Default Checkpoint | Leave blank to use whatever Easy Diffusion has loaded, **or** enter a model filename |
| Inference Steps | `20–25` (Easy Diffusion handles the sampler automatically) |

Click **Recheck** — you should see ● Online.

That's it. The app sends prompts to Easy Diffusion and receives PNG images back.
No workflow files, no node IDs to worry about.

### LAN use (offloading to a second machine)

Easy Diffusion is ideal for offloading generation to another machine on your
network — for example a dedicated desktop with a GPU while you develop on a laptop.

1. On the GPU machine: start Easy Diffusion with network access enabled
2. Find the LAN IP of the GPU machine (`ipconfig getifaddr en0` on Mac,
   `ip addr` on Linux)
3. In the app settings, set Image Gen URL to `http://192.168.x.x:9000`
4. Click Recheck — it should go green

### Limitations vs ComfyUI

- **No video generation** — Easy Diffusion is image-only
- **No workflow customization** — you can set prompt/steps/size but not node graphs
- **Model loading** — whatever checkpoint Easy Diffusion has loaded is used;
  you can't switch checkpoints from the app (change it in Easy Diffusion itself)

---

## Part 3: The generate_image agent tool

When a character has **tool use enabled**, they can call `generate_image` during
conversation. This works with either backend.

**How to trigger it:**
- "Draw me a picture of a cozy bedroom"
- "Can you generate an image of yourself?"
- "Make me a wallpaper of a cyberpunk city at night"

The generated image appears inline in the chat bubble below the character's text reply.

**How it reaches your character's system prompt:** The tool description says
*"Generate an image from a text prompt using the configured image generation backend."*
The LLM decides when to call it based on conversation context.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Status shows ● Offline | Check ComfyUI/Easy Diffusion is running; verify URL and port |
| "Background workflow template not found" | Check `backend/config/comfyui_bg_workflow.json` exists |
| "Checkpoint not found" in ComfyUI logs | The `.safetensors` filename in settings doesn't match what's in `ComfyUI/models/checkpoints/` |
| Generation times out | Increase `image_gen.timeout` in config; check GPU isn't memory-starved |
| Image is black / corrupt | ComfyUI VAE issue — try a different checkpoint or VAE |
| Image appears in chat but is 404 | Make sure the backend storage path `backend/storage/images/` exists and is writable |
