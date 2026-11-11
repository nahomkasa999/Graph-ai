# @nazs/flowlens-viewer

The production build is served by the Flowlens server. Double-click a node to drill down, Shift-click to expand it in place, or use the breadcrumb to go up. Press `/` to search labels, the arrow keys to select, Enter to drill and Escape to go back. The URL hash records the current focus.

Trace events pulse the graph as requests finish. Choose a trace to replay it and inspect its duration breakdown. Node badges show p50 and count, with a red error dot when the rolling window includes failures.

Node cards display locally bundled logos for detected technologies, including Pinecone and common databases. The viewer uses [Devicons](https://devicons.io/) for brand artwork.
