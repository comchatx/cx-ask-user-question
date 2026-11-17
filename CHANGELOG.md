# Changelog

## 0.1.1

- Nothing in the package changed: this is its first version published from GitHub, under npm's trusted publisher, with provenance.

## 0.1.0

- One tool, `ask_user_question`: questions with options on one card of the ComChatX page, answered later.
- A second tool, `propose`: one thing on the ComChatX page's confirm card for a yes or a no, answered later.
- An answer is recorded when the seller gives it and handed to cx at the next start if cx never got it; a card is asked again only from the conversation's active branch; an answer to a card asked before pi reloaded ends quietly.
