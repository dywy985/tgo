import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('nginx accepts knowledge-base uploads up to the backend 100MB limit', () => {
  const config = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
  assert.match(config, /client_max_body_size\s+100m\s*;/i);
});

test('HTML responses inherit the server security headers', () => {
  const config = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
  assert.match(config, /add_header\s+Content-Security-Policy\b/i);
  const htmlLocation = config.match(/location\s+~\*\s+\\\.html\$\s*\{([\s\S]*?)\}/i)?.[1] ?? '';
  assert.ok(htmlLocation, 'HTML location must exist');
  const directives = htmlLocation.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(directives, /\badd_header\b/i);
});
