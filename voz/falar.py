from TTS.api import TTS
import torch

# 🔥 Carrega modelo
tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

# usa GPU se tiver
if torch.cuda.is_available():
    tts = tts.to("cuda")

# 🎤 gera áudio com sua voz
tts.tts_to_file(
    text = """Será que o seu carro elétrico poderia acordar todos os dias com a bateria carregada pelo sol?

Será que aquele telhado parado pode virar uma pequena usina, gerando energia enquanto você dorme?

Será que já não passou da hora de parar de pagar combustível, e começar a produzir a sua própria energia?

Com a Solar System, você conecta painel solar, carregador elétrico e o seu carro, e transforma sua casa em um ponto de abastecimento inteligente

Sem fila, sem surpresa no preço, mais economia todos os meses

Será que o futuro já não chegou, e você ainda está preso ao tanque cheio?""",
    speaker_wav="F:/AI/Ai_kit/voz/ernane.wav",
    language="pt",
    file_path="saida.wav"
)

print("Áudio gerado: saida.wav")