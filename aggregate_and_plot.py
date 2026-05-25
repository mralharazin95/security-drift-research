"""
Aggregate analysis and publication-quality figures for the paper.
"""

import json
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
from statistics import mean, stdev

BASE = Path("/home/claude/research/pilot")

with open(BASE / 'full_analysis.json') as f:
    data = json.load(f)

scenarios = sorted(data['scenarios'], key=lambda s: s['id'])

# ============== Aggregate statistics ==============

print("=" * 90)
print("AGGREGATE STATISTICS — Single-Model Exploratory Study (Claude)")
print("=" * 90)
print(f"Total scenarios: {len(scenarios)}")
print(f"Rounds per scenario: 10")
print(f"Total snapshots: {sum(len(s['rounds']) for s in scenarios)}")
print()

# Per-round statistics across all scenarios
per_round_findings = {r: [] for r in range(1, 11)}
per_round_high = {r: [] for r in range(1, 11)}
per_round_med = {r: [] for r in range(1, 11)}
per_round_abs_score = {r: [] for r in range(1, 11)}
per_round_sdi_kloc = {r: [] for r in range(1, 11)}
per_round_loc = {r: [] for r in range(1, 11)}

for s in scenarios:
    for rd in s['rounds']:
        r = rd['round']
        per_round_findings[r].append(rd['total_findings'])
        per_round_high[r].append(rd['high'])
        per_round_med[r].append(rd['med'])
        per_round_abs_score[r].append(rd['abs_score'])
        per_round_sdi_kloc[r].append(rd['sdi_per_kloc'])
        per_round_loc[r].append(rd['loc'])

print(f"{'Round':<7}{'Mean Findings':<16}{'Mean LOC':<12}{'Mean Abs Score':<18}{'Mean SDI/kLOC':<16}")
print("-" * 90)
for r in range(1, 11):
    f_mean = mean(per_round_findings[r])
    loc_mean = mean(per_round_loc[r])
    score_mean = mean(per_round_abs_score[r])
    sdi_mean = mean(per_round_sdi_kloc[r])
    f_std = stdev(per_round_findings[r])
    print(f"R{r:<6}{f_mean:5.2f} ± {f_std:.2f}    {loc_mean:6.1f}      {score_mean:6.2f}             {sdi_mean:7.2f}")

# Peak analysis
print()
print("=" * 90)
print("PEAK ANALYSIS PER SCENARIO")
print("=" * 90)
print(f"{'Scenario':<28}{'R1 Findings':<14}{'Peak Round':<14}{'Peak Findings':<16}{'Increase %':<12}")
print("-" * 90)
peak_increases = []
for s in scenarios:
    rounds = s['rounds']
    r1 = rounds[0]['total_findings']
    peak_idx = max(range(len(rounds)), key=lambda i: rounds[i]['total_findings'])
    peak_findings = rounds[peak_idx]['total_findings']
    peak_round = rounds[peak_idx]['round']
    inc_pct = ((peak_findings - r1) / max(r1, 1)) * 100 if r1 > 0 else (peak_findings * 100)
    peak_increases.append(inc_pct)
    print(f"{s['name'][:26]:<28}{r1:<14}R{peak_round:<13}{peak_findings:<16}{inc_pct:+.0f}%")

print()
print(f"Mean peak increase R1->peak: {mean(peak_increases):.1f}% (std: {stdev(peak_increases):.1f})")

# Recovery analysis
print()
print("=" * 90)
print("SECURITY REVIEW EFFECTIVENESS (R8 vs R10)")
print("=" * 90)
print(f"{'Scenario':<28}{'R8 Score':<12}{'R10 Score':<12}{'Reduction %':<14}")
print("-" * 90)
reductions = []
for s in scenarios:
    r8 = s['rounds'][7]['abs_score']
    r10 = s['rounds'][9]['abs_score']
    if r8 > 0:
        red_pct = ((r8 - r10) / r8) * 100
    else:
        red_pct = 0
    reductions.append(red_pct)
    print(f"{s['name'][:26]:<28}{r8:<12}{r10:<12}{red_pct:.1f}%")
print()
print(f"Mean reduction R8->R10 (after security review): {mean(reductions):.1f}%")

# Density paradox check
print()
print("=" * 90)
print("DENSITY PARADOX VERIFICATION")
print("=" * 90)
print(f"For each scenario, comparing absolute trajectory vs density trajectory R1->R8:")
print(f"{'Scenario':<28}{'Abs R1->R8 change':<22}{'Density R1->R8 change':<22}{'Paradox?':<10}")
print("-" * 90)
paradox_count = 0
for s in scenarios:
    abs_r1 = s['rounds'][0]['abs_score']
    abs_r8 = s['rounds'][7]['abs_score']
    den_r1 = s['rounds'][0]['sdi_per_kloc']
    den_r8 = s['rounds'][7]['sdi_per_kloc']
    abs_change = abs_r8 - abs_r1
    den_change = den_r8 - den_r1
    paradox = (abs_change > 0 and den_change < 0)
    if paradox:
        paradox_count += 1
    print(f"{s['name'][:26]:<28}{abs_change:+.1f}              {den_change:+.1f}              {'YES' if paradox else 'no'}")
print()
print(f"Density paradox observed in {paradox_count} / {len(scenarios)} scenarios ({100*paradox_count/len(scenarios):.0f}%)")

