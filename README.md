# Security Drift in Iterative AI-Assisted Development

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![ORCID](https://img.shields.io/badge/ORCID-0009--0002--9454--6217-A6CE39?logo=orcid)](https://orcid.org/0009-0002-9454-6217)

**Companion repository for the paper:**

> Mahmoud J. M. Alharazin. "Security Drift in Iterative AI-Assisted Development: An Empirical Framework for Measuring Vulnerability Accumulation in Vibe-Coded FinTech Applications." *Array* (Elsevier), 2026. Under review.

## Overview

This repository contains the complete artifact set for reproducing the Security Drift study:

- **150 code snapshots** across 15 FinTech scenarios × 10 iteration rounds
- **Security Drift Index (SDI)** reference implementation
- **Multi-tool SAST pipeline** (Semgrep + Bandit + secret-pattern heuristic)
- **Custom FinTech Semgrep ruleset** (9 rules)
- **Full per-snapshot analysis results** (JSON)
- **Analysis and plotting scripts**

## Repository Structure

```
security-drift-research/
├── README.md
├── CITATION.cff              # Machine-readable citation metadata
├── codemeta.json             # CodeMeta research software metadata
├── RESEARCH_BRIEF.md         # Research and media one-page brief
├── LICENSE
├── sdi.py                    # SDI reference implementation
├── sast_pipeline.py          # Multi-tool SAST orchestrator
├── fintech_rules.yml         # 9 custom Semgrep rules for FinTech
├── run_batch.py              # Batch runner for all scenarios
├── aggregate_and_plot.py     # Statistical analysis and Figure 1
├── scenarios_catalog.md      # Full scenario specifications
├── data/
│   ├── full_analysis.json    # Primary dataset (150 observations)
│   └── aggregate_stats.json  # Cross-scenario summary statistics
└── scenarios/
    ├── scenario_01/          # USDT/USDC Deposit Endpoint
    │   ├── round_01/*.js
    │   ├── round_02/*.js
    │   └── ... (10 rounds)
    ├── scenario_02/          # JWT Auth with Refresh Tokens
    └── ... (15 scenarios total)
```

## Quick Start

### Requirements

- Python ≥ 3.10
- Semgrep ≥ 1.16
- Bandit ≥ 1.9

### Install dependencies

```bash
pip install semgrep bandit matplotlib numpy
```

### Run the full pipeline on all scenarios

```bash
python run_batch.py
```

### Compute SDI for a single snapshot

```python
from sdi import compute_sdi

findings = [
    {"cwe": "CWE-89", "severity": "HIGH"},
    {"cwe": "CWE-798", "severity": "MEDIUM"},
]
sdi = compute_sdi(findings, loc=150)
print(f"Absolute SDI: {sdi['absolute']}, Density SDI: {sdi['per_kloc']}")
```

### Reproduce Figure 1

```bash
python aggregate_and_plot.py
```

## Key Results

| Metric | Value |
|--------|-------|
| Total observations | 150 (15 scenarios × 10 rounds) |
| Mean vulnerability increase (R1→peak) | +219.3% ± 113.5% |
| Recovery after security-review prompts (R9–R10) | 100% across all 15 scenarios |
| Density paradox prevalence | 11/15 scenarios (73%) |

## The Security Drift Index (SDI)

The SDI is a reproducible scalar measure of how the vulnerability profile of a codebase changes across consecutive AI-assisted iteration cycles:

```
SDI_{[t,t+n]} = Σ_{c ∈ CWE} w_c · Δv_c
```

where `w_c` is a domain-calibrated CWE weight, and `Δv_c` is the change in weighted finding count for class `c`. Two normalization conventions are supported:

- **Absolute SDI**: raw weighted sum (units: "weighted findings")
- **Density SDI (per kLOC)**: absolute SDI / (effective LOC / 1000)

## Citation

The associated manuscript is under review at *Array* and is not published. If you use this framework, dataset, or SDI implementation, cite this public research artifact:

```bibtex
@software{alharazin2026securitydrift,
  title={Security Drift in Iterative AI-Assisted Development},
  author={Alharazin, Mahmoud J. M.},
  year={2026},
  version={1.0.0},
  url={https://github.com/mralharazin95/security-drift-research},
  note={Research artifact; associated manuscript under review at Array and not published}
}
```

Machine-readable metadata:

- [CITATION.cff](CITATION.cff)
- [CodeMeta](codemeta.json)
- [Research and Media Brief](RESEARCH_BRIEF.md)

## Speaking and Expert Commentary

For conference talks, panels, podcasts, workshops, and media commentary, see the verified [speaking and expert commentary profile](SPEAKING.md).

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Author

**Mahmoud J. M. Alharazin**

Management & Technology Consultant | Founder, MAGNET INNOVATE | AI Product Engineer

- Personal website: [alharazin.com](https://alharazin.com/)
- Company: [MAGNET INNOVATE LTD](https://magnetinnovate.com/) — UK company 15153676
- ORCID: [0009-0002-9454-6217](https://orcid.org/0009-0002-9454-6217)
- Email: [mahmoud@alharazin.com](mailto:mahmoud@alharazin.com)
