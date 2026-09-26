#!/usr/bin/env python3
"""
ambient_analyze.py

Analyze any ambient track and generate reference material for an AI coding
assistant (Cursor / Claude) to build generative music in the browser.

Outputs (in --out, default ./reference):
  analysis.json    numbers: tonality, drones, harmony timeline, texture, stereo, dynamics, sections
  analysis.png     mel spectrogram + chromagram + loudness/brightness curves, with sections marked
  MUSIC_BRIEF.md   auto-filled brief with descriptors, section map and a synthesis starting point

Usage:
  python ambient_analyze.py track.wav
  python ambient_analyze.py track.mp3 --out reference --title "Artist - Title"

Install:
  pip install librosa soundfile pyloudnorm matplotlib scipy numpy
"""
import argparse
import json
import os
import warnings

import numpy as np
import librosa
import librosa.display
import pyloudnorm as pyln
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import find_peaks
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")

SR = 22050
HOP = 512
N_FFT = 4096  # long window for good low-frequency (drone) resolution
EPS = 1e-10
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

BANDS = {
    "sub_20_60": (20, 60),
    "low_60_250": (60, 250),
    "lowmid_250_1k": (250, 1000),
    "mid_1k_4k": (1000, 4000),
    "high_4k_10k": (4000, 10000),
    "air_10k_plus": (10000, SR / 2),
}

CHORD_TEMPLATES = {
    "5": [0, 7], "": [0, 4, 7], "m": [0, 3, 7], "sus2": [0, 2, 7], "sus4": [0, 5, 7],
    "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "7": [0, 4, 7, 10],
    "add9": [0, 2, 4, 7], "madd9": [0, 2, 3, 7], "maj9": [0, 2, 4, 7, 11], "m9": [0, 2, 3, 7, 10],
}

KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


# ---------------------------------------------------------------- helpers

def fmt_time(s):
    s = int(round(s))
    return f"{s // 60}:{s % 60:02d}"


def r(x, n=3):
    return round(float(x), n)


def per_second(x, nsec):
    """Average a frame-rate feature (1D or 2D, frames on last axis) into 1-second bins."""
    x = np.atleast_2d(x)
    t = librosa.frames_to_time(np.arange(x.shape[1]), sr=SR, hop_length=HOP).astype(int)
    t = np.clip(t, 0, nsec - 1)
    counts = np.maximum(np.bincount(t, minlength=nsec), 1)
    out = np.vstack([np.bincount(t, weights=row, minlength=nsec) / counts for row in x])
    return out if out.shape[0] > 1 else out[0]


def downsample(arr, max_points=240):
    arr = np.asarray(arr, dtype=float)
    if len(arr) <= max_points:
        return [r(v) for v in arr], 1
    step = int(np.ceil(len(arr) / max_points))
    n = len(arr) // step * step
    out = arr[:n].reshape(-1, step).mean(axis=1)
    return [r(v) for v in out], step


def name_chord(c):
    """Best-matching chord name for a 12-bin chroma vector, plus its strongest notes."""
    if c.max() < EPS:
        return "silence", [], 0.0
    cn = c / (np.linalg.norm(c) + EPS)
    notes = [NOTE_NAMES[i] for i in np.argsort(c)[::-1] if c[i] >= 0.6 * c.max()]
    if c.max() / (c.mean() + EPS) < 1.35:
        return "cluster (no clear chord)", notes, 0.0
    best = (-1.0, "")
    for root in range(12):
        for quality, ivs in CHORD_TEMPLATES.items():
            t = np.zeros(12)
            t[[(root + i) % 12 for i in ivs]] = 1
            s = float(cn @ (t / np.linalg.norm(t)))
            if s > best[0]:
                best = (s, NOTE_NAMES[root] + quality)
    return best[1], notes, best[0]


def estimate_key(chroma_mean):
    res = []
    for k in range(12):
        for prof, mode in ((KS_MAJOR, "major"), (KS_MINOR, "minor")):
            res.append((float(np.corrcoef(np.roll(prof, k), chroma_mean)[0, 1]), f"{NOTE_NAMES[k]} {mode}"))
    res.sort(reverse=True)
    return res[:3]


