const API_BASE = "http://localhost:3001";

document.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    checkHealth();
    setInterval(checkHealth, 10000); // Checa saúde a cada 10s
});

async function checkHealth() {
    const services = [
        { name: "Node Backend", url: `http://localhost:3001/status` },
        // Tentamos a raiz '/' em vez de '/status' se o servidor não tiver a rota
        { name: "XTTS Server", url: `http://localhost:5005/` }, 
        { name: "STT Server", url: `http://localhost:5006/` } 
    ];

    for (const service of services) {
        try {
            // Usamos 'no-cors' ou apenas checamos se houve resposta
            const res = await fetch(service.url, { 
                mode: 'no-cors', // Importante para evitar erros de CORS ao apenas checar saúde
                signal: AbortSignal.timeout(2000) 
            });
            
            // Se não deu erro de conexão, consideramos online
            const card = document.querySelector(`[data-server="${service.name}"] .status-led`);
            if (card) {
                card.className = 'status-led online';
            }
        } catch (e) {
            const card = document.querySelector(`[data-server="${service.name}"] .status-led`);
            if (card) {
                card.className = 'status-led offline';
            }
        }
    }
}

async function loadConfig() {
    try {
        // Carregar Modelos
        const mRes = await fetch(`${API_BASE}/models`);
        const mData = await mRes.json();
        const select = document.getElementById("aiModel");
        select.innerHTML = mData.models.map(m => 
            `<option value="${m.name}">${m.name} ${m.size ? `(${m.size})` : ''}</option>`
        ).join('');

        // Carregar Config Geral
        const cRes = await fetch(`${API_BASE}/config`);
        const config = await cRes.json();
        document.getElementById("aiModel").value = config.aiModel;
        document.getElementById("useXTTS").checked = config.xttsEnabled;
        document.getElementById("microphone").checked = config.microphoneEnabled;

        // Carregar Skills
        await loadSkills();
        
        document.getElementById("statusText").textContent = "Sistema Sincronizado";
    } catch (err) {
        document.getElementById("statusText").textContent = "Erro ao conectar ao Backend";
    }
}

async function loadSkills() {
    const res = await fetch(`${API_BASE}/skills`);
    const skills = await res.json();
    const grid = document.getElementById("skillsGrid");
    grid.innerHTML = "";

    let activeCount = 0;
    skills.forEach(skill => {
        if(skill.active) activeCount++;
        const card = document.createElement("div");
        card.className = "skill-card";
        card.innerHTML = `
            <div class="skill-header">
                <strong>${skill.name}</strong>
                <label class="switch">
                    <input type="checkbox" ${skill.active ? 'checked' : ''} onchange="toggleSkill('${skill.name}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <p>${skill.description || 'Sem descrição'}</p>
            <button class="btn-log-small" onclick="window.open('../skills/${skill.name}/config.html')">⚙️ Configurar</button>
        `;
        grid.appendChild(card);
    });
    document.getElementById("activeSkillsCount").textContent = activeCount;
}

async function toggleSkill(name, active) {
    await fetch(`${API_BASE}/skills/${name}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ active })
    });
    document.getElementById("statusText").textContent = `Skill ${name} alterada`;
}

document.getElementById("saveBtn").addEventListener("click", async () => {
    const payload = {
        aiModel: document.getElementById("aiModel").value,
        xttsEnabled: document.getElementById("useXTTS").checked,
        microphoneEnabled: document.getElementById("microphone").checked
    };
    
    const res = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        const btn = document.getElementById("saveBtn");
        btn.textContent = "✅ Salvo!";
        setTimeout(() => btn.textContent = "💾 Salvar Configurações", 2000);
    }
});

function openLog(port) {
    window.open(`http://localhost:3002/logs?port=${port}`, '_blank');
}