# Changelog

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
