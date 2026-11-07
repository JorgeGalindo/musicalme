"""
Apple Music history from Apple's privacy export, without Jorge lifting a finger.

    python scripts/apple_export.py request   # ask privacy.apple.com for a copy
    python scripts/apple_export.py check     # download it if Apple has it ready
    python scripts/apple_export.py import    # unpack the newest download into data/

`request` and `check` drive Chrome with `claude -p --chrome` (see automation.py).
Apple takes up to a week to prepare the copy; trimestral.py calls `check` every
week until it's there. The download is unpacked into data/apple-exports/<date>/
(nested zips included) and the daily-tracks CSV is copied where process.py and
playlists.py read it. Nothing inside the archive is ever executed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from automation import ROOT, claude  # noqa: E402

DOWNLOADS = Path.home() / "Downloads"
EXPORTS = ROOT / "data" / "apple-exports"
DAILY_TRACKS_NAME = "Apple Music - Play History Daily Tracks.csv"
TARGET = ROOT / "data" / DAILY_TRACKS_NAME
ZIP_HINTS = ("apple media services", "apple_media_services", "apple-media-services")

STATUS_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["requested", "already_pending", "downloaded", "pending",
                                               "none", "login_required", "error"]},
        "files": {"type": "array", "items": {"type": "string"}},
        "detail": {"type": "string"},
    },
    "required": ["status", "detail"],
    "additionalProperties": False,
}

COMMON = """Trabajas en el Chrome de Jorge con las herramientas de Claude in Chrome. Abre una pestaña nueva y no toques las demás.
Si Apple pide iniciar sesión, una contraseña, un código de verificación o cualquier comprobación de identidad, no lo intentes: cierra tu pestaña y responde status «login_required» explicando qué pide.
No cambies ningún ajuste de la cuenta, no borres datos y no aceptes nada distinto de lo que se describe aquí. Al terminar, cierra tu pestaña."""

REQUEST_PROMPT = COMMON + """

Tarea: en https://privacy.apple.com pide una copia de los datos de Jorge con solo esta categoría: «Información de Apple Media Services» (en inglés «Apple Media Services information»). Desmarca todo lo demás. Si te deja elegir tamaño máximo de archivo, elige el mayor. Completa la solicitud.
- Si ya hay una solicitud de copia en curso, no pidas otra: responde «already_pending».
- Si la pediste, responde «requested».
- En «detail» pon en una frase lo que viste en la página (por ejemplo el plazo que indica Apple)."""

CHECK_PROMPT = COMMON + """

Tarea: en https://privacy.apple.com mira si la copia de datos que pidió Jorge está lista para descargar.
- Si está lista, descarga todos sus archivos con la descarga normal de Chrome (van a la carpeta Descargas), espera a que la página confirme que empezaron y responde «downloaded» con los nombres de archivo en «files».
- Si se sigue preparando, responde «pending».
- Si no hay ninguna solicitud ni copia disponible, responde «none».
- En «detail» pon en una frase lo que dice la página."""


def request() -> dict:
    return claude(REQUEST_PROMPT, STATUS_SCHEMA, chrome=True, timeout=1800)


def wait_for_downloads(timeout: int = 3600) -> None:
    """Chrome keeps .crdownload files until each download finishes."""
    deadline = time.time() + timeout
    while any(DOWNLOADS.glob("*.crdownload")):
        if time.time() > deadline:
            raise TimeoutError("La descarga de Apple sigue a medias tras una hora")
        time.sleep(20)


def check() -> dict:
    result = claude(CHECK_PROMPT, STATUS_SCHEMA, chrome=True, timeout=3600)
    if result["status"] == "downloaded":
        wait_for_downloads()
    return result


def _safe_extract(archive: zipfile.ZipFile, dest: Path) -> None:
    root = dest.resolve()
    for member in archive.infolist():
        target = (dest / member.filename).resolve()
        if root != target and root not in target.parents:
            raise ValueError(f"Ruta sospechosa dentro del zip: {member.filename}")
    archive.extractall(dest)


def unpack(zip_path: Path, dest: Path) -> None:
    """Extract a zip and every zip inside it, in place."""
    with zipfile.ZipFile(zip_path) as archive:
        _safe_extract(archive, dest)
    for inner in sorted(dest.rglob("*.zip")):
        inner_dest = inner.with_suffix("")
        inner_dest.mkdir(exist_ok=True)
        with zipfile.ZipFile(inner) as archive:
            _safe_extract(archive, inner_dest)
        inner.unlink()


def find_downloads(since: float = 0) -> list[Path]:
    return sorted((p for p in DOWNLOADS.glob("*.zip")
                   if any(h in p.name.lower() for h in ZIP_HINTS) and p.stat().st_mtime >= since),
                  key=lambda p: p.stat().st_mtime)


def import_latest(since: float = 0) -> Path:
    zips = find_downloads(since)
    if not zips:
        raise FileNotFoundError(f"No hay ningún zip de Apple Media Services en {DOWNLOADS}")
    dest = EXPORTS / datetime.now().strftime("%Y-%m-%d")
    dest.mkdir(parents=True, exist_ok=True)
    for z in zips:  # Apple may split a large copy into several parts
        unpack(z, dest / z.stem)
    found = sorted(dest.rglob(DAILY_TRACKS_NAME), key=lambda p: p.stat().st_size, reverse=True)
    if not found:
        raise FileNotFoundError(f"El export no trae «{DAILY_TRACKS_NAME}» (mira {dest})")
    shutil.copy2(found[0], TARGET)
    for z in zips:  # keep the unpacked copy in data/, not the zip in Descargas
        z.unlink()
    return found[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("step", choices=["request", "check", "import"])
    args = parser.parse_args()
    if args.step == "import":
        print(f"Importado: {import_latest()}")
        return 0
    result = request() if args.step == "request" else check()
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0 if result["status"] not in ("login_required", "error") else 1


if __name__ == "__main__":
    sys.exit(main())
