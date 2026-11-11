const wait = new Int32Array(new SharedArrayBuffer(4));

export function demoDelay(min: number, max: number) {
  if (process.env.DEMO_LATENCY === "1") {
    Atomics.wait(wait, 0, 0, min + Math.random() * (max - min));
  }
}
