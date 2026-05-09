(function bootstrapStudioState(globalScope) {
  const DEFAULT_TAB_IDS = ["briefing", "script"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeProject(input = {}) {
    const project = input && typeof input === "object" ? input : {};
    return {
      id: project.id || null,
      source: project.source || "studio",
      clientId: project.clientId ?? null,
      clientName: project.clientName || "Cliente nao definido",
      productName: project.productName || "",
      projectName: project.projectName || "Projeto Studio",
      status: project.status || "draft",
      currentStep: project.currentStep || "briefing",
      currentTab: project.currentTab || "briefing",
      unlockedTabs: ensureArray(project.unlockedTabs).length ? ensureArray(project.unlockedTabs) : [...DEFAULT_TAB_IDS],
      inputCommand: project.inputCommand || "",
      postCaption: project.postCaption || "",
      briefingApproved: Boolean(project.briefingApproved || project.briefing?.approved),
      attachments: ensureArray(project.attachments),
      createdAt: project.createdAt || null,
      updatedAt: project.updatedAt || null,
      resourceUsage: {
        vram: project.resourceUsage?.vram ?? "--",
        ram: project.resourceUsage?.ram ?? "--",
        gpu: project.resourceUsage?.gpu ?? "--",
        cpu: project.resourceUsage?.cpu ?? "--",
        disk: project.resourceUsage?.disk ?? "--"
      },
      progress: {
        currentTask: project.progress?.currentTask || "Aguardando briefing",
        percent: Number(project.progress?.percent || 0),
        completedSteps: Number(project.progress?.completedSteps || 0),
        totalSteps: Number(project.progress?.totalSteps || 2),
        elapsedMs: Number(project.progress?.elapsedMs || 0),
        elapsedSeconds: Math.max(0, Math.floor(Number(project.progress?.elapsedMs || 0) / 1000))
      },
      briefing: {
        approved: Boolean(project.briefing?.approved || project.briefingApproved),
        theme: project.briefing?.theme || "",
        purpose: project.briefing?.purpose || "",
        audience: project.briefing?.audience || "",
        visualMaterial: project.briefing?.visualMaterial || "",
        duration: project.briefing?.duration || "",
        mediaType: project.briefing?.mediaType || "",
        ratio: project.briefing?.ratio || "",
        platform: project.briefing?.platform || "",
        postType: project.briefing?.postType || "",
        videoContent: project.briefing?.videoContent || "",
        videoNarration: project.briefing?.videoNarration || "",
        bgmStyle: project.briefing?.bgmStyle || "",
        bgmId: project.briefing?.bgmId || "",
        subtitleInfo: project.briefing?.subtitleInfo || "",
        postCaption: project.briefing?.postCaption || "",
        characters: ensureArray(project.briefing?.characters),
        materialReferences: ensureArray(project.briefing?.materialReferences),
        ttsList: ensureArray(project.briefing?.ttsList),
        digitalHumanList: ensureArray(project.briefing?.digitalHumanList),
        styleList: ensureArray(project.briefing?.styleList),
        referenceNodeIds: ensureArray(project.briefing?.referenceNodeIds),
        rawReferences: project.briefing?.rawReferences || "",
        defaultsFromClientKit: project.briefing?.defaultsFromClientKit ?? null
      },
      script: {
        approved: Boolean(project.script?.approved),
        totalDuration: Number(project.script?.totalDuration || 0),
        scenes: ensureArray(project.script?.scenes)
      },
      production: {
        status: project.production?.status || "idle",
        jobs: ensureArray(project.production?.jobs),
        outputs: ensureArray(project.production?.outputs),
        errors: ensureArray(project.production?.errors)
      },
      canvasExport: {
        kiaPath: project.canvasExport?.kiaPath ?? null,
        ready: Boolean(project.canvasExport?.ready)
      },
      finalRender: {
        mp4Path: project.finalRender?.mp4Path ?? null,
        ready: Boolean(project.finalRender?.ready)
      }
    };
  }

  function normalizeViewModel(project) {
    const normalizedProject = normalizeProject(project);
    return {
      project: normalizedProject,
      clientName: normalizedProject.clientName,
      projectName: normalizedProject.projectName,
      flowType: normalizedProject.briefing.mediaType || "clip",
      currentTask: normalizedProject.progress.currentTask,
      currentTab: normalizedProject.currentTab,
      unlockedTabs: normalizedProject.unlockedTabs,
      progress: normalizedProject.progress,
      resources: normalizedProject.resourceUsage,
      messages: [],
      tabs: [
        { id: "briefing", label: "Briefing", icon: "../assets/icones/timeline/texto.svg" },
        { id: "script", label: "Roteiro", icon: "../assets/icones/timeline/filme.svg" }
      ]
    };
  }

  function createStudioState(initialProject = {}) {
    let project = normalizeProject(initialProject);

    return {
      getProject() {
        return clone(project);
      },
      getViewModel() {
        return clone(normalizeViewModel(project));
      },
      replaceProject(nextProject) {
        project = normalizeProject(nextProject);
        return this.getProject();
      },
      patchProject(patch = {}) {
        project = normalizeProject({
          ...project,
          ...patch,
          briefing: {
            ...project.briefing,
            ...(patch.briefing || {})
          },
          progress: {
            ...project.progress,
            ...(patch.progress || {})
          },
          resourceUsage: {
            ...project.resourceUsage,
            ...(patch.resourceUsage || {})
          }
        });
        return this.getProject();
      },
      updateBriefing(field, value) {
        project = normalizeProject({
          ...project,
          briefing: {
            ...project.briefing,
            [field]: value
          }
        });
        return this.getProject();
      }
    };
  }

  globalScope.StudioState = {
    createStudioState,
    normalizeProject,
    normalizeViewModel
  };
})(window);
