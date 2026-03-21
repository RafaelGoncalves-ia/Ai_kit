import torch
from TTS.api import TTS

class KitVoice:
    def __init__(self):
        print("Inicializando a fala da kit...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # Carrega o modelo uma única vez ao iniciar o sistema
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(self.device)
        self.speaker = "Daisy Studious"
        self.language = "pt"

    def falar(self, texto, output_path="output.wav", velocidade=1.0):
        try:
            self.tts.tts_to_file(
                text=texto,
                speaker=self.speaker,
                language=self.language,
                speed=velocidade,
                file_path=output_path
            )
            return True
        except Exception as e:
            print(f"Erro na fala: {e}")
            return False

# Exemplo de uso no seu KIT_IA:
# raposa = KitVoice()
# raposa.falar("Rafa, você vai mesmo clicar aí de novo?")