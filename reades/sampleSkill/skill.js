export default {
    name: "Sample Skill",               // Nome da Skill
    description: "Exemplo de Skill base para demonstração", // Descrição
    version: "1.0.0",
    active: true,                       // Se inicia ativa ou não
    configPath: "./config.html",        // Caminho para a tela de configuração
    settings: {                         // Configurações padrão
        exampleOption: true,
        exampleNumber: 5
    },
    init(context) {                     // Função chamada ao iniciar a Skill
        console.log("Sample Skill inicializada!");
    },
    run(context, input) {               // Função chamada para executar a Skill
        console.log("Sample Skill recebeu input:", input);
    }
}