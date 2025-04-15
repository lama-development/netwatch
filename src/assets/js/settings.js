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

// Function to update a single parameter
async function updateSetting(param) {
    try {
        // Get the new value from the input
        const input = document.getElementById(param);
        const newValue = input.value;

        // Get current settings
        const response = await fetch("/api/settings");
        const settings = await response.json();

        // Update only the specified parameter
        settings[param] = newValue;

        // Send updated settings to the server
        const updateResp = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        const result = await updateResp.json();
        console.log(result);

        // Show success popup
        showPopup("Settings updated successfully");
    } catch (error) {
        console.error("Error updating setting:", error);
    }
}

// Function to save all changes at once
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

        // Show success popup
        showPopup("Settings updated successfully");
    } catch (error) {
        console.error("Error saving settings:", error);
    }
}

// Load settings when the page starts
window.onload = loadSettings;