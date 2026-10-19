#!/usr/bin/env node
// img2code - local, deterministic screenshot-to-code harness.
// measure -> slice -> shot -> diff -> report, plus selftest and serve.
import path from 'node:path';
import { runMeasure } from '../src/commands/measure.mjs';
import { runSlice } from '../src/commands/slice.mjs';
import { runShot } from '../src/commands/shot.mjs';
import { runDiff } from '../src/commands/diff.mjs';
import { runReport } from '../src/commands/report.mjs';
import { runSelftest } from '../src/commands/selftest.mjs';
import { runProbe } from '../src/commands/probe.mjs';
import { runInspect } from '../src/commands/inspect.mjs';
import { runNormalize } from '../src/commands/normalize.mjs';
import { startStaticServer } from '../src/lib/serve.mjs';

const VERSION = '1.0.0';

const HELP = `img2code v${VERSION} - local deterministic screenshot-to-code harness

usage: img2code <command> [options]

commands
  normalize <image.png|jpg|webp> --out reference/ref.png [--json reference/source.json]
      Decode the image at its original dimensions and keep the source/output hashes.

  measure <ref.png> [--profile generic|dashboard] [--out measure.json] [--expect anchors.json]
      Measure canvas and colours. --profile dashboard also detects cyan cut-corner frames.
      Generic is the default; do not assume that every screenshot is a three-column dashboard.

  slice <ref.png> --spec assets.json [--out-dir assets] [--manifest assets/manifest.json] [--source ref.png]
      Cut named rectangles out of the reference with no resampling and verify every
      written asset is pixel-identical (0 differing pixels) to its source rectangle.

  probe <ref.png> [--region x,y,w,h] [--mask bright|white|cyanBright|red] [--out probe.json]
      Measure local colour components and ink spans; use alongside visual inspection.

  inspect <ref.png> <actual.png> --region x,y,w,h [--scale 2] [--out-dir out/detail]
      Export aligned reference/render crops, 50% overlay and difference image for close inspection.

  shot (--serve-dir dist | --url http://host/page) [--path index.html] [--query "?freeze=1"]
       --out shot.png [--width 1871] [--height 841] [--repeat 2] [--json shot.json] [--channel chrome]
       [--ready "#app"] [--timeout 30000] [--settle 300] [--no-freeze]
      Render with Playwright at deviceScaleFactor 1 with animations frozen, fonts and
      images awaited. --repeat N also proves byte-identical determinism.

  diff <ref.png> <actual.png> [--regions regions.json] [--config thresholds.json]
       [--out-dir out] [--json out/diff-report.json] [--threshold 0.15] [--max-mismatch 8]
       [--max-mae 10] [--min-ssim 0.93] [--code-max-mismatch 6] [--code-max-mae 10]
       [--code-min-ssim 0.92] [--structure none|dashboard] [--structure-tolerance 2] [--top 12]
      Compare render vs reference: pixelmatch mismatch, MAE, SSIM globally and per region
      class (code-drawn vs texture), structural panel alignment check, residual clusters,
      heatmap + side-by-side images. Exit 1 when any threshold is exceeded.

  report <diff-report.json> [--out-dir out] [--title "..."]
      Render the JSON report into fidelity-report.md / .html / .json.

  selftest [--ref ref.png] [--regions regions.json] [--target K4|L1|...] [--dx 6] [--work-dir dir]
      T1 identical images PASS; T2 target shifted 6px FAILs under the same thresholds;
      T3 two shots byte-identical. Without --ref a synthetic reference is generated.

  serve <dir> [--port 8080]
      Serve a directory for manual inspection (prints the URL, runs until Ctrl+C).
`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      const rawKey = eq >= 0 ? body.slice(0, eq) : body;
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (eq >= 0) {
        flags[key] = body.slice(eq + 1);
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'version' || command === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const args = parseArgs(argv.slice(1));
  switch (command) {
    case 'normalize': return (await runNormalize(args)).code;
    case 'measure': return (await runMeasure(args)).code;
    case 'slice': return runSlice(args).code;
    case 'probe': return runProbe(args).code;
    case 'inspect': return runInspect(args).code;
    case 'shot': return (await runShot(args)).code;
    case 'diff': return runDiff(args).code;
    case 'report': return runReport(args).code;
    case 'selftest': return (await runSelftest(args)).code;
    case 'serve': {
      const dir = args.positional[0] ?? '.';
      const server = await startStaticServer(dir, { port: Number(args.flags.port ?? 8080) });
      process.stdout.write(`serving ${path.resolve(dir)} at ${server.url}  (Ctrl+C to stop)\n`);
      await new Promise(() => {});
      return 0;
    }
    default:
      process.stderr.write(`img2code: unknown command "${command}"\n\n${HELP}`);
      return 2;
  }
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((err) => {
    process.stderr.write(`img2code: ${err && err.message ? err.message : err}\n`);
    if (process.env.IMG2CODE_DEBUG) process.stderr.write(`${err && err.stack}\n`);
    process.exitCode = 2;
  });
