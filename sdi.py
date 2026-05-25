"""
Security Drift Index (SDI) — Reference Implementation
======================================================

Companion artifact for the research:
"Security Drift in Iterative AI-Assisted Development:
 An Empirical Framework for Measuring and Mitigating
 Vulnerability Accumulation in Vibe-Coded FinTech Applications"

This module is the canonical reference implementation of the SDI as
defined in Section 3 of the manuscript. It is intentionally compact
and dependency-light so that reviewers and follow-on researchers can
reproduce results without environment friction.

Public API
----------
    VulnerabilityProfile  : Container for per-CWE counts at one snapshot.
    SDIWeights            : Configurable per-CWE weighting (FinTech default supplied).
    compute_sdi           : Compute SDI between two snapshots.
    compute_drift_vector  : Compute the full per-CWE drift vector.
    normalize_profile     : Normalize counts by codebase size.

Author : MAGNET INNOVATE LTD
License: MIT
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Mapping, Optional, Tuple
import json
import math


# ---------------------------------------------------------------------------
# Default FinTech-calibrated weights.
#
# Weights are deliberately transparent hyperparameters; the SDI is a
# *family* of indices parameterized by `w`. The defaults below reflect
# the operational priorities of FinTech security teams: cryptographic
# and authentication failures are weighted highest, followed by
# authorization, injection, and information exposure.
#
# Researchers extending to other domains should publish their weight
# vector alongside results.
# ---------------------------------------------------------------------------

FINTECH_DEFAULT_WEIGHTS: Dict[str, float] = {
    # Cryptography
    "CWE-327": 3.0,   # Use of broken/risky crypto
    "CWE-329": 3.0,   # Nonce/IV reuse
    "CWE-798": 4.0,   # Hardcoded credentials
    "CWE-310": 2.5,   # General crypto issues
    "CWE-312": 2.5,   # Cleartext storage of sensitive info

    # Authentication & session
    "CWE-287": 3.5,   # Improper authentication
    "CWE-307": 2.5,   # Improper restriction of auth attempts
    "CWE-384": 2.5,   # Session fixation
    "CWE-613": 2.0,   # Insufficient session expiration
    "CWE-294": 3.0,   # Replay
    "CWE-345": 3.0,   # Insufficient verification of authenticity
    "CWE-347": 3.0,   # Improper signature verification

    # Authorization
    "CWE-285": 3.0,   # Improper authorization
    "CWE-862": 3.5,   # Missing authorization
    "CWE-863": 3.5,   # Incorrect authorization
    "CWE-269": 3.5,   # Improper privilege management
    "CWE-639": 3.0,   # Authorization bypass through user-controlled key

    # Injection / input
    "CWE-89":  3.0,   # SQL Injection
    "CWE-79":  2.5,   # XSS
    "CWE-78":  3.5,   # OS command injection
    "CWE-20":  1.5,   # Improper input validation
    "CWE-22":  2.5,   # Path traversal
    "CWE-434": 3.0,   # Unrestricted file upload
    "CWE-918": 3.0,   # SSRF

    # Business logic & race conditions
    "CWE-840": 2.5,   # Business logic errors
    "CWE-841": 2.5,   # Improper enforcement of behavioral workflow
    "CWE-362": 2.5,   # Race condition

    # Information exposure
    "CWE-200": 1.5,   # Information exposure
    "CWE-209": 1.5,   # Through error message
    "CWE-532": 1.5,   # Through log files
    "CWE-208": 2.0,   # Through timing discrepancy
    "CWE-203": 1.5,   # Observable discrepancy

    # Resource / DoS
    "CWE-400": 1.5,   # Uncontrolled resource consumption
    "CWE-770": 1.5,   # Allocation without limits
    "CWE-693": 1.5,   # Protection mechanism failure
    "CWE-732": 2.0,   # Incorrect permission assignment

    # Logging
    "CWE-117": 1.5,   # Log injection
    "CWE-778": 1.0,   # Insufficient logging

    # Catch-all for unmapped findings
    "_UNKNOWN_": 1.0,
}


# ---------------------------------------------------------------------------
# Severity multipliers.
#
# When a SAST tool reports a severity for a finding, we apply a
# multiplicative factor on top of the CWE weight. A finding without
# a severity falls back to MEDIUM.
# ---------------------------------------------------------------------------

SEVERITY_MULTIPLIERS: Dict[str, float] = {
    "CRITICAL": 2.0,
    "HIGH":     1.5,
    "MEDIUM":   1.0,
    "LOW":      0.5,
    "INFO":     0.2,
}


# ---------------------------------------------------------------------------
# Data classes.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class VulnerabilityProfile:
    """
    A vulnerability profile is the weighted-finding state of a single
    code snapshot. It is the input unit for drift computation.

    Attributes
    ----------
    snapshot_id : str
        Identifier of the code snapshot (e.g., scenario_model_round_hash).
    findings : Mapping[(cwe, severity), int]
        Count of findings keyed by (CWE id, severity tier).
    loc_effective : int
        Lines of effective logic (excludes comments, blank lines, boilerplate).
        Used for normalization.
    """
    snapshot_id: str
    findings: Mapping[Tuple[str, str], int]
    loc_effective: int = 0

    def total_findings(self) -> int:
        return sum(self.findings.values())

    def to_dict(self) -> dict:
        return {
            "snapshot_id": self.snapshot_id,
            "loc_effective": self.loc_effective,
            "findings": {
                f"{cwe}|{sev}": n
                for (cwe, sev), n in self.findings.items()
            },
        }


@dataclass
class SDIWeights:
    """
    Configurable weight vector for SDI computation. Encapsulated as
    a class so the same study can compare alternative weighting schemes
    without rewriting computation code.
    """
    cwe_weights: Dict[str, float] = field(
        default_factory=lambda: dict(FINTECH_DEFAULT_WEIGHTS)
    )
    severity_multipliers: Dict[str, float] = field(
        default_factory=lambda: dict(SEVERITY_MULTIPLIERS)
    )
    normalize_by_loc: bool = True
    loc_normalization_unit: int = 1000  # findings per kLOC

    def weight_for(self, cwe: str, severity: str) -> float:
        cwe_w = self.cwe_weights.get(cwe, self.cwe_weights.get("_UNKNOWN_", 1.0))
        sev_m = self.severity_multipliers.get(severity.upper(), 1.0)
        return cwe_w * sev_m

    @classmethod
    def from_json(cls, path: str) -> "SDIWeights":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(
            cwe_weights=data.get("cwe_weights", dict(FINTECH_DEFAULT_WEIGHTS)),
            severity_multipliers=data.get(
                "severity_multipliers", dict(SEVERITY_MULTIPLIERS)
            ),
            normalize_by_loc=data.get("normalize_by_loc", True),
            loc_normalization_unit=data.get("loc_normalization_unit", 1000),
        )

    def to_json(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "cwe_weights": self.cwe_weights,
                    "severity_multipliers": self.severity_multipliers,
                    "normalize_by_loc": self.normalize_by_loc,
                    "loc_normalization_unit": self.loc_normalization_unit,
                },
                f, indent=2,
            )


# ---------------------------------------------------------------------------
# Core computation.
# ---------------------------------------------------------------------------

def normalize_profile(
    profile: VulnerabilityProfile,
    weights: SDIWeights,
) -> float:
    """
    Compute the scalar weighted vulnerability score for a single
    profile. This is the per-snapshot quantity that the SDI differences.

        S(C) = sum over (cwe, sev) of  w(cwe) * m(sev) * count(cwe, sev)

    If `normalize_by_loc` is True, the score is divided by
    (loc_effective / loc_normalization_unit), giving findings-per-kLOC.
    """
    total = 0.0
    for (cwe, severity), count in profile.findings.items():
        total += weights.weight_for(cwe, severity) * count

    if weights.normalize_by_loc and profile.loc_effective > 0:
        per_unit = profile.loc_effective / weights.loc_normalization_unit
        if per_unit > 0:
            total = total / per_unit

    return total


def compute_drift_vector(
    profile_t: VulnerabilityProfile,
    profile_t_plus_n: VulnerabilityProfile,
    weights: Optional[SDIWeights] = None,
) -> Dict[str, float]:
    """
    Compute the per-CWE drift vector between two snapshots.

    Returns a dict keyed by CWE with the *signed* change in weighted
    findings (positive = degradation, negative = improvement).

    Severity is collapsed into the weighting at this stage; if you need
    the raw per-(cwe, severity) deltas, iterate over `findings` directly.
    """
    weights = weights or SDIWeights()
    all_cwes = set()
    all_cwes.update(cwe for (cwe, _) in profile_t.findings.keys())
    all_cwes.update(cwe for (cwe, _) in profile_t_plus_n.findings.keys())

    def weighted_count_for_cwe(profile: VulnerabilityProfile, cwe: str) -> float:
        total = 0.0
        for (c, sev), count in profile.findings.items():
            if c == cwe:
                total += weights.weight_for(c, sev) * count
        return total

    delta: Dict[str, float] = {}
    for cwe in all_cwes:
        wt = weighted_count_for_cwe(profile_t, cwe)
        wn = weighted_count_for_cwe(profile_t_plus_n, cwe)
        delta[cwe] = wn - wt

    return delta


def compute_sdi(
    profile_t: VulnerabilityProfile,
    profile_t_plus_n: VulnerabilityProfile,
    weights: Optional[SDIWeights] = None,
) -> float:
    """
    Compute the scalar Security Drift Index between two snapshots.

        SDI(t, t+n) = S(C_{t+n}) - S(C_t)

    where S(.) is the LOC-normalized weighted score from
    `normalize_profile`.

    Sign convention: positive SDI = security degraded;
                     negative SDI = security improved.
    """
    weights = weights or SDIWeights()
    s_t = normalize_profile(profile_t, weights)
    s_n = normalize_profile(profile_t_plus_n, weights)
    return s_n - s_t


def compute_trajectory(
    profiles: Iterable[VulnerabilityProfile],
    weights: Optional[SDIWeights] = None,
) -> Tuple[list, list]:
    """
    Given an ordered sequence of profiles representing iteration rounds
    1..N, return (scores, cumulative_sdi).

    `scores[i]` is the absolute weighted score at round i.
    `cumulative_sdi[i]` is the SDI from round 0 to round i.
    """
    weights = weights or SDIWeights()
    profiles = list(profiles)
    if not profiles:
        return [], []

    scores = [normalize_profile(p, weights) for p in profiles]
    baseline = scores[0]
    cumulative = [s - baseline for s in scores]
    return scores, cumulative


def drift_summary(
    profile_t: VulnerabilityProfile,
    profile_t_plus_n: VulnerabilityProfile,
    weights: Optional[SDIWeights] = None,
    top_k: int = 5,
) -> dict:
    """
    Human-readable summary of a single drift step. Used in the paper's
    case-study figures.
    """
    weights = weights or SDIWeights()
    sdi = compute_sdi(profile_t, profile_t_plus_n, weights)
    vec = compute_drift_vector(profile_t, profile_t_plus_n, weights)

    sorted_by_magnitude = sorted(vec.items(), key=lambda x: abs(x[1]), reverse=True)
    top_contributors = sorted_by_magnitude[:top_k]

    return {
        "from": profile_t.snapshot_id,
        "to": profile_t_plus_n.snapshot_id,
        "sdi": round(sdi, 4),
        "direction": "degradation" if sdi > 0 else ("improvement" if sdi < 0 else "neutral"),
        "top_contributors": [
            {"cwe": cwe, "delta": round(d, 4)}
            for cwe, d in top_contributors
        ],
        "score_from": round(normalize_profile(profile_t, weights), 4),
        "score_to": round(normalize_profile(profile_t_plus_n, weights), 4),
    }


# ---------------------------------------------------------------------------
# Sensitivity analysis helper.
# ---------------------------------------------------------------------------

def sensitivity_analysis(
    profile_t: VulnerabilityProfile,
    profile_t_plus_n: VulnerabilityProfile,
    weight_schemes: Mapping[str, SDIWeights],
) -> Dict[str, float]:
    """
    Recompute the SDI under each named weighting scheme. Used to
    demonstrate that conclusions are robust to weight choice — a
    standard reviewer concern for any composite index.
    """
    return {
        name: compute_sdi(profile_t, profile_t_plus_n, w)
        for name, w in weight_schemes.items()
    }


# ---------------------------------------------------------------------------
# Self-test.
# ---------------------------------------------------------------------------

def _self_test() -> None:
    """Minimal smoke test, runnable as `python sdi.py`."""
    # A baseline snapshot: a single hardcoded credential, medium severity.
    p0 = VulnerabilityProfile(
        snapshot_id="scenario01_round01",
        findings={("CWE-798", "MEDIUM"): 1},
        loc_effective=120,
    )
    # After 5 rounds: hardcoded cred still there + new injection + missing auth check.
    p5 = VulnerabilityProfile(
        snapshot_id="scenario01_round05",
        findings={
            ("CWE-798", "MEDIUM"): 1,
            ("CWE-89", "HIGH"): 1,
            ("CWE-862", "HIGH"): 2,
        },
        loc_effective=210,
    )
    w = SDIWeights()
    sdi = compute_sdi(p0, p5, w)
    print(f"[self-test] SDI(round1 -> round5) = {sdi:+.3f}")
    print(f"[self-test] drift summary: {json.dumps(drift_summary(p0, p5, w), indent=2)}")
    assert sdi > 0, "expected positive drift in this synthetic case"
    print("[self-test] PASS")


if __name__ == "__main__":
    _self_test()
