// Guard workspace and secret-file conventions before feature development.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
const readJson = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
describe('repository setup', () => {
  it('uses JavaScript workspaces and Node 20', () => {
    const root = readJson('../package.json');
    expect(root.workspaces).toEqual(['client', 'server']);
    expect(root.engines.node).toBe('20.x');
    for (const name of root.workspaces)
      expect(readJson(`../${name}/package.json`).type).toBe('module');
  });
  it('ignores real env files and keeps example files', () => {
    const ignore = readFileSync(
      new URL('../.gitignore', import.meta.url),
      'utf8',
    );
    expect(ignore).toContain('\n.env\n');
    expect(ignore).toContain('!.env.example');
    expect(existsSync(new URL('../.husky/pre-commit', import.meta.url))).toBe(
      true,
    );
  });
});
