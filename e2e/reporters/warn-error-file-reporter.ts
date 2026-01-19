import fs from "fs";
import path from "path";
import type {
  Reporter,
  TestCase,
  TestResult,
  FullConfig,
  Suite,
} from "@playwright/test/reporter";

/**
 * Captures warning/error output for each e2e test into a single log file.
 * The file is reset on every Playwright run.
 */
class WarnErrorFileReporter implements Reporter {
  private logFilePath: string;

  constructor() {
    this.logFilePath = path.join(
      process.cwd(),
      "test-results",
      "e2e-warn-error.log",
    );
  }

  onBegin(config: FullConfig, suite: Suite): void {
    fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
    const header = [
      `E2E warnings/errors log`,
      `Run started: ${new Date().toISOString()}`,
      `Total tests: ${suite.allTests().length}`,
      "------------------------------------------------------------",
    ].join("\n");
    fs.writeFileSync(this.logFilePath, `${header}\n`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.titlePath().join(" > ");
    const entries: string[] = [];

    // Collect structured errors from the result
    for (const err of result.errors || []) {
      const message = err.message || String(err);
      entries.push(`ERROR: ${message.trim()}`);
    }

    // Collect stdout/stderr lines containing warnings/errors (case-insensitive)
    const collectStream = (stream: TestResult["stdout"]): string[] => {
      return stream
        .map(
          (chunk) =>
            chunk.text ?? (chunk.buffer ? chunk.buffer.toString("utf8") : ""),
        )
        .filter(Boolean)
        .flatMap((text) => text.split(/\r?\n/))
        .filter((line) => /warning|error/i.test(line));
    };

    const stdoutLines = collectStream(result.stdout);
    const stderrLines = collectStream(result.stderr);

    entries.push(...stdoutLines.map((line) => `STDOUT: ${line}`));
    entries.push(...stderrLines.map((line) => `STDERR: ${line}`));

    if (entries.length === 0 && result.status === "failed") {
      // Ensure failures are still noted even without explicit warning/error lines
      entries.push(`ERROR: Test failed without explicit error output.`);
    }

    if (entries.length === 0) return;

    const section = [
      `\n[${result.status.toUpperCase()}] ${title}`,
      ...entries,
    ].join("\n");

    fs.appendFileSync(this.logFilePath, `${section}\n`);
  }
}

export default WarnErrorFileReporter;
