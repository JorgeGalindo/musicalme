"""
Shared pieces for the quarterly jobs that run on the Mac mini.

`claude -p` drives Jorge's Chrome through the Claude in Chrome extension (his
Claude subscription, no API key). Chrome on the mini has to be open, with the
extension connected and Apple ID signed in at music.apple.com and
privacy.apple.com. When Apple asks to sign in again, the prompt returns
`login_required` and `avisar()` tells Jorge on the Mac and by email.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE = str(Path.home() / ".local/bin/claude")
CHROME_TOOLS = "mcp__claude-in-chrome"
AVISAR_A = "jorgegalindoalfonso@gmail.com"


class ClaudeError(RuntimeError):
    pass


def claude(prompt: str, schema: dict, *, chrome: bool = False, tools: list[str] | None = None,
           model: str = "claude-sonnet-5-5", timeout: int = 3600) -> dict:
    """Run `claude -p` and return its structured output (validated by --json-schema)."""
    cmd = [CLAUDE, "-p", "--model", model, "--output-format", "json",
           "--json-schema", json.dumps(schema), "--no-session-persistence", "--tools", ""]
    allowed = list(tools or [])
    if chrome:
        cmd.append("--chrome")
        allowed.append(CHROME_TOOLS)
    if allowed:
        cmd += ["--allowedTools", *allowed]
    run = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=ROOT)
    if run.returncode:
        raise ClaudeError(f"claude -p falló ({run.returncode}): {(run.stderr or run.stdout)[-600:]}")
    reply = json.loads(run.stdout)
    out = reply.get("structured_output")
    if reply.get("is_error") or not isinstance(out, dict):
        raise ClaudeError(f"claude -p sin respuesta estructurada: {str(reply.get('result'))[:600]}")
    return out


def avisar(asunto: str, cuerpo: str) -> None:
    """Notification on the Mac and an email to Jorge (he follows from the phone)."""
    subprocess.run(["/usr/bin/osascript", "-e", "on run argv", "-e",
                    'display notification (item 2 of argv) with title (item 1 of argv)', "-e", "end run",
                    f"musicalme · {asunto}", cuerpo[:200]], capture_output=True)
    try:
        claude(
            f"Envía un correo con mcp__claude_ai_Gmail__send_message a {AVISAR_A}. "
            f"Asunto: «musicalme · {asunto}». Cuerpo, tal cual:\n\n{cuerpo}\n\n"
            'Responde {"sent": true} si se envió.',
            {"type": "object", "properties": {"sent": {"type": "boolean"}}, "required": ["sent"]},
            tools=["mcp__claude_ai_Gmail__send_message"], model="claude-haiku-5-5", timeout=600,
        )
    except (ClaudeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"  (correo no enviado: {exc})")
