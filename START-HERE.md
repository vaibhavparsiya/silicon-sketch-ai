# Silicon Sketch v2
1. Install Node.js 22.16 or newer and extract the entire ZIP. Have a Cloudflare account with R2 enabled and a fresh Gemini API key.
2. Double-click deploy.bat on Windows. On macOS/Linux open a terminal in the extracted folder and run ./deploy.sh (or sh deploy.sh).
3. Approve the Cloudflare login in your browser. Enter the fresh key only at Wrangler's secret prompt. Confirm creation of the silicon-sketch Worker if asked. Open the workers.dev URL printed after deployment.

The script uses the current Cloudflare account, Worker name silicon-sketch and bucket silicon-sketch-designs. Deploying updates an existing Worker with that name. Cloud service quotas and billing depend on your account.

Use Compile for the built-in 8-bit ALU. In the RTL lab select Physical die and export GDSII. The seven layers use educational geometry. Cell area and nominal path delays are estimates. The bundled synthesis script is a Yosys flow. A production OpenROAD run requires a PDK and technology files. The sampled VCD records UI steps in synthetic 1 ns intervals. The UART dock assumes 8N1 at one sampled clock per bit. Equivalence supports matching combinational interfaces up to 16 input bits; the checker reports inconclusive cases. Fault hunts support synthesized combinational circuits, four probes and one final failing-vector submission.
