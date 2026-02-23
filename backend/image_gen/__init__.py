"""Image and video generation adapters for waifu-rt3d.

Provides a provider-agnostic interface for generating images (backgrounds,
portraits, character icons) and async video clips via ComfyUI, Easy Diffusion,
or any compatible backend.

Usage:
    from backend.image_gen.registry import get_image_gen
    adapter = get_image_gen(load_config())
    if adapter.is_available():
        result = adapter.generate("anime bedroom, neon lights", {"width": 512})
"""
