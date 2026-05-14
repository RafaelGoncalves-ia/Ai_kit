# KIT Wan Runtime Changelog

## 1.0.0

- Criada fachada `backend/runtimes/wan/engine`.
- Adicionado alias `VIDEO_WAN_RUNTIME=kit_wan_legacy`.
- `comfy_gguf` permanece aceito e redireciona para o runtime interno da KIT.
- Proibida inicialização de servidor, UI, API, websocket ou queue daemon do ComfyUI.
- Adicionado manifesto versionado em `manifests/runtime.json`.
- Adicionadas validações leves para diagnose sem carregar modelo completo.

## Política de versionamento

- O runtime legacy nunca deve ser atualizado automaticamente.
- Atualizações são manuais e devem registrar commits de ComfyUI e ComfyUI-GGUF.
- Patches KIT devem ser descritos neste changelog.
- Após qualquer alteração, rodar `npm run diagnose:wan` e só então `VIDEO_ALLOW_HEAVY_TEST=true npm run test:wan:tiny`.
