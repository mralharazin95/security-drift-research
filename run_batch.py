"""Run analysis per scenario with incremental save."""
import json, sys
from pathlib import Path
sys.path.insert(0, '/home/claude/research')

from sast_pipeline import run_semgrep, run_bandit, run_secret_heuristic, count_effective_loc
from sdi import VulnerabilityProfile, SDIWeights

BASE = Path("/home/claude/research/pilot")
RULES = "/home/claude/research/fintech_rules.yml"
OUTPUT = BASE / 'full_analysis.json'

NAMES = {1:"USDT/USDC Deposit", 2:"JWT Auth + Refresh", 3:"TOTP 2FA",
         4:"AES-256-GCM PII", 5:"Rate Limiting", 6:"KYC Upload",
         7:"Tx History Pagination", 8:"Withdrawal Auth", 9:"Webhook Signature",
         10:"Balance Reconciliation", 11:"Locked Investment Plan",
         12:"Admin Role Guard", 13:"Password Reset", 14:"Audit Log",
         15:"Referral Rewards"}

# Load existing if any
if OUTPUT.exists():
    with open(OUTPUT) as f:
        data = json.load(f)
    done = {s['id'] for s in data['scenarios']}
    print(f"Resuming. Already done: {sorted(done)}")
else:
    data = {'scenarios': []}
    done = set()

target_sid = int(sys.argv[1])
if target_sid in done:
    print(f"Scenario {target_sid} already done. Skipping.")
    sys.exit(0)

weights = SDIWeights()
scenario = {'id': target_sid, 'name': NAMES[target_sid], 'rounds': []}
baseline = None

for r in range(1, 11):
    target = str(BASE / f'scenario_{target_sid:02d}' / f'round_{r:02d}')
    semgrep = run_semgrep(target, RULES)
    bandit = run_bandit(target)
    secrets = run_secret_heuristic(target)

    agg = {}
    for res in [semgrep, bandit, secrets]:
        for k in res.findings:
            agg[k] = agg.get(k, 0) + 1

    loc = count_effective_loc(target)
    profile = VulnerabilityProfile(f's{target_sid:02d}r{r:02d}', agg, loc)

    abs_score = sum(weights.weight_for(c, s) * n for (c, s), n in profile.findings.items())
    high = sum(n for (c, s), n in profile.findings.items() if s == 'HIGH')
    med = sum(n for (c, s), n in profile.findings.items() if s == 'MEDIUM')
    low = sum(n for (c, s), n in profile.findings.items() if s == 'LOW')
    sdi_kloc = (abs_score / loc * 1000) if loc > 0 else 0
    if baseline is None: baseline = sdi_kloc

    scenario['rounds'].append({
        'round': r, 'loc': loc, 'total_findings': profile.total_findings(),
        'high': high, 'med': med, 'low': low,
        'abs_score': round(abs_score, 2),
        'sdi_per_kloc': round(sdi_kloc, 2),
        'sdi_delta': round(sdi_kloc - baseline, 2),
        'findings_breakdown': {f'{c}:{s}': n for (c, s), n in profile.findings.items()},
        'tool_counts': {'semgrep': semgrep.raw_count, 'bandit': bandit.raw_count, 'secret': secrets.raw_count},
    })
    print(f"  S{target_sid:02d} R{r:02d}: LOC={loc:3d} findings={profile.total_findings():2d} score={abs_score:.1f}")

data['scenarios'].append(scenario)
with open(OUTPUT, 'w') as f:
    json.dump(data, f, indent=2)
print(f"S{target_sid:02d} done. Saved.")
