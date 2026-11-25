# Silicon Sketch AI

**PromptWars × AI Vibeathon 2026 · Open Innovation**

[Live project](https://silicon-sketch-vaibhav.dapperroot2048.chatgpt.site/) · [RTL and GDSII lab](https://silicon-sketch-vaibhav.dapperroot2048.chatgpt.site/rtl)

Silicon Sketch AI turns a circuit prompt into an inspectable hardware design. The prompt is the interface to three labs. A bounded compiler handles recognizable Boolean rules and sequence descriptions instantly. A Gemini powered interpreter handles broader specifications and notebook sketches. The resulting RTL is synthesized in the browser with Yosys WebAssembly, simulated, checked against examples, and exported.

## Prompt engineering approach

The server supplies a constrained digital design instruction with mode specific JSON schemas and synthesizable Verilog rules. Requests include the original specification and, during repair, the failing RTL plus the synthesis diagnostic. Generated content is parsed and validated before the lab displays it. The user can inspect input mappings, logic paths, trace transitions, output vectors, and the generated source. Provider capacity errors trigger model fallback. This exposes where the prompt succeeded or needs clarification.

Example prompts include `At least two inputs are high`, `Detect 101 in 10101 with overlap`, `Make an 8-bit ALU`, and `Create a 5-bit combinational rotate-left-by-two circuit with ports a and y`. The first three have working deterministic routes. The last requires a provider key and available Gemini capacity. Image prompts support a JPEG conversion in the browser.

## What to evaluate

- Logic lab offers all 256 three-input Boolean functions, truth-table edits, minimized expression, waveform and a stuck-at counterexample.
- Sequence lab offers overlapping and non-overlapping pattern detection, a clock trace, state transitions, RTL and a testbench.
- RTL lab offers Yosys WASM synthesis, multibit and sequential simulation, probes, sample vectors, fault hunting and downloads.
- Physical die, GDSII and timing are educational estimates. They do not represent a fabricated layout or signoff timing.
- The live app's AI route needs a server-side `GEMINI_API_KEY`. Under provider capacity pressure it returns a clear error. Built-in prompts remain functional.

## Run and verify

Install Node.js 22+, then run `npm install`, `npm test`, and `npm start`. Open http://localhost:8000. Add `GEMINI_API_KEY=your_key` to a private `.env` for AI prompts. To deploy your own Worker, run `npm run build`, create the R2 bucket named in `wrangler.jsonc`, set `npx wrangler secret put GEMINI_API_KEY`, and run `npx wrangler deploy`. The repository excludes key files and build output.

The automated suite has 28 tests. It checks Boolean synthesis, sequence matches, ALU behavior, API validation, Gemini request and fallback routing, GDSII binary records, equivalence counterexamples, and blind fault challenge limits.
