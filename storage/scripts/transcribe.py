import sys
import json
import os
import warnings

# Suppress Hugging Face symlinks & download warnings
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["PYTHONWARNINGS"] = "ignore"
warnings.filterwarnings("ignore")

# Patch PyAV av.open to prevent Python 3.13 metadata_errors TypeError
try:
    import av
    _orig_av_open = av.open
    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)
    av.open = _safe_av_open
except Exception:
    pass

from faster_whisper import WhisperModel

def transcribe(audio_path, model_size="base", language=None):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    device = os.environ.get("WHISPER_DEVICE", "cpu")
    # For CPU, int8 computation is ultra-fast
    compute_type = "int8" if device == "cpu" else "float16"

    # Default to base for high accuracy, unless overridden
    active_model = model_size if model_size and model_size != "default" else os.environ.get("WHISPER_MODEL_SIZE", "base")

    try:
        model = WhisperModel(
            active_model,
            device=device,
            compute_type=compute_type,
            cpu_threads=min(8, os.cpu_count() or 4),
        )

        lang_arg = None
        if language and language not in ["auto", "hinglish"]:
            lang_arg = language

        # High-accuracy gaming & conversational initial prompt to prevent hallucinations
        initial_prompt = "GTA 5 gaming dialogue, gameplay commentary, funny reactions, screams, conversations in English, Hindi and Hinglish."

        segments, info = model.transcribe(
            audio_path,
            word_timestamps=True,
            language=lang_arg,
            initial_prompt=initial_prompt,
            beam_size=2,
            best_of=2,
            temperature=0,
            repetition_penalty=1.1,
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
        )

        results = []
        for segment in segments:
            clean_text = segment.text.strip()
            if not clean_text:
                continue

            seg_data = {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": clean_text,
                "words": []
            }
            if segment.words:
                for w in segment.words:
                    word_clean = w.word.strip()
                    if word_clean:
                        seg_data["words"].append({
                            "word": word_clean,
                            "start": round(w.start, 2),
                            "end": round(w.end, 2),
                            "probability": round(w.probability, 2)
                        })
            results.append(seg_data)

        output = {
            "language": info.language,
            "duration": round(info.duration, 2),
            "segments": results
        }

        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python transcribe.py <audio_path> [model_size] [language]"}))
        sys.exit(1)

    audio_file = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_MODEL_SIZE", "base")
    lang = sys.argv[3] if len(sys.argv) > 3 else "auto"

    transcribe(audio_file, model_name, lang)
