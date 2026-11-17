import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vitest";
import { CONFIRM_FORM, KIND, PROPOSE, formOf, proposalOf } from "../src/extensions/ask-user-question.js";
import { agentFiles, loopbackModel, RpcPi } from "./rpc.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
const RELOAD = join(ROOT, "test", "fixtures", "reload-command.ts");
const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop(); });

type Message = Record<string, unknown>;
const isInput = (message: Message): boolean => message["type"] === "extension_ui_request" && message["method"] === "input";
const inputs = (pi: RpcPi): Message[] => pi.heard.filter(isInput);
const no = JSON.stringify({ form: CONFIRM_FORM, confirmed: false });

/** A pi home of its own, the package listed for its tenant, and a model on loopback. */
async function home(calls: Parameters<typeof loopbackModel>[0], hold?: Parameters<typeof loopbackModel>[1]) {
  const root = mkdtempSync(join(tmpdir(), "cx-ask-life-"));
  stops.push(() => rmSync(root, { recursive: true, force: true }));
  const agentDir = join(root, "agent");
  const cwd = join(root, "tenant");
  for (const directory of [agentDir, cwd, join(cwd, ".pi")]) mkdirSync(directory, { recursive: true });
  const model = await loopbackModel(calls, hold);
  stops.push(model.close);
  const files = agentFiles(model.url);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [ROOT] }));
  const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"], HOME: root, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
  const start = (args: readonly string[] = []): RpcPi => { const pi = new RpcPi(PI, args, { cwd, env }); stops.push(() => pi.stop()); return pi; };
  const sessionFile = (): string => { const sessions = join(agentDir, "sessions"); return join(sessions, readdirSync(sessions, { recursive: true, encoding: "utf8" }).find((name) => name.endsWith(".jsonl"))!); };
  const entries = (): Message[] => readFileSync(sessionFile(), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Message);
  return { model, start, sessionFile, entries };
}

it("hands cx an answer the seller gave while cx worked, when pi was stopped and started again before cx had it, and asks it no more", async () => {
  let release = (): void => {};
  const held = new Promise<void>((done) => { release = done; });
  stops.push(() => release());
  const box = await home([{ name: PROPOSE, arguments: { title: "Export this plan to Excel?" } }], (request) => (request === 2 ? held : undefined));
  const first = box.start();
  expect(await first.send({ type: "prompt", message: "Plan next month's restock." })).toMatchObject({ success: true });
  const asked = await first.when(isInput);
  // cx is still at work on the tool's result when the seller answers No, then presses Stop, and the computer goes off.
  first.write({ type: "extension_ui_response", id: asked["id"], value: no });
  expect(await first.send({ type: "abort" })).toMatchObject({ success: true });
  await first.stop();
  release();
  expect(box.entries().filter((entry) => entry["type"] === "custom_message")).toEqual([]);

  const second = box.start(["--continue"]);
  const settled = second.settled();
  await settled;
  expect(box.model.texts.at(-1)).toBe("The seller answered No to your proposal: Export this plan to Excel?");
  expect(inputs(second)).toEqual([]);
  expect(box.entries().filter((entry) => entry["type"] === "custom_message" && entry["customType"] === KIND)).toHaveLength(1);
}, 60_000);

it("lets an answer to a card pi asked before a reload end quietly, pi still running, and hands cx the answer to the card asked again", async () => {
  const box = await home([{ name: PROPOSE, arguments: { title: "Export this plan to Excel?" } }]);
  const pi = box.start(["--extension", RELOAD]);
  const settled = pi.settled();
  expect(await pi.send({ type: "prompt", message: "Plan next month's restock." })).toMatchObject({ success: true });
  const old = await pi.when(isInput);
  await settled;
  // The steward reloads pi in its process after the seller's plugins change: the card is asked again, and the old dialog stays open.
  await pi.send({ type: "prompt", message: "/reload-now" });
  const again = await pi.when((message) => isInput(message) && message["id"] !== old["id"]);
  expect(JSON.parse(String(again["placeholder"]))).toEqual(JSON.parse(String(old["placeholder"])));
  pi.write({ type: "extension_ui_response", id: old["id"], value: no });
  expect(await pi.send({ type: "get_state" })).toMatchObject({ success: true });
  expect(box.entries().filter((entry) => entry["type"] === "custom_message")).toEqual([]);
  const answered = pi.settled();
  pi.write({ type: "extension_ui_response", id: again["id"], value: JSON.stringify({ form: CONFIRM_FORM, confirmed: true }) });
  await answered;
  expect(box.model.texts.at(-1)).toBe("The seller answered Yes to your proposal: Export this plan to Excel?");
  expect(box.entries().filter((entry) => entry["type"] === "custom_message" && entry["customType"] === KIND)).toHaveLength(1);
}, 60_000);

it("asks again only what the conversation's active branch left open: an abandoned branch's asking and answer are not read", async () => {
  const box = await home([]);
  const first = box.start();
  const settled = first.settled();
  expect(await first.send({ type: "prompt", message: "Hello." })).toMatchObject({ success: true });
  await settled;
  await first.stop();
  const own = proposalOf("tree-own", { title: "Keep this branch's question?" });
  const abandoned = formOf("abandoned", { questions: [{ question: "The abandoned branch's question?", options: [{ label: "x" }] }] });
  const session = SessionManager.open(box.sessionFile());
  const root = session.getLeafId()!;
  const asking = session.appendCustomEntry(KIND, { asked: own });
  session.appendCustomEntry(KIND, { answered: own.ask, value: no });
  session.branch(root);
  session.appendCustomEntry(KIND, { asked: abandoned });
  session.branch(asking);
  session.appendCustomEntry("elsewhere", {});

  const second = box.start(["--continue"]);
  const asked = await second.when(isInput);
  expect(await second.send({ type: "get_state" })).toMatchObject({ success: true });
  expect(inputs(second).map((message) => (JSON.parse(String(message["placeholder"])) as { ask: string }).ask)).toEqual(["tree-own"]);
  expect(asked["title"]).toBe("Keep this branch's question?");
}, 60_000);
