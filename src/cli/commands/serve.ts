import type { Command } from "commander";
import { createAgent } from "../../index.js";
import { createHttpServer } from "../../server/http.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Run a local HTTP server that exposes the link-processing API")
    .option("--host <host>", "bind address", "127.0.0.1")
    .option("--port <port>", "port", "8787")
    .option("--token <token>", "require Authorization: Bearer <token>")
    .option("--allow-non-local", "allow binding non-loopback addresses")
    .option("--config <path>", "config path")
    .action(
      async (opts: {
        host: string;
        port: string;
        token?: string;
        allowNonLocal?: boolean;
        config?: string;
      }) => {
        const token = opts.token ?? process.env.LINK_PROCESSING_SERVE_TOKEN;
        const agent = await createAgent({ configPath: opts.config });

        const server = createHttpServer({
          agent,
          host: opts.host,
          port: Number(opts.port),
          token,
          allowNonLocal: opts.allowNonLocal
        });

        const port = Number(opts.port);
        server.listen(port, opts.host, () => {
          const authNote = token ? " (bearer required)" : "";
          process.stderr.write(
            `link-processing serve listening on http://${opts.host}:${port}${authNote}\n`
          );
        });

        const shutdown = () => {
          process.stderr.write("\nshutting down...\n");
          server.close(() => {
            agent.close().finally(() => process.exit(0));
          });
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      }
    );
}
