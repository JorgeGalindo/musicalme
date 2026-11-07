"""
Copy the lists in playlists.json into Jorge's Apple Music library.

Drives music.apple.com in Chrome with `claude -p --chrome` (see automation.py).
Each list becomes a library playlist with the same name («musicalme · …»); on
later runs its songs are replaced, so the playlist link stays the same. Library
playlists sync to the iPhone through iCloud. The playlist URL and the songs
Apple Music doesn't have are written back into playlists.json.

    python scripts/apple_music_sync.py            # every playlist
    python scripts/apple_music_sync.py nuevas     # just one
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from automation import claude  # noqa: E402
from playlists import PLAYLISTS  # noqa: E402

SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["synced", "login_required", "error"]},
        "playlist_url": {"type": "string"},
        "added": {"type": "integer"},
        "not_found": {"type": "array", "items": {"type": "string"}},
        "detail": {"type": "string"},
    },
    "required": ["status", "added", "not_found", "detail"],
    "additionalProperties": False,
}


def prompt_for(playlist: dict) -> str:
    tracks = "\n".join(f"{i}. {t['artist']} — {t['song']}" for i, t in enumerate(playlist["tracks"], 1))
    return f"""Trabajas en el Chrome de Jorge con las herramientas de Claude in Chrome, en https://music.apple.com/es/ con su cuenta. Abre una pestaña nueva y no toques las demás.
Si la web pide iniciar sesión, una contraseña o un código, no lo intentes: responde status «login_required».
No borres ni modifiques ninguna otra playlist ni nada de la biblioteca salvo lo que se describe aquí.

Tarea: deja en la biblioteca de Jorge una playlist llamada exactamente «{playlist['name']}» con estas {len(playlist['tracks'])} canciones y en este orden.
- Si ya existe, quítale todas sus canciones y rellénala de nuevo (no la borres: su enlace debe seguir siendo el mismo).
- Si no existe, créala con la descripción: «{playlist['description']}».
- Para cada canción, búscala en Apple Music y añade la que coincida en artista y título (sin importar mayúsculas ni tildes). Prefiere la versión de estudio original; no uses directos, remixes ni versiones karaoke salvo que el título los pida. Si no encuentras una coincidencia clara, no añadas nada y apúntala en «not_found» tal cual aparece abajo.

Canciones:
{tracks}

Al terminar, abre la playlist, copia su URL en «playlist_url», cuenta en «added» las canciones que tiene y cierra tu pestaña. En «detail», una frase con lo que haya que saber."""


def sync(only: str | None = None) -> list[dict]:
    data = json.loads(PLAYLISTS.read_text())
    results = []
    for playlist in data["playlists"]:
        if only and playlist["id"] != only:
            continue
        result = claude(prompt_for(playlist), SCHEMA, chrome=True, timeout=3 * 3600)
        result["id"] = playlist["id"]
        results.append(result)
        print(f"{playlist['name']}: {result['status']}, {result['added']} canciones, "
              f"{len(result['not_found'])} no encontradas. {result['detail']}")
        if result["status"] != "synced":
            break
        playlist["apple_url"] = result.get("playlist_url") or playlist.get("apple_url")
        playlist["synced_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        playlist["not_found"] = result["not_found"]
        PLAYLISTS.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    return results


if __name__ == "__main__":
    out = sync(sys.argv[1] if len(sys.argv) > 1 else None)
    sys.exit(0 if out and all(r["status"] == "synced" for r in out) else 1)
