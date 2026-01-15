import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Fails and aborts the Playwright run as soon as a console error/warning or i18n missing key is observed.
 * This lets us stop the suite early to fix translation regressions or noisy browser warnings.
 */
class FailFastLogReporter implements Reporter {
  private triggered = false;

  private check(
    chunk: string | Buffer,
    test?: TestCase,
    result?: TestResult,
  ): void {
    if (this.triggered) return;
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const patterns = [
      { regex: /i18next::translator: missingKey/i, reason: "i18n missing key" },
      { regex: /\bmissing key\b/i, reason: "missing translation key" },
      { regex: /\bwarning\b/i, reason: "console warning" },
      { regex: /\berror\b/i, reason: "console error" },
    ];

    const hit = patterns.find((p) => p.regex.test(text));
    if (!hit) return;

    this.triggered = true;
    const title = test ? test.titlePath().join(" > ") : "unknown test";
    const snippet = text.trim().split(/\r?\n/).slice(0, 3).join("\n");
    const message = `Fail-fast triggered (${hit.reason}) in ${title}: ${snippet}`;

    // Surface the issue and abort the run immediately.
    console.error(message);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 0);
  }

  onStdOut(chunk: string | Buffer, test?: TestCase, result?: TestResult): void {
    this.check(chunk, test, result);
  }

  onStdErr(chunk: string | Buffer, test?: TestCase, result?: TestResult): void {
    this.check(chunk, test, result);
  }
}

export default FailFastLogReporter;
