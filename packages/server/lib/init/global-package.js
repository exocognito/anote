// Finding a globally installed copy of the server means asking the package
// manager that installed it, in the way that manager actually answers.
//
// A single hardcoded `npm root -g` gets this wrong twice over: it reports the
// package missing for anyone who installed it with something else, and on
// machines where npm is blocked outright it reports nothing at all.
//
// The managers do not agree on the shape of the answer. npm's global root is a
// node_modules directory, so the package name can be joined onto it. pnpm's is
// not — it is a parent holding hashed directories, so the path has to come from
// `pnpm ls` instead. yarn keeps node_modules one level below the dir it names.
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE = 'vibe-annotations-server';
const MANAGERS = ['pnpm', 'npm', 'yarn'];

function run(cmd, args) {
  let res;
  try {
    res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
  } catch {
    return null;
  }
  if (!res || res.status !== 0) return null;
  const out = (res.stdout || '').trim();
  return out || null;
}

function viaPnpm() {
  const out = run('pnpm', ['ls', '-g', '--depth=0', '--json']);
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    const roots = Array.isArray(parsed) ? parsed : [parsed];
    for (const root of roots) {
      const dir = root?.dependencies?.[PACKAGE]?.path;
      if (dir) return dir;
    }
  } catch {
    // unparseable output — treat as not found
  }
  return null;
}

function viaNpm() {
  const root = run('npm', ['root', '-g']);
  return root ? join(root, PACKAGE) : null;
}

function viaYarn() {
  const dir = run('yarn', ['global', 'dir']);
  return dir ? join(dir, 'node_modules', PACKAGE) : null;
}

const LOCATORS = { pnpm: viaPnpm, npm: viaNpm, yarn: viaYarn };

// The manager in use goes first, but a machine can have the server installed by
// a different one, so the rest still get a look.
function candidates(preferred) {
  if (!preferred || !LOCATORS[preferred]) return MANAGERS;
  return [preferred, ...MANAGERS.filter((m) => m !== preferred)];
}

export function findGlobalPackage(preferred) {
  for (const mgr of candidates(preferred)) {
    const dir = LOCATORS[mgr]();
    if (!dir) continue;

    const entry = join(dir, 'lib', 'server.js');
    if (!existsSync(entry)) continue;

    return { mgr, dir, entry, version: readVersion(dir) };
  }
  return null;
}

function readVersion(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}