# Save aggregated stats
agg_stats = {
    'total_snapshots': sum(len(s['rounds']) for s in scenarios),
    'per_round_means': {
        f'R{r}': {
            'mean_findings': round(mean(per_round_findings[r]), 2),
            'std_findings': round(stdev(per_round_findings[r]), 2),
            'mean_loc': round(mean(per_round_loc[r]), 1),
            'mean_abs_score': round(mean(per_round_abs_score[r]), 2),
            'mean_sdi_per_kloc': round(mean(per_round_sdi_kloc[r]), 2),
        }
        for r in range(1, 11)
    },
    'peak_increase_pct_mean': round(mean(peak_increases), 1),
    'peak_increase_pct_std': round(stdev(peak_increases), 1),
    'r8_to_r10_reduction_pct_mean': round(mean(reductions), 1),
    'density_paradox_count': paradox_count,
    'density_paradox_pct': round(100 * paradox_count / len(scenarios), 1),
}
with open(BASE / 'aggregate_stats.json', 'w') as f:
    json.dump(agg_stats, f, indent=2)

# =================== VISUALIZATIONS ===================
fig = plt.figure(figsize=(16, 11))

# Panel A: Per-scenario absolute findings over rounds
ax = plt.subplot(2, 2, 1)
colors = plt.cm.tab20(np.linspace(0, 1, len(scenarios)))
for s, color in zip(scenarios, colors):
    rounds = [r['round'] for r in s['rounds']]
    findings = [r['total_findings'] for r in s['rounds']]
    ax.plot(rounds, findings, '-o', color=color, alpha=0.6, markersize=4,
            label=f"S{s['id']:02d}")
ax.set_xlabel('Iteration Round')
ax.set_ylabel('Total Findings')
ax.set_title('A. Vulnerability accumulation across 15 FinTech scenarios')
ax.legend(loc='upper right', ncol=2, fontsize=8)
ax.set_xticks(range(1, 11))
ax.axvspan(8.5, 10.5, alpha=0.15, color='green')
ax.text(9.5, ax.get_ylim()[1] * 0.95, 'Security\nreview', ha='center',
        fontsize=10, color='green', fontweight='bold')
ax.grid(True, alpha=0.3)

# Panel B: Mean ± std across scenarios per round
ax = plt.subplot(2, 2, 2)
rounds = list(range(1, 11))
means = [mean(per_round_findings[r]) for r in rounds]
stds = [stdev(per_round_findings[r]) for r in rounds]
ax.errorbar(rounds, means, yerr=stds, fmt='-o', linewidth=2.5, markersize=8,
            capsize=5, color='#1f77b4', label='Mean ± SD across scenarios')
ax.fill_between(rounds, [m - s for m, s in zip(means, stds)],
                [m + s for m, s in zip(means, stds)], alpha=0.2, color='#1f77b4')
ax.set_xlabel('Iteration Round')
ax.set_ylabel('Findings (mean ± SD)')
ax.set_title('B. Aggregate trajectory: findings per round across all scenarios')
ax.set_xticks(rounds)
ax.axvspan(8.5, 10.5, alpha=0.15, color='green')
ax.grid(True, alpha=0.3)
ax.legend()

# Panel C: Absolute vs Density SDI (the density paradox)
ax = plt.subplot(2, 2, 3)
abs_means = [mean(per_round_abs_score[r]) for r in rounds]
den_means = [mean(per_round_sdi_kloc[r]) for r in rounds]

# Normalize both to [0,1] for visual comparison
abs_norm = [(v - min(abs_means)) / (max(abs_means) - min(abs_means)) for v in abs_means]
den_norm = [(v - min(den_means)) / (max(den_means) - min(den_means)) for v in den_means]

ax.plot(rounds, abs_norm, '-o', linewidth=2.5, markersize=8,
        color='#d62728', label='Absolute weighted score (normalized)')
ax.plot(rounds, den_norm, '-s', linewidth=2.5, markersize=8,
        color='#2ca02c', label='Per-kLOC SDI (normalized)')
ax.set_xlabel('Iteration Round')
ax.set_ylabel('Normalized SDI (0 to 1)')
ax.set_title('C. Density paradox: absolute vs LOC-normalized metrics\n(observed in {}/{} scenarios)'.format(paradox_count, len(scenarios)))
ax.set_xticks(rounds)
ax.legend()
ax.grid(True, alpha=0.3)
ax.axvspan(8.5, 10.5, alpha=0.15, color='green')

# Panel D: Recovery distribution (R8 -> R10)
ax = plt.subplot(2, 2, 4)
r8_scores = [s['rounds'][7]['abs_score'] for s in scenarios]
r10_scores = [s['rounds'][9]['abs_score'] for s in scenarios]
names = [f"S{s['id']:02d}" for s in scenarios]
x = np.arange(len(names))
width = 0.35
ax.bar(x - width/2, r8_scores, width, label='R8 (pre-review)', color='#d62728', alpha=0.8)
ax.bar(x + width/2, r10_scores, width, label='R10 (post-review)', color='#2ca02c', alpha=0.8)
ax.set_xlabel('Scenario')
ax.set_ylabel('Absolute Weighted Score')
ax.set_title(f'D. Effect of security review prompts (mean reduction: {mean(reductions):.0f}%)')
ax.set_xticks(x)
ax.set_xticklabels(names, rotation=45, fontsize=8)
ax.legend()
ax.grid(True, alpha=0.3, axis='y')

plt.tight_layout()
plt.savefig(BASE / 'full_study_results.png', dpi=180, bbox_inches='tight')
plt.savefig(BASE / 'full_study_results.pdf', bbox_inches='tight')
print()
print(f"Saved figures: full_study_results.png/.pdf")
