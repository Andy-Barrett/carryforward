# Private Wi-Fi phone trial

Andy authorized a private Wi-Fi HTTPS test on October 31, 2026. This is a paired development endpoint, not a public deployment or production authentication system. No router forwarding, tunnel, firewall change or system trust installation is performed by the preparation script. The owner subsequently confirmed local record/stop/play and one bounded live voice cycle on iPhone; see [live voice](LIVE_VOICE.md) for precise scope. Broader phone acceptance remains pending.

## Prepare

Use Node 24 and an existing OpenSSL installation. On the Mac, find the private IPv4 address of its trusted Wi-Fi interface. Both devices must be on that network.

```
node scripts/prepare-phone-https.mjs PRIVATE_IPV4 UNIQUE_TRIAL_NAME
```

This creates an ignored `.local/phone-https/UNIQUE_TRIAL_NAME/` folder. It refuses to overwrite an existing trial. The CA and server certificate expire after three days; the leaf certificate applies only to the supplied IP. Private keys and pairing code stay on the Mac. Transfer only `CarryForward-Phone-Trial.cer` to the owner's iPhone using AirDrop. Do not send `.key` files, the database or the trial folder.

The owner installs the certificate profile and explicitly enables its trust using Apple's documented iPhone process. Never bypass a Safari certificate warning. Trusting this CA allows certificates signed with its private key to authenticate TLS; remove the temporary profile when testing ends. The preparation script does not enable that trust on either device.

## Start

Set the following environment variables, with paths under the prepared trial directory, then run `node server.mjs`:

- `PORT=4316`
- `CARRYFORWARD_PHONE_HTTPS=1`
- `CARRYFORWARD_PHONE_HOST=PRIVATE_IPV4`
- `CARRYFORWARD_PHONE_KEY=.../server.key`
- `CARRYFORWARD_PHONE_CERT=.../server.pem`
- `CARRYFORWARD_PHONE_CODE=.../pairing-code.txt`
- `CARRYFORWARD_OPERATIONS_DB=.../operations.sqlite`
- `CARRYFORWARD_META_ENABLED=0`

The server binds only that private IPv4 interface. It checks the exact Host and HTTPS Origin, blocks shell/assets/APIs before pairing, limits incorrect pairing attempts and issues an HttpOnly/Secure/SameSite=Strict session cookie after the owner enters the code. Restarting the server invalidates pairing. The pairing code is not placed in a URL or printed by either script. Keep its local text file private. Authenticated Operations calls still require their existing intent and session checks.

Open `https://PRIVATE_IPV4:4316/` in Safari and enter the pairing code from the Mac. Use only the fictional work order and new synthetic narration/photos. Microphone permission remains a separate user action. Inference and transcription are deliberately disabled for this capture-only trial. This mode refuses an inference-enabled configuration or a missing explicit database path.

The browser's origin includes the IP and port: changing either creates separate browser storage. A cached shell may reopen offline, but a server restart still requires re-pairing for network operations. This is not multi-user authorization or a persistent deployed service.

## October 31 preparation evidence

The first trial used port 4316. Real TLS requests verified the generated CA and intended certificate IP. Unpaired config returned 401, successful pairing returned 303, the paired app returned 200, an unrelated HTTP Host returned 421 and config reported inference/transcription disabled. The local receipt is ignored with the trial files. These are Mac-to-server checks, not iPhone validation.

All 83 Node 24 tests passed, including access restrictions, pairing origin checks, secure cookie flags, malformed/oversized input and rate limiting. No provider calls occurred. iPhone Mirroring timed out and Apple's device tool failed to initialize; actual phone OS/browser details, trust installation, microphone, camera, interruption and offline outcomes are still unrecorded. Follow `PHONE_VALIDATION.md` after the owner completes access.
