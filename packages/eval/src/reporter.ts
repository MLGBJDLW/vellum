/**
 * Reporter - Generate pass-rate reports with V3 enhancements
 * @module @vellum/eval
 */

import { readFileSync, writeFileSync } from "fs";
import { aggregateTokenUsage } from "./pricing.js";
import type {
  CostSummary,
  EvalResult,
  GroupStats,
  PassAtK,
  PassRateReport,
  RegressionAnalysis,
  RegressionComparison,
  ReporterOptions,
  ReportMeta,
  RunResult,
} from "./types.js";

/**
 * Reporter generates evaluation reports with V3 enhancements
 */
export class Reporter {
  private options: Required<ReporterOptions>;

  constructor(options: ReporterOptions = {}) {
    this.options = {
      regressionThreshold: options.regressionThreshold ?? 0.1,
    };
  }

  /**
   * Generate a complete evaluation report
   */
  generateReport(results: EvalResult[], meta: ReportMeta, baselinePath?: string): PassRateReport {
    const overall = this.computeOverallStats(results);
    const passAtK = this.computeAggregatePassAtK(results);
    const byCategory = this.groupBy(results, "category");
    const byDifficulty = this.groupBy(results, "difficulty");

    // Compare with baseline if provided
    const regression = baselinePath ? this.compareWithBaseline(results, baselinePath) : undefined;

    // V3: Aggregate costs
    const costSummary = this.computeCostSummary(results);

    return {
      overall,
      passAtK,
      byCategory,
      byDifficulty,
      results,
      regression,
      meta,
      costSummary,
    };
  }

  /**
   * Compute pass@K from individual run results
   * pass@K = probability that at least one of K random samples passes
   */
  computePassAtK(runs: RunResult[]): PassAtK {
    const n = runs.length;
    if (n === 0) {
      return { "pass@1": 0, "pass@3": 0 };
    }

    const c = runs.filter((r) => r.pass).length;

    // pass@k = 1 - (n-c choose k) / (n choose k)
    // For k=1: pass@1 = c/n
    // For k=3: pass@3 = 1 - ((n-c)(n-c-1)(n-c-2)) / (n(n-1)(n-2))
    const passAt1 = c / n;

    let passAt3 = 0;
    if (n >= 3) {
      const failProb = this.combinations(n - c, 3) / this.combinations(n, 3);
      passAt3 = 1 - failProb;
    } else {
      // If we have fewer than 3 runs, use simple probability
      passAt3 = c > 0 ? 1 : 0;
    }

    const result: PassAtK = {
      "pass@1": Math.round(passAt1 * 1000) / 1000,
      "pass@3": Math.round(passAt3 * 1000) / 1000,
    };

    // Add pass@5 if we have enough runs
    if (n >= 5) {
      const failProb5 = this.combinations(n - c, 5) / this.combinations(n, 5);
      result["pass@5"] = Math.round((1 - failProb5) * 1000) / 1000;
    }

    return result;
  }

  /**
   * Save report to JSON file
   */
  saveReport(report: PassRateReport, filePath: string): void {
    writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  }

  /**
   * Load report from JSON file
   */
  loadReport(filePath: string): PassRateReport {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as PassRateReport;
  }

