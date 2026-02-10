import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const patches = [
  {
    name: "d3-selection",
    entry: "src/index.js",
    target: "./selection/index.js",
    copyFrom: "src 2",
  },
  {
    name: "d3-transition",
    entry: "src/index.js",
    target: "./transition/index.js",
  },
];

const ensureEntry = async ({ name, entry, target, copyFrom }) => {
  const packageRoot = path.join(root, "node_modules", name);
  const entryPath = path.join(packageRoot, entry);
  if (copyFrom) {
    const sourceDir = path.join(packageRoot, copyFrom);
    try {
      const items = await fs.readdir(sourceDir);
      if (items.length) {
        const destDir = path.join(packageRoot, "src");
        await fs.mkdir(destDir, { recursive: true });
        await Promise.all(
          items.map(async (item) => {
            const source = path.join(sourceDir, item);
            const dest = path.join(destDir, item);
            await fs.copyFile(source, dest);
          }),
        );
        console.log(`[patch-d3] synced ${name}/${copyFrom} -> src`);
      }
    } catch {
      // ignore if src 2 is absent
    }
  }
  if (name === "d3-selection") {
    const indexPath = path.join(packageRoot, "src", "index.js");
    try {
      const current = await fs.readFile(indexPath, "utf8");
      if (
        !current.includes("selection.prototype.interrupt") ||
        !current.includes("export default selection")
      ) {
        const next = `${current.trimEnd()}\nimport selection from "./selection/index.js";\nif (!selection.prototype.interrupt) {\n  selection.prototype.interrupt = function() { return this; };\n}\nexport default selection;\n`;
        await fs.writeFile(indexPath, next, "utf8");
        console.log("[patch-d3] patched d3-selection/src/index.js");
      }
    } catch {
      // ignore
    }
    const shimTargets = [
      {
        file: "selectAll.js",
        target: "./selection/selectAll.js",
      },
    ];
    for (const shim of shimTargets) {
      const shimPath = path.join(packageRoot, "src", shim.file);
      try {
        await fs.access(shimPath);
      } catch {
        await fs.writeFile(
          shimPath,
          `export {default} from "${shim.target}";\n`,
          "utf8",
        );
        console.log(`[patch-d3] wrote ${name}/src/${shim.file}`);
      }
    }
  }

  if (name === "d3-transition") {
    const interruptPath = path.join(packageRoot, "src", "interrupt.js");
    try {
      await fs.access(interruptPath);
    } catch {
      const interruptSource = `var STARTING = 2;\nvar ENDING = 5;\nvar ENDED = 6;\n\nexport function interrupt(node, name) {\n  var schedules = node.__transition,\n      schedule,\n      active,\n      empty = true,\n      i;\n\n  if (!schedules) return;\n\n  name = name == null ? null : name + \"\";\n\n  for (i in schedules) {\n    if ((schedule = schedules[i]).name !== name) { empty = false; continue; }\n    active = schedule.state > STARTING && schedule.state < ENDING;\n    schedule.state = ENDED;\n    schedule.timer.stop();\n    schedule.on.call(active ? \"interrupt\" : \"cancel\", node, node.__data__, schedule.index, schedule.group);\n    delete schedules[i];\n  }\n\n  if (empty) delete node.__transition;\n}\n\nexport function selection_interrupt(name) {\n  return this.each(function() {\n    interrupt(this, name);\n  });\n}\n`;
      await fs.writeFile(interruptPath, interruptSource, "utf8");
      console.log("[patch-d3] wrote d3-transition/src/interrupt.js");
    }

    const indexPath = path.join(packageRoot, "src", "index.js");
    const indexSource = `import selection from "d3-selection";\nimport transition from "./transition/index.js";\nimport { selection_interrupt } from "./interrupt.js";\nexport * from "./transition/index.js";\nexport { interrupt, selection_interrupt } from "./interrupt.js";\nselection.prototype.interrupt = selection_interrupt;\nselection.prototype.transition = transition;\n`;
    try {
      await fs.writeFile(indexPath, indexSource, "utf8");
      console.log("[patch-d3] updated d3-transition/src/index.js");
    } catch {
      // ignore
    }
  }

  try {
    await fs.access(entryPath);
    return;
  } catch {
    // continue
  }

  const dir = path.dirname(entryPath);
  await fs.mkdir(dir, { recursive: true });
  const content = `export * from "${target}";\n`;
  await fs.writeFile(entryPath, content, "utf8");
  console.log(`[patch-d3] wrote ${name}/${entry}`);
};

const run = async () => {
  for (const patch of patches) {
    try {
      await ensureEntry(patch);
    } catch (error) {
      console.warn(`[patch-d3] skipped ${patch.name}:`, error);
    }
  }
};

await run();
