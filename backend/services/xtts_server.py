from flask import Flask, request, jsonify, send_file
from TTS.api import TTS
import torch
import os
import uuid
import warnings
import simpleaudio as sa

# Desabilita avisos de seguranca torch.load (weights_only)
# Para PyTorch 2.3.1: weights_only=False e padrao
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
    # Para PyTorch 2.6+: usa safe_globals se disponivel
    if hasattr(torch.serialization, "safe_globals"):
        import TTS.tts.configs.xtts_config as xtts_config

        with torch.serialization.safe_globals([xtts_config.XttsConfig]):
            tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")
    else:
        # Para PyTorch 2.3.1: carrega normalmente
        print("[XTTS] PyTorch < 2.6 detectado, carregando sem safe_globals...")
        tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

    if torch.cuda.is_available():
        print("[XTTS] Usando GPU")
        tts = tts.to("cuda")
    else:
        print("[XTTS] Usando CPU")

    ready = True
    print("[XTTS] Pronto!")
except Exception as e:
    print(f"[XTTS] Erro ao carregar modelo: {e}")
    tts = None

OUTPUT_DIR = os.path.abspath("output")


def resolve_internal_speaker_name(value):
    requested = str(value or "").strip()
    if not requested:
        return "Daisy Studious"
    if os.path.isfile(requested):
        return requested
    requested = os.path.splitext(os.path.basename(requested))[0] if os.path.splitext(requested)[1] else requested
    speakers = getattr(tts, "speakers", None) or []
    for speaker_name in speakers:
        if str(speaker_name) == requested:
            return str(speaker_name)
    requested_key = requested.casefold()
    for speaker_name in speakers:
        if str(speaker_name).casefold() == requested_key:
            return str(speaker_name)
    return requested


def get_output_path():
    file_name = f"audio_{uuid.uuid4().hex[:8]}.wav"
    return os.path.join(OUTPUT_DIR, file_name)


@app.route("/audio")
def get_audio():
    latest = None
    if os.path.isdir(OUTPUT_DIR):
        files = [os.path.join(OUTPUT_DIR, f) for f in os.listdir(OUTPUT_DIR) if f.lower().endswith(".wav")]
        if files:
            latest = max(files, key=os.path.getctime)
    if latest and os.path.exists(latest):
        return send_file(latest, as_attachment=True)
    return jsonify({"error": "Arquivo nao encontrado"}), 404


@app.route("/speak", methods=["POST"])
def speak():
    print("[XTTS] Recebendo requisicao speak")
    if tts is None:
        print("[XTTS] Modelo nao carregado")
        return jsonify({"error": "Modelo nao carregado"}), 500

    data = request.json
    text = data.get("text", "")
    speaker = resolve_internal_speaker_name(data.get("speaker", "Daisy Studious"))
    language = data.get("language", "pt")
    print(f"[XTTS] Texto: {text}, Speaker: {speaker}, Language: {language}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = get_output_path()

    try:
        tts.tts_to_file(
            text=text,
            speaker=speaker,
            language=language,
            file_path=output_path
        )
        print(f"[XTTS] Audio gerado: {output_path}")

        played = False
        playback_error = None

        try:
            # So responde quando a reproducao termina, para a fila JS nao sobrepor frases.
            wave_obj = sa.WaveObject.from_wave_file(output_path)
            play_obj = wave_obj.play()
            play_obj.wait_done()
            played = True
            print("[XTTS] Audio reproduzido via simpleaudio")
        except Exception as playback_err:
            playback_error = str(playback_err)
            print(f"[XTTS] Falha ao reproduzir audio, mas o arquivo foi gerado: {playback_error}")

        return jsonify({
            "status": "ok",
            "file": output_path,
            "played": played,
            "playback_error": playback_error
        })
    except Exception as e:
        print(f"[XTTS] Erro ao gerar audio: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("XTTS_PORT", 5005))
    print(f"[XTTS] Iniciando servidor na porta {port}")
    app.run(port=port)
