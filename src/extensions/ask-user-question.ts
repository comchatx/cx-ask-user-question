import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** The mark of the ComChatX page's option form: the page draws an input whose placeholder carries it as one card. */
export const OPTION_FORM = "comchatx.options/1";
/** The mark of the page's confirm form: one thing proposed, drawn as the yes-or-no card. */
export const CONFIRM_FORM = "comchatx.confirm/1";
export const TOOL = "ask_user_question";
export const PROPOSE = "propose";
/** The kind of this package's entries: an asking sent, an asking answered, and the message that hands the answers to cx. */
export const KIND = "cx-ask-user-question";
/** pi's longest timeout: the page's hold sets no wait of its own on a dialog that carries one, and Node counts it. */
export const NEVER = 2 ** 31 - 1;

/**
 * The bounds on what cx may ask in one call. The platform holds a dialog of up to 16 KiB for a page that opens later, and the form rides
 * in the dialog twice JSON-encoded; with every character at its costliest (a control character, seven bytes there) the largest form these
 * allow is under that, so no form the schema passes is dropped.
 */
export const BOUNDS = { questions: 4, options: 4, question: 100, label: 30, description: 60 } as const;
/** The bounds on one proposal, held to the same hold. */
export const PROPOSE_BOUNDS = { title: 100, message: 300 } as const;

/** Where cx puts the asking instead of the chat: a card's file on the seller's board, and how urgent the card is. */
export const PLACE = {
  type: "object",
  additionalProperties: false,
  required: ["file"],
  properties: {
    file: { type: "string", minLength: 4, pattern: "\\.md$", description: "The card's file on the seller's board, as /tenant/board/<board>/<tab>/<name>.md." },
    level: { type: "integer", enum: [1, 2, 3], description: "How urgent the card is: 1 routine, 2 urgent, 3 very urgent." },
  },
  description: "Write the asking as a card to this file on the seller's board instead of the chat.",
} as const;

export const PROPOSE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: PROPOSE_BOUNDS.title, description: "The one thing proposed, as a yes-or-no question the seller reads." },
    message: { type: "string", maxLength: PROPOSE_BOUNDS.message, description: "What will happen on a yes, under the question." },
    place: PLACE,
  },
} as const;

export const PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array", minItems: 1, maxItems: BOUNDS.questions,
      description: "The questions, shown together on one card, one at a time.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options"],
        properties: {
          question: { type: "string", minLength: 1, maxLength: BOUNDS.question, description: "The question, as the seller reads it." },
          options: {
            type: "array", minItems: 1, maxItems: BOUNDS.options,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label"],
              properties: {
                label: { type: "string", minLength: 1, maxLength: BOUNDS.label, description: "The option's name." },
                description: { type: "string", maxLength: BOUNDS.description, description: "One line under the name: what choosing it means." },
              },
            },
          },
          multiSelect: { type: "boolean", description: "True when the seller may choose more than one option." },
        },
      },
    },
    place: PLACE,
  },
} as const;

export type Place = { readonly file: string; readonly level?: 1 | 2 | 3 };
export type Params = { readonly place?: Place; readonly questions: readonly { readonly question: string; readonly options: readonly { readonly label: string; readonly description?: string }[]; readonly multiSelect?: boolean }[] };
type Choice = { readonly name: string; readonly line?: string };
export type Form = { readonly form: typeof OPTION_FORM; readonly ask: string; readonly questions: readonly { readonly words: string; readonly options: readonly Choice[]; readonly several?: true }[] };
export type Answer = { readonly chosen: readonly string[]; readonly own?: string } | null;
export type ProposeParams = { readonly title: string; readonly message?: string; readonly place?: Place };
export type Proposal = { readonly form: typeof CONFIRM_FORM; readonly ask: string; readonly title: string; readonly message?: string };
/** Either form this package asks: what is recorded, and asked again, under its `ask`. */
export type Asked = Form | Proposal;

export const proposalOf = (ask: string, params: ProposeParams): Proposal =>
  ({ form: CONFIRM_FORM, ask, title: params.title, ...(params.message === undefined || params.message === "" ? {} : { message: params.message }) });

/** The seller's 是 or 否, as the page sends it; anything else reads as pi reads a closed confirm, a no. */
export function confirmedOf(value: string | undefined): boolean {
  let read: unknown;
  try { read = value === undefined ? undefined : JSON.parse(value); } catch { read = undefined; }
  return typeof read === "object" && read !== null && (read as { form?: unknown }).form === CONFIRM_FORM && (read as { confirmed?: unknown }).confirmed === true;
}

