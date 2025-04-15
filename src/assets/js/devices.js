document.addEventListener("DOMContentLoaded", function () {
    const devicesTableBody = document.getElementById("devices-table-body");
    const deviceForm = document.getElementById("device-form");
    const submitButton = deviceForm.querySelector("button[type='submit']");
    const paginationContainer = document.getElementById("pagination");
    
    // State variables
    let cancelEditButton = null;
    let editingDeviceId = null;
    let devicesList = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    
    // Sorting state
    let currentSortColumn = null;
    let currentSortDirection = 1; // 1: ascending, -1: descending

    // Fetch devices from the API
    async function fetchDevices() {
        try {
            const response = await fetch("/api/devices");
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            devicesList = data.devices;
            currentPage = 1; // Reset pagination when data is refreshed
            
            updateSummaryWidget();
            renderDevicesTable();
            setupSorting();
        } catch (error) {
            console.error("Error fetching devices:", error);
            showErrorNotification("Failed to load devices. Please try again.");
        }
    }

    // Update the dynamic summary widget
    function updateSummaryWidget() {
        const totalNumberEl = document.getElementById("total-number");
        const categoriesContainer = document.getElementById("categories-container");
        if (!totalNumberEl || !categoriesContainer) return;

        // Update the total device count
        totalNumberEl.textContent = devicesList.length;

        // Aggregate counts by device type
        const summary = devicesList.reduce((acc, device) => {
            const type = device.type || "Other";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        // Clear previous category cards
        categoriesContainer.innerHTML = "";

        // Mapping of device types to Boxicons
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
                const deviceForm = document.getElementById("add-device");
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
            // Format display values with fallbacks for empty fields
            const customAlertsDisplay = formatCustomAlerts(device.custom_alerts);
            const ownerDisplay = device.owner || createPlaceholder();
            const alertsDisplay = customAlertsDisplay || createPlaceholder();

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td>${device.type}</td>
                <td>${ownerDisplay}</td>
                <td>${alertsDisplay}</td>
                <td>
                    <div class="action-buttons">
                        <button class="edit-button" data-id="${device.id}" data-tooltip="Edit">
                            <i class='bx bx-edit-alt'></i>
                        </button>
                        <button class="delete-button" data-id="${device.id}" data-tooltip="Delete">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </td>
            `;
            devicesTableBody.appendChild(row);
        });

        setupActionButtons();
        renderPagination(sortedDevices.length);
    }

    /**
     * Format custom alerts for display
     * @param {Array|string} alerts - Custom alerts as array or comma-separated string
     * @returns {string} Formatted alerts for display
     */
    function formatCustomAlerts(alerts) {
        if (!alerts) return "";
        
        if (Array.isArray(alerts)) {
            return alerts.join(", ");
        } else if (typeof alerts === "string") {
            return alerts.split(",").join(", ");
        }
        
        return "";
    }

    /**
     * Create a placeholder for empty fields
     * @returns {string} HTML for placeholder
     */
    function createPlaceholder() {
        return `<span style="color: var(--color-text-secondary);">/</span>`;
    }

    /**
     * Setup click handlers for edit and delete buttons
     */
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
                    
                    // Scroll to the form when edit button is clicked
                    const formSection = document.getElementById("add-device");
                    if (formSection) {
                        formSection.scrollIntoView({ behavior: "smooth" });
                    }
                }
            });
        });
    }

    /**
     * Delete a device from the database
     * @param {string|number} deviceId - ID of the device to delete
     */
    async function deleteDevice(deviceId) {
        try {
            const response = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
            if (!response.ok) {
                throw new Error("Failed to delete device");
            }
        } catch (error) {
            console.error("Error deleting device:", error);
            showErrorNotification("Error deleting device. Please try again.");
        }
    }

    /**
     * Populate the form with device data for editing
     * @param {Object} device - Device object to edit
     */
    function populateFormForEditing(device) {
        editingDeviceId = device.id;
        deviceForm.name.value = device.name;
        deviceForm.ip.value = device.ip;
        deviceForm.type.value = device.type;
        deviceForm.mac_address.value = device.mac_address || "";
        deviceForm.owner.value = device.owner || "";

        // Reset and set custom alerts checkboxes
        document.querySelectorAll("input[name='custom_alerts']").forEach(cb => {
            cb.checked = false;
        });
        
        if (device.custom_alerts) {
            const alertsArray = getAlertsArray(device.custom_alerts);
            
            alertsArray.forEach(alert => {
                document.querySelectorAll("input[name='custom_alerts']").forEach(checkbox => {
                    if (checkbox.value.trim().toLowerCase() === alert.toLowerCase()) {
                        checkbox.checked = true;
                    }
                });
            });
        }

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

    /**
     * Convert custom alerts to an array regardless of input format
     * @param {Array|string} alerts - Custom alerts data
     * @returns {Array} Array of alert strings
     */
    function getAlertsArray(alerts) {
        if (Array.isArray(alerts)) {
            return alerts;
        } else if (typeof alerts === "string" && alerts.trim().length > 0) {
            return alerts.split(",").map(s => s.trim());
        }
        return [];
    }

    /**
     * Reset the form back to add mode
     */
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

    /**
     * Handle form submission for add/update operations
     */
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
            custom_alerts: customAlerts
        };

        try {
            const isEditing = !!editingDeviceId;
            const url = isEditing ? `/api/devices/${editingDeviceId}` : "/api/devices";
            const method = isEditing ? "PUT" : "POST";
            
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(deviceData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            resetFormToAddMode();
            fetchDevices();
        } catch (error) {
            console.error("Error submitting device form:", error);
            showErrorNotification(`Error ${editingDeviceId ? 'updating' : 'adding'} device. Please try again.`);
        }
    });

    /**
     * Setup sorting on table headers
     */
    function setupSorting() {
        const thElements = document.querySelectorAll("thead th[data-sort]");
        thElements.forEach(th => {
            th.addEventListener("click", function () {
                const sortKey = this.getAttribute("data-sort");
                
                // Toggle sort direction or set new sort column
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

    /**
     * Render pagination controls
     * @param {number} totalItems - Total number of items to paginate
     */
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

    // Initialize the module
    fetchDevices();
});