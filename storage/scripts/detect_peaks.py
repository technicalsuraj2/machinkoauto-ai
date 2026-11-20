import sys
import json
import os
import wave
import numpy as np

def detect_audio_peaks(wav_path, clip_count=5, target_len=30, min_len=20, max_len=55):
    if not os.path.exists(wav_path):
        print(json.dumps({"error": f"WAV file not found: {wav_path}"}))
        sys.exit(1)

    try:
        with wave.open(wav_path, "rb") as w:
            n_frames = w.getnframes()
            sr = w.getframerate()
            frames = w.readframes(n_frames)
            samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)

        total_secs = len(samples) / sr
        if total_secs < min_len:
            # Video too short, return full duration as one clip
            return [{
                "peakSec": total_secs / 2,
                "startTime": 0.0,
                "endTime": round(total_secs, 1),
                "duration": round(total_secs, 1),
                "energyScore": 95,
            }]

        # 1-second RMS volume calculation
        win = sr
        n_windows = len(samples) // win
        trimmed = samples[:n_windows * win].reshape(n_windows, win)
        rms = np.sqrt(np.mean(trimmed ** 2, axis=1) + 1e-6)

        # 3-second moving average for sustained sound energy/screams/laughter
        kernel = np.ones(3) / 3.0
        smooth_rms = np.convolve(rms, kernel, mode="same")

        # Baseline noise floor and peak threshold
        baseline = np.median(smooth_rms)
        max_rms = np.max(smooth_rms)

        # Minimum spacing between clips (at least max_len + 10s)
        min_spacing = max(45, target_len + 15)

        # Sort candidate seconds by highest audio energy
        sorted_indices = np.argsort(smooth_rms)[::-1]

        selected_peaks = []
        for sec in sorted_indices:
            # Skip first 2 seconds and last 5 seconds of stream
            if sec < 2 or sec > (total_secs - 10):
                continue

            # Ensure minimum gap between any selected peak
            if all(abs(sec - p) >= min_spacing for p in selected_peaks):
                selected_peaks.append(int(sec))
                if len(selected_peaks) >= clip_count:
                    break

        # Fallback if not enough distinct peaks found
        if len(selected_peaks) < clip_count:
            window_size = total_secs / max(1, clip_count)
            for i in range(clip_count):
                fallback_sec = int(i * window_size + window_size * 0.4)
                if fallback_sec not in selected_peaks and fallback_sec < (total_secs - 10):
                    selected_peaks.append(fallback_sec)
                if len(selected_peaks) >= clip_count:
                    break

        selected_peaks.sort()

        # Build candidate intervals around each peak
        # Place the peak roughly 40-50% into the clip so the viewer hears the buildup then the crazy reaction
        results = []
        buildup_ratio = 0.4
        buildup_secs = target_len * buildup_ratio

        for peak_sec in selected_peaks:
            c_start = max(0.0, round(peak_sec - buildup_secs, 1))
            c_end = min(total_secs, round(c_start + target_len, 1))
            dur = round(c_end - c_start, 1)

            # Energy score between 85 and 99
            peak_val = smooth_rms[min(len(smooth_rms) - 1, peak_sec)]
            normalized_score = 85 + min(14, int(((peak_val - baseline) / (max_rms - baseline + 1e-5)) * 14))

            results.append({
                "peakSec": peak_sec,
                "startTime": c_start,
                "endTime": c_end,
                "duration": dur,
                "energyScore": normalized_score,
            })

        print(json.dumps({"success": True, "moments": results}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python detect_peaks.py <wav_path> [clip_count] [target_len]"}))
        sys.exit(1)

    wav = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    t_len = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    detect_audio_peaks(wav, count, t_len)
