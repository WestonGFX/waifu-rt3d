"""Waifu-RT3D AI Motion subsystem.

This package provides:
  beacon.py         — UDP auto-discovery (LAN broadcast, no libraries needed)
  remote_client.py  — Async proxy to a remote motion inference server
  motion_server.py  — Standalone server that runs on the GPU machine

Design goal: zero configuration.  The GPU machine broadcasts its presence;
the main app hears it and connects automatically.  No IP addresses to type.
"""
