import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { CONFIRM_FORM, KIND, NEVER, OPTION_FORM, PROPOSE, TOOL } from "../src/extensions/ask-user-question.js";
import { agentFiles, loopbackModel, RpcPi } from "./rpc.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
const stops: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop(); });

type Message = Record<string, unknown>;
const isInput = (message: Message): boolean => message["type"] === "extension_ui_request" && message["method"] === "input";

it("in pi's RPC mode the tool returns at once, the form waits with pi's longest timeout, and the answer, given after the computer was switched off and on, reaches the session and starts a turn", async () => {
  const home = mkdtempSync(join(tmpdir(), "cx-ask-"));
  stops.push(() => rmSync(home, { recursive: true, force: true }));
  const agentDir = join(home, "agent");
  const cwd = join(home, "tenant");
  for (const directory of [agentDir, cwd, join(cwd, ".pi")]) mkdirSync(directory, { recursive: true });
  const model = await loopbackModel([{ name: TOOL, arguments: { questions: [{ question: "How should this lot ship?", options: [{ label: "By sea", description: "About 35 days" }, { label: "By air" }] }] } }]);
  stops.push(model.close);
  const files = agentFiles(model.url);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [ROOT] }));
  const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"], HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };

  const first = new RpcPi(PI, [], { cwd, env });
  stops.push(() => first.stop());
  const settled = first.settled();
  expect(await first.send({ type: "prompt", message: "Plan next month's restock." })).toMatchObject({ success: true });
  const asked = await first.when(isInput);
  await settled;
  // The turn ended with the form unanswered: the tool's result came back without it.
  const ended = first.heard.find((message) => message["type"] === "tool_execution_end")!;
  expect(first.heard.indexOf(ended)).toBeGreaterThan(first.heard.indexOf(asked));
  expect(ended).toMatchObject({ toolName: TOOL, isError: false });
  expect(JSON.stringify(ended["result"])).toContain("Their answers will arrive as a later message.");
  const form = JSON.parse(String(asked["placeholder"])) as { form: string; ask: string };
  expect([asked["title"], asked["timeout"], form.form]).toEqual(["How should this lot ship?", NEVER, OPTION_FORM]);
  expect(model.texts).toHaveLength(2);

  // The computer is switched off and on: pi starts on the same session and asks the same asking again.
  await first.stop();
  const second = new RpcPi(PI, ["--continue"], { cwd, env });
  stops.push(() => second.stop());
  const again = await second.when(isInput);
  expect(JSON.parse(String(again["placeholder"]))).toEqual(form);
  const answered = second.settled();
  second.write({ type: "extension_ui_response", id: again["id"], value: JSON.stringify({ form: OPTION_FORM, answers: [{ chosen: ["By air"], own: "200 first" }] }) });
  await answered;
  expect(model.texts.at(-1)).toBe("The seller answered your questions:\n- How should this lot ship? → By air; in their own words: 200 first");
  const sessions = join(agentDir, "sessions");
  const file = readdirSync(sessions, { recursive: true, encoding: "utf8" }).find((name) => name.endsWith(".jsonl"))!;
  const entries = readFileSync(join(sessions, file), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Message);
  expect(entries.find((entry) => entry["type"] === "custom_message" && entry["customType"] === KIND)).toMatchObject({ display: true,
    details: { form: OPTION_FORM, ask: form.ask, questions: [{ words: "How should this lot ship?" }], answers: [{ chosen: ["By air"], own: "200 first" }] } });
}, 60_000);

it("in pi's RPC mode a proposal returns at once, waits with pi's longest timeout as the confirm form, and the seller's No reaches the session as the seller's", async () => {
  const home = mkdtempSync(join(tmpdir(), "cx-propose-"));
  stops.push(() => rmSync(home, { recursive: true, force: true }));
  const agentDir = join(home, "agent");
  const cwd = join(home, "tenant");
  for (const directory of [agentDir, cwd, join(cwd, ".pi")]) mkdirSync(directory, { recursive: true });
  const model = await loopbackModel([{ name: PROPOSE, arguments: { title: "Export this plan to Excel?", message: "One sheet, 12 rows." } }]);
  stops.push(model.close);
  const files = agentFiles(model.url);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [ROOT] }));
  const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"], HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };

  const pi = new RpcPi(PI, [], { cwd, env });
  stops.push(() => pi.stop());
  const settled = pi.settled();
  expect(await pi.send({ type: "prompt", message: "Plan next month's restock." })).toMatchObject({ success: true });
  const asked = await pi.when(isInput);
  await settled;
  expect(pi.heard.find((message) => message["type"] === "tool_execution_end")).toMatchObject({ toolName: PROPOSE, isError: false });
  const form = JSON.parse(String(asked["placeholder"])) as { form: string; ask: string };
  expect([asked["title"], asked["timeout"], form]).toEqual(["Export this plan to Excel?", NEVER, { form: CONFIRM_FORM, ask: form.ask, title: "Export this plan to Excel?", message: "One sheet, 12 rows." }]);
  const answered = pi.settled();
  pi.write({ type: "extension_ui_response", id: asked["id"], value: JSON.stringify({ form: CONFIRM_FORM, confirmed: false }) });
  await answered;
  expect(model.texts.at(-1)).toBe("The seller answered No to your proposal: Export this plan to Excel?");
  const sessions = join(agentDir, "sessions");
  const file = readdirSync(sessions, { recursive: true, encoding: "utf8" }).find((name) => name.endsWith(".jsonl"))!;
  const entries = readFileSync(join(sessions, file), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Message);
  expect(entries.find((entry) => entry["type"] === "custom_message" && entry["customType"] === KIND)).toMatchObject({ display: true,
    details: { form: CONFIRM_FORM, ask: form.ask, title: "Export this plan to Excel?", confirmed: false } });
}, 60_000);

