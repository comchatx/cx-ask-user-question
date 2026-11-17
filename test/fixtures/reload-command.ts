import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The steward's reload, as a command: pi reads its packages again in the same process, as it does after a seller's plugins change. */
export default function reloadCommand(pi: ExtensionAPI): void {
  pi.registerCommand("reload-now", { description: "Reload", handler: async (_args, ctx) => { await ctx.reload(); } });
}
