import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { KIND, NEVER, PLUGINS_FORM, SUGGEST } from "../src/extensions/ask-user-question.js";
import { agentFiles, loopbackModel, RpcPi } from "./rpc.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop(); });

type Message = Record<string, unknown>;
const isInput = (message: Message): boolean => message["type"] === "extension_ui_request" && message["method"] === "input";
const PACKAGES = ["cx-review-lens", "@comchatx/cx-schedule"];

/** pi's agent directory and tenant for a loopback model that makes `calls`, with this package listed in the tenant. */
async function world(calls: { name: string; arguments: unknown }[]) {
  const home = mkdtempSync(join(tmpdir(), "cx-suggest-"));
  stops.push(() => rmSync(home, { recursive: true, force: true }));
  const agentDir = join(home, "agent");
  const cwd = join(home, "tenant");
  for (const directory of [agentDir, cwd, join(cwd, ".pi")]) mkdirSync(directory, { recursive: true });
  const model = await loopbackModel(calls);
  stops.push(model.close);
  const files = agentFiles(model.url);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [ROOT] }));
  const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"], HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
  const start = (args: readonly string[] = []): RpcPi => { const pi = new RpcPi(PI, args, { cwd, env }); stops.push(() => pi.stop()); return pi; };
  const records = (): Message[] => {
    const sessions = join(agentDir, "sessions");
    const file = readdirSync(sessions, { recursive: true, encoding: "utf8" }).find((name) => name.endsWith(".jsonl"))!;
    return readFileSync(join(sessions, file), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Message)
      .filter((entry) => entry["type"] === "custom_message" && entry["customType"] === KIND);
  };
  return { model, start, records };
}

const nth = (pi: RpcPi, count: number): Promise<Message> => pi.when((message) => isInput(message) && pi.heard.filter(isInput).indexOf(message) === count - 1);

it("in pi's RPC mode a plugin card returns at once, waits as the page's form, and the seller's Install, close, and a card none of whose plugins showed each reach cx as its text", async () => {
  const call = { name: SUGGEST, arguments: { title: "For your listings", packages: PACKAGES } };
  const { model, start, records } = await world([call, call, call]);
  const pi = start();
  const settled = pi.settled();
  expect(await pi.send({ type: "prompt", message: "What would help with my reviews?" })).toMatchObject({ success: true });
  const first = await nth(pi, 1);
  await settled;
  // The turn ended with the card unanswered: the tool's result came back without it.
  const ended = pi.heard.find((message) => message["type"] === "tool_execution_end")!;
  expect(ended).toMatchObject({ toolName: SUGGEST, isError: false });
  expect((ended["result"] as { content: { text: string }[] }).content.map((one) => one.text)).toEqual(["The plugin card was asked for. What the seller does with it, or that none of the plugins could be shown, arrives as a later message."]);
  const form = JSON.parse(String(first["placeholder"])) as { ask: string };
  expect([first["title"], first["timeout"], form]).toEqual(["For your listings", NEVER, { form: PLUGINS_FORM, ask: form.ask, packages: PACKAGES }]);

  // Each answer is handed to cx and starts a turn, in which the model asks the next card.
  pi.write({ type: "extension_ui_response", id: first["id"], value: JSON.stringify({ form: PLUGINS_FORM, added: "@comchatx/cx-schedule" }) });
  const second = await nth(pi, 2);
  expect(model.texts).toContain("The seller chose to install @comchatx/cx-schedule.");
  pi.write({ type: "extension_ui_response", id: second["id"], cancelled: true });
  const third = await nth(pi, 3);
  expect(model.texts).toContain("The seller put the plugin card away without installing any.");
  const last = pi.settled();
  pi.write({ type: "extension_ui_response", id: third["id"], value: JSON.stringify({ form: PLUGINS_FORM, added: null }) });
  await last;
  expect(model.texts.at(-1)).toBe("None of the plugins you named could be shown to the seller.");
  const asks = [first, second, third].map((one) => (JSON.parse(String(one["placeholder"])) as { ask: string }).ask);
  expect(records().map((entry) => entry["details"])).toEqual([
    { form: PLUGINS_FORM, ask: asks[0], title: "For your listings", packages: PACKAGES, added: "@comchatx/cx-schedule" },
    { form: PLUGINS_FORM, ask: asks[1], title: "For your listings", packages: PACKAGES, added: null },
    { form: PLUGINS_FORM, ask: asks[2], title: "For your listings", packages: PACKAGES, added: null },
  ]);
}, 90_000);

it("in pi's RPC mode a plugin card left open is asked again, the same asking, when pi starts on the session again", async () => {
  const { model, start, records } = await world([{ name: SUGGEST, arguments: { title: "For your listings", packages: PACKAGES } }]);
  const first = start();
  const settled = first.settled();
  await first.send({ type: "prompt", message: "What would help with my reviews?" });
  const asked = await first.when(isInput);
  await settled;
  await first.stop();
  const second = start(["--continue"]);
  const again = await second.when(isInput);
  expect([again["title"], again["placeholder"]]).toEqual([asked["title"], asked["placeholder"]]);
  const answered = second.settled();
  second.write({ type: "extension_ui_response", id: again["id"], value: JSON.stringify({ form: PLUGINS_FORM, added: "cx-review-lens" }) });
  await answered;
  expect(model.texts.at(-1)).toBe("The seller chose to install cx-review-lens.");
  expect(records()).toHaveLength(1);
  // The open asking was asked once after the start, not again.
  expect(second.heard.filter(isInput).filter((one) => one["placeholder"] === asked["placeholder"])).toHaveLength(1);
}, 90_000);

it("in pi's RPC mode a fourth name, or a name given twice, is refused by the tool's schema and asks the seller nothing; three names, each once, are asked", async () => {
  const { start } = await world([
    { name: SUGGEST, arguments: { title: "For your listings", packages: [...PACKAGES, "pi-web-access", "billion-context"] } },
    { name: SUGGEST, arguments: { title: "For your listings", packages: ["cx-review-lens", "cx-review-lens"] } },
    { name: SUGGEST, arguments: { title: "For your listings", packages: [...PACKAGES, "pi-web-access"] } },
  ]);
  const pi = start();
  for (const message of ["What would help?", "And now?", "And three?"]) {
    const settled = pi.settled();
    await pi.send({ type: "prompt", message });
    await settled;
  }
  const ended = pi.heard.filter((message) => message["type"] === "tool_execution_end");
  expect(ended.map((one) => [one["toolName"], one["isError"]])).toEqual([[SUGGEST, true], [SUGGEST, true], [SUGGEST, false]]);
  expect(pi.heard.filter(isInput).map((one) => (JSON.parse(String(one["placeholder"])) as { packages: string[] }).packages)).toEqual([[...PACKAGES, "pi-web-access"]]);
}, 90_000);
