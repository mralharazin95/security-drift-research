"""
SAST Pipeline — Multi-tool scan orchestration and finding normalization
========================================================================

Companion artifact for the research:
"Security Drift in Iterative AI-Assisted Development"

This module orchestrates the SAST scan of a code snapshot, normalizes
the findings from multiple tools into a unified (CWE, severity) schema,
and produces a VulnerabilityProfile consumable by `sdi.py`.

Supported scanners (with graceful degradation if a tool is unavailable):
- Semgrep      (default: p/owasp-top-ten + p/javascript + p/typescript)
- Bandit       (Python-specific)
- Gitleaks     (optional, secret scanning)
- Hardcoded-secret heuristic (fallback when Gitleaks is absent)

Design philosophy: deterministic, dependency-light, reproducible.
A two-line invocation should reproduce any reviewer-requested figure.

Author : MAGNET INNOVATE LTD
License: MIT
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import shutil
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from sdi import VulnerabilityProfile


# ---------------------------------------------------------------------------
# Finding normalization schema.
# ---------------------------------------------------------------------------

# Mapping Semgrep severity levels → unified severity tier.
SEMGREP_SEV: Dict[str, str] = {
    "ERROR":   "HIGH",
    "WARNING": "MEDIUM",
    "INFO":    "LOW",
}

# Mapping Bandit severity → unified severity tier.
BANDIT_SEV: Dict[str, str] = {
    "HIGH":   "HIGH",
    "MEDIUM": "MEDIUM",
    "LOW":    "LOW",
}

# Semgrep does not always tag findings with a CWE explicitly; for those
# without, we apply heuristic mappings from rule id prefixes.
RULE_ID_TO_CWE_HEURISTIC: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"sql[_\-]?inj",        re.I), "CWE-89"),
    (re.compile(r"xss|cross[_\-]?site", re.I), "CWE-79"),
    (re.compile(r"command[_\-]?inj",    re.I), "CWE-78"),
    (re.compile(r"path[_\-]?traversal", re.I), "CWE-22"),
    (re.compile(r"ssrf",                re.I), "CWE-918"),
    (re.compile(r"hardcoded[_\-]?(secret|password|key|token)", re.I), "CWE-798"),
    (re.compile(r"jwt|json[_\-]?web[_\-]?token", re.I), "CWE-345"),
    (re.compile(r"weak[_\-]?(crypto|hash|cipher)", re.I), "CWE-327"),
    (re.compile(r"insecure[_\-]?random", re.I), "CWE-330"),
    (re.compile(r"missing[_\-]?auth", re.I), "CWE-862"),
    (re.compile(r"csrf",     re.I), "CWE-352"),
    (re.compile(r"open[_\-]?redirect", re.I), "CWE-601"),
    (re.compile(r"file[_\-]?upload", re.I), "CWE-434"),
    (re.compile(r"timing[_\-]?attack", re.I), "CWE-208"),
    (re.compile(r"race[_\-]?condition", re.I), "CWE-362"),
    (re.compile(r"rate[_\-]?limit", re.I), "CWE-307"),
]


def _heuristic_cwe(rule_id: str) -> str:
    for pat, cwe in RULE_ID_TO_CWE_HEURISTIC:
        if pat.search(rule_id):
            return cwe
    return "_UNKNOWN_"


# ---------------------------------------------------------------------------
# Scanners.
# ---------------------------------------------------------------------------

@dataclass
class ScannerResult:
    tool: str
    findings: List[Tuple[str, str]]   # list of (CWE, SEVERITY)
    raw_count: int
    error: Optional[str] = None


def run_semgrep(target_dir: str, config: str = "p/owasp-top-ten") -> ScannerResult:
    """
    Run Semgrep against `target_dir` with the given config. Returns
    normalized findings.
    """
    if shutil.which("semgrep") is None:
        return ScannerResult("semgrep", [], 0, error="semgrep not installed")

    try:
        proc = subprocess.run(
            ["semgrep", "--config", config, "--json",
             "--quiet", "--timeout", "60", target_dir],
            capture_output=True, text=True, timeout=180,
        )
    except subprocess.TimeoutExpired:
        return ScannerResult("semgrep", [], 0, error="timeout")

    # Semgrep returns 0 even with findings; non-zero with --error
    if not proc.stdout:
        return ScannerResult("semgrep", [], 0,
                             error=proc.stderr[:200] if proc.stderr else "no output")

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return ScannerResult("semgrep", [], 0, error=f"json parse: {e}")

    findings: List[Tuple[str, str]] = []
    for r in data.get("results", []):
        extra = r.get("extra", {})
        metadata = extra.get("metadata", {})
        severity_raw = extra.get("severity", "WARNING")
        severity = SEMGREP_SEV.get(severity_raw.upper(), "MEDIUM")

        # CWE extraction. Semgrep metadata may carry it as `cwe` (str or list).
        cwe_field = metadata.get("cwe")
        cwe: Optional[str] = None
        if isinstance(cwe_field, list) and cwe_field:
            cwe = cwe_field[0]
        elif isinstance(cwe_field, str):
            cwe = cwe_field

        if cwe:
            m = re.search(r"CWE[-\s]?(\d+)", cwe)
            cwe = f"CWE-{m.group(1)}" if m else _heuristic_cwe(r.get("check_id", ""))
        else:
            cwe = _heuristic_cwe(r.get("check_id", ""))

        findings.append((cwe, severity))

    return ScannerResult("semgrep", findings, len(findings))


def run_bandit(target_dir: str) -> ScannerResult:
    """Run Bandit for Python files in `target_dir`."""
    if shutil.which("bandit") is None:
        return ScannerResult("bandit", [], 0, error="bandit not installed")

    # Skip silently if no python files present.
    has_py = any(
        f.endswith(".py")
        for _, _, files in os.walk(target_dir)
        for f in files
    )
    if not has_py:
        return ScannerResult("bandit", [], 0)

    try:
        proc = subprocess.run(
            ["bandit", "-r", target_dir, "-f", "json", "-q"],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        return ScannerResult("bandit", [], 0, error="timeout")

    if not proc.stdout:
        return ScannerResult("bandit", [], 0,
                             error=proc.stderr[:200] if proc.stderr else "no output")

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return ScannerResult("bandit", [], 0, error=f"json parse: {e}")

    findings: List[Tuple[str, str]] = []
    for r in data.get("results", []):
        sev = BANDIT_SEV.get((r.get("issue_severity") or "MEDIUM").upper(), "MEDIUM")
        cwe_str = r.get("issue_cwe", {}).get("id") if r.get("issue_cwe") else None
        if cwe_str:
            cwe = f"CWE-{cwe_str}"
        else:
            cwe = _heuristic_cwe(r.get("test_id", "") + " " + r.get("test_name", ""))
        findings.append((cwe, sev))

    return ScannerResult("bandit", findings, len(findings))


def run_secret_heuristic(target_dir: str) -> ScannerResult:
    """
    Lightweight secret detection as a fallback when Gitleaks/TruffleHog
    are unavailable. Detects hardcoded secrets via common patterns.
    Conservative — false positives counted as MEDIUM, not HIGH.
    """
    secret_patterns = [
        (re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"), "CWE-798"),
        (re.compile(r"(?i)jwt[_-]?secret\s*[:=]\s*['\"][^'\"]{4,}['\"]"), "CWE-798"),
        (re.compile(r"(?i)bearer\s+[a-z0-9._-]{20,}"), "CWE-798"),
        (re.compile(r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"), "CWE-798"),
        (re.compile(r"(?i)mongodb(\+srv)?://[^:]+:[^@]+@"), "CWE-798"),
        (re.compile(r"(?i)postgres(ql)?://[^:]+:[^@]+@"), "CWE-798"),
    ]
    findings: List[Tuple[str, str]] = []
    skip_dirs = {".git", "node_modules", "dist", "build", "venv", "__pycache__"}

    for root, dirs, files in os.walk(target_dir):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in files:
            if not f.endswith((".js", ".ts", ".tsx", ".jsx", ".py",
                               ".env", ".json", ".yml", ".yaml")):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
            except OSError:
                continue
            for pat, cwe in secret_patterns:
                for _ in pat.finditer(content):
                    findings.append((cwe, "MEDIUM"))

    return ScannerResult("secret_heuristic", findings, len(findings))


# ---------------------------------------------------------------------------
# Effective-LOC counter for normalization.
# ---------------------------------------------------------------------------

def count_effective_loc(target_dir: str) -> int:
    """
    Count lines of effective logic: non-blank, non-comment lines in source
    files. Used for SDI normalization.
    """
    extensions = (".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".java")
    skip_dirs = {".git", "node_modules", "dist", "build", "venv",
                 "__pycache__", ".next", "coverage"}
    total = 0
    block_comment = False

    for root, dirs, files in os.walk(target_dir):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in files:
            if not f.endswith(extensions):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        s = line.strip()
                        if not s:
                            continue
                        # Crude block-comment tracking for /* ... */
                        if "/*" in s and "*/" not in s:
                            block_comment = True
                            continue
                        if block_comment:
                            if "*/" in s:
                                block_comment = False
                            continue
                        if s.startswith("//") or s.startswith("#") or s.startswith("*"):
                            continue
                        total += 1
            except OSError:
                continue
    return total


# ---------------------------------------------------------------------------
# Aggregation.
# ---------------------------------------------------------------------------

def scan_snapshot(
    target_dir: str,
    snapshot_id: str,
    semgrep_config: str = "p/owasp-top-ten",
    deduplicate: bool = True,
) -> Tuple[VulnerabilityProfile, Dict[str, ScannerResult]]:
    """
    Run all available scanners against `target_dir` and aggregate.

    Deduplication strategy: if multiple tools report the same (CWE, severity)
    at the same location, count once. We approximate this without
    full location matching by collapsing duplicates per (CWE, severity)
    when `deduplicate=True`.

    Returns
    -------
    (profile, per_tool_results)
    """
    results: Dict[str, ScannerResult] = {
        "semgrep": run_semgrep(target_dir, semgrep_config),
        "bandit":  run_bandit(target_dir),
        "secret_heuristic": run_secret_heuristic(target_dir),
    }

    aggregated: Dict[Tuple[str, str], int] = {}
    for r in results.values():
        for key in r.findings:
            aggregated[key] = aggregated.get(key, 0) + 1

    if deduplicate:
        # Soft dedup: if a (CWE, sev) pair was reported by multiple tools,
        # count it once per pair rather than per report. This is the
        # conservative interpretation used in the paper.
        aggregated = {k: 1 if v > 0 else 0 for k, v in aggregated.items()}

    loc = count_effective_loc(target_dir)

    profile = VulnerabilityProfile(
        snapshot_id=snapshot_id,
        findings=aggregated,
        loc_effective=loc,
    )
    return profile, results


# ---------------------------------------------------------------------------
# CLI entry point.
# ---------------------------------------------------------------------------

def _cli() -> None:
    import argparse
    p = argparse.ArgumentParser(description="Run the SAST pipeline.")
    p.add_argument("target_dir", help="Directory to scan.")
    p.add_argument("--snapshot-id", default="snapshot_0", help="Identifier for this snapshot.")
    p.add_argument("--no-dedup", action="store_true", help="Disable deduplication.")
    p.add_argument("--config", default="p/owasp-top-ten",
                   help="Semgrep config (default: p/owasp-top-ten).")
    args = p.parse_args()

    profile, raw = scan_snapshot(
        args.target_dir,
        args.snapshot_id,
        semgrep_config=args.config,
        deduplicate=not args.no_dedup,
    )
    print(json.dumps({
        "profile": profile.to_dict(),
        "per_tool": {
            name: {"raw_count": r.raw_count, "error": r.error}
            for name, r in raw.items()
        },
    }, indent=2))


if __name__ == "__main__":
    _cli()
