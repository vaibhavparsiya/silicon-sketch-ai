import { boundedBytes } from '../shared/validators.js';
const PRIMARY = 'gemini-3.5-flash-lite';
const REPAIR = 'gemini-3.8-flash';
const GOOGLE_MODELS = [
  PRIMARY,
  'gemini-3.1-flash-lite',
  REPAIR,
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];
const RETRY_DELAYS = [800, 1500, 1500, 1500];
const MAX_REPLY = 512 * 1024;
const TIME_BUDGET = 45000;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function googlePayload(model, instructions, text, image) {
  const gemma = model.startsWith('gemma-');
  const parts = [
    { text: gemma ? instructions + '\nReturn exactly one JSON object.\n' + text : text },
  ];
  if (image)
    parts.push({
      inlineData: { mimeType: 'image/jpeg', data: image.slice(image.indexOf(',') + 1) },
    });
  const contents = [{ role: 'user', parts }];
  return gemma
    ? { contents }
    : {
        contents,
        systemInstruction: { parts: [{ text: instructions }] },
        generationConfig: { responseMimeType: 'application/json' },
      };
}

/** Request one answer with bounded provider failover and a shared elapsed-time budget.
 * @param {object} env
 * @param {string} instructions
 * @param {string} text
 * @param {string|undefined} image
 * @param {boolean} correcting
 * @returns {Promise<{model:string,content:string}>}
 */
export async function requestDesign(env, instructions, text, image, correcting) {
  const google = Boolean(env.GEMINI_API_KEY);
  const models = google
    ? correcting
      ? [REPAIR, ...GOOGLE_MODELS.filter((m) => m !== REPAIR)]
      : GOOGLE_MODELS
    : ['openai/gpt-oss-120b', 'openai/gpt-oss-120b'];
  const deadline = Date.now() + TIME_BUDGET;
  for (const [i, model] of models.entries()) {
    const url = google
      ? 'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':generateContent?key=' +
        encodeURIComponent(env.GEMINI_API_KEY)
      : 'https://api.groq.com/openai/v1/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (!google) headers.Authorization = 'Bearer ' + env.GROQ_API_KEY;
    const body = google
      ? googlePayload(model, instructions, text, image)
      : {
          model,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
        };
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        redirect: 'manual',
      });
    } catch {
      throw Object.assign(Error('AI provider could not be reached.'), { status: 502 });
    }
    if (!response.ok) {
      await response.body?.cancel();
      const transient = response.status === 429 || response.status === 503;
      const unavailableModel = google && response.status === 404;
      const delay = unavailableModel ? 0 : google ? RETRY_DELAYS[i] : 550;
      if (
        (transient || unavailableModel) &&
        i + 1 < models.length &&
        Date.now() + delay < deadline
      ) {
        if (delay) await pause(delay);
        continue;
      }
      throw Object.assign(Error('AI provider returned HTTP ' + response.status + '.'), {
        status: transient ? response.status : 502,
      });
    }
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(await boundedBytes(response.body, MAX_REPLY)));
    } catch {
      throw Object.assign(Error('AI provider returned an invalid response.'), { status: 502 });
    }
    const content = google
      ? data.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text || '')
          .join('')
      : data.choices?.[0]?.message?.content;
    return { model, content };
  }
}
