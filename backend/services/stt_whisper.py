from faster_whisper import WhisperModel
import sys

model = WhisperModel(
    "tiny",            # 🔥 aqui está a mudança
    device="cuda",     # usa GPU
    compute_type="float16"
)

def transcribe(audio_path):
    segments, _ = model.transcribe(
        audio_path,
        language="pt",
        beam_size=1,     # 🔥 mais rápido
        vad_filter=True  # remove silêncio (ganho real)
    )

    text = ""
    for segment in segments:
        text += segment.text

    return text.strip()

if __name__ == "__main__":
    print(transcribe(sys.argv[1]))