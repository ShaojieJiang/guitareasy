// A dedicated entry point for alphaTab's synthesis worker.
//
// alphaTab always runs its synthesizer in a Web Worker — `core.useWorkers`
// only controls the *rendering* worker — and it builds that worker from a URL
// on the origin its own bundle was served from. In the `embedded` player mode
// the widget runs on the host's sandbox origin, so that URL is cross-origin
// and `new Worker(url)` is rejected by the browser no matter what the host's
// CSP says.
//
// Bundling this entry separately gives the widget a self-contained worker
// script whose URL is known at build time, which it can fetch over CORS and
// run from a same-origin blob instead. alphaTab's main entry detects that it
// is running inside a worker and calls `Environment.initializeWorker()` on
// import, so importing it is all this file has to do.
import '@coderline/alphatab'
