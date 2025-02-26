// Funzione per caricare le impostazioni correnti al caricamento della pagina
async function loadSettings() {
    try {
        const response = await fetch("/api/settings");
        const settings = await response.json();
        document.getElementById("ping_timeout").value = settings.ping_timeout;
        document.getElementById("log_level").value = settings.log_level;
        document.getElementById("check_interval").value = settings.check_interval;
        document.getElementById("retry_interval").value = settings.retry_interval;
        document.getElementById("max_retries").value = settings.max_retries;
    } catch (error) {
        console.error("Errore nel caricamento delle impostazioni:", error);
    }
}


// Funzione per aggiornare un singolo parametro
async function updateSetting(param) {
    try {
        // Recupera il nuovo valore dall'input
        const input = document.getElementById(param);
        const newValue = input.value;

        // Recupera le impostazioni correnti
        const response = await fetch("/api/settings");
        const settings = await response.json();

        // Aggiorna solo il parametro specificato
        settings[param] = newValue;

        // Invia le impostazioni aggiornate al server
        const updateResp = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        const result = await updateResp.json();
        console.log(result);
    } catch (error) {
        console.error("Errore nell'aggiornamento della setting:", error);
    }
}   

// Funzione per salvare tutte le modifiche contemporaneamente
async function saveAll() {
    try {
        const settings = {
            ping_timeout: document.getElementById("ping_timeout").value,
            log_level: document.getElementById("log_level").value,
            check_interval: document.getElementById("check_interval").value,
            retry_interval: document.getElementById("retry_interval").value,
            max_retries: document.getElementById("max_retries").value,
        };

        const response = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        const result = await response.json();
        console.log(result);
    } catch (error) {
        console.error("Errore nel salvataggio delle impostazioni:", error);
    }
}

// Carica le impostazioni all'avvio della pagina
window.onload = loadSettings;