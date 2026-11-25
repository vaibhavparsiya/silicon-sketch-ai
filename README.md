# Silicon Sketch AI

**PromptWars × AI Vibeathon 2026 · Open Innovation**

Turn a hardware requirement into a circuit you can question. Write a prompt, inspect the compiler’s interpretation, change an input, and check the result against a truth table, a clock trace, or a Verilog simulation.

[Open Silicon Sketch AI](https://silicon-sketch-vaibhav.dapperroot2048.chatgpt.site/) · [Sequence Lab](https://silicon-sketch-vaibhav.dapperroot2048.chatgpt.site/sequence) · [RTL & GDSII Lab](https://silicon-sketch-vaibhav.dapperroot2048.chatgpt.site/rtl)

## Problem and prompt design

A vague specification can produce plausible hardware with the wrong interface or timing. Silicon Sketch makes the prompt testable. The interpreter asks for clarification when necessary. Each lab constrains the response schema, validates inputs and output artifacts, and gives the designer a way to check behavior. During RTL repair the model receives the original specification, the proposed Verilog and the Yosys diagnostic.

| Try this prompt | What to inspect |
| --- | --- |
| **At least two inputs are high** | Set ABC to 101. Y should be 1. Force A stuck at 0. The healthy circuit and the faulty circuit disagree on 101 and 110. |
| **Detect 101 in 10101 with overlap** | The detector pulses at clocks 3 and 5. Change **After a match** to **Start fresh** and replay. Only clock 3 pulses. |
| **Make an 8-bit ALU** | Open the sample vectors in RTL Lab. Compare observed outputs and flags with the expected values. |
| **Create a combinational five-bit rotate-left-by-two module. Name the unsigned input a and the output y. Wrap discarded bits to the low end.** | With AI configured, inspect both port widths and probe a=17 (10001). The expected output is 6 (00110). The test suite independently checks all 32 input values with actual Yosys synthesis. |

The first three examples work with the deterministic compiler. **Interpret with AI** sends a free-form request or sketch to the configured provider. Provider errors and invalid responses are surfaced in the lab. A submitted request may also return a clarification question.

## How the labs work

- **Logic Lab** compiles three-input Boolean functions to an eight-bit mask. The minimizer enumerates 27 ternary cubes and computes a minimum cover, breaking ties on literal count. Truth-table edits update the schematic, waveform, fault diagnosis, RTL and self-checking testbench.
- **Sequence Lab** builds prefix-matching state machines for one to eight bits and replays up to 96 clock edges. Its exported testbench checks against an independent substring oracle.
- **RTL Lab** synthesizes edited Verilog in a dedicated Yosys WebAssembly worker. It includes six pre-synthesized examples, net probes, example vectors, fault hunts, sampled VCD, equivalence checks, and GDSII export. Each compiler job has a 20-second deadline. The simulator models two-state logic, supported flip-flops and buses up to 32 bits. Physical placement and timing are educational estimates. Fabrication signoff requires a PDK and a physical-design flow.

## Architecture

~~~mermaid
flowchart TD
  Form["Prompt or sketch"] --> API["Same-origin Worker or Node API"]
  API --> Fast["Shared Boolean and sequence engines"]
  API --> Model["Gemini / Gemma or Groq"]
  Model --> Schema["Validate typed design"]
  Fast --> Schema
  Schema --> Lab["Interactive lab"]
  Lab --> Yosys["Browser Yosys worker"]
  Yosys --> Sim["Gate simulator and exports"]
  Lab --> Share["Snapshot / fault hunt"]
  Share --> Store["R2 or Node file storage"]
~~~

The shared engines live in shared/. The API router, transport limits, model provider, compiler and storage handlers live in worker/. The browser uses small lab components under src/components/ and a same-origin API client under src/api/. The original public page and module entry points are preserved. The esbuild pipeline bundles the same application for both server runtimes.

## API reference

JSON writes require an Origin matching the request URL and a Content-Type of application/json. The health endpoint exposes only the configured provider name and a boolean. Provider availability is checked by an actual generation request.

| Method and path | Input | Result |
| --- | --- | --- |
| POST /api/interpret | prompt, optional preferred_mode, force_ai and JPEG data URL in image | Validated logic, sequence or universal RTL design, compiler source and lab artifacts |
| POST /api/repair | prompt, verilog and yosys_error | Validated replacement RTL and testbench |
| POST /api/validate | A logic, sequence or RTL design | Normalized design and derived lab artifacts |
| POST /api/designs | A design with its current probe or trace state | HTTP 201 with a content-addressed snapshot ID |
| GET /api/designs/:id | ID from the share link | Saved snapshot or HTTP 404 |
| GET /api/ai-health | No body | configured and provider |
| POST /api/fault-analyze | design and fault containing node and stuck_at | Failing vectors, expected and observed values, and coverage of the applied stimulus |
| POST /api/ai-compile | Same fields as interpret | Forces the model path |
| POST /api/challenge, /api/probe, /api/verify-fault | Create a mystery fault, probe an input, submit one diagnosis | Four-probe budget and a recorded final result |
| POST /api/hunts, /api/hunts/open, /api/hunts/probe, /api/hunts/solve | Create or play a shared fault in a synthesized combinational circuit | Shareable hunt, observed outputs and final result |

The native Google route starts with gemini-3.5-flash-lite. A busy or rate-limited model can fall through gemini-3.1-flash-lite, gemini-3.8-flash and the two configured Gemma 4 models. Missing model IDs are skipped. Malformed generated content gets a bounded repair attempt. Groq is selected when only GROQ_API_KEY is set. Model access and capacity depend on the account. Without either key, forced AI requests return HTTP 503 with fallback_available and the deterministic routes keep working.

## Security and accessibility

- A streaming reader enforces a 32 KiB wire limit even when Content-Length is absent. Large designs use gzip with a separate 512 KiB decoded ceiling. Compiler prompts are limited to 1,000 characters. The server validates identifiers, net drivers, cell types, sizes and numeric ranges and rejects reserved object keys.
- The rate limiter admits 20 compiler and snapshot-write requests per client per minute across the protected routes. HTTP 429 includes Retry-After. Wrangler uses a Cloudflare rate-limiting binding. Other hosts use a bounded per-process counter, which resets on restart. Node uses the socket peer. A reverse proxy can cause several users to share a bucket.
- Every response carries a Content Security Policy, framing denial, MIME sniffing protection, a referrer policy and disabled camera, microphone and geolocation permissions. Only the dedicated compiler worker can download the pinned npm package and instantiate its verified WebAssembly. Keys stay on the server. Public snapshots are accessible to anyone with their links. Hidden challenge answers stay in server storage.
- Each lab has a skip link, labelled form fields, visible keyboard focus, and status announcements. Logic toggles and waveform selectors expose their state. Schematic descriptions include current outputs. The sequence waveform uses a navigable table. RTL gate selection preserves keyboard focus after the graph updates. The Net selector offers an alternative to traversing individual gates.
- The browser audit exercises WCAG 2.1 A and AA rules with axe-core at desktop and mobile widths, together with keyboard interactions and actual synthesis. Automated checks cover the tested states. A complete accessibility assessment also includes human assistive-technology testing.

## Run and verify

Use Node 22.16 or newer. Start from a fresh checkout with these commands.

~~~sh
npm install
npm run lint
npm test
npm start
~~~

Open http://localhost:8000. npm start builds the browser and server together. Use npm ci for reproducible installs from the lockfile. npm test enforces at least 96% line coverage across the frontend application modules, shared engines and Worker API. The tests include all 256 three-input functions, detector traces, actual Yosys synthesis, netlist simulation, storage, model fallbacks and rendered UI behavior. The following commands run the checks in Chromium.

~~~sh
npx playwright-core install chromium
npm run test:browser
~~~

Set CHROMIUM_PATH to an existing Chromium executable if needed. The browser test retrieves the locked compiler package through npm, verifies the in-browser synthesis path and uses a temporary directory for saved designs. Use npm run format:check to check source formatting. Run npm run examples to regenerate the checked-in example netlists.

## Deploy

**Local AI.** Copy .env.example to .env for Node or .dev.vars for Wrangler. Set GEMINI_API_KEY privately and restart the server. The optional GROQ_API_KEY is an alternative provider.

**Cloudflare Workers.** The included deploy.bat and deploy.sh run the deployment on Windows and macOS/Linux respectively. For a manual deployment, run these commands.

~~~sh
npm ci
npm run build
npx wrangler login
npx wrangler r2 bucket create silicon-sketch-designs
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
~~~

Create the bucket once. Wrangler prompts privately for the key. To deploy independently, use the Worker name and bucket you own in wrangler.jsonc. To test locally with Wrangler, run npm run build followed by npx wrangler dev.

**Node and containers.** The Dockerfile builds the Worker bundle and runs a non-root Node server on port 8080. Configure PORT, HOST and optionally PUBLIC_ORIGIN for a reverse proxy. Node stores snapshots under .local/. Mount a persistent volume for durable Node storage. R2 provides persistence in the Worker deployment.

**Project status.** Silicon Sketch AI is an active educational prototype. The three labs, simulation, sharing and hardware exports can be exercised in the live project. The optional Supabase schema is provided for further development.