MODES = {  # intervals above the root that distinguish each mode
    "Ionian (major)": [0, 2, 4, 5, 7, 9, 11], "Dorian": [0, 2, 3, 5, 7, 9, 10],
    "Phrygian": [0, 1, 3, 5, 7, 8, 10], "Lydian": [0, 2, 4, 6, 7, 9, 11],
    "Mixolydian": [0, 2, 4, 5, 7, 9, 10], "Aeolian (natural minor)": [0, 2, 3, 5, 7, 8, 10],
}


def estimate_mode(chroma_mean, root_idx):
    """Score each diatonic mode on a fixed root: energy inside the scale minus energy outside it."""
    c = chroma_mean / (chroma_mean.max() + EPS)
    third = "minor" if c[(root_idx + 3) % 12] > c[(root_idx + 4) % 12] else "major"
    scores = []
    for name, ivs in MODES.items():
        inside = sum(c[(root_idx + i) % 12] for i in ivs)
        outside = c.sum() - inside
        scores.append((inside - 1.5 * outside, name))
    # prefer the more common modes when the evidence is within noise
    common = {"Aeolian (natural minor)": 0.06, "Ionian (major)": 0.06, "Dorian": 0.03, "Mixolydian": 0.03}
    scores = sorted(((sc + common.get(n, 0), n) for sc, n in scores), reverse=True)
    return third, [n for _, n in scores[:3]]


# ---------------------------------------------------------------- descriptors

def d_brightness(hz):
    if hz < 700: return "dark"
    if hz < 1500: return "warm"
    if hz < 3000: return "balanced"
    return "bright"


def d_texture(flat):
    if flat < 0.01: return "tonal (pads, drones, clear pitches)"
    if flat < 0.05: return "mixed (tonal material with noise and air)"
    return "noisy / textural (noise, field recordings, granular)"


def d_pulse(clarity, perc):
    if clarity > 0.6 or (clarity > 0.35 and perc > 0.05): return "clear pulse"
    if clarity > 0.25 and perc > 0.02: return "weak or implied pulse"
    return "no pulse (beatless)"


def d_width(ratio, mono):
    if mono: return "mono source"
    if ratio < 0.15: return "narrow"
    if ratio < 0.5: return "moderately wide"
    return "very wide"


def d_dynamics(lra):
    if lra < 3: return "static, almost no level change"
    if lra < 8: return "gentle swells"
    return "large dynamic arc"


def d_harmony(sec_per_change):
    if sec_per_change > 60: return "static harmony, drone-based"
    if sec_per_change > 20: return "slow harmonic movement"
    return "moving harmony"


def d_arc(sections):
    if len(sections) < 2:
        return "single continuous section"
    lv = [s["loudness_lufs"] for s in sections]
    if max(lv) - min(lv) < 2:
        return "flat, even energy throughout"
    i = int(np.argmax(lv))
    if i == 0:
        return "starts at its fullest and gradually recedes"
    if i == len(lv) - 1:
        return "builds steadily toward the end"
    return f"rises to a peak around {fmt_time(sections[i]['start_s'])} then recedes"


# ---------------------------------------------------------------- analysis

