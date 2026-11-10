#!/usr/bin/env node
/**
 * Starts a local MongoDB for development — no Atlas account, no IP allow-list, no
 * Docker required (if `mongod` is installed).
 *
 * The API fails fast when the database is unreachable, so a development machine
 * without a database is a machine where nothing runs. This script finds a local
 * `mongod`, starts it on 127.0.0.1 with its data inside the repo (`backend/.data/db`,
 * git-ignored), and prints the exact MONGODB_URI to put in `.env`.
 *
 * Usage:
 *   npm run db:local              start it (Ctrl+C stops it)
 *   npm run db:local -- --print-uri
 *                                 just print the URI, start nothing
 *   MONGOD_PORT=27018 npm run db:local
 *
 * With Docker instead:  docker run -d -p 27017:27017 --name ecommerce-mongo mongo:7
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataPath = path.join(projectRoot, '.data', 'db');
const port = Number(process.env.MONGOD_PORT ?? 27017);
const uri = `mongodb://127.0.0.1:${port}/ecommerce`;
const flags = new Set(process.argv.slice(2));

const bold = (message) => `\u001b[1m${message}\u001b[0m`;
const ok = (message) => console.log(`✓ ${message}`);
const bad = (message) => console.log(`✖ ${message}`);
const info = (message) => console.log(`  ${message}`);

if (flags.has('--print-uri') || flags.has('-p')) {
  console.log(uri);
  process.exit(0);
}

/** Is something already accepting connections on the port? */
function isListening(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });

    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Finds `mongod` (or `mongod.exe`) by walking PATH, without spawning anything. */
function resolveOnPath(name) {
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
      : [''];

  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!entry) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.join(entry, `${name}${extension.toLowerCase()}`);

      if (existsSync(candidate)) {
        return candidate;
      }

      const upper = path.join(entry, `${name}${extension.toUpperCase()}`);

      if (upper !== candidate && existsSync(upper)) {
        return upper;
      }
    }
  }

  return null;
}

/**
 * `mongod` on PATH, or a standard install location.
 *
 * Windows installers do not add themselves to PATH, so guessing the newest version
 * under "Program Files\MongoDB\Server" saves the user from doing it by hand.
 */
function findMongod() {
  if (process.env.MONGOD_BINARY) {
    return existsSync(process.env.MONGOD_BINARY) ? process.env.MONGOD_BINARY : null;
  }

  const bases = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/snap/bin'];
  const onPath = resolveOnPath('mongod');

  if (onPath) {
    return onPath;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\MongoDB\\Server', 'C:\\Program Files (x86)\\MongoDB\\Server']) {
      if (!existsSync(root)) {
        continue;
      }

      for (const version of readdirSync(root).sort().reverse()) {
        candidates.push(path.join(root, version, 'bin', 'mongod.exe'));
      }
    }
  } else {
    for (const base of bases) {
      candidates.push(path.join(base, 'mongod'));
    }
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

if (await isListening(port)) {
  ok(`Something is already listening on 127.0.0.1:${port} — nothing to start.`);
  console.log('');
  console.log(`  Put this in backend/.env:  ${bold(`MONGODB_URI=${uri}`)}`);
  console.log('  Then run `npm run db:check` to confirm the API can use it.');
  process.exit(0);
}

const binary = findMongod();

if (!binary) {
  bad('No local `mongod` found.');
  console.log('');
  console.log('  Pick one of these, then run `npm run db:local` again:');
  info('Windows : winget install --exact --id MongoDB.Server');
  info('macOS   : brew tap mongodb/brew && brew install mongodb-community');
  info('Linux   : sudo apt install mongodb-org (see mongodb.com/docs/manual/installation)');
  info('Docker  : docker run -d -p 27017:27017 --name ecommerce-mongo mongo:7');
  info('Atlas   : keep MONGODB_URI on Atlas and run `npm run db:check` instead.');
  console.log('');
  info('Already installed somewhere unusual? Set MONGOD_BINARY to its full path.');
  process.exit(1);
}

mkdirSync(dataPath, { recursive: true });

console.log(bold('Starting local MongoDB'));
info(`binary  ${binary}`);
info(`data    ${path.relative(projectRoot, dataPath)}`);
info(`address 127.0.0.1:${port}`);
console.log('');

const child = spawn(
  binary,
  ['--dbpath', dataPath, '--port', String(port), '--bind_ip', '127.0.0.1'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let ready = false;

const onData = (chunk) => {
  const text = chunk.toString();
  // mongod logs JSON lines on some builds and plain text on others; only the first
  // "waiting for connections" is worth printing.
  if (!ready && /waiting for connections/i.test(text)) {
    ready = true;
    console.log('');
    ok('MongoDB is ready.');
    console.log('');
    console.log(`  Put this in backend/.env:  ${bold(`MONGODB_URI=${uri}`)}`);
    console.log('  Then, in another terminal: npm run start:dev');
    console.log('');
    console.log('  Ctrl+C stops MongoDB. Data lives in backend/.data/db.');
    return;
  }

  if (process.env.MONGOD_VERBOSE) {
    process.stdout.write(text);
  }
};

child.stdout.on('data', onData);
child.stderr.on('data', onData);

child.on('exit', (code, signal) => {
  if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 0) {
    console.log('');
    ok('MongoDB stopped.');
    process.exit(0);
  }

  bad(`mongod exited with code ${code}.`);
  info('A common cause is a lock left by an unclean shutdown:');
  info(`  delete ${path.relative(projectRoot, path.join(dataPath, 'mongod.lock'))} and retry.`);
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  bad(`Could not start ${binary}: ${error.message}`);
  info('Set MONGOD_BINARY to the full path of mongod and retry.');
  process.exit(1);
});

const stop = () => {
  if (child.exitCode === null) {
    child.kill('SIGINT');
  }
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
