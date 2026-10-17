# Little One

A private daily log of a child's health and wellbeing, for two parents on two phones.

- Installable web app: open the site in Safari, then Share → Add to Home Screen.
- Entries are stored on each phone (IndexedDB).
- Optional sync: each phone encrypts its copy with a family passphrase (PBKDF2-SHA-256, AES-GCM) before
  saving it to a **private** GitHub repository chosen at setup. The passphrase is never stored or sent.
- PDF reports are generated on the phone with [jsPDF](https://github.com/parallax/jsPDF) (MIT, see `vendor/`).
- Fonts: Fraunces and DM Sans (SIL Open Font License, see `fonts/`).
- No analytics, trackers or third-party requests. The page's Content-Security-Policy only allows
  connections to this site and `api.github.com`.

This repository contains code only. No personal information is stored here.
