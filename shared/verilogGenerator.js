import { expression, synthesize } from './booleanEngine.js';
import { buildDetector } from './sequenceEngine.js';
/** Emit a synthesizable combinational module.
 * @param {number} mask
 * @param {string[]} [terms]
 * @returns {string}
 */
export function hardware(mask, terms) {
  return (
    'module silicon_sketch(input wire A, B, C, output wire Y);\n  assign Y = ' +
    expression(terms ?? synthesize(mask)) +
    ';\nendmodule\n'
  );
}
/** Emit a self-checking testbench for every truth-table row.
 * @param {number} mask
 * @returns {string}
 */
export function bench(mask) {
  return (
    "`timescale 1ns/1ps\nmodule tb;\n  reg [2:0] abc; wire Y; integer i;\n  localparam [7:0] expected = 8'h" +
    mask.toString(16).padStart(2, '0') +
    ';\n  silicon_sketch dut(abc[2],abc[1],abc[0],Y);\n  initial begin\n    for(i=0;i<8;i=i+1) begin\n      abc=i; #1;\n      if(Y !== expected[i]) $fatal(1,"Mismatch at %b",abc);\n    end\n    $display("PASS: all 8 vectors"); $finish;\n  end\nendmodule\n'
  );
}

/** Emit synchronous detector RTL including reset behavior.
 * @param {string} pattern
 * @param {boolean} overlap
 * @returns {string}
 */
export function detectorRTL(pattern, overlap) {
  const machine = buildDetector(pattern, overlap);
  const width = Math.max(1, Math.ceil(Math.log2(machine.length)));
  const cases = machine.map(([zero, one], i) =>
    [
      '        ' + width + "'d" + i + ': begin',
      '          state <= din ? ' +
        width +
        "'d" +
        one.next +
        ' : ' +
        width +
        "'d" +
        zero.next +
        ';',
      "          detected <= din ? 1'b" + one.hit + " : 1'b" + zero.hit + ';',
      '        end',
    ].join('\n'),
  );
  return [
    '// Pattern ' + pattern + ' | ' + (overlap ? 'overlapping' : 'non-overlapping') + ' matches',
    'module sequence_detector(input wire clk, rst, din, output reg detected);',
    '  reg [' + (width - 1) + ':0] state;',
    '  always @(posedge clk) begin',
    '    if (rst) begin state <= 0; detected <= 0; end',
    '    else begin',
    '      case (state)',
    ...cases,
    '        default: begin state <= 0; detected <= 0; end',
    '      endcase',
    '    end',
    '  end',
    'endmodule',
    '',
  ].join('\n');
}

/** Emit an independent substring-oracle testbench.
 * @param {string} pattern
 * @param {boolean} overlap
 * @param {string} stream
 * @returns {string}
 */
export function detectorBench(pattern, overlap, stream) {
  buildDetector(pattern, overlap);
  if (!/^[01]{1,96}$/.test(stream)) throw Error('Record a stream before exporting the testbench.');
  // Independent oracle: compare literal input substrings, without walking FSM states.
  let start = 0;
  const expected = [...stream].map((_, i) => {
    const from = i + 1 - pattern.length;
    const hit = from >= start && stream.slice(from, i + 1) === pattern;
    if (hit && !overlap) start = i + 1;
    return Number(hit);
  });
  return [
    '`timescale 1ns/1ps',
    'module tb;',
    '  reg clk=0, rst=1, din=0; wire detected;',
    '  sequence_detector dut(clk,rst,din,detected);',
    '  always #5 clk = ~clk;',
    '  task step(input b, input wanted); begin',
    '    @(negedge clk); din=b; rst=0;',
    '    @(posedge clk); #1;',
    '    if(detected !== wanted) $fatal(1,"Mismatch at %0t, expected %b, got %b",$time,wanted,detected);',
    '  end endtask',
    '  initial begin',
    '    @(posedge clk); #1;',
    '    if(detected !== 0) $fatal(1,"Reset failed");',
    ...[...stream].map((b, i) => "    step(1'b" + b + ", 1'b" + expected[i] + ');'),
    '    $display("PASS: ' + stream.length + ' clocks"); $finish;',
    '  end',
    'endmodule',
    '',
  ].join('\n');
}
