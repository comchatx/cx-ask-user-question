import { randomUUID } from "node:crypto";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { expect, it } from "vitest";
import { BOUNDS, CONFIRM_FORM, cardOf, NEVER, OPTION_FORM, PARAMETERS, PROPOSE, PROPOSE_BOUNDS, PROPOSE_PARAMETERS, TOOL, answerText, answersOf, confirmedOf, formOf, proposalOf, proposalText, waiting, type Params } from "../src/extensions/ask-user-question.js";

const tool = { name: TOOL, description: "", parameters: PARAMETERS as never };
const valid = (args: unknown): unknown => validateToolArguments(tool, { type: "toolCall", id: "c", name: TOOL, arguments: args as never });
/** The platform's hold: a dialog's body of more than this is not kept for a page that opens later. */
const HELD_BODY_BYTES = 16 * 1024;

it("bounds the form so that the largest one the schema passes, every character at its costliest, fits the platform's hold", () => {
  const costly = (length: number): string => "\u0001".repeat(length);
  const params: Params = { questions: Array.from({ length: BOUNDS.questions }, () => ({ question: costly(BOUNDS.question), multiSelect: true,
    options: Array.from({ length: BOUNDS.options }, () => ({ label: costly(BOUNDS.label), description: costly(BOUNDS.description) })) })) };
  expect(valid(params)).toEqual(params);
  const form = formOf(randomUUID(), params);
  const body = { form: "ui_request", id: randomUUID(), method: "input", title: form.questions[0]!.words, placeholder: JSON.stringify(form), timeout: NEVER };
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(HELD_BODY_BYTES);
});

it("refuses a call past any bound, or with no question or no option", () => {
  const one = { question: "How should this lot ship?", options: [{ label: "By sea" }] };
  for (const args of [{ questions: [] }, { questions: Array.from({ length: BOUNDS.questions + 1 }, () => one) }, { questions: [{ ...one, options: [] }] },
    { questions: [{ ...one, options: Array.from({ length: BOUNDS.options + 1 }, () => ({ label: "x" })) }] }, { questions: [{ ...one, question: "x".repeat(BOUNDS.question + 1) }] },
    { questions: [{ ...one, options: [{ label: "x".repeat(BOUNDS.label + 1) }] }] }, { questions: [{ ...one, options: [{ label: "x", description: "x".repeat(BOUNDS.description + 1) }] }] }]) {
    expect(() => valid(args), JSON.stringify(args).slice(0, 80)).toThrow();
  }
});

it("writes the call as the page's form: a question's words, each option's name and line, several answers where asked", () => {
  expect(formOf("a1", { questions: [{ question: "How?", options: [{ label: "By sea", description: "35 days" }, { label: "By air", description: "" }] }, { question: "Colours?", multiSelect: true, options: [{ label: "Blue" }] }] })).toEqual({
    form: OPTION_FORM, ask: "a1", questions: [{ words: "How?", options: [{ name: "By sea", line: "35 days" }, { name: "By air" }] }, { words: "Colours?", several: true, options: [{ name: "Blue" }] }] });
});

it("reads the page's answers a question each, and a declined card as every question unanswered, and says them to cx", () => {
  const form = formOf("a1", { questions: [{ question: "How?", options: [{ label: "By sea" }] }, { question: "Colours?", multiSelect: true, options: [{ label: "Blue" }, { label: "Grey" }] }, { question: "Where?", options: [{ label: "East" }] }] });
  const answers = answersOf(form, JSON.stringify({ form: OPTION_FORM, answers: [{ chosen: ["By sea"] }, { chosen: ["Blue", "Grey"], own: "green" }, null] }));
  expect(answers).toEqual([{ chosen: ["By sea"] }, { chosen: ["Blue", "Grey"], own: "green" }, null]);
  expect(answerText(form, answers)).toBe("The seller answered your questions:\n- How? → By sea\n- Colours? → Blue; Grey; in their own words: green\n- Where? → (skipped)");
  for (const declined of [undefined, "", "not the form"]) expect(answersOf(form, declined)).toEqual([null, null, null]);
  expect(answerText(form, [null, null, null])).toBe("The seller closed your questions without answering them.");
});

it("finds the askings cx has no answer to, in the order asked: unanswered, or answered with the seller's answer and not yet handed to cx", () => {
  const form = (ask: string) => formOf(ask, { questions: [{ question: "How?", options: [{ label: "By sea" }] }] });
  const entry = (data: unknown) => ({ type: "custom", customType: "cx-ask-user-question", data });
  const handed = (ask: string) => ({ type: "custom_message", customType: "cx-ask-user-question", details: { form: OPTION_FORM, ask } });
  const value = JSON.stringify({ form: OPTION_FORM, answers: [{ chosen: ["By sea"] }] });
  const open = waiting([
    entry({ asked: form("a1") }), { type: "custom", customType: "other", data: { asked: form("x") } }, entry({ asked: form("a2") }), entry({ answered: "a1", value }), handed("a1"),
    entry({ asked: form("a3") }), entry({ answered: "a3", value }), entry({ asked: form("a4") }), entry({ answered: "a4", value: null }),
  ]);
  expect(open.map((one) => [one.asked.ask, one.answered])).toEqual([["a2", undefined], ["a3", { value }], ["a4", { value: undefined }]]);
});

