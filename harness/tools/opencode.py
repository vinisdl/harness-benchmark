import json
from pathlib import Path

from harness.tools.base import check_generated, docker_run, prepare_work_dir

TOOL_NAME = "opencode"
MODEL = "openai/gpt-6.1-sol"


def run(task_dir: Path, work_dir: Path, timeout: int = 3600) -> dict:
    prompt = (task_dir / "prompt.md").read_text(encoding="utf-8")
    prepare_work_dir(work_dir)

    # opencode.json configura o modelo; lido pelo OpenCode no diretório de trabalho
    (work_dir / "opencode.json").write_text(
        json.dumps({"model": MODEL}, indent=2), encoding="utf-8"
    )

    error: str | None = None
    exit_code = -1
    stderr = ""

    try:
        result = docker_run(
            work_dir,
            ["opencode", "run", "--model", MODEL, "--auto", prompt],
            timeout,
        )
        exit_code = result.returncode
        stderr = result.stderr or ""
    except TimeoutError:
        error = f"timeout after {timeout}s"
    except FileNotFoundError:
        error = "docker binary not found"

    generated = check_generated(work_dir)
    return {
        "tool": TOOL_NAME,
        "exit_code": exit_code,
        "stderr": stderr,
        "error": error,
        "generated_code": generated,
        "syntax_error": generated is None,
    }
