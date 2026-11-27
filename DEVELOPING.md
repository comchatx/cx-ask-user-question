# Developing cx-ask-user-question

One extension, `src/extensions/ask-user-question.ts`, registers three tools: `ask_user_question`, `propose` and `suggest_plugins`.

- **`ask_user_question`** takes one to four questions, each with one to four options (a name and an optional line) and an optional `multiSelect`. It writes them as the ComChatX page's option form (`comchatx.options/1`).
- **`propose`** takes one `title`, the yes-or-no question, and an optional `message`, what happens on a yes. It writes them as the page's confirm form (`comchatx.confirm/1`).
- **`suggest_plugins`** takes a `title`, what the seller reads at the card's head, and one to three npm names in `packages`, each once. It writes `{ form: "comchatx.plugins/1", ask, packages }` as the placeholder and the title as the input's title; the page draws each name as its Plugins page does, with its own Install. The value is `{ form, added }`: the name pressed, or `null` where none could be shown; a close is pi's cancelled; any other value reads as `null`. The record's `details` are `{ form, ask, title, packages, added }`. It takes no `place`.
- **Bounds.** The schemas' bounds (`BOUNDS`, `PROPOSE_BOUNDS`, `SUGGEST_BOUNDS`) keep the largest form under the platform's 16 KiB hold for a dialog with every character at its costliest; `test/ask.test.ts` builds those forms and measures them.
- **A value of spaces alone.** A title, question or option name of spaces alone passes the schemas. For `ask_user_question` and `propose` the page's reader (`readOptionForm`, `src/shared/option-form.ts` in the product) then takes the whole form for a plain input and draws it as one; what the seller types there reads as a declined card or a No, and cx can ask again, so the schemas hold no rule for it. A `suggest_plugins` title rides outside the placeholder, so a title of spaces alone still draws the plugin card, under a blank head.
- **The three tools return at once.** Each puts its form in the placeholder of one `ctx.ui.input`, with pi's longest timeout, and does not await it. The result tells cx the card is asked for and that the answer comes later; it does not say the seller sees it.
- **The answer** is the input's value. An option form's is the form's mark and one answer a question (`{ chosen, own? }`, or `null` for a skipped one); a declined card is pi's cancelled, and every question is unanswered. A confirm form's is its mark and `confirmed`; anything else reads as No. The package hands the answer to cx with `pi.sendMessage` (`display: true`, `triggerTurn: true`); the message's `details` are the page's record of the answered card, and that message in the session's record is what says cx has it.
- **The session's own record.** `appendEntry` writes each asking when it is sent, and the seller's answer when it comes, before the answer is handed to cx. On `session_start` the active branch (`getBranch()`) is read: an asking with no answer is asked again under the same `ask`, and an answer whose message to cx is not in the record is handed to cx, not asked again. While cx works, pi holds that message in memory until it takes it, so an answer given then and lost to a restart is handed over at the next start. One case is known and not guarded: an answer given while cx works, then Stop, then a plugin installed or updated before the seller's next message reloads pi in its process, which keeps the queued message while the record does not hold it yet, so the next start hands it over again and cx reads the same answer twice in one request; nothing is lost or asked again.
- **pi's session lifecycle.** At `session_shutdown`, which pi sends before a reload or a session's replacement, the extension stops: an answer to a dialog it asked before then ends there, and the card asked again at the next `session_start` takes it. The page draws one card an asking, the newest dialog for its `ask`.
- **Outside the ComChatX page** each form is a plain input whose placeholder is the JSON.

## Install

```bash
pi install npm:@comchatx/cx-ask-user-question
```

## Develop

```bash
npm ci
npm run typecheck
npm test
```

## Release

A tag `v<version>` on `main`, the version in `package.json`, runs `.github/workflows/release.yml`, which publishes through npm trusted publishing. WRITING-A-PACKAGE.md, "Shipping it", gives the steps before the first release.