/** What cx reads of a proposal answered. */
export const proposalText = (proposal: Proposal, confirmed: boolean): string => `The seller answered ${confirmed ? "Yes" : "No"} to your proposal: ${proposal.title}`;

export function formOf(ask: string, params: Params): Form {
  return {
    form: OPTION_FORM, ask,
    questions: params.questions.map((one) => ({
      words: one.question,
      options: one.options.map((option) => (option.description === undefined || option.description === "" ? { name: option.label } : { name: option.label, line: option.description })),
      ...(one.multiSelect === true ? { several: true as const } : {}),
    })),
  };
}

/** The answers the page sent, one a question, or every question unanswered where the seller declined the card. */
export function answersOf(form: Form, value: string | undefined): readonly Answer[] {
  let read: unknown;
  try { read = value === undefined ? undefined : JSON.parse(value); } catch { read = undefined; }
  const answers = typeof read === "object" && read !== null && (read as { form?: unknown }).form === OPTION_FORM ? (read as { answers?: unknown }).answers : undefined;
  return form.questions.map((_, at) => {
    const one: unknown = Array.isArray(answers) ? answers[at] : null;
    if (typeof one !== "object" || one === null) return null;
    const chosen = (one as { chosen?: unknown }).chosen;
    const own = (one as { own?: unknown }).own;
    return { chosen: Array.isArray(chosen) ? chosen.filter((name): name is string => typeof name === "string") : [], ...(typeof own === "string" && own !== "" ? { own } : {}) };
  });
}

/** What cx reads: each question and the seller's answer to it. */
export function answerText(form: Form, answers: readonly Answer[]): string {
  if (answers.every((one) => one === null)) return "The seller closed your questions without answering them.";
  return ["The seller answered your questions:", ...form.questions.map((question, at) => {
    const answer = answers[at] ?? null;
    const said = answer === null ? "(skipped)" : [...answer.chosen, ...(answer.own === undefined ? [] : [`in their own words: ${answer.own}`])].join("; ");
    return `- ${question.words} → ${said}`;
  })].join("\n");
}

/**
 * The asking as a card of the seller's board: its title, `asks`, the form as one line of JSON in `questions`, `level` where cx gave one, and
 * the questions and options in words, for a reader that does not draw the form.
 */
export function cardOf(form: Asked, level: Place["level"]): string {
  const title = form.form === CONFIRM_FORM ? form.title : form.questions[0]!.words;
  const words = form.form === CONFIRM_FORM ? [form.title, ...(form.message === undefined ? [] : [form.message])]
    : form.questions.map((question) => [question.words, ...question.options.map((option) => `- ${option.name}${option.line === undefined ? "" : `: ${option.line}`}`)].join("\n"));
  return ["---", `title: ${JSON.stringify(title)}`, "asks: true", ...(level === undefined ? [] : [`level: ${level}`]), `questions: ${JSON.stringify(form)}`, "---", "", words.join("\n\n"), ""].join("\n");
}

/** Writes the card to its file, the directories to it made. Nothing waits on the seller, and nothing is recorded to ask again. */
async function place(form: Asked, where: Place, cwd: string): Promise<string> {
  const file = resolve(cwd, where.file);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, cardOf(form, where.level));
  return file;
}
const placed = (file: string): string => `The card is in the seller's Inbox at ${file}. Their answer will arrive as a later message naming the card.`;

type Entry = { readonly type: string; readonly customType?: string; readonly data?: unknown; readonly details?: unknown };
/** An asking cx does not have the answer to: unanswered, or answered with a value the seller gave that never reached cx. */
export type Waiting = { readonly asked: Asked; readonly answered?: { readonly value: string | undefined } };
/**
 * The askings of the conversation's branch that cx has no answer to, in the order asked. An asking is done when the message that hands
 * its answer to cx is in the record; the answer the seller gave is recorded first, so one that never reached cx is handed over, not asked again.
 */
