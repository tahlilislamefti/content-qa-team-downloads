# Content QA Assistant v2.1.2 — Public Team Install & User Guide

**Download:** [Team ZIP](https://github.com/tahlilislamefti/content-qa-team-downloads/releases/download/v2.1.2-public-team/Content_QA_v2.1.2_TEAM_KIT.zip)

**Release page:** https://github.com/tahlilislamefti/content-qa-team-downloads/releases/tag/v2.1.2-public-team

**IMPORTANT:** Download is public; Google API authorization remains limited to administrator-approved Google OAuth test users. Coworkers must also have access to the underlying Google Docs/Sheets. This is not a Chrome Web Store installation.


**Installation type:** Free, manual installation of the Chrome extension using Load unpacked. **No Chrome Web Store account or fee.**

This package contains the **frozen v2.1.2 code**. It uses one shared Chrome extension ID and the team's Google OAuth Client ID.

**Chrome extension ID:** `hklpmnbndociojhhmdddmhbohoacihac`

## For your coworkers (one-time installation)

1. Download the ZIP directly from the public GitHub Releases page at https://github.com/tahlilislamefti/content-qa-team-downloads/releases/tag/v2.1.2-public-team (no GitHub account required).
2. Right-click the ZIP in Windows and choose **Extract All**. Open the extracted folder. It contains a folder named **Extension**.
3. Move the extracted **Extension** folder to a permanent location such as `Documents/Content_QA_Team`. **Do not delete or move it after installation.**
4. Open Google Chrome and visit `chrome://extensions`.
5. Turn **Developer mode** on (top-right), click **Load unpacked**, and choose the **Extension** folder containing `manifest.json`.
6. Verify that Chrome shows **Universal Content QA Assistant — Team Pilot**, **version 2.1.2**, with extension ID **`hklpmnbndociojhhmdddmhbohoacihac`**. If the ID differs, stop and contact the administrator.
7. Pin it using Chrome's puzzle-piece/extensions menu.
8. Open a Google Doc you have permission to view, click the extension, select your project, and click **Audit Current Document**.
9. On the first Google sign-in, select the account authorized by the team admin and grant the requested read-only Google Docs/Sheets permissions.

**Daily use:** Open Google Doc → click extension → Audit Current Document → review the findings.

## Initial configuration (once per coworker or project)

Click **Manage Projects & Rules**.

- Choose **Add project**, enter your client/project name.
- For a standalone Google Doc, leave Google Sheets URL and tab empty, select the rules, and save.
- For a Google content sheet, enter its URL and exact tab name, click **Detect columns from header**, confirm the columns that contain Google Doc links, then save.
- Use **Export profiles backup** to back up your configuration. You can import a trusted team-shared profiles JSON instead of configuring everything manually.
- The project profiles are stored **locally in your own Chrome profile**. They are not shared automatically.

For a Google Doc containing exactly two readable tabs, the optional **Compare Two Tabs in This Document** action treats tab 1 as source and tab 2 as translation.

## Understanding the report

- **REQUIRED** is a rule-based finding based on the project's configured limits.
- **VERIFY** means an item needs human review; it does not necessarily mean something is wrong.
- Word counts can differ from the Google Docs built-in count.
- Translation word-count comparison does not measure translation quality.
- The extension is read-only and does not edit the source documents.

## If Google sign-in fails

- Ask the administrator to confirm your email is added in **Google Auth Platform → Audience → Test users**, if the app remains External/Testing.
- Ask for access to the actual Google Doc/Sheet in Drive.
- Check that Chrome displays the exact extension ID shown above.
- If Chrome says the extension is blocked by company policy, contact your IT administrator.
- **Do not create your own OAuth client or edit manifest.json.**

## Manual updates

The administrator supplies a new ZIP. Export your profiles, then replace the contents of your existing installed **Extension** folder with the newer ones and click **Reload** at `chrome://extensions`. Keep the same folder location, `manifest.key`, and team OAuth client configuration. Chrome won't automatically update this unpacked extension.

## Security

Only install ZIPs from your team's trusted administrator. Chrome Developer Mode permits locally loaded code; don't install untrusted ZIPs. No API key or ChatGPT login is needed. Avoid sharing Google credentials, access tokens, or restricted content sheet URLs publicly.
