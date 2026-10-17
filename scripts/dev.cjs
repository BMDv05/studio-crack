'use strict';
/* `npm run dev` at the repo root: starts API (:3100) and Vite (:5173)
 * together with prefixed output. Ctrl+C stops both. No extra dependencies. */
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const targets = [
  { name: 'server', color: '\x1b[36m', args: ['--prefix', 'server', 'run', 'dev'] },
  { name: 'client', color: '\x1b[35m', args: ['--prefix', 'client', 'run', 'dev'] },
];

const children = [];

for (const t of targets) {
  const child = spawn(npm, t.args, { cwd: ROOT, shell: process.platform === 'win32' });
  children.push(child);
  const prefix = `${t.color}[${t.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) if (line.trim()) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited (${code})`);
    shutdown(code || 0);
  });
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* already gone */ }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Double H Studio dev:');
console.log('  API   http://localhost:3100');
console.log('  Site  http://localhost:5173  (proxies /api + /media to :3100)');
