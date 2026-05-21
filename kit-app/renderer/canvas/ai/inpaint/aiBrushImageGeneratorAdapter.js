(function () {
  const DEFAULT_PADDING = 128;

  function waitForFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function yieldStep(status, message) {
    await status?.(message);
    await waitForFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function alignToMultiple(value, multiple = 8, fallback = 512) {
    const numeric = Math.max(multiple, Math.round(Number(value || fallback)));
    return Math.max(multiple, Math.round(numeric / multiple) * multiple);
  }

  function getGenerationSize(config = {}) {
    return {
      width: alignToMultiple(config.width, 8, 512),
      height: alignToMultiple(config.height, 8, 512)
    };
  }

  function makeCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function containRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / Math.max(1, sourceWidth), targetHeight / Math.max(1, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    return {
      x: Math.round((targetWidth - width) / 2),
      y: Math.round((targetHeight - height) / 2),
      width,
      height
    };
  }

  function canvasToBlob(canvas, type = "image/png") {
    if (canvas?.convertToBlob) {
      return canvas.convertToBlob({ type });
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao exportar PNG temporario."));
      }, type);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao converter PNG temporario."));
      reader.readAsDataURL(blob);
    });
  }

  async function canvasToDataUrlAsync(canvas) {
    return blobToDataUrl(await canvasToBlob(canvas, "image/png"));
  }

  function normalizeInpaintResponse(response = {}) {
    const firstImage = Array.isArray(response.images) ? response.images.find(Boolean) : "";
    const source = response.image
      || response.imageBase64
      || response.output
      || response.outputPath
      || response.path
      || response.url
      || firstImage
      || response.file
      || response.metadata?.output_file
      || "";
    if (!source) {
      console.error("[AI_BRUSH] no generated image in response", response);
      throw new Error("Resposta do inpaint nao trouxe imagem gerada.");
    }

    let imageSource = String(source || "").trim();
    let imageType = "path";
    if (/^data:image\//i.test(imageSource)) {
      imageType = "base64";
    } else if (/^[a-z0-9+/=]+$/i.test(imageSource) && imageSource.length > 128 && (response.imageBase64 || response.image)) {
      imageSource = `data:image/png;base64,${imageSource}`;
      imageType = "base64";
    } else if (/^(https?:|file:|blob:|\/)/i.test(imageSource)) {
      imageType = "url";
    }

    return {
      imageSource,
      imageType,
      metadata: response.metadata || {}
    };
  }

  function getInpaintOptions(config = {}) {
    const continuity = config.inpaintPreserveContinuity !== false;
    const feather = Math.max(0, Math.min(50, Math.round(Number(config.inpaintFeatherPx ?? 8))));
    const expand = Math.max(-20, Math.min(80, Math.round(Number(config.inpaintExpandPx ?? 8))));
    const padding = Math.max(0, Math.min(512, Math.round(Number(config.inpaintContextPaddingPx ?? DEFAULT_PADDING))));
    const inpaintArea = config.inpaintArea === "whole_picture" || config.inpaint_area === "whole_picture"
      ? "whole_picture"
      : "only_masked";
    const maskedContent = ["fill", "original", "latent_noise", "latent_nothing"].includes(config.maskedContent || config.masked_content)
      ? (config.maskedContent || config.masked_content)
      : "fill";
    const rawOutputMode = config.inpaintOutputMode || config.inpaint_output_mode || config.inpaintResultMode;
    const outputModeMap = {
      "active-layer": "replace_original",
      replace: "replace_original",
      replaceSelected: "replace_original",
      "full-layer": "new_full_layer",
      "new-layer": "new_full_layer",
      newLayer: "new_full_layer",
      "cropped-layer": "patch_layer",
      patch: "patch_layer"
    };
    const outputMode = outputModeMap[rawOutputMode] || rawOutputMode;
    return {
      inpaintArea,
      maskedContent,
      contextMode: "full",
      featherPx: continuity ? Math.max(feather, 12) : feather,
      expandPx: continuity ? Math.max(expand, 8) : expand,
      contextPaddingPx: continuity ? Math.max(padding, 128) : padding,
      continuity,
      outputMode: ["replace_original", "new_full_layer", "patch_layer"].includes(outputMode)
        ? outputMode
        : "new_full_layer"
    };
  }

  function prepareRoi({ layer, sourceCanvas, selectionMask, scenePointToImagePixel, options }) {
    if (options?.contextMode === "full") {
      return {
        originalBounds: { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height },
        paddedBounds: { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height }
      };
    }
    const bounds = selectionMask?.getBounds?.();
    if (!bounds) {
      throw new Error("SelectionMask ativa vazia.");
    }

    const corners = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.left + bounds.width, y: bounds.top },
      { x: bounds.left, y: bounds.top + bounds.height },
      { x: bounds.left + bounds.width, y: bounds.top + bounds.height }
    ].map((point) => scenePointToImagePixel(layer, point, sourceCanvas)).filter(Boolean);

    if (!corners.length) {
      throw new Error("Selecao fora da layer ativa.");
    }

    const minX = Math.min(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxX = Math.max(...corners.map((point) => point.x));
    const maxY = Math.max(...corners.map((point) => point.y));
    const padding = Math.max(0, Math.round(Number(options?.contextPaddingPx ?? DEFAULT_PADDING)))
      + Math.max(0, Math.round(Number(options?.expandPx || 0)))
      + Math.max(0, Math.round(Number(options?.featherPx || 0)));
    const padded = {
      x: Math.max(0, Math.floor(minX - padding)),
      y: Math.max(0, Math.floor(minY - padding)),
      width: 1,
      height: 1
    };
    padded.width = Math.max(1, Math.min(sourceCanvas.width - padded.x, Math.ceil(maxX - padded.x + padding)));
    padded.height = Math.max(1, Math.min(sourceCanvas.height - padded.y, Math.ceil(maxY - padded.y + padding)));

    return {
      originalBounds: {
        x: Math.max(0, Math.floor(minX)),
        y: Math.max(0, Math.floor(minY)),
        width: Math.max(1, Math.ceil(maxX - minX)),
        height: Math.max(1, Math.ceil(maxY - minY))
      },
      paddedBounds: padded
    };
  }

  async function cropMaskToCanvas({ imageMask, bounds, runPixelWorker, options }) {
    const result = await runPixelWorker?.("softMaskToImageData", {
      maskData: imageMask.data,
      width: imageMask.width,
      height: imageMask.height,
      sx: bounds.x,
      sy: bounds.y,
      sw: bounds.width,
      sh: bounds.height,
      featherPx: options?.featherPx ?? 8,
      expandPx: options?.expandPx ?? 8
    }).catch(() => null);

    if (!result?.imageData) {
      throw new Error("Nao foi possivel preparar a mascara da selecao.");
    }

    const canvas = makeCanvas(bounds.width, bounds.height);
    canvas.getContext("2d").putImageData(result.imageData, 0, 0);
    return canvas;
  }

  function makeBaseAndMaskCanvases({ sourceCanvas, maskCropCanvas, paddedBounds, generationSize }) {
    const contentRect = containRect(paddedBounds.width, paddedBounds.height, generationSize.width, generationSize.height);
    const baseCanvas = makeCanvas(generationSize.width, generationSize.height);
    const baseCtx = baseCanvas.getContext("2d");
    baseCtx.clearRect(0, 0, generationSize.width, generationSize.height);
    baseCtx.drawImage(
      sourceCanvas,
      paddedBounds.x,
      paddedBounds.y,
      paddedBounds.width,
      paddedBounds.height,
      contentRect.x,
      contentRect.y,
      contentRect.width,
      contentRect.height
    );

    const maskCanvas = makeCanvas(generationSize.width, generationSize.height);
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, generationSize.width, generationSize.height);
    maskCtx.save();
    maskCtx.globalCompositeOperation = "source-over";
    maskCtx.drawImage(maskCropCanvas, contentRect.x, contentRect.y, contentRect.width, contentRect.height);
    maskCtx.restore();

    return { baseCanvas, maskCanvas, contentRect };
  }

  function createAdapter(deps = {}) {
    async function run(promptText, context = {}) {
      const prompt = String(promptText || "").trim();
      if (!prompt) {
        throw new Error("Digite um prompt para editar a area.");
      }

      const layer = context.layer;
      const selectionMask = context.selectionMask;
      const imageMask = context.imageMask;
      if (!deps.isRasterEditableImage?.(layer)) {
        throw new Error("Pena IA precisa de uma layer raster ativa.");
      }
      if (!selectionMask || selectionMask.isEmpty?.()) {
        throw new Error("SelectionMask ativa obrigatoria para a Pena IA.");
      }
      if (!imageMask?.data) {
        throw new Error("InpaintMask da Pena IA indisponivel.");
      }
      if (typeof deps.inpaintStableDiffusionImage !== "function") {
        throw new Error("Endpoint de inpaint do Gerador de Imagem indisponivel.");
      }

      console.info("[AI_BRUSH] run inpaint start");
      await yieldStep(deps.status, "Recortando area selecionada...");
      const sourceCanvas = context.sourceCanvas || await deps.createRasterCanvasFromSource(
        deps.getImageSourceForRaster(layer),
        layer.getElement?.()
      );
      const generatorConfig = deps.getGeneratorConfig(prompt);
      const inpaintOptions = getInpaintOptions(generatorConfig);
      console.info("[AI_BRUSH] inpaint context mode", inpaintOptions.contextMode);
      console.info("[AI_BRUSH] continuity mode", inpaintOptions.continuity);
      console.info("[AI_BRUSH] feather px", inpaintOptions.featherPx);
      console.info("[AI_BRUSH] expand selection px", inpaintOptions.expandPx);
      console.info("[AI_BRUSH] context padding px", inpaintOptions.contextPaddingPx);
      console.info("[AI_BRUSH] output mode", inpaintOptions.outputMode);
      const roi = prepareRoi({
        layer,
        sourceCanvas,
        selectionMask,
        scenePointToImagePixel: deps.scenePointToImagePixel,
        options: inpaintOptions
      });
      const generationSize = getGenerationSize(generatorConfig);
      console.info("[AI_BRUSH] roi prepared", { ...roi, generationSize });
      console.info("[AI_BRUSH] export roi/full", inpaintOptions.contextMode === "full" ? "full" : "roi");

      await yieldStep(deps.status, "Redimensionando para o modelo...");
      const maskCropCanvas = await cropMaskToCanvas({
        imageMask,
        bounds: roi.paddedBounds,
        runPixelWorker: deps.runCanvasPixelWorker,
        options: inpaintOptions
      });
      console.info("[AI_BRUSH] soft mask created");
      const { baseCanvas, maskCanvas, contentRect } = makeBaseAndMaskCanvases({
        sourceCanvas,
        maskCropCanvas,
        paddedBounds: roi.paddedBounds,
        generationSize
      });

      await yieldStep(deps.status, "Exportando imagem base...");
      const baseDataUrl = await canvasToDataUrlAsync(baseCanvas);
      const initSaved = await deps.saveTempPng({
        dataUrl: baseDataUrl,
        layerId: layer.layerId || "ai-brush-base",
        name: deps.makeObjectName?.(layer) || "ai-brush-base",
        width: generationSize.width,
        height: generationSize.height
      });
      if (!initSaved?.filePath) {
        throw new Error("Nao foi possivel exportar a imagem base da Pena IA.");
      }
      console.info("[AI_BRUSH] active layer exported async");

      await yieldStep(deps.status, "Exportando mascara...");
      const maskDataUrl = await canvasToDataUrlAsync(maskCanvas);
      const maskSaved = await deps.saveTempPng({
        dataUrl: maskDataUrl,
        layerId: layer.layerId || "ai-brush-mask",
        name: `${deps.makeObjectName?.(layer) || "ai-brush"}-mask`,
        width: generationSize.width,
        height: generationSize.height
      });
      if (!maskSaved?.filePath) {
        throw new Error("Nao foi possivel exportar a mascara da Pena IA.");
      }
      console.info("[AI_BRUSH] selection mask exported for SD async");

      if (baseCanvas.width !== generationSize.width || baseCanvas.height !== generationSize.height ||
        maskCanvas.width !== generationSize.width || maskCanvas.height !== generationSize.height) {
        throw new Error("Imagem e mascara precisam ter a mesma resolucao do payload.");
      }
      console.info("[AI_BRUSH] image and mask dimensions checked", generationSize);

      const engineConfig = await deps.ensureImageEngineAndConfig?.();
      const config = deps.getGeneratorConfig(prompt, engineConfig);
      console.info("[AI_BRUSH] using image generator flow");
      console.info("[AI_BRUSH] selected model", config.checkpoint || config.model || "(none)");

      const metadata = {
        originalBounds: roi.originalBounds,
        paddedBounds: roi.paddedBounds,
        generationSize,
        scaleMode: "contain-padding",
        source: "canvas_ai_brush",
        contentRect,
        inpaintOptions
      };
      const payload = {
        ...config,
        mode: "inpaint",
        source: "canvas_ai_brush",
        prompt,
        negativePrompt: config.negativePrompt || config.negative_prompt || "",
        imagePath: initSaved.filePath,
        image_path: initSaved.filePath,
        initImagePath: initSaved.filePath,
        maskPath: maskSaved.filePath,
        mask_path: maskSaved.filePath,
        inpaintArea: inpaintOptions.inpaintArea,
        inpaint_area: inpaintOptions.inpaintArea,
        maskedContent: inpaintOptions.maskedContent,
        masked_content: inpaintOptions.maskedContent,
        inpaintOutputMode: inpaintOptions.outputMode,
        inpaint_output_mode: inpaintOptions.outputMode,
        width: generationSize.width,
        height: generationSize.height,
        targetLayerId: layer.layerId || null,
        aiBrushMetadata: metadata
      };
      console.info("[AI_BRUSH] inpaint request payload ready", {
        width: payload.width,
        height: payload.height,
        mode: payload.mode,
        source: payload.source
      });

      await yieldStep(deps.status, "Enviando para inpaint...");
      console.info("[AI_BRUSH] inpaint request sent");
      deps.startProgressPolling?.();
      await yieldStep(deps.status, "Gerando edicao IA...");
      const result = await deps.withTimeout(deps.inpaintStableDiffusionImage(payload), 180000);
      console.info("[AI_BRUSH] inpaint response raw", result);
      console.info("[AI_BRUSH] inpaint response received");
      const normalizedResponse = normalizeInpaintResponse(result || {});
      console.info("[AI_BRUSH] normalized response", normalizedResponse);

      return {
        ...result,
        metadata: {
          ...(result.metadata || {}),
          ...metadata,
          image_path: initSaved.filePath,
          mask_path: maskSaved.filePath,
          width: generationSize.width,
          height: generationSize.height
        },
        normalizedResponse,
        composition: {
          sourceCanvas,
          maskCropCanvas,
          paddedBounds: roi.paddedBounds,
          generationSize,
          contentRect,
          inpaintOptions
        }
      };
    }

    return { run };
  }

  window.AiBrushImageGeneratorAdapter = { create: createAdapter };
})();
