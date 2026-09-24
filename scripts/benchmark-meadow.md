# Meadow performance checks

The wall depth prepass was subsequently removed to address animated foliage
flicker. The measurements below describe the earlier optimization pass and
must be rerun for the current renderer.

Open `/?scene=meadow&manual&debug`, wait for loading to finish, then run in DevTools:

```js
const { benchmarkMeadow } = await import('/scripts/benchmark-meadow.js');
await benchmarkMeadow({ roses: 0 });
await benchmarkMeadow({ roses: 64 });
```

The agreed target is an M3 Max, 1440 × 900 CSS pixels, DPR 2
(2880 × 1800 rendered pixels), with the existing 4× scene MSAA and all visual
settings unchanged. 120 FPS requires 8.33 ms per frame.

The full test holds 64 varied roses and eight emergence ripples active. It
restores the original pool, events, lifetime and animation loop afterwards.
It rejects a run if another scene update changes the requested rose count.

These are GPU-completed throughput measurements: each sample is the elapsed
time for eight submitted frames divided by eight. P95 is the percentile of
those batch averages, not individual displayed-frame latency. A passing result
does not independently prove 120 Hz presentation or every camera/Inspector
configuration. Close other rendering tabs for repeatable comparisons.

Validation performed during this optimization:

- Production build and the three rose-pool lifecycle tests passed.
- Meadow, Ice, Cube, and Meadow/project transitions passed WebGPU validation.
- Original/optimized HDR comparisons at 2880 × 1800 differed by at most
  0.0000611 per color channel at eight fog samples; 12 and 24 samples matched
  exactly. Switching back to eight samples correctly rebuilt the shader.
- Cached rain events matched the original analytic ripple field within
  0.000224 across four animation times, including cell-grid edges.

The 120 FPS target is **not achieved**. After other GPU workloads were paused,
final measurements at the agreed size were:

| Workload | Median batch frame time | P95 batch frame time |
| --- | ---: | ---: |
| Idle | 9.295 ms | 9.508 ms |
| 64 roses + eight emergence ripples | 9.832 ms | 10.083 ms |

Each workload measured 320 frames after 96 warmup frames. Earlier idle baseline
measurements before optimization were approximately 11.1 ms. Timings varied
substantially while other workloads were active; those runs are not used as the
final acceptance measurement. More optimization is needed to reach 8.33 ms.
