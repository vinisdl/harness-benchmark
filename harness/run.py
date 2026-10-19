#!/usr/bin/env python3
"""
Ponto de entrada do benchmark de tarefa única.

Uso:
  python harness/run.py [--dry-run] [--tools claude_code,opencode,codex_cli] [--timeout 3600]

Flags:
  --dry-run       Nao invoca as ferramentas de IA; usa stub que retorna vazio
  --tools         Comma-separated lista de ferramentas (padrao: claude_code,opencode,codex_cli)
  --repetitions   Numero de repeticoes por ferramenta (padrao: 1)
  --timeout       Timeout em segundos por run (padrao: 3600)

Pré-requisito: docker info deve responder (Docker Desktop em execução).
Construa a imagem antes do primeiro run:
  docker build -t benchmark-runner benchmark/
"""

import argparse
import csv
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BENCHMARK_DIR = Path(__file__).parent.parent
if str(BENCHMARK_DIR) not in sys.path:
    sys.path.insert(0, str(BENCHMARK_DIR))

RESULTS_DIR = BENCHMARK_DIR / "results"
TASK_DIR = BENCHMARK_DIR / "task"

ALL_TOOLS = ["claude_code", "opencode", "codex_cli"]

SCORES_CSV_HEADER = [
    "tool", "run",
    "entregaveis", "integracao_llm", "testes", "arquitetura",
    "error_handling", "qualidade_codigo", "documentacao", "seguranca",
    "total", "notes",
]

RUNS_JSON: list[dict] = []


def _save_runs_json() -> None:
    runs_path = RESULTS_DIR / "runs.json"
    runs_path.write_text(json.dumps(RUNS_JSON, indent=2, ensure_ascii=False), encoding="utf-8")


def _run_command(cmd: list[str]) -> tuple[int, str]:
    binary = shutil.which(cmd[0])
    if binary is None:
        return -1, ""
    try:
        r = subprocess.run([binary] + cmd[1:], capture_output=True, text=True, timeout=10)
        return r.returncode, (r.stdout + r.stderr).strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return -1, ""


def check_environment(tools: list[str]) -> None:
    missing: list[str] = []

    if _run_command(["python", "--version"])[0] != 0 and \
       _run_command(["python3", "--version"])[0] != 0:
        missing.append("python")

    if _run_command(["node", "--version"])[0] != 0:
        missing.append("node")

    # Docker: necessário para execução isolada das ferramentas
    rc, _ = _run_command(["docker", "info"])
    if rc != 0:
        missing.append("docker (Docker Desktop não está em execução?)")

    # Imagem benchmark-runner
    rc2, _ = _run_command(["docker", "image", "inspect", "benchmark-runner"])
    if rc2 != 0:
        missing.append("imagem benchmark-runner (rode: docker build -t benchmark-runner benchmark/)")

    if missing:
        print(f"ERRO: requisitos não atendidos: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)


def collect_environment_info(tools: list[str]) -> dict:
    info: dict = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "python_version": sys.version,
        "node_version": _run_command(["node", "--version"])[1],
        "docker_version": _run_command(["docker", "--version"])[1],
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "environment.json").write_text(
        json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return info


def load_tool(tool_name: str):
    return importlib.import_module(f"harness.tools.{tool_name}")


def run_benchmark(
    selected_tools: list[str],
    repetitions: int,
    timeout: int,
    dry_run: bool,
) -> None:
    if not TASK_DIR.exists() or not (TASK_DIR / "prompt.md").exists():
        print(f"ERRO: {TASK_DIR / 'prompt.md'} não encontrado.", file=sys.stderr)
        sys.exit(1)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    scores_path = RESULTS_DIR / "scores.csv"
    if not scores_path.exists():
        with scores_path.open("w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=SCORES_CSV_HEADER).writeheader()

    run_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for tool_name in selected_tools:
        if not dry_run:
            tool_module = load_tool(tool_name)

        for rep in range(1, repetitions + 1):
            work_dir = RESULTS_DIR / "generated_code" / run_date / tool_name / f"run_{rep}"
            work_dir.mkdir(parents=True, exist_ok=True)

            print(f"  [{tool_name}] run {rep}...", end=" ", flush=True)
            started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.monotonic()

            run_meta: dict = {
                "tool": tool_name,
                "run": rep,
                "started_at": started_at,
                "finished_at": None,
                "duration_seconds": None,
                "exit_code": None,
                "boot_failed": False,
                "timeout": False,
                "stderr_tail": "",
                "notes": "",
            }

            if dry_run:
                run_meta.update({
                    "exit_code": 0,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "duration_seconds": 0.0,
                })
                print("dry-run")
            else:
                adapter_result = tool_module.run(TASK_DIR, work_dir, timeout)
                duration = time.monotonic() - t0
                run_meta.update({
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "duration_seconds": round(duration, 1),
                    "exit_code": adapter_result.get("exit_code"),
                    "timeout": "timeout" in (adapter_result.get("error") or ""),
                    "stderr_tail": (adapter_result.get("stderr") or "")[-500:],
                })
                status = "OK" if adapter_result.get("exit_code") == 0 else f"exit={adapter_result.get('exit_code')}"
                print(f"{round(duration)}s | {status}")

            RUNS_JSON.append(run_meta)
            _save_runs_json()

    print(f"\nWorkspaces em: {RESULTS_DIR / 'generated_code' / run_date}")
    print(f"Metadados em:  {RESULTS_DIR / 'runs.json'}")
    print(f"Preencha:      {RESULTS_DIR / 'scores.csv'} com a rubrica do PROTOCOL.md")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark de ferramentas de IA — tarefa única (via Docker)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Não invoca ferramentas; gera estrutura de arquivos stub")
    parser.add_argument("--tools", type=str, default=",".join(ALL_TOOLS),
                        help="Comma-separated lista de ferramentas")
    parser.add_argument("--repetitions", type=int, default=1,
                        help="Número de repetições por ferramenta (padrão: 1)")
    parser.add_argument("--timeout", type=int, default=3600,
                        help="Timeout em segundos por run (padrão: 3600)")
    args = parser.parse_args()

    _TOOL_ALIASES = {"codex": "codex_cli", "opencode": "opencode", "claude": "claude_code"}
    selected_tools = [_TOOL_ALIASES.get(t.strip(), t.strip()) for t in args.tools.split(",") if t.strip()]

    if not args.dry_run:
        check_environment(selected_tools)

    env_info = collect_environment_info(selected_tools)
    print(f"Ambiente: {env_info['platform']} | node {env_info['node_version']}")
    print(f"Docker: {env_info['docker_version']}")
    print(f"Ferramentas: {selected_tools}")
    print(f"Repetições: {args.repetitions} | Timeout: {args.timeout}s")

    run_benchmark(selected_tools, args.repetitions, args.timeout, args.dry_run)


if __name__ == "__main__":
    main()
