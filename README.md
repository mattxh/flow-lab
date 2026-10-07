# Flow Lab

An interactive playground for learning how machines, GPUs, AI models, containers, and platform software work together. Built for high-school-level exploration, with illustrated components and animated request flows.

## Explore

- Start with eight NVIDIA RTX PRO 6000 GPUs, each with 96 GB of VRAM.
- Drag models onto hardware, share cards, distribute large models, and remove copies.
- Compare Linux, Docker, and Kubernetes; add JupyterHub, Langfuse, storage, and GitOps layers.
- Mix chat, vision, embedding, and reranking traffic and watch queues grow.
- Adjust KV cache assumptions and see their effect on memory capacity.
- Turn machines off and explore Kubernetes recovery and pending workloads.
- Select **Track one request**, then **Next layer**, for a guided explanation.

The default view opens **Busy platform** with active traffic. All dots play at quarter speed so the flows are easier to follow; request rates and timings use simulated seconds. Choose **Hardware only**, use **Reset lab**, or append `?setup=basic` for an empty machine.

## Run locally

Open `index.html` in a modern browser, keeping the JavaScript and CSS files in the same folder. No installation, account, real GPUs, or backend service is required.

## Publish with GitHub Pages

In the repository's **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. GitHub hosts the app and updates it when changes are pushed to that branch. The `.nojekyll` file lets Pages serve these static files directly.

## Teaching model

This is a browser simulation, not an AI inference service. No model weights are downloaded and the displayed requests and Langfuse traces are simulated. GPU memory stays local to individual cards; Kubernetes does not automatically pool it into one address space.

Model memory budgets, KV cache coefficients, throughput, and recovery timing are illustrative assumptions, not benchmarks or deployment guarantees. Real serving engines, model architectures, GPU sharing, and distributed workloads have additional requirements. Official references are linked inside the app. See [the detailed guide](README.txt) for the simulation's assumptions and controls.

## Files

- `index.html`: interface and explanations
- `style.css`: layout and visual styling
- `art.js`: component illustrations
- `engine.js`: model catalog and resource rules
- `app.js`: interaction, simulation, request tracking, and animation

The app uses plain HTML, CSS, and JavaScript with no build step or external runtime dependencies.
