import os
import subprocess
from pathlib import Path

LITELLM_CONFIG = Path(__file__).parent.parent / "proxy" / "litellm_config.yaml"
CODEX_CONFIG = Path(__file__).parent.parent / "proxy" / "codex_config.toml"
DOCKER_IMAGE = "benchmark-runner"

# Env vars passed to every container run — only what's needed for LiteLLM routing.
# AZURE_API_KEY is taken from the host env at runtime (not hardcoded).
CONTAINER_ENV = {
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_API_KEY": "litellm",
    "OPENAI_BASE_URL": "http://localhost:4000/v1",
    "OPENAI_API_KEY": "litellm",
}


def prepare_work_dir(work_dir: Path) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)


def check_generated(work_dir: Path) -> str | None:
    """Retorna 'ok' se package.json existe no workspace gerado, None caso contrário."""
    return "ok" if (work_dir / "package.json").exists() else None


def docker_run(
    work_dir: Path,
    tool_cmd: list[str],
    timeout: int,
    extra_volumes: list[tuple[Path, str]] | None = None,
) -> subprocess.CompletedProcess:
    """Executa tool_cmd dentro do container benchmark-runner com work_dir montado."""
    cmd = [
        "docker", "run", "--rm",
        "--volume", f"{work_dir}:/workspace:rw",
        "--volume", f"{LITELLM_CONFIG}:/litellm_config.yaml:ro",
        "--workdir", "/workspace",
        "--env", "AZURE_API_KEY",          # passa do host sem expor o valor aqui
    ]
    for host_path, container_path in (extra_volumes or []):
        cmd.extend(["--volume", f"{host_path}:{container_path}:ro"])
    for key, val in CONTAINER_ENV.items():
        cmd.extend(["--env", f"{key}={val}"])
    cmd.append(DOCKER_IMAGE)
    cmd.extend(tool_cmd)

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=os.environ,                    # AZURE_API_KEY precisa estar no env do host
    )
    # Unifica stdout+stderr: erros do docker e do tool vão para stdout em modo non-TTY
    combined = (result.stdout or "") + (result.stderr or "")
    result.stderr = combined
    # Persiste log completo do harness no workspace montado
    (work_dir / "harness.log").write_text(combined, encoding="utf-8")
    return result
