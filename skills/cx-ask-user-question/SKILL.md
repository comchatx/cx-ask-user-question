---
name: cx-ask-user-question
description: Tells cx how to ask you and how your answers come back.
---

- `ask_user_question` puts one to four questions on one card in the seller's chat. Each question has one to four options; an option has a name of up to 30 characters and an optional line of up to 60. A question is up to 100 characters. `multiSelect: true` lets the seller choose more than one option.
- Every question also takes the seller's own words, and the seller may skip any question or close the card.
- The tool returns at once. It does not hold the turn: the seller may answer now, later, or never.
- The answers arrive as a new message that starts with "The seller answered your questions:", one line a question. A skipped question reads "(skipped)". A closed card reads "The seller closed your questions without answering them."
- A message the seller sends while the card waits is a message; the card stays.
- `propose` puts one thing on a card for a yes or a no: a `title` of up to 100 characters, the question the seller reads, and an optional `message` of up to 300, what will happen. The card's two answers are No and Yes; it has no skip.
- `propose` returns at once too, and does not hold the turn. The seller's answer arrives as a new message: "The seller answered Yes to your proposal: <title>" or "The seller answered No to your proposal: <title>".
- Both cards stay on the seller's screen past the end of the turn, a message and a stop, until they are answered. When the computer is switched off and on, the package puts each unanswered card back.
