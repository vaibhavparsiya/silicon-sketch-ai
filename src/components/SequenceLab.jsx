import { clockTable } from './SequenceTrace.jsx';
import { node } from './dom.js';
import { download } from './HardwareExportCard.jsx';
import { detectorRTL, detectorBench } from '../../shared/verilogGenerator.js';
import { shareTools, labPrompt } from '../../web/service.mjs';
import { buildDetector, simulate, maxCycles } from '../../shared/sequenceEngine.js';
import { byId as $ } from './dom.js';

/** Attach the Sequence Lab controls to the active document.
 * @returns {void}
 */
export function mountSequenceLab() {
  let pattern = '101',
    overlap = true,
    stream = '10101',
    index = 4;
  let machine = buildDetector(pattern, overlap),
    trace = simulate(machine, stream);
  function say(message) {
    $('notice').textContent = message;
  }
  function inspect() {
    const row = trace[index];
    $('prev').disabled = index <= 0;
    $('next').disabled = index >= trace.length - 1;
    $('cycle').textContent = row ? 'Clock ' + row.cycle : 'Reset state';
    const edge = $('edge');
    edge.replaceChildren();
    if (row) {
      edge.append(
        node('b', 'S' + row.state),
        node('span', '— ' + row.input + ' →'),
        node('b', 'S' + row.next),
        node('strong', 'Y = ' + row.hit, row.hit ? 'pulse' : ''),
      );
      const memory = pattern.slice(0, row.next);
      const accumulated = pattern.slice(0, row.state) + String(row.input);
      let explanation = row.hit
        ? 'Pattern ' + pattern + ' ends at this edge. '
        : 'No complete match at this edge. ';
      explanation += memory
        ? 'The detector keeps “' + memory + '” as the start of a possible next match.'
        : row.hit && !overlap
          ? 'The detector starts fresh on the next edge.'
          : 'No prefix is retained.';
      $('why').textContent =
        'Before the edge, S' +
        row.state +
        ' held ' +
        (row.state ? '“' + pattern.slice(0, row.state) + '”' : 'an empty prefix') +
        '. Reading ' +
        row.input +
        ' gives “' +
        accumulated +
        '”. ' +
        explanation;
    } else {
      edge.append(node('b', 'S0'));
      $('why').textContent = 'The detector has no input history. Clock 0 or 1 to begin.';
    }
    for (const b of $('scope').querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.cycle) === index));
    [...$('states').children].forEach((tr, i) =>
      tr.classList.toggle('selected', i === (row?.next ?? 0)),
    );
  }
  function select(i, scroll) {
    index = i;
    inspect();
    if (scroll)
      $('scope')
        .querySelector('[aria-pressed=true]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function draw() {
    trace = simulate(machine, stream);
    index = trace.length - 1;
    $('signature').textContent = pattern;
    const count = trace.reduce((sum, row) => sum + row.hit, 0);
    const other = simulate(buildDetector(pattern, !overlap), stream)
      .filter((row) => row.hit)
      .map((row) => row.cycle);
    $('overlap-comparison').textContent =
      'On this stream, ' +
      (overlap ? 'starting fresh' : 'allowing overlap') +
      ' would detect ' +
      (other.length ? 'at clock ' + other.join(', ') : 'no matches') +
      '.';
    $('score').textContent =
      trace.length + ' clocks  /  ' + count + ' ' + (count === 1 ? 'match' : 'matches');
    clockTable($('scope'), trace, select);
    const rows = machine.map((pair, i) => {
      const tr = document.createElement('tr');
      tr.append(node('th', 'S' + i));
      for (const t of pair) tr.append(node('td', 'S' + t.next + ' / ' + t.hit));
      return tr;
    });
    $('states').replaceChildren(...rows);
    $('undo').disabled = !stream;
    $('reset').disabled = !stream;
    $('bench').disabled = !stream;
    $('code').textContent = detectorRTL(pattern, overlap);
    inspect();
    $('scope').scrollLeft = $('scope').scrollWidth;
  }
  function append(bits) {
    if (!/^[01]+$/.test(bits)) {
      say('Enter binary digits only.');
      return;
    }
    if (bits.length + stream.length > maxCycles) {
      say('The trace holds 96 clocks. Reset or undo before appending more.');
      return;
    }
    stream += bits;
    draw();
    say('Recorded ' + bits.length + ' clock ' + (bits.length === 1 ? 'edge.' : 'edges.'));
  }
  $('design').onsubmit = (e) => {
    e.preventDefault();
    const nextPattern = $('pattern').value,
      nextMode = $('mode').value === 'overlap';
    try {
      machine = buildDetector(nextPattern, nextMode);
      pattern = nextPattern;
      overlap = nextMode;
      draw();
      say('Built detector and replayed ' + trace.length + ' clock edges.');
    } catch (err) {
      say(err.message);
    }
  };
  $('play').onsubmit = (e) => {
    e.preventDefault();
    append($('stream').value);
  };
  $('zero').onclick = () => append('0');
  $('one').onclick = () => append('1');
  $('undo').onclick = () => {
    stream = stream.slice(0, -1);
    draw();
    say('Removed the last clock edge.');
  };
  $('reset').onclick = () => {
    stream = '';
    draw();
    say('Trace reset to S0.');
  };
  $('prev').onclick = () => select(index - 1, true);
  $('next').onclick = () => select(index + 1, true);
  $('rtl').onclick = () => download('sequence_detector.v', detectorRTL(pattern, overlap));
  $('bench').onclick = () => download('sequence_tb.sv', detectorBench(pattern, overlap, stream));
  draw();

  function restore(d) {
    if (d.kind !== 'sequence') throw Error('This snapshot belongs to the logic lab.');
    pattern = d.pattern;
    overlap = d.overlap;
    stream = d.stream;
    machine = buildDetector(pattern, overlap);
    $('pattern').value = pattern;
    $('mode').value = overlap ? 'overlap' : 'restart';
    draw();
    select(d.index, false);
  }
  const incoming = sessionStorage.getItem('silicon-draft');
  if (incoming) {
    sessionStorage.removeItem('silicon-draft');
    try {
      restore(JSON.parse(incoming));
    } catch {
      say('Could not load the design.');
    }
  }
  shareTools(() => ({ kind: 'sequence', pattern, overlap, stream, index }), restore);

  labPrompt('sequence', restore);
}
