"""
Quarterly musicalme update, run every week by launchd (ops/com.jorge.musicalme-trimestral.plist).

Each run looks at data/estado-trimestral.json and does only the next step:

  idle, last cycle 90+ days ago  → ask privacy.apple.com for a copy (apple_export request)
  requested                      → see if Apple has it ready; if so download it,
                                   import it, rebuild the dashboard (when the raw
                                   Spotify history is in data/), make the playlists,
                                   copy them into Apple Music and push the JSONs
                                   (Vercel deploys musicalme on every push)

Apple asking to sign in again, or any failure, reaches Jorge as a Mac
notification and an email. Nothing else needs him.

    python scripts/trimestral.py          # what launchd runs
    python scripts/trimestral.py --now    # start a cycle today, whatever the date
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apple_export  # noqa: E402
import apple_music_sync  # noqa: E402
import playlists  # noqa: E402
from automation import ROOT, avisar  # noqa: E402

STATE = ROOT / "data" / "estado-trimestral.json"
EVERY = timedelta(days=90)
PYTHON = sys.executable


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"status": "idle", "requested_at": None, "last_cycle": None}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=1))


def now() -> datetime:
    return datetime.now(timezone.utc)


def due(state: dict) -> bool:
    last = state.get("last_cycle")
    return last is None or now() - datetime.fromisoformat(last) >= EVERY


def run_script(name: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([PYTHON, str(ROOT / "scripts" / name), *args], cwd=ROOT,
                          capture_output=True, text=True)


def update_everything() -> str:
    """After a fresh export is in data/. Returns a summary for the email."""
    lines = []
    dashboard = run_script("process.py")
    if dashboard.returncode == 0:
        if (ROOT / "data" / "artists-enriched.json").exists():
            run_script("enrich_musicbrainz.py")  # géneros de artistas nuevos (incremental)
            run_script("process.py")
        lines.append("Panel de análisis actualizado.")
    else:
        lines.append("Panel sin actualizar: " + (dashboard.stdout + dashboard.stderr).strip()[-300:])

    playlists.main()
    data = json.loads(playlists.PLAYLISTS.read_text())
    lines.append(f"Datos hasta {data['data_through']}.")

    results = apple_music_sync.sync()
    for r in results:
        missing = f", {len(r['not_found'])} no están en Apple Music" if r["not_found"] else ""
        lines.append(f"{r['id']}: {r['status']}, {r['added']} canciones{missing}.")
    if any(r["status"] != "synced" for r in results):
        lines.append("Las playlists de Apple Music no se han podido actualizar del todo.")

    subprocess.run(["git", "add", "app/public/data"], cwd=ROOT, check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode:
        msg = f"Datos de Apple Music hasta {data['data_through']} y playlists del trimestre"
        subprocess.run(["git", "commit", "-q", "-m", msg], cwd=ROOT, check=True)
        push = subprocess.run(["git", "push", "-q", "origin", "main"], cwd=ROOT, capture_output=True, text=True)
        lines.append("Publicado en la web." if push.returncode == 0 else f"git push falló: {push.stderr[-200:]}")
    return "\n".join(lines)


def step(state: dict, force: bool = False) -> dict:
    if state["status"] == "idle":
        if not (force or due(state)):
            return state
        r = apple_export.request()
        print(f"request → {r['status']}: {r['detail']}")
        if r["status"] in ("requested", "already_pending"):
            state.update(status="requested", requested_at=now().isoformat(timespec="seconds"))
        elif r["status"] == "login_required":
            avisar("Apple pide iniciar sesión",
                   "Para pedir la copia trimestral de tus datos, inicia sesión en privacy.apple.com "
                   f"en el Chrome del mini. El próximo lunes lo vuelvo a intentar.\n\n{r['detail']}")
        else:
            avisar("No pude pedir tus datos a Apple", r["detail"])
        return state

    r = apple_export.check()
    print(f"check → {r['status']}: {r['detail']}")
    if r["status"] == "downloaded":
        since = datetime.fromisoformat(state["requested_at"]).timestamp()
        path = apple_export.import_latest(since)
        print(f"importado {path}")
        summary = update_everything()
        state.update(status="idle", requested_at=None, last_cycle=now().isoformat(timespec="seconds"))
        avisar("Música actualizada", summary)
    elif r["status"] == "none":
        state.update(status="idle", requested_at=None)  # the request vanished; ask again next run
    elif r["status"] == "login_required":
        avisar("Apple pide iniciar sesión",
               "Tu copia de datos puede estar lista, pero privacy.apple.com pide iniciar sesión en el "
               f"Chrome del mini.\n\n{r['detail']}")
    elif r["status"] == "pending":
        requested = datetime.fromisoformat(state["requested_at"])
        if now() - requested > timedelta(days=21):
            avisar("Apple tarda más de lo normal", f"Pedida el {requested:%d/%m}. {r['detail']}")
    else:
        avisar("No pude comprobar tus datos de Apple", r["detail"])
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--now", action="store_true", help="start a cycle today")
    args = parser.parse_args()
    print(f"— {datetime.now():%Y-%m-%d %H:%M}")
    state = load_state()
    try:
        state = step(state, force=args.now)
    except Exception as exc:
        traceback.print_exc()
        avisar("Falló la actualización trimestral", f"{type(exc).__name__}: {exc}")
        return 1
    finally:
        save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