  /**
   * Print report to console
   */
  printReport(report: PassRateReport): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`EVALUATION REPORT - ${report.meta.timestamp}`);
    console.log(`Runs per task: ${report.meta.runsPerTask}`);
    if (report.meta.provider) {
      console.log(`Provider: ${report.meta.provider} / ${report.meta.model}`);
    }
    console.log(`${"=".repeat(60)}\n`);

    console.log(
      `Overall: ${report.overall.passed}/${report.overall.total} (${(report.overall.rate * 100).toFixed(1)}%)`
    );

    // pass@K metrics
    console.log(`\nPass@K Metrics:`);
    console.log(`  pass@1: ${(report.passAtK["pass@1"] * 100).toFixed(1)}%`);
    console.log(`  pass@3: ${(report.passAtK["pass@3"] * 100).toFixed(1)}%`);
    if (report.passAtK["pass@5"] !== undefined) {
      console.log(`  pass@5: ${(report.passAtK["pass@5"] * 100).toFixed(1)}%`);
    }

    // V3: Cost summary
    if (report.costSummary) {
      console.log(`\n💰 Cost Summary:`);
      console.log(
        `  Total tokens: ${report.costSummary.totalTokenUsage.inputTokens.toLocaleString()} in / ${report.costSummary.totalTokenUsage.outputTokens.toLocaleString()} out`
      );
      console.log(`  Estimated cost: $${report.costSummary.totalEstimatedCost.toFixed(4)}`);
      console.log(`  Avg cost/task: $${report.costSummary.averageCostPerTask.toFixed(4)}`);
    }

    console.log(`\nBy Category:`);
    for (const [cat, stats] of Object.entries(report.byCategory)) {
      console.log(`  ${cat}: ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(1)}%)`);
    }

    console.log(`\nBy Difficulty:`);
    for (const [diff, stats] of Object.entries(report.byDifficulty)) {
      console.log(`  ${diff}: ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(1)}%)`);
    }

    // Regression report
    if (report.regression) {
      console.log(`\n${"-".repeat(60)}`);
      console.log(`REGRESSION ANALYSIS (vs ${report.regression.baselinePath})`);
      if (report.regression.overallRegressed) {
        console.log(
          `⚠️  REGRESSION DETECTED in ${report.regression.regressedTasks.length} task(s):`
        );
        for (const taskId of report.regression.regressedTasks) {
          const comp = report.regression.comparisons.find((c) => c.taskId === taskId)!;
          console.log(`  - ${taskId}: ${comp.regressionReason}`);
        }
      } else {
        console.log(`✅ No regressions detected`);
      }
    }

    console.log(`\n${"=".repeat(60)}\n`);
  }

  /**
   * Check if there are regressions
   */
  hasRegressions(report: PassRateReport): boolean {
    return report.regression?.overallRegressed ?? false;
  }

  // ============================================
  // Private Methods
  // ============================================

  private computeOverallStats(results: EvalResult[]): GroupStats {
    const passed = results.filter((r) => r.pass).length;
    return {
      passed,
      total: results.length,
      rate: results.length > 0 ? passed / results.length : 0,
    };
  }

  private computeAggregatePassAtK(results: EvalResult[]): PassAtK {
    if (results.length === 0) {
      return { "pass@1": 0, "pass@3": 0 };
    }

    // Average the pass@K across all tasks
    const sum = results.reduce(
      (acc, r) => ({
        passAt1: acc.passAt1 + r.passAtK["pass@1"],
        passAt3: acc.passAt3 + r.passAtK["pass@3"],
        passAt5: acc.passAt5 + (r.passAtK["pass@5"] ?? 0),
        hasPassAt5: acc.hasPassAt5 && r.passAtK["pass@5"] !== undefined,
      }),
      { passAt1: 0, passAt3: 0, passAt5: 0, hasPassAt5: true }
    );

    const n = results.length;
    const result: PassAtK = {
      "pass@1": Math.round((sum.passAt1 / n) * 1000) / 1000,
      "pass@3": Math.round((sum.passAt3 / n) * 1000) / 1000,
    };

    if (sum.hasPassAt5) {
      result["pass@5"] = Math.round((sum.passAt5 / n) * 1000) / 1000;
    }

    return result;
  }

  private groupBy(
    results: EvalResult[],
    field: "category" | "difficulty"
  ): Record<string, GroupStats> {
    const groups: Record<string, EvalResult[]> = {};

    for (const result of results) {
      const key = result[field];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
    }

    const stats: Record<string, GroupStats> = {};
    for (const [key, items] of Object.entries(groups)) {
      const passed = items.filter((r) => r.pass).length;
      stats[key] = {
        passed,
        total: items.length,
        rate: items.length > 0 ? passed / items.length : 0,
      };
    }

    return stats;
  }

  /**
   * V3 ENHANCED: Compare with baseline using both pass@1 AND avgScore
   */
  private compareWithBaseline(results: EvalResult[], baselinePath: string): RegressionAnalysis {
    const baseline = this.loadReport(baselinePath);
    const baselineMap = new Map(baseline.results.map((r) => [r.taskId, r]));
    const regressionThreshold = this.options.regressionThreshold;

    const comparisons: RegressionComparison[] = [];
    const regressedTasks: string[] = [];

    for (const result of results) {
      const base = baselineMap.get(result.taskId);
      if (!base) continue;

      // ============================================
      // V3 FIX: Enhanced regression detection
      // Check BOTH pass@1 drop AND significant avgScore drop
      // ============================================
      const passAt1Regressed = result.passAtK["pass@1"] < base.passAtK["pass@1"];
      const avgScoreRegressed = base.avgScore - result.avgScore > regressionThreshold;
      const regressed = passAt1Regressed || avgScoreRegressed;

      let regressionReason: string | undefined;
      if (regressed) {
        if (passAt1Regressed && avgScoreRegressed) {
          regressionReason = `pass@1 dropped AND avgScore dropped by ${(base.avgScore - result.avgScore).toFixed(2)}`;
        } else if (passAt1Regressed) {
          regressionReason = `pass@1 dropped from ${base.passAtK["pass@1"]} to ${result.passAtK["pass@1"]}`;
        } else {
          regressionReason = `avgScore dropped by ${(base.avgScore - result.avgScore).toFixed(2)} (threshold: ${regressionThreshold})`;
        }
      }

      const comparison: RegressionComparison = {
        taskId: result.taskId,
        baseline: { passAt1: base.passAtK["pass@1"], avgScore: base.avgScore },
        current: { passAt1: result.passAtK["pass@1"], avgScore: result.avgScore },
        delta: {
          passAt1: result.passAtK["pass@1"] - base.passAtK["pass@1"],
          avgScore: result.avgScore - base.avgScore,
        },
        regressed,
        regressionReason,
      };

      comparisons.push(comparison);
      if (regressed) regressedTasks.push(result.taskId);
    }

    return {
      baselinePath,
      comparisons,
      overallRegressed: regressedTasks.length > 0,
      regressedTasks,
    };
  }

  /**
   * V3: Compute cost summary
   */
  private computeCostSummary(results: EvalResult[]): CostSummary {
    const totalTokenUsage = aggregateTokenUsage(results.map((r) => r.totalTokenUsage));
    const totalEstimatedCost = results.reduce((sum, r) => sum + r.totalEstimatedCost, 0);

    return {
      totalEstimatedCost,
      totalTokenUsage,
      averageCostPerTask: results.length > 0 ? totalEstimatedCost / results.length : 0,
    };
  }

  /**
   * Calculate combinations C(n, k)
   */
  private combinations(n: number, k: number): number {
    if (k > n || k < 0) return 0;
    if (k === 0 || k === n) return 1;

    let result = 1;
    for (let i = 0; i < k; i++) {
      result = (result * (n - i)) / (i + 1);
    }
    return result;
  }
}
