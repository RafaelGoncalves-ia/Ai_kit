from flask import Flask, request, jsonify, send_file
from TTS.api import TTS
import torch
import os
import warnings
import simpleaudio as sa

# Desabilita avisos de segurança torch.load (weights_only)
# Para PyTorch 2.3.1: weights_only=False é padrão
# Para PyTorch 2.6+: usamos safe_globals
warnings.filterwarnings("ignore", category=UserWarning)

app = Flask(__name__)

ready = False

@app.route("/health", methods=["GET"])
def health():
    if ready:
        return jsonify({"status": "ok"}), 200
    return jsonify({"status": "loading"}), 503

print("[XTTS] Carregando modelo...")
print(f"[XTTS] PyTorch version: {torch.__version__}")
try:
    # Para PyTorch 2.6+: usa safe_globals se disponível
    if hasattr(torch.serialization, 'safe_globals'):
        import TTS.tts.configs.xtts_config as xtts_config
        with torch.serialization.safe_globals([xtts_config.XttsConfig]):
            tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")
    else:
        # Para PyTorch 2.3.1: carrega normalmente (weights_only=False é padrão)
        print("[XTTS] PyTorch < 2.6 detectado, carregando sem safe_globals...")
        tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")
    
    ready = True
    print("[XTTS] Pronto!")
except Exception as e:
    print(f"[XTTS] Erro ao carregar modelo: {e}")
    tts = None

OUTPUT_PATH = os.path.abspath("output.wav")

@app.route("/audio")
def get_audio():
    if os.path.exists(OUTPUT_PATH):
        return send_file(OUTPUT_PATH, as_attachment=True)
    else:
        return jsonify({"error": "Arquivo não encontrado"}), 404

@app.route("/speak", methods=["POST"])
def speak():
    print("[XTTS] Recebendo requisição speak")
    if tts is None:
        print("[XTTS] Modelo não carregado")
        return jsonify({"error": "Modelo não carregado"}), 500

    data = request.json
    text = data.get("text", "")
    speaker = data.get("speaker", "Daisy Studious")  # Voz padrão
    language = data.get("language", "pt")  # Idioma padrão
    print(f"[XTTS] Texto: {text}, Speaker: {speaker}, Language: {language}")

    os.makedirs("output", exist_ok=True)

    try:
        tts.tts_to_file(
            text=text,
            speaker=speaker,
            language=language,
            file_path=OUTPUT_PATH
        )
        print(f"[XTTS] Áudio gerado: {OUTPUT_PATH}")

        # toca o áudio com simpleaudio (não bloqueia)
        wave_obj = sa.WaveObject.from_wave_file(OUTPUT_PATH)
        play_obj = wave_obj.play()
        print("[XTTS] Áudio reproduzido via simpleaudio")

        return jsonify({
            "status": "ok",
            "file": OUTPUT_PATH
        })
    except Exception as e:
        print(f"[XTTS] Erro ao gerar áudio: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("XTTS_PORT", 5005))
    print(f"[XTTS] Iniciando servidor na porta {port}")
    app.run(port=port)