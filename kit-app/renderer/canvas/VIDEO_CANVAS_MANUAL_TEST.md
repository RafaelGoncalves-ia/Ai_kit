# Teste manual: video no Canvas

1. Abrir o Canvas KIT IA.
2. Importar um arquivo MP4 local de aproximadamente 5 segundos pelo painel Midia.
3. Confirmar que o item aparece imediatamente na timeline e dentro da folha do Canvas.
4. Confirmar no DevTools que existe log `[MEDIA][VIDEO_IMPORT]` com `filePath`, `fileUrl`, `itemId`, `layerId`, `slideId`, `startTime`, `duration`, `sourceStart`, `sourceEnd`, dimensoes, `readyState` e `error`.
5. Mover e redimensionar o video no Canvas.
6. Mover o playhead dentro do intervalo do item e confirmar que o frame muda.
7. Cortar ou dividir o item na timeline e confirmar que o video continua visivel no trecho ativo.
8. Sobrepor texto ou imagem e confirmar que a ordem de camadas respeita o z-index visual.
9. Mover o playhead para fora do intervalo do video e confirmar que o item deixa de aparecer no tempo atual.
