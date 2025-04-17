// Function to load current settings when the page loads
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
        console.error("Error loading settings:", error);
    }
}

function showPopup(message) {
    let popup = document.getElementById("popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "popup";
        popup.className = "popup";
        document.body.appendChild(popup);
    }
    popup.innerHTML = '<i class="bx bx-check-circle"></i> ' + message;
    popup.classList.add("show");

    setTimeout(() => {
        popup.classList.remove("show");
    }, 3000);
}

// Function to save all settings and refresh monitoring
async function saveAllAndRefresh() {
    try {
        const settings = {
            ping_timeout: document.getElementById("ping_timeout").value,
            log_level: document.getElementById("log_level").value,
            check_interval: document.getElementById("check_interval").value,
            retry_interval: document.getElementById("retry_interval").value,
            max_retries: document.getElementById("max_retries").value,
            parallel_pings: true, // Keeping default values for these
            ping_count: 3,
            cache_ttl: 300
        };

        const response = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        const result = await response.json();
        console.log(result);

        // Force refresh of monitoring by restarting the monitoring cycle
        const refreshResponse = await fetch("/api/refresh_monitoring", {
            method: "POST"
        }).catch(err => {
            console.log("Monitoring refresh not available, will refresh on next cycle");
        });

        // Show success popup
        showPopup("Settings saved and monitoring refreshed");
    } catch (error) {
        console.error("Error saving settings:", error);
        showPopup("Error saving settings: " + error.message);
    }
}

// Function to reset settings to default values
async function resetToDefault() {
    try {
        // Default settings based on the application defaults
        const defaultSettings = {
            ping_timeout: 3,
            log_level: "INFO",
            check_interval: 30,
            retry_interval: 1,
            max_retries: 3,
            parallel_pings: true,
            ping_count: 3,
            cache_ttl: 300
        };

        // Update UI with default values
        document.getElementById("ping_timeout").value = defaultSettings.ping_timeout;
        document.getElementById("log_level").value = defaultSettings.log_level;
        document.getElementById("check_interval").value = defaultSettings.check_interval;
        document.getElementById("retry_interval").value = defaultSettings.retry_interval;
        document.getElementById("max_retries").value = defaultSettings.max_retries;

        // Save the default settings to the server and refresh monitoring
        const response = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(defaultSettings)
        });
        const result = await response.json();
        console.log(result);

        // Force refresh of monitoring by restarting the monitoring cycle
        const refreshResponse = await fetch("/api/refresh_monitoring", {
            method: "POST"
        }).catch(err => {
            console.log("Monitoring refresh not available, will refresh on next cycle");
        });

        // Show success popup
        showPopup("Settings reset to default values and monitoring refreshed");
    } catch (error) {
        console.error("Error resetting settings:", error);
        showPopup("Error resetting settings: " + error.message);
    }
}

// Load settings when the page starts
window.onload = loadSettings;