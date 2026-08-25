import { Command } from 'commander';
import { TgoClient } from '../client.js';
import { loadConfig, resolveOutput, resolveServer, updateConfig } from '../config.js';
import { printError, printResult } from '../output.js';

export function registerAuthCommands(parent: Command): void {
  const auth = parent.command('auth').description('Authentication commands');

  auth
    .command('login')
    .description('Login and save token')
    .requiredOption('-u, --user <username>', 'Username or email')
    .requiredOption('-p, --pass <password>', 'Password')
    .action(async (opts, cmd) => {
      const globals = cmd.parent!.parent!.opts();
      const format = resolveOutput(globals.output);
      try {
        const server = resolveServer(globals.server);
        if (!server) {
          throw new Error('Server URL required. Use --server or TGO_SERVER env var.');
        }
        const client = new TgoClient({ server });
        const result = await client.postForm<{
          access_token: string;
          token_type: string;
          staff: Record<string, unknown>;
        }>('/v1/staff/login', {
          username: opts.user,
          password: opts.pass,
          grant_type: 'password',
        });

        updateConfig({ server, token: result.access_token });
        printResult({
          success: true,
          message: 'Logged in successfully',
          staff: result.staff,
        }, format);
      } catch (err) {
        printError(err, format);
      }
    });

  auth
    .command('logout')
    .description('Clear saved token')
    .action((_opts, cmd) => {
      const globals = cmd.parent!.parent!.opts();
      const format = resolveOutput(globals.output);
      updateConfig({ token: undefined });
      printResult({ success: true, message: 'Logged out' }, format);
    });

  auth
    .command('whoami')
    .description('Show current login info')
    .action(async (_opts, cmd) => {
      const globals = cmd.parent!.parent!.opts();
      const format = resolveOutput(globals.output);
      try {
        const client = new TgoClient({
          server: resolveServer(globals.server),
          token: globals.token,
        });
        const result = await client.get('/v1/staff/me');
        printResult(result, format);
      } catch (err) {
        printError(err, format);
      }
    });
}

// For MCP: standalone action functions
export async function authLogin(server: string, username: string, password: string): Promise<unknown> {
  const client = new TgoClient({ server });
  const result = await client.postForm<{
    access_token: string;
    token_type: string;
    staff: Record<string, unknown>;
  }>('/v1/staff/login', {
    username,
    password,
    grant_type: 'password',
  });
  updateConfig({ server, token: result.access_token });
  return { success: true, message: 'Logged in successfully', staff: result.staff };
}

export async function authWhoami(clientOpts?: { server?: string; token?: string }): Promise<unknown> {
  const client = new TgoClient(clientOpts);
  return client.get('/v1/staff/me');
}

export function authLogout(): unknown {
  updateConfig({ token: undefined });
  return { success: true, message: 'Logged out' };
}