def analyze(path):
    # Native-rate multichannel for loudness and stereo, mono 22.05k for everything else
    native, sr_n = librosa.load(path, sr=None, mono=False)
    native = np.atleast_2d(native)
    y = librosa.resample(librosa.to_mono(native), orig_sr=sr_n, target_sr=SR)
    dur = len(y) / SR
    nsec = max(1, int(np.ceil(dur)))

    # --- loudness
    meter = pyln.Meter(sr_n)
    data = native.T
    integrated = meter.integrated_loudness(data)
    win, hop = int(3 * sr_n), int(sr_n)
    st = []
    for start in range(0, max(1, len(data) - win + 1), hop):
        v = meter.integrated_loudness(data[start:start + win])
        st.append(max(v, -70.0) if np.isfinite(v) else -70.0)
    st = np.array(st)
    gated = st[(st > -70) & (st > integrated - 20)]
    lra = float(np.percentile(gated, 95) - np.percentile(gated, 10)) if len(gated) > 2 else 0.0
    peak_db = 20 * np.log10(np.abs(native).max() + EPS)
    st_per_sec = np.interp(np.arange(nsec), np.arange(len(st)) + 1.5, st)

    # --- stereo
    mono_src = native.shape[0] < 2
    if mono_src:
        width_ratio, corr = 0.0, 1.0
    else:
        L, R = native[0], native[1]
        mid, side = (L + R) / 2, (L - R) / 2
        width_ratio = float(np.sqrt(np.mean(side ** 2)) / (np.sqrt(np.mean(mid ** 2)) + EPS))
        corr = float(np.corrcoef(L, R)[0, 1])

    # --- spectrum
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    P = S ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    centroid = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
    flatness = librosa.feature.spectral_flatness(S=S)[0]
    rms = librosa.feature.rms(S=S, frame_length=N_FFT)[0]
    active = rms > (rms.max() * 0.01)  # ignore silence when summarizing

    band_frames = np.vstack([P[(freqs >= lo) & (freqs < hi)].sum(axis=0) for lo, hi in BANDS.values()])
    band_share_frames = band_frames / (band_frames.sum(axis=0, keepdims=True) + EPS)
    band_total = band_frames[:, active].sum(axis=1)
    band_share = band_total / (band_total.sum() + EPS)

    # --- harmonic vs percussive
    H, Pc = librosa.decompose.hpss(S)
    perc_ratio = float((Pc ** 2).sum() / ((H ** 2).sum() + (Pc ** 2).sum() + EPS))

    # --- pulse
    fps = SR / HOP
    onset_env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=SR)
    # remove slow swells (2 s moving average) so only short-term periodicity counts
    oe = onset_env - uniform_filter1d(onset_env, size=int(2 * SR / HOP))
    ac = librosa.autocorrelate(oe)
    ac = ac / (ac[0] + EPS)
    lo, hi = int(np.ceil(fps * 60 / 180)), int(fps * 60 / 50)
    if len(ac) > hi:
        lag = lo + int(np.argmax(ac[lo:hi]))
        # autocorrelation peaks at every multiple of the beat; prefer the shortest strong one
        for div in (3, 2):
            sub = int(round(lag / div))
            if sub >= lo:
                j = max(lo, sub - 2) + int(np.argmax(ac[max(lo, sub - 2):sub + 3]))
                if ac[j] > 0.8 * ac[lag]:
                    lag = j
                    break
        clarity, pulse_bpm = float(ac[lag]), 60 * fps / lag
    else:
        clarity, pulse_bpm = 0.0, 0.0
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    onsets_per_min = len(onsets) / (dur / 60)

    # --- tonality
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    chroma_mean = chroma[:, active[: chroma.shape[1]]].mean(axis=1) if active.any() else chroma.mean(axis=1)
    keys = estimate_key(chroma_mean)
    pc_rank = [NOTE_NAMES[i] for i in np.argsort(chroma_mean)[::-1]]
    root_name = keys[0][1].split()[0]
    root_idx = NOTE_NAMES.index(root_name)
    third, mode_guesses = estimate_mode(chroma_mean, root_idx)
    # When major/minor on the same root nearly tie, let the third decide
    if len(keys) > 1 and keys[1][1].split()[0] == root_name and abs(keys[0][0] - keys[1][0]) < 0.05:
        want = "minor" if third == "minor" else "major"
        keys.sort(key=lambda kv: (kv[1] != f"{root_name} {want}", -kv[0]))

    # --- drones: peaks in the median spectrum (median favours sustained energy)
    med = np.median(S[:, active], axis=1) if active.any() else np.median(S, axis=1)
    band_mask = (freqs >= 30) & (freqs <= 1200)
    idx_offset = np.argmax(band_mask)
    seg = med[band_mask]
    peaks, _ = find_peaks(seg, prominence=seg.max() * 0.05)
    drones = []
    seen = set()
    for p in sorted(peaks, key=lambda p: seg[p], reverse=True):
        b = p + idx_offset
        note = librosa.hz_to_note(freqs[b], unicode=False)
        if note in seen:
            continue
        seen.add(note)
        row = S[b]
        persistence = float(np.mean(row > 0.3 * np.percentile(row, 95)))
        drones.append({
            "hz": r(freqs[b], 1), "note": note,
            "level_db": r(20 * np.log10(seg[p] / (seg.max() + EPS)), 1),
            "persistence": r(persistence, 2),
        })
        if len(drones) >= 6:
            break

    # --- harmony timeline (8 s windows, merged when the chord repeats)
    w = max(1, int(8 * fps))
    act_cols = active[: chroma.shape[1]]
    floor = np.percentile(chroma[:, act_cols] if act_cols.any() else chroma, 30, axis=1)
    drone_pcs = [NOTE_NAMES[i] for i in np.argsort(floor)[::-1] if floor[i] >= 0.5 * floor.max() and floor.max() > 0.2]
    windows = []
    for i in range(0, chroma.shape[1], w):
        raw = chroma[:, i:i + w].mean(axis=1)
        moving = np.clip(raw - floor, 0, None)
        # use the moving part if it carries enough energy, otherwise the full chroma
        # Rescale what moves above the drone, then add the drone back at a lower weight,
        # so pad chords are named even when a loud drone dominates the chroma.
        if moving.max() > 0.05:
            c = moving / moving.max() + 0.6 * floor / (floor.max() + EPS)
        else:
            c = raw
        if rms[i:i + w].mean() < rms.max() * 0.01:
            name, notes, conf = "silence", [], 0.0
        else:
            name, notes, conf = name_chord(c)
        windows.append((i / fps, name, notes, conf))
    harmony = []
    for t, name, notes, conf in windows:
        if harmony and harmony[-1]["chord"] == name:
            harmony[-1]["end_s"] = r(min(t + 8, dur), 1)
            continue
        harmony.append({"start_s": r(t, 1), "end_s": r(min(t + 8, dur), 1),
                        "chord": name, "notes": notes, "match": r(conf, 2)})
    tonal_segments = [h for h in harmony if h["chord"] not in ("silence",)]
    sec_per_change = dur / max(1, len(tonal_segments))

    # --- sections: cluster per-second timbre + harmony + loudness
    cent_s = per_second(np.log(centroid + 1), nsec)
    flat_s = per_second(np.log(flatness + EPS), nsec)
    bands_s = per_second(band_share_frames, nsec)
    chroma_s = per_second(chroma, nsec)
    cent_hz_s = per_second(centroid, nsec)
    F = np.vstack([st_per_sec, cent_s, flat_s, bands_s, chroma_s * 0.5])
    F = (F - F.mean(axis=1, keepdims=True)) / (F.std(axis=1, keepdims=True) + EPS)
    F = median_filter(F, size=(1, 7))
    k = int(np.clip(round(dur / 70), 2, 10)) if nsec >= 40 else 1
    if k > 1:
        bounds = sorted(set(int(b) for b in librosa.segment.agglomerative(F, k)) | {0})
    else:
        bounds = [0]
    cleaned = [0]
    for b in bounds[1:]:
        if b - cleaned[-1] >= 15 and nsec - b >= 15:
            cleaned.append(b)
    edges = cleaned + [nsec]

    sections = []
    for n, (a, b) in enumerate(zip(edges[:-1], edges[1:])):
        cs = chroma_s[:, a:b].mean(axis=1)
        name, notes, _ = name_chord(cs)
        chords_here = []
        for h in harmony:
            if h["start_s"] < b and h["end_s"] > a and h["chord"] != "silence" and h["chord"] not in chords_here:
                chords_here.append(h["chord"])
        shares = bands_s[:, a:b].mean(axis=1)
        sections.append({
            "label": chr(65 + n),
            "start_s": a, "end_s": min(b, round(dur, 1)),
            "loudness_lufs": r(np.mean(st_per_sec[a:b]), 1),
            "brightness_hz": int(np.mean(cent_hz_s[a:b])),
            "brightness": d_brightness(np.mean(cent_hz_s[a:b])),
            "dominant_notes": notes[:5],
            "overall_chord": name,
            "chords": chords_here[:8],
            "dominant_band": list(BANDS)[int(np.argmax(shares))],
            "band_share": {k_: r(v, 3) for k_, v in zip(BANDS, shares)},
        })
    if sections:
        lv = [s["loudness_lufs"] for s in sections]
        lo_, hi_ = min(lv), max(lv)
        for s in sections:
            if hi_ - lo_ < 2:
                s["energy"] = "even"
                continue
            rel = (s["loudness_lufs"] - lo_) / (hi_ - lo_ + EPS)
            s["energy"] = "low" if rel < 0.34 else ("medium" if rel < 0.67 else "high")

    # --- curves for the JSON (downsampled)
    loud_curve, step = downsample(st_per_sec)
    bright_curve, _ = downsample(cent_hz_s)
    flat_curve, _ = downsample(per_second(flatness, nsec))

    cent_active = centroid[active] if active.any() else centroid
    analysis = {
        "file": os.path.basename(path),
        "duration_s": r(dur, 1),
        "loudness": {
            "integrated_lufs": r(integrated, 1),
            "loudness_range_lu": r(lra, 1),
            "peak_dbfs": r(peak_db, 1),
            "dynamics": d_dynamics(lra),
        },
        "tonality": {
            "key_candidates": [{"key": kname, "confidence": r(c, 2)} for c, kname in keys],
            "pitch_classes_ranked": pc_rank,
            "pitch_class_strength": {NOTE_NAMES[i]: r(chroma_mean[i], 3) for i in range(12)},
            "third": third,
            "mode_candidates": mode_guesses,
            "note": "Ambient is often modal or drone-based; treat key as tonal center, not strict major/minor.",
        },
        "drones": drones,
        "harmony": {
            "timeline": harmony,
            "drone_pitch_classes": drone_pcs,
            "note_on_timeline": "Chords are named on what moves above the constant drone floor.",
            "avg_seconds_per_change": r(sec_per_change, 1),
            "character": d_harmony(sec_per_change),
        },
        "texture": {
            "brightness_centroid_hz_median": int(np.median(cent_active)),
            "brightness_centroid_hz_p10_p90": [int(np.percentile(cent_active, 10)), int(np.percentile(cent_active, 90))],
            "brightness": d_brightness(np.median(cent_active)),
            "spectral_flatness_median": r(np.median(flatness[active] if active.any() else flatness), 4),
            "texture": d_texture(np.median(flatness[active] if active.any() else flatness)),
            "percussive_ratio": r(perc_ratio, 3),
            "band_share": {k_: r(v, 3) for k_, v in zip(BANDS, band_share)},
        },
        "rhythm": {
            "pulse": d_pulse(clarity, perc_ratio),
            "pulse_clarity": r(clarity, 2),
            "pulse_bpm_if_any": r(pulse_bpm, 1),
            "onsets_per_minute": r(onsets_per_min, 1),
        },
        "stereo": {
            "side_to_mid_ratio": r(width_ratio, 3),
            "lr_correlation": r(corr, 3),
            "width": d_width(width_ratio, mono_src),
        },
        "sections": sections,
        "arc": d_arc(sections),
        "curves": {
            "step_s": step,
            "loudness_lufs": loud_curve,
            "brightness_hz": bright_curve,
            "flatness": flat_curve,
        },
    }
    plot_data = dict(S=S, chroma=chroma, st_per_sec=st_per_sec, cent_hz_s=cent_hz_s,
                     edges=edges, harmony=harmony, dur=dur)
    return analysis, plot_data