export function waiting(entries: readonly Entry[]): readonly Waiting[] {
  const open = new Map<string, Waiting>();
  for (const entry of entries) {
    if (entry.customType !== KIND) continue;
    if (entry.type === "custom_message") { const ask = (entry.details as { ask?: unknown } | undefined)?.ask; if (typeof ask === "string") open.delete(ask); continue; }
    if (entry.type !== "custom") continue;
    const data = entry.data as { asked?: Asked; answered?: string; value?: string | null } | undefined;
    if (data?.asked !== undefined) open.set(data.asked.ask, { asked: data.asked });
    const was = data?.answered === undefined ? undefined : open.get(data.answered);
    if (was !== undefined) open.set(was.asked.ask, { asked: was.asked, answered: { value: data?.value ?? undefined } });
  }
  return [...open.values()];
}

export default function askUserQuestion(pi: ExtensionAPI): void {
  // pi ends this runtime on a reload and on a session's replacement; an answer to a dialog it asked then is the old session's, and ends here.
  let live = true;
  pi.on("session_shutdown", () => { live = false; });
  /** Hands the seller's answer to cx as a message, its `details` the page's record of the answered card. */
  const handOver = (form: Asked, value: string | undefined): void => {
    if (form.form === CONFIRM_FORM) {
      const confirmed = confirmedOf(value);
      pi.sendMessage({ customType: KIND, content: proposalText(form, confirmed), display: true, details: { form: CONFIRM_FORM, ask: form.ask, title: form.title, confirmed } }, { triggerTurn: true });
      return;
    }
    const answers = answersOf(form, value);
    pi.sendMessage({
      customType: KIND, content: answerText(form, answers), display: true,
      details: { form: OPTION_FORM, ask: form.ask, questions: form.questions.map(({ words }) => ({ words })), answers },
    }, { triggerTurn: true });
  };
  /** Puts the form in front of the seller and, whenever they answer, records the answer and hands it to cx. Nothing waits on it. */
  const ask = (form: Asked, ctx: ExtensionContext): void => {
    const title = form.form === CONFIRM_FORM ? form.title : form.questions[0]!.words;
    void ctx.ui.input(title, JSON.stringify(form), { timeout: NEVER }).then((value) => {
      if (!live) return;
      pi.appendEntry(KIND, { answered: form.ask, value: value ?? null });
      handOver(form, value);
    });
  };
  // The computer was switched off, or pi restarted, with an asking open: a card unanswered is asked again, as the same asking, and an
  // answer the seller gave that cx never got is handed to cx.
  pi.on("session_start", (_event, ctx) => {
    for (const one of waiting(ctx.sessionManager.getBranch() as readonly Entry[])) {
      if (one.answered === undefined) ask(one.asked, ctx); else handOver(one.asked, one.answered.value);
    }
  });
  pi.registerTool({
    name: TOOL,
    label: "Ask the seller",
    description: "Put one to four questions with options in front of the seller on one card. Returns at once; the answers arrive later as a message.",
    promptSnippet: "Ask the seller one to four questions with options, answered later",
    parameters: PARAMETERS as never,
    async execute(_call, params, _signal, _update, ctx) {
      const form = formOf(randomUUID(), params as Params);
      const where = (params as Params).place;
      if (where !== undefined) { const file = await place(form, where, ctx.cwd); return { content: [{ type: "text", text: placed(file) }], details: { ask: form.ask, file } }; }
      pi.appendEntry(KIND, { asked: form });
      ask(form, ctx);
      return { content: [{ type: "text", text: "The card with these questions is asked of the seller. Their answers will arrive as a later message." }], details: { ask: form.ask } };
    },
  });
  pi.registerTool({
    name: PROPOSE,
    label: "Propose to the seller",
    description: "Put one thing in front of the seller for a yes or a no, on one card. Returns at once; the seller's Yes or No arrives later as a message.",
    promptSnippet: "Propose one thing to the seller for a yes or a no, answered later",
    parameters: PROPOSE_PARAMETERS as never,
    async execute(_call, params, _signal, _update, ctx) {
      const form = proposalOf(randomUUID(), params as ProposeParams);
      const where = (params as ProposeParams).place;
      if (where !== undefined) { const file = await place(form, where, ctx.cwd); return { content: [{ type: "text", text: placed(file) }], details: { ask: form.ask, file } }; }
      pi.appendEntry(KIND, { asked: form });
      ask(form, ctx);
      return { content: [{ type: "text", text: "The proposal is asked of the seller as a yes-or-no card. Their Yes or No will arrive as a later message." }], details: { ask: form.ask } };
    },
  });
}
