document.addEventListener("DOMContentLoaded", async () => {
    // Elementos do DOM
    const aiModelSelect = document.getElementById("aiModel");
    const useXTTS = document.getElementById("useXTTS");
    const microphone = document.getElementById("microphone");
    const mute = document.getElementById("mute");
    const skillsGrid = document.getElementById("skillsGrid");
    const statusIndicator = document.querySelector(".status-indicator");
    const statusText = document.getElementById("statusText");
    const versionSpan = document.getElementById("version");
    const backendStatus = document.getElementById("backendStatus");
    const activeSkillsCount = document.getElementById("activeSkillsCount");
    const reloadBtn = document.getElementById("reloadBtn");
    const saveBtn = document.getElementById("saveBtn");

    // Estado da aplicação
    let currentConfig = {};

    // ==========================
    // Função para atualizar status visual
    // ==========================
    function updateStatus(online, message) {
        statusIndicator.className = `status-indicator ${online ? 'status-online' : 'status-offline'}`;
        statusText.textContent = message;
    }

    // ==========================
    // Função para carregar configuração do backend
    // ==========================
    async function loadConfig() {
        try {
            updateStatus(false, "Carregando configuração...");

            // Carregar modelos disponíveis
            const modelsRes = await fetch("http://localhost:3001/models");
            const modelsData = await modelsRes.json();

            // Carregar configuração atual
            const configRes = await fetch("http://localhost:3001/config");
            const configData = await configRes.json();

            currentConfig = configData;

            // Preencher modelos IA
            aiModelSelect.innerHTML = "";
            modelsData.models.forEach(model => {
                const opt = document.createElement("option");
                opt.value = model.name;
                opt.textContent = `${model.name} (${model.size})`;
                if (model.name === configData.aiModel) opt.selected = true;
                aiModelSelect.appendChild(opt);
            });

            // Preencher configurações de voz
            useXTTS.checked = configData.xttsEnabled || false;
            microphone.checked = configData.microphoneEnabled || false;
            mute.checked = configData.muted || false;

            // Carregar e exibir skills
            await loadSkills();

            // Atualizar informações do sistema
            versionSpan.textContent = configData.version || "1.0.0";
            backendStatus.textContent = "Online";
            activeSkillsCount.textContent = configData.skills ? configData.skills.filter(s => s.active).length : 0;

            updateStatus(true, "Configuração carregada");
        } catch (err) {
            console.error("Erro ao carregar configuração:", err);
            updateStatus(false, "Erro ao conectar com o backend");
        }
    }

    // ==========================
    // Função para carregar skills
    // ==========================
    async function loadSkills() {
        try {
            const res = await fetch("http://localhost:3001/skills");
            const skills = await res.json();

            skillsGrid.innerHTML = "";

            if (skills.length === 0) {
                skillsGrid.innerHTML = '<div class="skill-card"><div>Nenhuma skill encontrada</div></div>';
                return;
            }

            skills.forEach(skill => {
                const skillCard = document.createElement("div");
                skillCard.className = "skill-card";

                skillCard.innerHTML = `
                    <div class="skill-header">
                        <span class="skill-name">${skill.name}</span>
                        <label class="switch">
                            <input type="checkbox" ${skill.active ? 'checked' : ''} data-skill="${skill.name}">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="skill-description">${skill.description || 'Sem descrição'}</div>
                    <div class="skill-actions">
                        ${skill.configPath ? `<button class="btn-secondary" data-config="${skill.configPath}">⚙️ Configurar</button>` : ''}
                        <button class="btn-primary" data-info="${skill.name}">ℹ️ Info</button>
                    </div>
                `;

                // Event listeners
                const checkbox = skillCard.querySelector('input[type="checkbox"]');
                checkbox.addEventListener("change", () => toggleSkill(skill.name, checkbox.checked));

                const configBtn = skillCard.querySelector('[data-config]');
                if (configBtn) {
                    configBtn.addEventListener("click", () => openSkillConfig(skill));
                }

                const infoBtn = skillCard.querySelector('[data-info]');
                infoBtn.addEventListener("click", () => showSkillInfo(skill));

                skillsGrid.appendChild(skillCard);
            });
        } catch (err) {
            console.error("Erro ao carregar skills:", err);
            skillsGrid.innerHTML = '<div class="skill-card"><div>Erro ao carregar skills</div></div>';
        }
    }

    // ==========================
    // Toggle skill ativo/inativo
    // ==========================
    async function toggleSkill(name, active) {
        try {
            const res = await fetch(`http://localhost:3001/skills/${name}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ active })
            });

            if (res.ok) {
                updateStatus(true, `Skill ${name} ${active ? 'ativada' : 'desativada'}`);
                await loadConfig(); // Recarregar para atualizar contadores
            } else {
                throw new Error("Erro na resposta do servidor");
            }
        } catch (err) {
            console.error("Erro ao alterar skill:", err);
            updateStatus(false, `Erro ao alterar skill ${name}`);
            // Reverter checkbox
            event.target.checked = !active;
        }
    }

    // ==========================
    // Abrir configuração da skill
    // ==========================
    function openSkillConfig(skill) {
        if (!skill.configPath) {
            alert("Esta skill não possui configurações personalizadas.");
            return;
        }

        // Abrir em nova janela/aba
        const configWindow = window.open(skill.configPath, `config_${skill.name}`, "width=600,height=700,scrollbars=yes,resizable=yes");
        if (!configWindow) {
            alert("Popup bloqueado! Permita popups para esta página.");
        }
    }

    // ==========================
    // Mostrar informações da skill
    // ==========================
    function showSkillInfo(skill) {
        const info = `
Nome: ${skill.name}
Descrição: ${skill.description || 'N/A'}
Status: ${skill.active ? 'Ativa' : 'Inativa'}
Configuração: ${skill.configPath ? 'Disponível' : 'Não disponível'}
        `;

        alert(info);
    }

    // ==========================
    // Salvar configurações globais
    // ==========================
    async function saveConfig() {
        const payload = {
            aiModel: aiModelSelect.value,
            xttsEnabled: useXTTS.checked,
            microphoneEnabled: microphone.checked,
            muted: mute.checked
        };

        try {
            updateStatus(false, "Salvando...");

            const res = await fetch("http://localhost:3001/config", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                updateStatus(true, "Configurações salvas com sucesso!");
                currentConfig = { ...currentConfig, ...payload };
                saveBtn.style.background = "";
                saveBtn.textContent = "💾 Salvar";
            } else {
                throw new Error("Erro na resposta do servidor");
            }
        } catch (err) {
            console.error("Erro ao salvar:", err);
            updateStatus(false, "Erro ao salvar configurações");
        }
    }

    // ==========================
    // Event listeners
    // ==========================
    reloadBtn.addEventListener("click", loadConfig);
    saveBtn.addEventListener("click", saveConfig);

    // Auto-indicação de mudanças não salvas
    aiModelSelect.addEventListener("change", () => {
        saveBtn.style.background = "#ffc107";
        saveBtn.textContent = "💾 Salvar (alterado)";
    });

    [useXTTS, microphone, mute].forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            saveBtn.style.background = "#ffc107";
            saveBtn.textContent = "💾 Salvar (alterado)";
        });
    });

    // ==========================
    // Inicialização
    // ==========================
    loadConfig();

    // Recarregar automaticamente a cada 30 segundos
    setInterval(loadConfig, 30000);
});