# Veil: private by default, smart by cloud

**Live app:** https://luongs3.github.io/veil/ (Chrome 138+ desktop; Gemini Nano downloads on first click)

Doctors, lawyers and HR teams want the reasoning of a frontier cloud model, but they can't paste a patient chart, a tenant's case file or a harassment complaint into one. Veil splits the job with **Firebase AI Logic hybrid inference**:

| stage | where | model | sees |
|---|---|---|---|
| 1. Find personal data | **on device** | Gemini Nano (Chrome Prompt API) via `InferenceMode.ONLY_ON_DEVICE`, JSON-schema constrained | raw text |
| 2. Do the heavy work (referral letter, demand letter, investigation plan) | **cloud** | `gemini-3.8-flash` via `InferenceMode.ONLY_IN_CLOUD` | placeholders only (`[PERSON_3]`, `[ID_2]`) |
| 3. Put the real values back | **on device** | deterministic vault in the tab | cloud answer + local vault |
| helper: note title | **hybrid** | `InferenceMode.PREFER_ON_DEVICE` → cloud fallback | redacted text only |

The routing is the product. Raw text is only ever passed to the ONLY_ON_DEVICE model. The cloud model gets text that has already passed a **leak guard**, which cancels the cloud call if any vault value survived redaction. Every log line shows the SDK's own `inferenceSource` (`on_device` / `in_cloud`), so you can check where each call ran instead of trusting us.

## A real run (from the live app, clinic sample)
```
Gemini Nano found 12 entities on-device in 14441 ms [on_device]
Vault holds 12 values in this tab only; leak check passed
gemini-3.8-flash answered in 45156 ms [in_cloud]
Re-hydrated locally — real values never left the device
Title via on_device in 2295 ms: "Patient [PERSON_3]: Chest Tightness, [DATE_2] Visit Summary"
```
The cloud received `Patient [PERSON_3] (DOB [DATE_1], [ID_2]) … Lives at [ADDRESS_1], [LOCATION_1] with her son [PERSON_2]` and returned a full cardiology referral letter. The browser then filled the names back in.

## Defense in depth
1. **Deterministic shield** (`src/redact.js`): regex rules for emails, phone numbers, SSNs, cards, IBANs, MRN/policy/case IDs and dates. These always run, even without Nano.
2. **Gemini Nano NER**: catches what regex can't (names, street addresses, organizations, cities). Output is constrained with `responseConstraint` (JSON schema) through `onDeviceParams.promptOptions`.
3. **Leak guard**: a case-insensitive scan of the outbound prompt for every vault value. Any hit means no cloud call.
4. **Graceful degradation**: in a browser without on-device AI, stage 1 falls back to the deterministic shield. Raw text still never goes to the cloud.

## Firebase usage
- `firebase/ai`: `getAI(app, { backend: new GoogleAIBackend() })`, three `getGenerativeModel` instances, one per `InferenceMode`, and `initializeDeviceModel()` for the Nano download progress (`src/main.js`)
- `firebase/app-check`: reCAPTCHA Enterprise provider; App Check is **enforced** on AI Logic
- AI monitoring is enabled in the Firebase console

## Run locally
```bash
npm install
echo "VITE_FIREBASE_API_KEY=<your web api key>" > .env   # from your Firebase web app config
# edit src/config.js with your project ids + reCAPTCHA Enterprise site key
npm run dev        # dev mode uses an App Check debug token (register it in the console)
```
To deploy: `./deploy.sh` (GitHub Pages).

Chrome on-device AI needs desktop Chrome 138+ with ~22 GB free disk. The app's "Download Gemini Nano" button triggers the download with a user gesture.

## Who it's for
Small clinics, legal-aid desks and HR teams that have no budget for a private LLM deployment but still have a duty of confidentiality. Veil adds no server, so there is no new data processor holding their data.

## License
Apache-2.0
