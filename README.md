# Little One

A private daily log of a child's health and wellbeing, for two parents on two phones.

- Installable web app: open the site in Safari, then Share → Add to Home Screen.
- Entries are stored on each phone (IndexedDB).
- Optional sync: each phone encrypts its copy with a family passphrase (PBKDF2-SHA-256, AES-GCM) before
  saving it to a **private** GitHub repository chosen at setup. The passphrase is never stored or sent.
- Optional family members (for example grandparents) can add entries from their own phones without seeing
  the parents' log. Their entries go to a second private repository, reached with a key that can only reach
  that repository. Each family member's entries are locked with their own random key, carried in their code.
  The parents' phones hold those keys inside the parents' locked log and copy the entries in. Nothing from
  the parents' log is ever written to the family repository.
- PDF reports are generated on the phone with [jsPDF](https://github.com/parallax/jsPDF) (MIT, see `vendor/`).
- Fonts: Fraunces and DM Sans (SIL Open Font License, see `fonts/`).
- No analytics, trackers or third-party requests. The page's Content-Security-Policy only allows
  connections to this site and `api.github.com`.

This repository contains code only. No personal information is stored here.
