# Changelog

## 0.2.0

- `suggest_plugins` puts one to three plugins, by their npm names, on one card in the seller's chat, under a `title` of up to 100 characters. It sends the page's plugin form (`comchatx.plugins/1`), records the asking and asks it again at `session_start`, and returns at once. The seller's first Install, their close, or a card none of whose plugins could be shown reaches cx as a later message, its `details` the form, the asking, the title, the names and `added`. The skill says so in one sentence. A page that does not read the plugin form shows the asking as a plain input.

## 0.1.4

- The tile's mark on the Plugins page is the signed drawing.

## 0.1.3

- `place: { file, level? }` on `ask_user_question` and `propose` writes the asking as a card to that file on the seller's board instead of the chat, and returns at once with no dialog. The card's front matter is `title`, `asks: true`, `level` where given and `questions`, the form as one line of JSON. Its body is the questions and options in words. The seller answers it in the Inbox (cx-board-tasks 0.3.5), and the answer comes to cx as the seller's message naming the card. Without `place`, both tools are as before. The skill says so in one line.

## 0.1.2

- The card's name is the one signed on 2026-11-17: "Question Cards" on the English page (`comchatx.name`) and 「提问卡」 on the Chinese page (`comchatx.nameZh`).
- `package-lock.json`'s own version, which still read 0.1.0, reads the package's version again.

## 0.1.1

- Nothing in the package changed: this is its first version published from GitHub, under npm's trusted publisher, with provenance.

## 0.1.0

- One tool, `ask_user_question`: questions with options on one card of the ComChatX page, answered later.
- A second tool, `propose`: one thing on the ComChatX page's confirm card for a yes or a no, answered later.
- An answer is recorded when the seller gives it and handed to cx at the next start if cx never got it; a card is asked again only from the conversation's active branch; an answer to a card asked before pi reloaded ends quietly.