# ---------------------------------------------------------------- outputs

def plot(pd, out_png, title):
    fig, ax = plt.subplots(4, 1, figsize=(16, 13), sharex=True,
                           gridspec_kw={"height_ratios": [3, 2, 1.3, 1.3]})
    M = librosa.power_to_db(librosa.feature.melspectrogram(S=pd["S"] ** 2, sr=SR, n_mels=128), ref=np.max)
    librosa.display.specshow(M, sr=SR, hop_length=HOP, x_axis="time", y_axis="mel", ax=ax[0], cmap="magma")
    ax[0].set_title(f"{title}  |  mel spectrogram (sections marked)")
    librosa.display.specshow(pd["chroma"], sr=SR, hop_length=HOP, x_axis="time", y_axis="chroma", ax=ax[1], cmap="viridis")
    ax[1].set_title("chromagram (harmony timeline labels)")
    for h in pd["harmony"]:
        if h["chord"] != "silence":
            ax[1].text(h["start_s"] + 0.5, 11.3, h["chord"], color="white", fontsize=7, va="top")
    t = np.arange(len(pd["st_per_sec"]))
    ax[2].plot(t, pd["st_per_sec"], color="tab:red")
    ax[2].set_ylabel("LUFS (3 s)")
    ax[2].set_title("short-term loudness")
    ax[3].plot(t, uniform_filter1d(pd["cent_hz_s"], 5), color="tab:blue")
    ax[3].set_ylabel("Hz")
    ax[3].set_title("brightness (spectral centroid, 5 s smoothed)")
    ax[3].set_xlabel("time (s)")
    for e_i, e in enumerate(pd["edges"][:-1]):
        for a in ax:
            a.axvline(e, color="white" if a in ax[:2] else "gray", lw=1, ls="--")
        ax[0].text(e + 1, ax[0].get_ylim()[1] * 0.8, chr(65 + e_i), color="white", fontsize=14, weight="bold")
    plt.tight_layout()
    plt.savefig(out_png, dpi=100)
    plt.close(fig)


