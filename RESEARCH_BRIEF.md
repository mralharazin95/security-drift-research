# Security Drift — Research and Media Brief

## One-Sentence Summary

Security Drift is a reproducible framework for measuring whether security risk improves or degrades across repeated AI-assisted software iterations, rather than evaluating only a final code snapshot.

## Why It Matters

A single AI-generated change can look acceptable while small omissions accumulate across later prompts and revisions. Product, engineering, security, and governance teams therefore need a way to measure direction over time and decide where human review, automated analysis, and release gates belong.

## Public Artifact at a Glance

- **150 code snapshots**
- **15 FinTech scenarios**
- **10 standardized iteration rounds per scenario**
- **Security Drift Index (SDI)** in absolute and per-kLOC forms
- **Multi-tool SAST pipeline** using Semgrep, Bandit, and a secret-pattern heuristic
- Scenario specifications, analysis outputs, and reproduction scripts are available in this repository

## Artifact-Level Results

The current public artifact reports:

- Mean vulnerability increase from Round 1 to each scenario's peak: **+219.3% ± 113.5%**
- Reduction after explicit security-review prompts in Rounds 9–10: **100% across the 15 scenarios**
- Density paradox observed in **11 of 15 scenarios (73.3%)**

The density paradox describes cases where absolute weighted findings rise while the per-kLOC rate falls because the codebase grows faster than the finding count. This is why absolute and normalized measures should be reviewed together.

> These are results from the public research artifact. The associated manuscript is under review at *Array* and is not published or peer-reviewed. Do not describe it as an accepted or published paper.

## Practical Questions This Work Supports

- How can teams detect security degradation across AI-assisted iterations?
- Where should SAST and human review checkpoints sit in the delivery workflow?
- Why can point-in-time vulnerability counts miss directional risk?
- How should teams interpret absolute findings versus per-kLOC density?
- What evidence should be retained for reproducible AI product assurance?

## Available Commentary and Speaking Themes

Mahmoud J. M. Alharazin is available for evidence-based commentary, conference sessions, panels, podcasts, and practical briefings on:

- Security Drift and iterative AI-assisted development
- AI Product Engineering and governed go-live decisions
- FinTech security and quality assurance
- Digital transformation and delivery governance
- Responsible AI evaluation, monitoring, and operational accountability

See the verified [Speaking and Expert Commentary profile](SPEAKING.md).

## Reproducibility and Citation

- Repository overview and reproduction instructions: [README](README.md)
- Machine-readable citation metadata: [CITATION.cff](CITATION.cff)
- Research software metadata: [codemeta.json](codemeta.json)
- Cross-scenario statistics: [aggregate_stats.json](aggregate_stats.json)
- Scenario catalogue: [scenarios_catalog.md](scenarios_catalog.md)

## Author and Contact

**Mahmoud J. M. Alharazin**  
Management & Technology Consultant | Founder, MAGNET INNOVATE | AI Product Engineer

- Personal website: [alharazin.com](https://alharazin.com/)
- Company: [MAGNET INNOVATE LTD](https://magnetinnovate.com/) — UK company 15153676
- ORCID: [0009-0002-9454-6217](https://orcid.org/0009-0002-9454-6217)
- Email: [mahmoud@alharazin.com](mailto:mahmoud@alharazin.com)
- Location and delivery: Konya, Türkiye; international remote availability

## Accuracy Note

This page summarizes verifiable material already present in the public repository. It does not claim event acceptance, client outcomes, academic publication, or qualifications beyond the verified professional record.
