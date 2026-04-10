import os
import re
import torch
import time
from TTS.api import TTS

# ==============================
# CONFIG
# ==============================
OUTPUT_DIR = "catalogo_vozes"
LANGUAGE = "pt"

# O texto que a Daisy e as outras 57 vozes vão falar
TEXTO = """
Olá, eu sou uma voz de teste. 
Estou falando de forma neutra, com ritmo normal e pronúncia clara. 
Agora vou mudar o tom. Estou mais animada! Isso parece natural pra você? 
Agora mais séria... analisando uma situação importante, com calma e precisão. 
Vamos testar números: 1, 2, 3, 10, 100, 1.000 e 10.000. 
Vou fazer o download do arquivo e depois te dou um feedback, beleza? 
Mano, isso aqui ficou muito top, sério mesmo, tá funcionando liso demais! 
Eu não acredito que isso funcionou! 
E agora uma frase longa para testar fluidez, respiração e consistência da voz ao longo do tempo, mantendo entonação, clareza e naturalidade mesmo com uma estrutura mais extensa e contínua de fala.
"""

# ==============================
# INIT
# ==============================
print("--- Inicializando XTTS v2 ---")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Rodando em: {device.upper()}")

# Carrega o modelo uma única vez
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

print("Extraindo lista de vozes do Speaker Manager...")
# Acessa a lista real de vozes dentro do modelo carregado
try:
    speakers = list(tts.synthesizer.tts_model.speaker_manager.speakers.keys())
except:
    # Fallback caso a estrutura mude em versões futuras do TTS
    speakers = tts.speakers

speakers.sort()
total_vozes = len(speakers)
print(f"Total de vozes detectadas: {total_vozes}")

# ==============================
# FUNÇÕES
# ==============================
def limpar_nome(nome):
    """Transforma 'Daisy Studious' em 'daisy_studious' para o Windows não reclamar"""
    nome = nome.lower().replace(" ", "_")
    return re.sub(r'[^a-z0-9_\-]', '', nome)

# ==============================
# EXECUÇÃO
# ==============================
os.makedirs(OUTPUT_DIR, exist_ok=True)
erros = []

start_time_total = time.time()

for i, speaker in enumerate(speakers, 1):
    nome_limpo = limpar_nome(speaker)
    file_path = os.path.join(OUTPUT_DIR, f"{nome_limpo}.wav")

    print(f"\n[{i}/{total_vozes}] Processando: {speaker}")

    if os.path.exists(file_path):
        print(f"  -> Arquivo '{nome_limpo}.wav' já existe. Pulando...")
        continue

    try:
        start_time_item = time.time()
        
        tts.tts_to_file(
            text=TEXTO,
            speaker=speaker,
            language=LANGUAGE,
            file_path=file_path
        )
        
        # Limpa cache da GPU após cada voz para evitar 'Out of Memory'
        if device == "cuda":
            torch.cuda.empty_cache()

        duration = time.time() - start_time_item
        print(f"  -> Sucesso! Tempo: {duration:.2f}s")
        
    except Exception as e:
        print(f"  -> [!] ERRO na voz {speaker}: {e}")
        erros.append((speaker, str(e)))

# ==============================
# RELATÓRIO FINAL
# ==============================
tempo_total = (time.time() - start_time_total) / 60

print("\n" + "="*40)
print(f"PROCESSO FINALIZADO EM {tempo_total:.2f} MINUTOS")
print(f"Arquivos salvos em: {os.path.abspath(OUTPUT_DIR)}")

if erros:
    print(f"\nTotal de falhas: {len(erros)}")
    for nome, erro in erros:
        print(f"- {nome}: {erro}")
else:
    print("\nParabéns! Todas as 58 vozes foram geradas sem erros.")
print("="*40)