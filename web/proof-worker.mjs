import { prove } from './physical.mjs';
import { simulator } from './net.mjs';
self.onmessage = ({ data }) => {
  try {
    self.postMessage(prove(data.golden, data.edited, simulator));
  } catch (e) {
    self.postMessage({ status: e.message });
  }
};