const proposeTool = { name: PROPOSE, description: "", parameters: PROPOSE_PARAMETERS as never };
const validProposal = (args: unknown): unknown => validateToolArguments(proposeTool, { type: "toolCall", id: "c", name: PROPOSE, arguments: args as never });

it("bounds a proposal so that the largest the schema passes, every character at its costliest, fits the platform's hold, and refuses one past a bound", () => {
  const costly = (length: number): string => "\u0001".repeat(length);
  const params = { title: costly(PROPOSE_BOUNDS.title), message: costly(PROPOSE_BOUNDS.message) };
  expect(validProposal(params)).toEqual(params);
  const form = proposalOf(randomUUID(), params);
  const body = { form: "ui_request", id: randomUUID(), method: "input", title: form.title, placeholder: JSON.stringify(form), timeout: NEVER };
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(HELD_BODY_BYTES);
  for (const args of [{}, { title: "" }, { title: "x".repeat(PROPOSE_BOUNDS.title + 1) }, { title: "x", message: "x".repeat(PROPOSE_BOUNDS.message + 1) }]) expect(() => validProposal(args), JSON.stringify(args).slice(0, 60)).toThrow();
});

it("writes a proposal as the page's confirm form, reads the seller's 是 or 否, and says it to cx", () => {
  expect([proposalOf("p1", { title: "Export this plan?", message: "" }), proposalOf("p2", { title: "Export?", message: "One sheet." })]).toEqual([
    { form: CONFIRM_FORM, ask: "p1", title: "Export this plan?" }, { form: CONFIRM_FORM, ask: "p2", title: "Export?", message: "One sheet." }]);
  expect([confirmedOf(JSON.stringify({ form: CONFIRM_FORM, confirmed: true })), confirmedOf(JSON.stringify({ form: CONFIRM_FORM, confirmed: false })), confirmedOf(undefined), confirmedOf("{")]).toEqual([true, false, false, false]);
  const proposal = proposalOf("p1", { title: "Export this plan?" });
  expect([proposalText(proposal, true), proposalText(proposal, false)]).toEqual(["The seller answered Yes to your proposal: Export this plan?", "The seller answered No to your proposal: Export this plan?"]);
  const entry = (data: unknown) => ({ type: "custom", customType: "cx-ask-user-question", data });
  const handed = { type: "custom_message", customType: "cx-ask-user-question", details: { form: OPTION_FORM, ask: "a1" } };
  expect(waiting([entry({ asked: proposal }), entry({ asked: formOf("a1", { questions: [{ question: "How?", options: [{ label: "x" }] }] }) }), entry({ answered: "a1", value: null }), handed])).toEqual([{ asked: proposal }]);
});


it("writes an asking as a board card: its title, asks, level where given, the form as one line of JSON in questions, and the questions and options in words", () => {
  const form = formOf("a1", { questions: [{ question: "How?", options: [{ label: "By sea", description: "35 days" }, { label: "By air" }] }, { question: "Colours?", multiSelect: true, options: [{ label: "Blue" }] }] });
  expect(cardOf(form, 2)).toBe(`---\ntitle: "How?"\nasks: true\nlevel: 2\nquestions: ${JSON.stringify(form)}\n---\n\nHow?\n- By sea: 35 days\n- By air\n\nColours?\n- Blue\n`);
  const proposal = proposalOf("p1", { title: "Export \"this\" plan?", message: "One sheet." });
  expect(cardOf(proposal, undefined)).toBe(`---\ntitle: "Export \\"this\\" plan?"\nasks: true\nquestions: ${JSON.stringify(proposal)}\n---\n\nExport "this" plan?\n\nOne sheet.\n`);
});

it("takes a place of a Markdown file and a level of 1 to 3 on both tools, and refuses any other", () => {
  const one = { question: "How?", options: [{ label: "By sea" }] };
  expect(valid({ questions: [one], place: { file: "/tenant/board/main/待办/a.md", level: 3 } })).toMatchObject({ place: { level: 3 } });
  expect(validProposal({ title: "Export?", place: { file: "a.md" } })).toMatchObject({ place: { file: "a.md" } });
  for (const place of [{}, { file: "a.txt" }, { file: "a.md", level: 4 }, { file: "a.md", level: 0 }, { file: "a.md", other: 1 }]) {
    expect(() => valid({ questions: [one], place }), JSON.stringify(place)).toThrow();
    expect(() => validProposal({ title: "x", place }), JSON.stringify(place)).toThrow();
  }
});

it("tells cx in its skill that place writes the card on the seller's board instead of the chat", async () => {
  const { readFileSync } = await import("node:fs");
  const skill = readFileSync(new URL("../skills/cx-ask-user-question/SKILL.md", import.meta.url), "utf8");
  expect(skill).toContain("`place: { file }` writes the card to that file on the seller's board instead of the chat");
});
