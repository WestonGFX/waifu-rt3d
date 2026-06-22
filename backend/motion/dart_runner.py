"""Resident DART text->motion generator for the GPU box (Stage 3 Phase 3).

Wraps DART's `mld.rollout_mld` so the diffusion model is loaded into VRAM **once**
and reused across requests (the whole point of a live motion service: ~14 s model
load amortised, then ~1.3 s per clip on the RTX 5080). The motion server's
`_try_load_ai_backend` / `/generate` AI branch calls :class:`DartRunner`, returning
the generated SMPL-X ``.npz`` to the Mac, which converts it to a normalized-VRM GLB
via ``tools/dart_to_glb.py`` (transport A2 in the Phase-3 design doc).

Deployment (box-side): DART's modules (`mld.*`) are only importable from the DART
repo root in the WSL ``dart`` conda env (Python 3.10 + cu128 + the pytorch3d shim).
So this module **lazily** imports DART inside :meth:`DartRunner.load` — that keeps
the file importable on the Mac (for unit tests / the Mac-side server) without DART
present. Run the engine on the box from the DART repo root, e.g.::

    conda activate dart && cd /root/DART
    python /path/to/dart_runner.py --prompt wave --primitives 8

Phase-3 status: this is the generation ENGINE (live-verified on the box). The
persistent networked service (motion_server AI branch + Mac transport) consumes it.

Non-commercial license note: DART + SMPL-X output inherit research-only licensing
(see the Phase-3 design doc) — prototype use only until commercial SMPL licensing.
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Default checkpoint relative to the DART repo root (matches demos/run_demo.sh).
DEFAULT_CHECKPOINT = "./mld_denoiser/mld_fps_clip_repeat_euler/checkpoint_300000.pt"


class DartRunner:
    """Holds a DART diffusion model resident in VRAM and generates motion clips.

    Construct once (loads the model), then call :meth:`generate` per request. All
    DART imports are deferred to :meth:`load` so importing this module on a machine
    without DART (e.g. the Mac) does not fail.

    Attributes:
        checkpoint: Path to the denoiser checkpoint (DART-repo-relative or absolute).
        dataset: DART dataset conditioning name (``"babel"`` for the SMPL-X demo).
        device: Torch device string.
        guidance: Classifier-free guidance scale.
        batch_size: Rollout batch size (1 for single-clip generation).
        loaded: True once :meth:`load` has run.
    """

    def __init__(
        self,
        checkpoint: str = DEFAULT_CHECKPOINT,
        *,
        dataset: str = "babel",
        device: str = "cuda",
        guidance: float = 5.0,
        batch_size: int = 1,
    ) -> None:
        self.checkpoint = checkpoint
        self.dataset = dataset
        self.device = device
        self.guidance = guidance
        self.batch_size = batch_size
        self.loaded = False
        self._ctx: dict[str, Any] = {}

    def load(self) -> None:
        """Load the DART denoiser + MVAE + diffusion + seed dataset into memory.

        Mirrors ``mld.rollout_mld.__main__`` setup. Heavy and DART-dependent —
        imported lazily here. Idempotent.

        Raises:
            ImportError: If DART modules are not importable (not on the box / not
                run from the DART repo root).
        """
        if self.loaded:
            return
        import torch  # noqa: PLC0415
        from mld.rollout_mld import load_mld  # noqa: PLC0415
        from mld.train_mld import create_gaussian_diffusion  # noqa: PLC0415
        from data_loaders.humanml.data.dataset import SinglePrimitiveDataset  # noqa: PLC0415

        device = torch.device(self.device if torch.cuda.is_available() else "cpu")
        self.device = str(device)
        denoiser_args, denoiser_model, vae_args, vae_model = load_mld(self.checkpoint, device)
        diffusion_args = denoiser_args.diffusion_args
        diffusion_args.respacing = ""
        diffusion = create_gaussian_diffusion(diffusion_args)
        seq = "./data/stand.pkl" if self.dataset == "babel" else "./data/stand_20fps.pkl"
        dataset = SinglePrimitiveDataset(
            cfg_path=vae_args.data_args.cfg_path,
            dataset_path=vae_args.data_args.data_dir,
            body_type=vae_args.data_args.body_type,
            sequence_path=seq,
            batch_size=self.batch_size,
            device=device,
            enforce_gender="male",
            enforce_zero_beta=1,
        )
        self._ctx = dict(
            denoiser_args=denoiser_args, denoiser_model=denoiser_model,
            vae_args=vae_args, vae_model=vae_model, diffusion=diffusion, dataset=dataset,
        )
        self.loaded = True
        logger.info("DartRunner loaded (checkpoint=%s, device=%s)", self.checkpoint, self.device)

    def generate(self, prompt: str, *, primitives: int = 8, seed: int = 0) -> Path:
        """Generate one motion clip and return the path to its SMPL-X ``.npz``.

        Args:
            prompt: Action text (BABEL-style), e.g. ``"wave"`` or ``"walk in circles"``.
            primitives: Rollout length in motion primitives (~8 ≈ 2.2 s @ 30 fps).
            seed: RNG seed for reproducibility.

        Returns:
            Path to ``sample_0_smplx.npz`` (SMPL-X axis-angle ``poses`` + ``trans``),
            the exact input format ``tools/dart_to_glb.py`` consumes.

        Raises:
            RuntimeError: If :meth:`load` has not been called.
            FileNotFoundError: If DART did not produce the expected npz.
        """
        if not self.loaded:
            raise RuntimeError("DartRunner.load() must be called before generate()")
        import random  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        import torch  # noqa: PLC0415
        from mld.rollout_mld import RolloutArgs, rollout  # noqa: PLC0415

        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)

        text_prompt = f"{prompt}*{primitives}"
        ckpt = Path(self.checkpoint)
        save_dir = ckpt.parent / ckpt.name.split(".")[0] / "rollout"
        save_dir.mkdir(parents=True, exist_ok=True)

        args = RolloutArgs()
        args.seed = seed
        args.dataset = self.dataset
        args.denoiser_checkpoint = self.checkpoint
        args.guidance_param = self.guidance
        args.batch_size = self.batch_size
        args.text_prompt = text_prompt
        args.export_smpl = 1
        args.use_predicted_joints = 1
        args.device = self.device
        args.save_dir = save_dir

        rollout(
            text_prompt,
            self._ctx["denoiser_args"], self._ctx["denoiser_model"],
            self._ctx["vae_args"], self._ctx["vae_model"],
            self._ctx["diffusion"], self._ctx["dataset"], args,
        )

        # rollout() names the dir from text_prompt + flags (see rollout_mld.rollout).
        fn = text_prompt[:40].replace(" ", "_").replace(".", "")
        out_dir = save_dir / f"use_pred_joints_{fn}_guidance{self.guidance}_seed{seed}"
        npz = out_dir / "sample_0_smplx.npz"
        if not npz.exists():
            raise FileNotFoundError(f"DART produced no npz at {npz}")
        return npz


def main() -> None:
    """Box-side smoke test. Run from the DART repo root in the ``dart`` conda env."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--prompt", default="wave", help="action text prompt")
    p.add_argument("--primitives", type=int, default=8, help="rollout primitives (~8≈2.2s)")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    args = p.parse_args()

    runner = DartRunner(args.checkpoint)
    runner.load()
    npz = runner.generate(args.prompt, primitives=args.primitives, seed=args.seed)
    print(f"[dart_runner] OK -> {npz}")


if __name__ == "__main__":
    main()
