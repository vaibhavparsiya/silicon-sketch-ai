export const maxCycles = 96;

export function buildDetector(pattern, overlap = true) {
  if (typeof pattern !== 'string' || !/^[01]{1,8}$/.test(pattern)) {
    throw Error('Choose a pattern of 1–8 binary digits.');
  }
  // State k remembers k matching prefix bits. After each edge, retain
  // the longest suffix that can still start another occurrence.
  return Array.from({length: pattern.length}, (_, state) =>
    ['0','1'].map(input => {
      const seen = pattern.slice(0, state) + input;
      const hit = Number(seen === pattern);
      let next = hit && !overlap ? 0 : Math.min(pattern.length - 1, seen.length);
      while (next && !seen.endsWith(pattern.slice(0,next))) next--;
      return {next, hit};
    })
  );
}

export function simulate(machine, stream) {
  if (typeof stream !== 'string' || !/^[01]*$/.test(stream) || stream.length > maxCycles) {
    throw Error('Enter up to 96 binary digits.');
  }
  let state = 0;
  return [...stream].map((input,i) => {
    const {next,hit} = machine[state][Number(input)];
    const row = {cycle:i+1, state, input:Number(input), next, hit};
    state = next;
    return row;
  });
}

export function detectorRTL(pattern, overlap) {
  const machine = buildDetector(pattern,overlap);
  const width = Math.max(1,Math.ceil(Math.log2(machine.length)));
  const cases = machine.map(([zero,one],i) => [
    '        '+width+"'d"+i+': begin',
    '          state <= din ? '+width+"'d"+one.next+' : '+width+"'d"+zero.next+';',
    "          detected <= din ? 1'b"+one.hit+" : 1'b"+zero.hit+';',
    '        end'
  ].join('\n'));
  return ['// Pattern '+pattern+' | '+(overlap?'overlapping':'non-overlapping')+' matches',
    'module sequence_detector(input wire clk, rst, din, output reg detected);',
    '  reg ['+(width-1)+':0] state;',
    '  always @(posedge clk) begin',
    '    if (rst) begin state <= 0; detected <= 0; end',
    '    else begin','      case (state)',...cases,
    '        default: begin state <= 0; detected <= 0; end',
    '      endcase','    end','  end','endmodule',''].join('\n');
}

export function detectorBench(pattern, overlap, stream) {
  buildDetector(pattern,overlap);
  if(!/^[01]{1,96}$/.test(stream))throw Error('Record a stream before exporting the testbench.');
  // Independent oracle: compare literal input substrings, without walking FSM states.
  let start = 0;
  const expected = [...stream].map((_,i) => {
    const from = i+1-pattern.length;
    const hit = from >= start && stream.slice(from,i+1)===pattern;
    if(hit && !overlap) start=i+1;
    return Number(hit);
  });
  return ['`timescale 1ns/1ps','module tb;',
    '  reg clk=0, rst=1, din=0; wire detected;',
    '  sequence_detector dut(clk,rst,din,detected);',
    '  always #5 clk = ~clk;',
    '  task step(input b, input wanted); begin',
    '    @(negedge clk); din=b; rst=0;',
    '    @(posedge clk); #1;',
    '    if(detected !== wanted) $fatal(1,"Mismatch at %0t, expected %b, got %b",$time,wanted,detected);',
    '  end endtask','  initial begin','    @(posedge clk); #1;',
    '    if(detected !== 0) $fatal(1,"Reset failed");',
    ...[...stream].map((b,i)=>"    step(1'b"+b+", 1'b"+expected[i]+");"),
    '    $display("PASS: '+stream.length+' clocks"); $finish;',
    '  end','endmodule',''].join('\n');
}
