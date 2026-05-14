from TTS.api import TTS
import torch

tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

if torch.cuda.is_available():
    tts = tts.to("cuda")

texto = """
Quer parar de queimar dinheiro com impulsionamento?
Então talvez esteja na hora de anunciar do jeito certo
"""

tts.tts_to_file(
    text=texto,
    speaker="Daisy Studious", # Ajustado de daisy_studious para Daisy Studious
    language="pt",
    file_path="F:/AI/Ai_kit/output/saida.wav"
)

print("Áudio gerado em: F:/AI/Ai_kit/output/saida.wav")