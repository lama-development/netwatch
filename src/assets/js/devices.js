// src/assets/js/devices.js

document.addEventListener("DOMContentLoaded", function () {
    const devicesTableBody = document.getElementById("devices-table-body");
    const deviceForm = document.getElementById("device-form");
    const toggleAdvancedBtn = document.getElementById("toggle-advanced");
    const advancedSection = document.getElementById("advanced-section");
    
    let advancedVisible = false;
    toggleAdvancedBtn.addEventListener("click", function () {
        advancedVisible = !advancedVisible;
        if (advancedVisible) {
            advancedSection.classList.remove("hidden");
            toggleAdvancedBtn.textContent = "Hide Advanced";
        } else {
            advancedSection.classList.add("hidden");
            toggleAdvancedBtn.textContent = "Show Advanced";
        }
    });
    
    async function fetchDevices() {
        try {
            const response = await fetch("/api/devices");
            const data = await response.json();
            renderDevices(data.devices);
        } catch (error) {
            console.error("Error fetching devices:", error);
        }
    }
    
    function renderDevices(devices) {
        devicesTableBody.innerHTML = "";
        devices.forEach(device => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td>${device.type}</td>
                <td>${device.owner || ""}</td>
                <td>${device.custom_alerts || ""}</td>
                <td>
                    <button class="edit-button" data-id="${device.id}">Edit</button>
                    <button class="delete-button" data-id="${device.id}">Delete</button>
                </td>
            `;
            devicesTableBody.appendChild(row);
        });
    
        document.querySelectorAll(".delete-button").forEach(button => {
            button.addEventListener("click", async function () {
                const deviceId = this.getAttribute("data-id");
                if (confirm("Are you sure you want to delete this device?")) {
                    await deleteDevice(deviceId);
                    fetchDevices();
                }
            });
        });
    
        document.querySelectorAll(".edit-button").forEach(button => {
            button.addEventListener("click", function () {
                const deviceId = this.getAttribute("data-id");
                editDevice(deviceId);
            });
        });
    }
    
    async function deleteDevice(deviceId) {
        try {
            const response = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
            if (!response.ok) {
                alert("Error deleting device");
            }
        } catch (error) {
            console.error("Error deleting device:", error);
        }
    }
    
    async function editDevice(deviceId) {
        // For simplicity, using prompt dialogs; you could enhance this with a modal.
        const newName = prompt("Enter new device name:");
        if (!newName) return;
        const newIp = prompt("Enter new IP address:");
        if (!newIp) return;
        const newType = prompt("Enter new device type:");
        if (!newType) return;
        const newOwner = prompt("Enter new owner (optional):");
        const customAlertsInput = prompt("Enter custom alerts (comma-separated) [e.g., High Latency,Device Offline]:");
        const customAlerts = customAlertsInput ? customAlertsInput.split(",").map(a => a.trim()) : [];
        const newSubnet = prompt("Enter new subnet (optional):");
        const newGateway = prompt("Enter new gateway (optional):");
        const newDns = prompt("Enter new DNS (optional):");
    
        const updatedDevice = {
            name: newName,
            ip: newIp,
            type: newType,
            owner: newOwner,
            custom_alerts: customAlerts,
            subnet: newSubnet,
            gateway: newGateway,
            dns: newDns,
            mac_address: null
        };
    
        try {
            const response = await fetch(`/api/devices/${deviceId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedDevice)
            });
            if (!response.ok) {
                alert("Error updating device");
            } else {
                fetchDevices();
            }
        } catch (error) {
            console.error("Error updating device:", error);
        }
    }
    
    deviceForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const formData = new FormData(deviceForm);
    // Gather custom alerts from checkboxes into an array
        const customAlertsCheckboxes = document.querySelectorAll("input[name='custom_alerts']:checked");
        const customAlerts = Array.from(customAlertsCheckboxes).map(cb => cb.value);
        const deviceData = {
            name: formData.get("name"),
            ip: formData.get("ip"),
            type: formData.get("type"),
            mac_address: formData.get("mac_address"),
            owner: formData.get("owner"),
            custom_alerts: customAlerts,
            subnet: formData.get("subnet"),
            gateway: formData.get("gateway"),
            dns: formData.get("dns")
        };
    
        try {
            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(deviceData)
            });
            if (response.ok) {
                deviceForm.reset();
                // Uncheck custom alerts checkboxes manually if needed
                document.querySelectorAll("input[name='custom_alerts']").forEach(cb => cb.checked = false);
                fetchDevices();
            } else {
                alert("Error adding device");
            }
        } catch (error) {
            console.error("Error adding device:", error);
        }
    });
    
    // Initial load
    fetchDevices();
});