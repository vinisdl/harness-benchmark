import json
import os
import platform
import subprocess
import sys
from pathlib import Path

BENCHMARK_DIR = Path(__file__).parent.parent.parent  # benchmark/
_IS_WINDOWS = platform.system() == "Windows"


def _bin(name: str) -> list[str]:
    """Retorna o comando para invocar um binário do node_modules/.bin no OS atual.
    No Windows, chama o .cmd diretamente (não via node). Em Unix, chama via node."""
    if _IS_WINDOWS:
        cmd_path = BENCHMARK_DIR / "node_modules" / ".bin" / f"{name}.cmd"
        return [str(cmd_path)]
    return ["node", str(BENCHMARK_DIR / "node_modules" / ".bin" / name)]


_DEFAULT_METRICS = {
    "tests_passed": 0,
    "tests_total": 0,
    "coverage_pct": None,
    "cyclomatic_complexity": 0.0,
    "eslint_warnings": 0,
    "syntax_error": False,
}


def _ensure_node_modules(work_dir: Path) -> dict:
    """
    Garante que work_dir tenha acesso ao node_modules do benchmark.
    Tenta symlink primeiro; em caso de falha (comum no Windows sem modo desenvolvedor),
    usa NODE_PATH como fallback.
    Retorna variáveis de ambiente extras a passar nos subprocessos.
    """
    link = work_dir / "node_modules"
    if not link.exists():
        try:
            os.symlink(BENCHMARK_DIR / "node_modules", link, target_is_directory=True)
        except (OSError, NotImplementedError):
            # Sem privilégios de symlink no Windows: usa NODE_PATH como fallback
            pass

    extra_env: dict = {}
    if not link.exists():
        extra_env["NODE_PATH"] = str(BENCHMARK_DIR / "node_modules")

    # Vitest precisa do vitest.config.js e package.json para resolver plugins
    for fname in ("vitest.config.js", "package.json"):
        src = BENCHMARK_DIR / fname
        dst = work_dir / fname
        if src.exists() and not dst.exists():
            import shutil
            shutil.copy2(src, dst)

    return extra_env


def _run_subprocess(cmd: list[str], cwd: Path, timeout: int, extra_env: dict) -> subprocess.CompletedProcess:
    env = {**os.environ, **extra_env}
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


def collect(work_dir: Path, task_type: str) -> dict:
    """
    Executa Vitest e ESLint no código em work_dir e retorna métricas.
    """
    metrics = dict(_DEFAULT_METRICS)

    # Arquivo principal gerado pela ferramenta
    main_file = work_dir / ("solution.test.js" if task_type == "T2" else "solution.js")
    # Arquivo alvo para ESLint (lógica de negócio, não o test)
    eslint_target = work_dir / ("source.js" if task_type == "T2" else "solution.js")

    # 1. Verificação de sintaxe
    syntax_check = subprocess.run(
        ["node", "--check", str(main_file)],
        capture_output=True,
        text=True,
    )
    if syntax_check.returncode != 0:
        metrics["syntax_error"] = True
        return metrics

    extra_env = _ensure_node_modules(work_dir)

    # 2. Vitest com coverage
    # No Windows usa .cmd diretamente; no Unix usa node. vm-modules via NODE_OPTIONS.
    try:
        vitest_result = _run_subprocess(
            _bin("vitest") + [
                "run",
                "--reporter=json",
                "--coverage",
                "--coverage.reporter=json-summary",
            ],
            cwd=work_dir,
            timeout=60,
            extra_env={**extra_env, "NODE_OPTIONS": "--experimental-vm-modules"},
        )
        # Vitest emite JSON no stdout quando --reporter=json
        vitest_json = json.loads(vitest_result.stdout)
        metrics["tests_passed"] = vitest_json.get("numPassedTests", 0)
        metrics["tests_total"] = vitest_json.get("numTotalTests", 0)

        # Coverage só é relevante para T2
        if task_type == "T2":
            summary_path = work_dir / "coverage" / "coverage-summary.json"
            if summary_path.exists():
                summary = json.loads(summary_path.read_text(encoding="utf-8"))
                metrics["coverage_pct"] = summary.get("total", {}).get("lines", {}).get("pct")
    except subprocess.TimeoutExpired:
        print("collect: vitest timeout", file=sys.stderr)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"collect: vitest parse error: {exc}", file=sys.stderr)

    # 3. ESLint com regra de complexidade ciclomática
    try:
        eslint_result = _run_subprocess(
            _bin("eslint") + [
                "--format", "json",
                "--rule", '{"complexity": ["warn", 1]}',
                str(eslint_target),
            ],
            cwd=work_dir,
            timeout=30,
            extra_env=extra_env,
        )
        eslint_output = json.loads(eslint_result.stdout)
        messages = eslint_output[0]["messages"] if eslint_output else []

        metrics["eslint_warnings"] = sum(1 for m in messages if m.get("severity") == 1)

        complexity_values = [
            m["message"]
            for m in messages
            if m.get("ruleId") == "complexity"
        ]
        if complexity_values:
            # As mensagens têm formato "Function 'x' has a complexity of N."
            # Extrai o número N de cada mensagem
            import re
            numbers = []
            for msg in complexity_values:
                match = re.search(r"\d+", msg)
                if match:
                    numbers.append(int(match.group()))
            metrics["cyclomatic_complexity"] = sum(numbers) / len(numbers) if numbers else 1.0
        else:
            metrics["cyclomatic_complexity"] = 1.0
    except subprocess.TimeoutExpired:
        print("collect: eslint timeout", file=sys.stderr)
    except (json.JSONDecodeError, OSError, IndexError) as exc:
        print(f"collect: eslint parse error: {exc}", file=sys.stderr)

    return metrics
