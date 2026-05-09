from TTS.api import TTS
import torch

tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

if torch.cuda.is_available():
    tts = tts.to("cuda")

texto = """
Quando o cliente consegue se ver ali
a venda começa antes da visita

É isso que o marketing certo faz

Transforma conteúdo em percepção
interesse em valor
e visualização em oportunidade real

Com estratégia
cada imóvel ganha vida
antes mesmo de alguém entrar

Quer aplicar isso no seu negócio
fala com a Adsune
"""

tts.tts_to_file(
    text=texto,
    speaker="Daisy Studious", # Ajustado de daisy_studious para Daisy Studious
    language="pt",
    file_path="F:/AI/Ai_kit/output/saida.wav"
)

print("Áudio gerado em: F:/AI/Ai_kit/output/saida.wav")