def brief(a, title):
    t, h, x, rh, st, ld = a["tonality"], a["harmony"], a["texture"], a["rhythm"], a["stereo"], a["loudness"]
    key = t["key_candidates"][0]["key"]
    root = key.split()[0]
    drone_notes = [d["note"] for d in a["drones"] if d["persistence"] > 0.4] or [d["note"] for d in a["drones"][:3]]
    chords = []
    for seg in h["timeline"]:
        if seg["chord"] not in ("silence",) and seg["chord"] not in chords:
            chords.append(seg["chord"])
    lp_lo = int(x["brightness_centroid_hz_p10_p90"][0] * 1.5)
    lp_hi = min(12000, int(x["brightness_centroid_hz_p10_p90"][1] * 3))
    bands_sorted = sorted(x["band_share"].items(), key=lambda kv: kv[1], reverse=True)

    lines = []
    L = lines.append
    L("# Music brief")
    L("")
    L("Auto-generated by `ambient_analyze.py`. Items marked **(verify)** come from signal analysis and")
    L("should be checked by ear. Sections marked **TODO** need your intent, which the analysis cannot know.")
    L("")
    L("## Reference")
    L(f"- Track: {title}")
    L(f"- Length: {fmt_time(a['duration_s'])}")
    L("- Use it for: **TODO** (mood / sound palette / slow evolution / harmonic color)")
    L("- Do NOT copy: melodies, exact progressions, samples. Original generative composition only.")
    L("")
    L("## Summary")
    L(f"A {x['brightness']}, {x['texture'].split(' (')[0]} ambient piece, {st['width']}, with {ld['dynamics']}. ")
    L(f"Harmony: {h['character']} (about one change every {h['avg_seconds_per_change']:.0f} s). "
      f"Rhythm: {rh['pulse']}. Overall arc: {a['arc']}.")
    L("")
    L("## Musical facts")
    L(f"- Tonal center: **{root}** (best key guess {key}, alternatives: "
      f"{', '.join(k['key'] for k in t['key_candidates'][1:])}) **(verify)**")
    L(f"- Mode: {t['third']} third, likely {' / '.join(t['mode_candidates'][:2])} **(verify)**")
    L(f"- Strongest pitch classes: {', '.join(t['pitch_classes_ranked'][:6])}")
    L(f"- Sustained drone notes: {', '.join(drone_notes) if drone_notes else 'none detected'} **(verify)**")
    if h.get("drone_pitch_classes"):
        L(f"- Constant drone pitch classes: {', '.join(h['drone_pitch_classes'])}")
    L(f"- Chord colors above the drone: {', '.join(chords[:10]) if chords else 'none'} **(approximate, verify)**")
    if rh["pulse"] == "clear pulse":
        L(f"- Pulse: ~{rh['pulse_bpm_if_any']:.0f} BPM (may be half or double time) **(verify)**")
    else:
        L(f"- Pulse: {rh['pulse']}. Use free time / long durations instead of a grid.")
    L(f"- Event density: ~{rh['onsets_per_minute']:.0f} note onsets per minute")
    L(f"- Loudness target: {ld['integrated_lufs']} LUFS integrated, range {ld['loudness_range_lu']} LU")
    L("")
    L("## Structure")
    L("| Section | Time | Energy | Brightness | Harmony | Dominant band | What happens (TODO) |")
    L("|---|---|---|---|---|---|---|")
    for s in a["sections"]:
        harm = ", ".join(s["chords"][:4]) or s["overall_chord"]
        L(f"| {s['label']} | {fmt_time(s['start_s'])}-{fmt_time(s['end_s'])} | {s['energy']} ({s['loudness_lufs']} LUFS) "
          f"| {s['brightness']} (~{s['brightness_hz']} Hz) | {harm} | {s['dominant_band']} | |")
    L("")
    L("## Sound palette")
    L(f"- Spectral balance (share of energy): " + ", ".join(f"{k} {v*100:.0f}%" for k, v in bands_sorted[:4]))
    L(f"- Texture: {x['texture']} (flatness {x['spectral_flatness_median']})")
    L(f"- Percussive content: {x['percussive_ratio']*100:.0f}% of energy")
    L(f"- Stereo: {st['width']} (side/mid {st['side_to_mid_ratio']}, L/R correlation {st['lr_correlation']})")
    L("- Reverb / space: **TODO** (e.g. long hall, 8-15 s decay, dark tail). Not measurable reliably.")
    L("- Specific sounds heard: **TODO** (e.g. bowed textures, tape hiss, field recording, glassy bells)")
    L("")
    L("## Suggested generative engine (starting point)")
    L(f"- **Drone layer:** sustained oscillators on {', '.join(drone_notes[:3]) or root}, slow detune/LFO drift, "
      f"attack 4-10 s, release 8-20 s.")
    L(f"- **Harmony layer:** pads voicing the chord colors above, rooted in {root}; change every "
      f"~{max(8, int(h['avg_seconds_per_change']))} s with long crossfades, not on a grid.")
    if x["spectral_flatness_median"] >= 0.01:
        top_band = bands_sorted[0][0]
        L(f"- **Texture layer:** filtered noise or granular layer, emphasis around {top_band.replace('_', ' ')}.")
    if rh["pulse"] != "no pulse (beatless)":
        L(f"- **Pulse layer:** soft, sparse events around {rh['pulse_bpm_if_any']:.0f} BPM with heavy swing/humanize.")
    else:
        L("- **Events:** sparse, randomly timed notes (Poisson-style) from the pitch set, soft attacks.")
    L(f"- **Master tone:** lowpass sweeping roughly {lp_lo}-{lp_hi} Hz to follow the brightness curve.")
    L(f"- **Evolution:** follow the section map and arc ({a['arc']}).")
    L("")
    L("## Interactivity (TODO)")
    L("| Music parameter | Driven by | Behavior |")
    L("|---|---|---|")
    L("| Master lowpass cutoff | e.g. scroll progress | closed at start, opens toward section peak |")
    L("| Texture layer volume | e.g. scene intensity uniform | fades in above 0.5 |")
    L("| Harmony change | e.g. camera waypoint | crossfade to next chord over 4-8 s |")
    L("| Drone detune / width | e.g. pointer movement | subtle, smoothed |")
    L("")
    L("## Tech constraints (edit as needed)")
    L("- Tone.js or raw Web Audio, no audio files, start on user gesture")
    L("- All timing via the audio clock / Transport, no setTimeout for musical events")
    L("- Smooth every parameter change (rampTo / setTargetAtTime), no zipper noise")
    L("- Mobile-safe CPU budget: max ~8-12 voices, one shared reverb")
    L("- Expose an API like `setIntensity(0..1)`, `setSection(n)`, `setBrightness(0..1)`")
    L("")
    L("## Files")
    L("- `analysis.json`: all numbers, harmony timeline, per-section data, curves")
    L("- `analysis.png`: spectrogram, chromagram, loudness and brightness over time")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Analyze an ambient track and write analysis + music brief.")
    ap.add_argument("track")
    ap.add_argument("--out", default="reference")
    ap.add_argument("--title", default=None, help='e.g. "Artist - Title" (defaults to file name)')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    title = args.title or os.path.splitext(os.path.basename(args.track))[0]
    print(f"Analyzing {args.track} ...")
    analysis, pdata = analyze(args.track)
    analysis["title"] = title

    with open(os.path.join(args.out, "analysis.json"), "w") as f:
        json.dump(analysis, f, indent=1)
    plot(pdata, os.path.join(args.out, "analysis.png"), title)
    with open(os.path.join(args.out, "MUSIC_BRIEF.md"), "w") as f:
        f.write(brief(analysis, title))

    print(f"Done: {args.out}/analysis.json, analysis.png, MUSIC_BRIEF.md")
    print(f"  center {analysis['tonality']['key_candidates'][0]['key']}, "
          f"{analysis['texture']['brightness']}, {analysis['rhythm']['pulse']}, "
          f"{len(analysis['sections'])} sections")


if __name__ == "__main__":
    main()
