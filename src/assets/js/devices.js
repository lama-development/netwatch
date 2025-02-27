// src/assets/js/devices.js

document.addEventListener("DOMContentLoaded", function () {

    async function fetchDevices() {
        try {
            const response = await fetch("/api/devices");
            const data = await response.json();
            const devices = data.devices;
            const tableBody = document.getElementById("devices-table-body");
            tableBody.innerHTML = ""; // Clear previous rows

            devices.forEach(device => {
                const row = document.createElement("tr");

            row.innerHTML = `
            <td>${device.name}</td>
            <td>${device.ip_address}</td>
            <td>${device.category}</td>
            <td>${device.os}</td>
            <td>
                <div class="action-buttons">
                <button class="edit-button">Edit</button>
                <button class="delete-button">Delete</button>
                </div>
            </td>
            `;

                // Add event listeners for the buttons
                const editBtn = row.querySelector(".edit-button");
                editBtn.addEventListener("click", () => editDevice(device));

                const deleteBtn = row.querySelector(".delete-button");
                deleteBtn.addEventListener("click", () => deleteDevice(device.id));

                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Error fetching devices:", error);
        }
    }

    async function deleteDevice(deviceId) {
        if (confirm("Are you sure you want to delete this device?")) {
            try {
                const response = await fetch(`/api/devices/${deviceId}`, {
                    method: "DELETE",
                });
                if (response.ok) {
                    fetchDevices(); // Refresh list
                } else {
                    alert("Failed to delete device.");
                }
            } catch (error) {
                console.error("Error deleting device:", error);
            }
        }
    }

    async function editDevice(device) {
        // Simple prompts for new values (you can enhance this with a modal form)
        const newName = prompt("Enter new name:", device.name);
        if (newName === null) return;
        const newIp = prompt("Enter new IP Address:", device.ip_address);
        if (newIp === null) return;
        const newCategory = prompt("Enter new category:", device.category);
        if (newCategory === null) return;
        const newOS = prompt("Enter new OS:", device.os);
        if (newOS === null) return;

        const updatedDevice = {
            name: newName,
            ip_address: newIp,
            category: newCategory,
            os: newOS
        };

        try {
            const response = await fetch(`/api/devices/${device.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedDevice)
            });
            if (response.ok) {
                fetchDevices();
            } else {
                alert("Failed to update device.");
            }
        } catch (error) {
            console.error("Error updating device:", error);
        }
    }

    // Handle add-device form submission
    const form = document.getElementById("add-device-form");
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const formData = new FormData(form);
        const device = {
            name: formData.get("name"),
            ip_address: formData.get("ip_address"),
            category: formData.get("category") || "",
            os: formData.get("os") || ""
        };

        try {
            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(device)
            });
            if (response.ok) {
                form.reset();
                fetchDevices();
            } else {
                alert("Error adding device.");
            }
        } catch (error) {
            console.error("Error adding device:", error);
            alert("Error adding device.");
        }
    });

    // Initial fetch
    fetchDevices();
});
