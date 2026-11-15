/**
 * Production deploy: D1 migrations + `wrangler deploy`, in the right order.
 * Used as the Workers Builds deploy command (`bun run deploy`); also works
 * locally after `wrangler login`.
 *
 * The repo holds no database ID: on the first deploy Wrangler creates the D1
 * database named in `wrangler.jsonc` and links it to the Worker, and later
 * deploys stay linked. Migrations can't create the database, so:
 *  - database exists → migrate, then deploy (new code never sees an old schema);
 *  - first deploy    → deploy (creates the database), then migrate.
 */
import { unstable_readConfig } from 'wrangler';

const BINDING = 'DB';

const config = unstable_readConfig({ config: 'wrangler.jsonc' });
const name = config.d1_databases.find((d) => d.binding === BINDING)?.database_name;
if (!name) throw new Error(`wrangler.jsonc: no D1 binding "${BINDING}" with a database_name`);

/** Runs a command with the terminal attached (Wrangler may ask to confirm locally). */
const run = async (...cmd: string[]) => {
	console.log(`\n$ ${cmd.join(' ')}`);
	const proc = Bun.spawn(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
	const code = await proc.exited;
	if (code !== 0) process.exit(code);
};

const listing = Bun.spawnSync(['wrangler', 'd1', 'list', '--json'], {
	stdout: 'pipe',
	stderr: 'inherit'
});
// Fail on any error (for example missing credentials) rather than guessing.
if (listing.exitCode !== 0) process.exit(listing.exitCode);
const exists = (JSON.parse(listing.stdout.toString()) as { name: string }[]).some(
	(db) => db.name === name
);

const migrate = () => run('wrangler', 'd1', 'migrations', 'apply', BINDING, '--remote');
const deploy = () => run('wrangler', 'deploy');

if (exists) {
	await migrate();
	await deploy();
} else {
	console.log(`D1 database "${name}" doesn't exist yet: deploying first creates it.`);
	await deploy();
	await migrate();
}
