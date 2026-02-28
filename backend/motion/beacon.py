"""UDP auto-discovery for the waifu-motion server.

How it works
------------
The GPU machine (Windows PC) runs :func:`start_beacon_sender` in a background
thread.  It broadcasts a small JSON packet every 5 seconds to the local network's
broadcast address (255.255.255.255) on UDP port 8082.

The main app (Mac) calls :func:`discover_motion_servers` — it opens the same
UDP port, listens for up to ``timeout`` seconds, and returns every distinct
waifu-motion server it heard from.

No external dependencies — uses only Python's built-in ``socket`` module.
No configuration required on either machine.

Firewall notes
--------------
On Windows the motion server's installer (setup_windows.bat) automatically adds
firewall rules for UDP 8082 and TCP 8081.  On Mac, UDP receive on 8082 is
typically allowed by default for LAN broadcasts.
"""

import json
import logging
import socket
import threading
import time

logger = logging.getLogger(__name__)

BEACON_PORT     = 8082          # UDP port for discovery broadcasts
BEACON_INTERVAL = 5.0           # seconds between each broadcast
DISCOVER_TIMEOUT = 8.0          # how long discover() blocks before giving up
SERVICE_TAG      = "waifu-motion"


# ─────────────────────────────────────────────────────────────────────────────
# Sender  (runs on the GPU / Windows machine inside motion_server.py)
# ─────────────────────────────────────────────────────────────────────────────

def start_beacon_sender(motion_port: int = 8081) -> None:
    """Broadcast this machine's motion-server address every BEACON_INTERVAL seconds.

    Runs in a daemon thread — call once at startup in motion_server.py.
    The beacon is a tiny JSON payload so the receiver can parse it easily.

    Args:
        motion_port: TCP port the motion server is listening on (default 8081).
    """
    payload = json.dumps({
        "service": SERVICE_TAG,
        "port":    motion_port,
        "version": "1.0",
    }).encode()

    def _loop() -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        while True:
            try:
                sock.sendto(payload, ("<broadcast>", BEACON_PORT))
            except Exception as exc:   # noqa: BLE001
                logger.debug("Beacon send error: %s", exc)
            time.sleep(BEACON_INTERVAL)

    thread = threading.Thread(target=_loop, daemon=True, name="motion-beacon-sender")
    thread.start()
    logger.info("Motion beacon broadcasting on UDP %d every %.0fs", BEACON_PORT, BEACON_INTERVAL)


# ─────────────────────────────────────────────────────────────────────────────
# Receiver  (runs on the main app / Mac inside server.py)
# ─────────────────────────────────────────────────────────────────────────────

def discover_motion_servers(timeout: float = DISCOVER_TIMEOUT) -> list[dict]:
    """Listen for beacon packets from motion servers on the local network.

    Blocks for up to ``timeout`` seconds collecting responses, then returns.
    Multiple servers (e.g. two GPU machines) are all returned.

    Args:
        timeout: Maximum seconds to wait.  Lower values = faster but may miss
                 servers whose 5-second beacon didn't fire yet.

    Returns:
        List of dicts: ``[{"ip": str, "port": int, "version": str, "url": str}]``
        Empty list if nothing was found or the socket couldn't bind.

    Example:
        >>> servers = discover_motion_servers(timeout=5)
        >>> if servers:
        ...     print(f"Found: {servers[0]['url']}")
    """
    found: dict[str, dict] = {}

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.settimeout(min(timeout, 2.0))   # short per-recv timeout so we loop
    try:
        sock.bind(("", BEACON_PORT))
    except OSError as exc:
        logger.warning("Discovery: could not bind UDP %d: %s", BEACON_PORT, exc)
        return []

    deadline = time.monotonic() + timeout
    logger.info("Scanning local network for waifu-motion servers (%.0fs)…", timeout)

    try:
        while time.monotonic() < deadline:
            try:
                data, addr = sock.recvfrom(512)
                info = json.loads(data.decode())
                if info.get("service") != SERVICE_TAG:
                    continue
                ip   = addr[0]
                port = int(info.get("port", 8081))
                key  = f"{ip}:{port}"
                if key not in found:
                    entry = {
                        "ip":      ip,
                        "port":    port,
                        "version": info.get("version", "?"),
                        "url":     f"http://{ip}:{port}",
                    }
                    found[key] = entry
                    logger.info("  Found motion server: %s", entry["url"])
            except socket.timeout:
                pass   # normal — keep looping until deadline
            except (json.JSONDecodeError, ValueError):
                pass   # malformed packet, ignore
    finally:
        sock.close()

    return list(found.values())
