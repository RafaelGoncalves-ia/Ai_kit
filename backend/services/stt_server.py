from flask import Flask, request, jsonify
from faster_whisper import WhisperModel
import tempfile
import os

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

app = Flask(__name__)

print("[STT] carregando modelo...")

model = WhisperModel(
    "tiny",
    device="cuda",
    compute_type="float16"
)

print("[STT] pronto")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    try:
        file = request.files["audio"]

        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            file.save(tmp.name)
            path = tmp.name

        segments, _ = model.transcribe(
            path,
            language="pt",
            beam_size=1,
            vad_filter=True
        )

        text = "".join([s.text for s in segments]).strip()

        os.remove(path)

        return jsonify({ "text": text })

    except Exception as e:
        print("[STT] ERRO:", e)
        return jsonify({ "error": str(e) }), 500

if __name__ == "__main__":
    app.run(port=5006)