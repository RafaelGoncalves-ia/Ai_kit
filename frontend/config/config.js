document.addEventListener("DOMContentLoaded", async () => {
    const aiModelSelect = document.getElementById("aiModel");
    const useXTTS = document.getElementById("useXTTS");
    const microphone = document.getElementById("microphone");
    const mute = document.getElementById("mute");
    const skillsList = document.getElementById("skillsList");
    const statusText = document.getElementById("status");

    // ==========================
    // Função para carregar o backend
    // ==========================
    async function loadConfig() {
        try {
            const res = await fetch("http://localhost:3000/config");
            const data = await res.json();

            // Modelos IA
            aiModelSelect.innerHTML = "";
            data.models.forEach(model => {
                const opt = document.createElement("option");
                opt.value = model;
                opt.textContent = model;
                if (model === data.currentAIModel) opt.selected = true;
                aiModelSelect.appendChild(opt);
            });

            // Voz / microfone
            useXTTS.checked = data.xttsEnabled;
            microphone.checked = data.microphoneEnabled;
            mute.checked = data.muted;

            // Skills
            skillsList.innerHTML = "";
            data.skills.forEach(skill => {
                const div = document.createElement("div");
                div.className = "skillItem";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = skill.active;
                checkbox.addEventListener("change", () => toggleSkill(skill.name, checkbox.checked));

                const label = document.createElement("span");
                label.textContent = skill.name;

                const configBtn = document.createElement("button");
                configBtn.textContent = "Config";
                configBtn.addEventListener("click", () => openSkillConfig(skill));

                div.appendChild(checkbox);
                div.appendChild(label);
                div.appendChild(configBtn);

                skillsList.appendChild(div);
            });

            statusText.textContent = "Status: Conectado";
        } catch (err) {
            console.error(err);
            statusText.textContent = "Status: erro ao carregar config";
        }
    }

    // ==========================
    // Toggle skill ativo / inativo
    // ==========================
    async function toggleSkill(name, active) {
        await fetch(`http://localhost:3000/skills/${name}`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ active })
        });
    }

    // ==========================
    // Abrir config da Skill
    // ==========================
    function openSkillConfig(skill) {
        if (!skill.configPath) return alert("Esta skill não possui configurações.");
        window.open(skill.configPath, "_blank", "width=500,height=600");
    }

    // ==========================
    // Salvar configurações globais
    // ==========================
    document.getElementById("saveBtn").addEventListener("click", async () => {
        const payload = {
            aiModel: aiModelSelect.value,
            xttsEnabled: useXTTS.checked,
            microphoneEnabled: microphone.checked,
            muted: mute.checked
        };

        await fetch("http://localhost:3000/config", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        alert("Configurações salvas!");
    });

    // Inicializar
    loadConfig();
});