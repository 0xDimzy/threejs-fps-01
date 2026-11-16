// EMBERLINE entrypoint: hand the game in.
// Copies game/ and screenshots/ from this repository into the output
// directory (MAKEFUN_OUTPUT_DIR outside the grader, /output inside it) and
// writes /output/dossier.json with buildDossier from the kit's
// vendor/makefun-threejs.ts. Node 22, standard library only.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The dossier caps the bounty fixes: the judge reads at most 160 KiB of
// source text, and the dossier itself at most 1.5 MiB. Keep them in one
// named place so a cap change touches one line, not the build call.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The trees the entry ships: the game itself and its screenshots. The
// dossier is built from exactly what lands in the output directory, so the
// copy and the build cannot disagree about the entry's contents.
const SHIPPED_TREES = ['game', 'screenshots'];

function copyTree(name) {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) {
    console.log(`main.ts: no ${name}/ in the repository, skipping`);
    return;
  }
  cpSync(from, to, { recursive: true });
  console.log(`main.ts: copied ${name}/ -> ${to}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
for (const tree of SHIPPED_TREES) copyTree(tree);

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`main.ts: wrote dossier.json (${dossier.length} bytes) to ${outputDir}`);
