document.addEventListener("DOMContentLoaded", function () {
    const devicesTableBody = document.getElementById("devices-table-body");
    const deviceForm = document.getElementById("device-form");
    const toggleAdvancedBtn = document.getElementById("toggle-advanced");
    const advancedSection = document.getElementById("advanced-section");
    const submitButton = deviceForm.querySelector("button[type='submit']");
    let cancelEditButton = null; // will be created on-demand
    const paginationContainer = document.getElementById("pagination"); // ensure this exists in your HTML

    let editingDeviceId = null;
    let advancedVisible = false;
    let devicesList = []; // full list of devices fetched from the server
    let currentPage = 1;
    const itemsPerPage = 10; // adjust as needed

    // Sorting variables
    let currentSortColumn = null;
    let currentSortDirection = 1; // 1: ascending, -1: descending

    // Toggle advanced section
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

    // Fetch devices from the API
    async function fetchDevices() {
        try {
            const response = await fetch("/api/devices");
            const data = await response.json();
            devicesList = data.devices;
            currentPage = 1; // reset pagination when data is refreshed
            updateSummaryWidget(); // update our summary widget with real data
            renderDevicesTable();
            setupSorting();
        } catch (error) {
            console.error("Error fetching devices:", error);
        }
    }

    // Update the dynamic summary widget
    function updateSummaryWidget() {
        const totalNumberEl = document.getElementById("total-number");
        const categoriesContainer = document.getElementById("categories-container");
        if (!totalNumberEl || !categoriesContainer) return;

        // Update the total device count
        totalNumberEl.textContent = devicesList.length;

        // Aggregate counts by device type (using 'Other' as fallback)
        const summary = {};
        devicesList.forEach(device => {
            const type = device.type || "Other";
            summary[type] = (summary[type] || 0) + 1;
        });

        // Clear previous category cards
        categoriesContainer.innerHTML = "";

        // Mapping of device types to Boxicons (customize as needed)
        const categoryIcons = {
            "Computer": "bx-desktop",
            "Printer": "bx-printer",
            "Router": "bx-network-chart",
            "Switch": "bx-transfer",
            "Server": "bx-server",
            "Firewall": "bx-shield",
            "Access Point": "bx-wifi",
            "Other": "bx-devices"
        };
        const defaultIcon = "bx-device";

        // Create a card for each category
        Object.entries(summary).forEach(([category, count]) => {
            const iconClass = categoryIcons[category] || defaultIcon;
            const card = document.createElement("div");
            card.classList.add("category-card");
            card.setAttribute("data-category", category);
            card.innerHTML = `
                <i class="bx ${iconClass} category-icon"></i>
                <div class="category-info">
                    <div class="category-name">${category}</div>
                    <div class="category-count">${count}</div>
                </div>
                <button class="add-device" data-category="${category}" title="Add ${category}">
                    <i class="bx bx-plus-circle"></i>
                </button>
            `;
            categoriesContainer.appendChild(card);
        });

        // Attach click events to plus buttons on category cards
        document.querySelectorAll(".devices-summary-widget .add-device").forEach(button => {
            button.addEventListener("click", function () {
                const category = this.getAttribute("data-category");
                // Pre-fill the type field of the device form
                const typeField = document.getElementById("type");
                if (typeField) {
                    typeField.value = category;
                }
                // Scroll smoothly to the device form
                const deviceForm = document.getElementById("device-form");
                if (deviceForm) {
                    deviceForm.scrollIntoView({ behavior: "smooth" });
                }
            });
        });
    }

    // Render the devices table with pagination and sorting applied
    function renderDevicesTable() {
        // Apply sorting if active
        let sortedDevices = [...devicesList];
        if (currentSortColumn) {
            sortedDevices.sort((a, b) => {
                let valA = a[currentSortColumn] || "";
                let valB = b[currentSortColumn] || "";
                // For custom alerts, join arrays if necessary
                if (Array.isArray(valA)) valA = valA.join(", ");
                if (Array.isArray(valB)) valB = valB.join(", ");
                if (typeof valA === "string") valA = valA.toLowerCase();
                if (typeof valB === "string") valB = valB.toLowerCase();
                if (valA < valB) return -1 * currentSortDirection;
                if (valA > valB) return 1 * currentSortDirection;
                return 0;
            });
        }

        // Apply pagination logic
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedDevices = sortedDevices.slice(startIndex, startIndex + itemsPerPage);

        devicesTableBody.innerHTML = "";
        paginatedDevices.forEach(device => {
            // Format custom alerts with a space after commas
            let customAlertsDisplay = "";
            if (device.custom_alerts) {
                if (Array.isArray(device.custom_alerts)) {
                    customAlertsDisplay = device.custom_alerts.join(", ");
                } else {
                    customAlertsDisplay = device.custom_alerts.split(",").join(", ");
                }
            }
            // Similarly for owner or custom alerts if desired:
            const ownerDisplay = device.owner ? device.owner : `<span style="color: var(--color-text-secondary);">/</span>`;
            const alertsDisplay = customAlertsDisplay ? customAlertsDisplay : `<span style="color: var(--color-text-secondary);">/</span>`;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td>${device.type}</td>
                <td>${ownerDisplay}</td>
                <td>${alertsDisplay}</td>
                <td>
                    <div class="action-buttons">
                        <button class="edit-button" data-id="${device.id}">Edit</button>
                        <button class="delete-button" data-id="${device.id}">Delete</button>
                    </div>
                </td>
            `;
            devicesTableBody.appendChild(row);
        });

        setupActionButtons();
        renderPagination(sortedDevices.length);
    }

    // Setup click handlers for edit and delete buttons
    function setupActionButtons() {
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
                const device = devicesList.find(d => d.id == deviceId);
                if (device) {
                    populateFormForEditing(device);
                }
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

    // Populate the form with device data for editing
    function populateFormForEditing(device) {
        editingDeviceId = device.id;
        deviceForm.name.value = device.name;
        deviceForm.ip.value = device.ip;
        deviceForm.type.value = device.type;
        deviceForm.mac_address.value = device.mac_address || "";
        deviceForm.owner.value = device.owner || "";

        // Reset custom alerts checkboxes
        document.querySelectorAll("input[name='custom_alerts']").forEach(cb => {
            cb.checked = false;
        });
        if (device.custom_alerts) {
            let alertsArray = [];
            if (Array.isArray(device.custom_alerts)) {
                alertsArray = device.custom_alerts;
            } else if (typeof device.custom_alerts === "string" && device.custom_alerts.trim().length > 0) {
                alertsArray = device.custom_alerts.split(",").map(s => s.trim());
            }
            alertsArray.forEach(alert => {
                document.querySelectorAll("input[name='custom_alerts']").forEach(checkbox => {
                    if (checkbox.value.trim().toLowerCase() === alert.toLowerCase()) {
                        checkbox.checked = true;
                    }
                });
            });
        }

        deviceForm.subnet.value = device.subnet || "";
        deviceForm.gateway.value = device.gateway || "";
        deviceForm.dns.value = device.dns || "";
        submitButton.textContent = "Update Device";

        // Create and add a cancel edit button only when in edit mode
        if (!cancelEditButton) {
            cancelEditButton = document.createElement("button");
            cancelEditButton.type = "button";
            cancelEditButton.textContent = "Cancel Edit";
            cancelEditButton.id = "cancel-edit";
            cancelEditButton.addEventListener("click", resetFormToAddMode);
            deviceForm.appendChild(cancelEditButton);
        }
    }

    // Reset the form back to add mode
    function resetFormToAddMode() {
        editingDeviceId = null;
        deviceForm.reset();
        document.querySelectorAll("input[name='custom_alerts']").forEach(cb => {
            cb.checked = false;
        });
        submitButton.textContent = "Add Device";
        if (cancelEditButton) {
            cancelEditButton.remove();
            cancelEditButton = null;
        }
    }

    // Handle form submission for add/update
    deviceForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const formData = new FormData(deviceForm);
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
            let response;
            if (editingDeviceId) {
                response = await fetch(`/api/devices/${editingDeviceId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(deviceData)
                });
            } else {
                response = await fetch("/api/devices", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(deviceData)
                });
            }
            if (response.ok) {
                resetFormToAddMode();
                fetchDevices();
            } else {
                alert(`Error ${editingDeviceId ? 'updating' : 'adding'} device`);
            }
        } catch (error) {
            console.error("Error submitting device form:", error);
        }
    });

    // Setup sorting on table headers
    function setupSorting() {
        const thElements = document.querySelectorAll("thead th[data-sort]");
        thElements.forEach(th => {
            th.addEventListener("click", function () {
                const sortKey = this.getAttribute("data-sort");
                if (currentSortColumn === sortKey) {
                    currentSortDirection *= -1;
                } else {
                    currentSortColumn = sortKey;
                    currentSortDirection = 1;
                }
                // Reset all sort icons to default
                document.querySelectorAll("thead th[data-sort] i").forEach(icon => {
                    icon.className = "bx bx-sort";
                });
                // Update icon for clicked header based on sort direction
                const icon = this.querySelector("i");
                if (icon) {
                    icon.className = currentSortDirection === 1 ? "bx bx-sort-up" : "bx bx-sort-down";
                }
                renderDevicesTable();
            });
        });
    }

    // Render pagination controls
    function renderPagination(totalItems) {
        if (!paginationContainer) return;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        paginationContainer.innerHTML = "";

        // Previous button
        const prevButton = document.createElement("button");
        prevButton.textContent = "Previous";
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener("click", function () {
            if (currentPage > 1) {
                currentPage--;
                renderDevicesTable();
            }
        });
        paginationContainer.appendChild(prevButton);

        // Page info
        const pageInfo = document.createElement("span");
        pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `;
        paginationContainer.appendChild(pageInfo);

        // Next button
        const nextButton = document.createElement("button");
        nextButton.textContent = "Next";
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener("click", function () {
            if (currentPage < totalPages) {
                currentPage++;
                renderDevicesTable();
            }
        });
        paginationContainer.appendChild(nextButton);
    }

    // Initial load
    fetchDevices();
});
