# Gold Shore Exit Plan

This document captures the operational steps required to migrate `goldshore.org` off HostGator and onto GitHub Pages while preserving email delivery through iCloud Mail. Follow each step in sequence and confirm completion before moving forward.

## 1. Confirm Existing Services
- **Domain registrar** – Identify which provider currently holds the `goldshore.org` registration (GoDaddy, Namecheap, HostGator, etc.).
- **DNS host** – Determine whether DNS is presently managed at HostGator or via the registrar's DNS dashboard.
- **Email provider** – Note that iCloud Mail is already configured and active for `@goldshore.org` mailboxes.

## 2. Prepare GitHub Pages
- **Repository** – Ensure the static site lives at [`goldshore/goldshore.github.io`](https://github.com/goldshore/goldshore.github.io).
- **CNAME file** – Confirm the repository contains a `CNAME` file with the single line `goldshore.org`.
- **Pages source** – Use the GitHub Pages build pipeline (recommended via GitHub Actions) so that pushes to `main` trigger deployments.

## 3. Transition DNS
Update records at the target DNS host (Cloudflare recommended, otherwise registrar DNS) with the following entries:

### Web records
| Type | Host | Value |
|------|------|-------|
| A | `goldshore.org` | `185.199.108.153` |
| A | `goldshore.org` | `185.199.109.153` |
| A | `goldshore.org` | `185.199.110.153` |
| A | `goldshore.org` | `185.199.111.153` |
| CNAME | `www.goldshore.org` | `goldshore.github.io` |

### Email records
| Type | Host | Priority | Value |
|------|------|----------|-------|
| MX | `goldshore.org` | 10 | `mx01.mail.icloud.com` |
| MX | `goldshore.org` | 10 | `mx02.mail.icloud.com` |
| TXT | `goldshore.org` | – | `"v=spf1 include:icloud.com ~all"` |
| CNAME | `sig1._domainkey.goldshore.org` | – | `sig1.dkim.mail.icloud.com` |
| TXT | `_dmarc.goldshore.org` | – | `"v=DMARC1; p=none; rua=mailto:dmarc-reports@icloud.com"` |

## 4. Test the Cutover
- **Verify DNS** – Use `dig goldshore.org` or an online DNS checker to confirm records have propagated.
- **Verify site** – Load `https://goldshore.org` and ensure it serves the GitHub Pages content.
- **Verify email** – Send and receive messages using the `@goldshore.org` address via iCloud Mail.

## 5. Decommission HostGator
- **Backup** – Optionally download a final copy of `/public_html/` from the HostGator account.
- **Cancel hosting** – Terminate the HostGator hosting plan once the site and email are confirmed working.
- **Retain domain** – Keep the domain registration active (either transfer to preferred registrar or maintain at HostGator).

## 6. Future-Proofing Recommendations
- **DNS** – Move DNS management to Cloudflare for SSL, subdomain control, and security features.
- **Web hosting** – Continue using GitHub Pages for static content delivery.
- **Backend services** – Provision a VPS only if dynamic capabilities become necessary.
- **Storage** – Store shared assets in iCloud and Google Drive.
- **Automation** – Leverage GitHub Actions for automated builds, deployments, and synchronization tasks.
