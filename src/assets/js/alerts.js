document.addEventListener("DOMContentLoaded", function() {
    // DOM elements
    const totalAlertsElement = document.getElementById("total-alerts");
    const criticalCountElement = document.querySelector("#level-critical .level-count");
    const warningCountElement = document.querySelector("#level-warning .level-count");
    const infoCountElement = document.querySelector("#level-info .level-count");
    const alertsTableBody = document.getElementById("alerts-table-body");
    const noAlertsMessage = document.getElementById("no-alerts-message");
    const paginationContainer = document.getElementById("pagination");
    const filterSeverity = document.getElementById("filter-severity");
    const filterStatus = document.getElementById("filter-status");
    const alertModal = document.getElementById("alert-modal");
    const alertSettingsForm = document.getElementById("alert-settings-form");

    // Gestore specifico per il pulsante di chiusura del modale
    document.querySelector(".close-modal").addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation(); // Evita la propagazione dell'evento
        document.getElementById("alert-modal").classList.remove("show");
    });

    // State management
    let allAlerts = []; // Will store all alerts
    let filteredAlerts = []; // Will store filtered alerts
    let currentPage = 1;
    const itemsPerPage = 10;
    let currentAlertId = null;
    // Dashboard summary counts
    let summary = {
        total: 0,
        critical: 0,
        warning: 0,
        info: 0
    };
    // Sorting state
    let currentSortColumn = "timestamp";
    let currentSortDirection = -1; // -1: descending (newest first), 1: ascending
    // Flag to track if alerts are loading for the first time
    let isInitialLoad = true;

    // Load alerts on page load
    loadAlerts();
    
    // Set up automatic refresh interval (every 30 seconds)
    setInterval(loadAlerts, 30000);
    
    // Load settings on page load
    loadSettings();

    // Event listeners
    filterSeverity.addEventListener("change", applyFilters);
    filterStatus.addEventListener("change", applyFilters);
    
    // Also close modal when clicking outside of the modal content
    if (alertModal) {
        alertModal.addEventListener("click", (event) => {
            // Close only if clicking on the background, not the modal content
            if (event.target === alertModal) {
                alertModal.classList.remove("show");
            }
        });
    }
    
    alertSettingsForm.addEventListener("submit", saveSettings);
    
    document.getElementById("acknowledge-alert").addEventListener("click", async () => {
        await acknowledgeAlert(currentAlertId);
        alertModal.classList.remove("show");
        loadAlerts();
    });
    
    document.getElementById("resolve-alert").addEventListener("click", async () => {
        await resolveAlert(currentAlertId);
        alertModal.classList.remove("show");
    });

    // Load alerts from the API
    async function loadAlerts() {
        try {
            // First, fetch the summary for the dashboard counts
            const summaryResponse = await fetch("/api/alerts/summary");
            if (!summaryResponse.ok) {
                throw new Error("Failed to fetch alert summary");
            }
            
            const summaryData = await summaryResponse.json();
            summary = summaryData; // Store the full summary object
            
            // Update the counts in the UI
            updateDashboardCounts();
            
            // Get the selected status filter
            const statusFilter = filterStatus.value;
            let apiUrl = "/api/alerts";
            
            // Add status filter to API call if needed
            if (statusFilter !== "all") {
                apiUrl += `?status=${statusFilter}`;
            } else {
                // Explicitly exclude resolved alerts
                apiUrl += "?exclude_resolved=true";
            }
            
            // Fetch all alerts
            const alertsResponse = await fetch(apiUrl);
            if (!alertsResponse.ok) {
                throw new Error("Failed to fetch alerts");
            }
            
            const data = await alertsResponse.json();
            allAlerts = data.alerts || [];
            
            // Apply any active filters
            applyFilters();
            
            // Show success message only on first load or on explicit refresh action
            if (isInitialLoad) {
                isInitialLoad = false;
                // No need to show a popup on initial load
            }
        } catch (error) {
            console.error("Error loading alerts:", error);
            showPopup("Error loading alerts. Please try again.", "error");
        }
    }
    
    // Update dashboard counts
    function updateDashboardCounts() {
        totalAlertsElement.textContent = summary.total || "0";
        criticalCountElement.textContent = summary.critical || "0";
        warningCountElement.textContent = summary.warning || "0";
        infoCountElement.textContent = summary.info || "0";
    }
    
    // In a real application, this would fetch settings from the API
    function loadSettings() {
        // These would be retrieved from an API in a real application
        // For now, use default settings
        const settings = {
            email_notifications: true,
            notification_email: "admin@example.com",
            alert_retention: 30,
            cpu_threshold: 80,
            memory_threshold: 80,
            latency_threshold: 200,
            packet_loss_threshold: 5
        };
        
        // Populate form fields
        document.getElementById("email-notifications").checked = settings.email_notifications;
        document.getElementById("notification-email").value = settings.notification_email;
        document.getElementById("alert-retention").value = settings.alert_retention;
        document.getElementById("cpu-threshold").value = settings.cpu_threshold;
        document.getElementById("memory-threshold").value = settings.memory_threshold;
        document.getElementById("latency-threshold").value = settings.latency_threshold;
        document.getElementById("packet-loss-threshold").value = settings.packet_loss_threshold;
    }
    
    // Save settings (in a real app, this would make an API call)
    function saveSettings(event) {
        event.preventDefault();
        
        const settings = {
            email_notifications: document.getElementById("email-notifications").checked,
            notification_email: document.getElementById("notification-email").value,
            alert_retention: document.getElementById("alert-retention").value,
            cpu_threshold: document.getElementById("cpu-threshold").value,
            memory_threshold: document.getElementById("memory-threshold").value,
            latency_threshold: document.getElementById("latency-threshold").value,
            packet_loss_threshold: document.getElementById("packet-loss-threshold").value
        };
        
        // In a real application, this would be an API call
        console.log("Saving settings:", settings);
        
        // Show success message
        showPopup("Alert settings saved successfully");
    }
    
    // Apply filters to the alerts list
    function applyFilters() {
        const severityFilter = filterSeverity.value;
        const statusFilter = filterStatus.value;
        
        filteredAlerts = allAlerts.filter(alert => {
            // Apply severity filter
            if (severityFilter !== "all" && alert.severity !== severityFilter) {
                return false;
            }
            
            // Apply status filter if not "all"
            if (statusFilter !== "all" && alert.status !== statusFilter) {
                return false;
            }
            
            return true;
        });
        
        // Reset to first page when filtering
        currentPage = 1;
        
        // Render the filtered and sorted alerts
        renderAlerts();
    }
    
    // Render alerts in the table
    function renderAlerts() {
        // Sort alerts if a sort column is selected
        if (currentSortColumn) {
            filteredAlerts.sort((a, b) => {
                const valA = a[currentSortColumn];
                const valB = b[currentSortColumn];
                
                if (valA < valB) return -1 * currentSortDirection;
                if (valA > valB) return 1 * currentSortDirection;
                return 0;
            });
        }
        
        // Clear the table body
        alertsTableBody.innerHTML = "";
        
        // Show/hide the no alerts message
        if (filteredAlerts.length === 0) {
            noAlertsMessage.classList.remove("hidden");
            paginationContainer.classList.add("hidden");
        } else {
            noAlertsMessage.classList.add("hidden");
            paginationContainer.classList.remove("hidden");
            
            // Apply pagination
            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedAlerts = filteredAlerts.slice(startIndex, startIndex + itemsPerPage);
            
            // Add rows to the table
            paginatedAlerts.forEach(alert => {
                const row = document.createElement("tr");
                
                // Format the timestamp for display
                const timestamp = new Date(alert.timestamp);
                const formattedDate = timestamp.toLocaleDateString();
                const formattedTime = timestamp.toLocaleTimeString();
                
                // Create a badge for the severity
                const severityBadge = `<span class="alert-badge ${alert.severity}">${alert.severity}</span>`;
                
                row.innerHTML = `
                    <td>${formattedDate} ${formattedTime}</td>
                    <td>${alert.device_name}</td>
                    <td>${severityBadge}</td>
                    <td>${alert.type}</td>
                    <td>${alert.message}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="detail-button" data-id="${alert.id}" data-tooltip="Dettagli">
                                <i class='bx bx-info-circle'></i>
                            </button>
                            <button class="resolve-button" data-id="${alert.id}" data-tooltip="Risolvi">
                                <i class='bx bx-check-double'></i>
                            </button>
                        </div>
                    </td>
                `;
                
                alertsTableBody.appendChild(row);
            });
            
            // Add click handlers to buttons
            document.querySelectorAll(".detail-button").forEach(button => {
                button.addEventListener("click", function() {
                    const alertId = parseInt(this.getAttribute("data-id"));
                    showAlertDetails(alertId);
                });
            });
            
            document.querySelectorAll(".resolve-button").forEach(button => {
                button.addEventListener("click", async function() {
                    const alertId = parseInt(this.getAttribute("data-id"));
                    await resolveAlert(alertId);
                });
            });
            
            // Render pagination
            renderPagination();
        }
    }
    
    // Handle clicking on alert details button
    function showAlertDetails(alertId) {
        // Find the alert in our data
        const alert = allAlerts.find(a => a.id === alertId);
        if (!alert) return;
        
        // Store the current alert ID for modal actions
        currentAlertId = alertId;
        
        // Format the timestamp for display
        const timestamp = new Date(alert.timestamp);
        const formattedDateTime = `${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
        
        // Update modal content
        document.getElementById("modal-device").textContent = alert.device_name;
        document.getElementById("modal-time").textContent = formattedDateTime;
        document.getElementById("modal-type").textContent = alert.type;
        document.getElementById("modal-severity").textContent = alert.severity;
        document.getElementById("modal-status").textContent = alert.status;
        document.getElementById("modal-message").textContent = alert.message;
        document.getElementById("modal-description").textContent = alert.description || "No additional description available.";
        
        // Show/hide action buttons based on alert status
        const acknowledgeButton = document.getElementById("acknowledge-alert");
        const resolveButton = document.getElementById("resolve-alert");
        
        if (alert.status === "active") {
            acknowledgeButton.style.display = "flex";
            resolveButton.style.display = "flex";
        } else if (alert.status === "acknowledged") {
            acknowledgeButton.style.display = "none";
            resolveButton.style.display = "flex";
        } else {
            acknowledgeButton.style.display = "none";
            resolveButton.style.display = "none";
        }
        
        // Show the modal
        alertModal.classList.add("show");
    }
    
    // Handle acknowledging an alert
    async function acknowledgeAlert(alertId) {
        try {
            // Call the API to acknowledge the alert
            const response = await fetch(`/api/alerts/${alertId}/acknowledge`, {
                method: "PUT"
            });
            
            if (!response.ok) {
                throw new Error("Failed to acknowledge alert");
            }
            
            // Show success message
            showPopup("Alert acknowledged successfully");
            
            // Update the local alert in our list so we don't need to reload
            const alertIndex = allAlerts.findIndex(alert => alert.id === alertId);
            if (alertIndex !== -1) {
                allAlerts[alertIndex].status = "acknowledged";
                applyFilters();
            }
        } catch (error) {
            console.error("Error acknowledging alert:", error);
            showPopup("Error acknowledging alert. Please try again.", "error");
        }
    }
    
    // Handle resolving an alert
    async function resolveAlert(alertId) {
        try {
            // Find the alert to identify its severity
            const alertIndex = allAlerts.findIndex(alert => alert.id === alertId);
            if (alertIndex === -1) {
                throw new Error("Alert not found");
            }
            
            const alertToResolve = allAlerts[alertIndex];
            
            // Call the API to resolve the alert with persistent flag
            const response = await fetch(`/api/alerts/${alertId}/resolve`, {
                method: "PUT",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    permanent: true
                })
            });
            
            if (!response.ok) {
                throw new Error("Failed to resolve alert");
            }
            
            // Update summary counts based on the severity of the resolved alert
            if (summary.total > 0) summary.total--;
            if (alertToResolve.severity === "critical" && summary.critical > 0) summary.critical--;
            if (alertToResolve.severity === "warning" && summary.warning > 0) summary.warning--;
            if (alertToResolve.severity === "info" && summary.info > 0) summary.info--;
            
            // Update the dashboard counts immediately
            updateDashboardCounts();
            
            // Remove the alert from the allAlerts array
            allAlerts.splice(alertIndex, 1);
            
            // Update the filtered alerts and re-render
            applyFilters();
            
            // Show success message
            showPopup("Alert resolved successfully");
        } catch (error) {
            console.error("Error resolving alert:", error);
            showPopup("Error resolving alert. Please try again.", "error");
        }
    }
    
    // Render pagination controls
    function renderPagination() {
        if (!paginationContainer) return;
        
        const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage);
        paginationContainer.innerHTML = "";
        
        // Create previous button
        const prevButton = document.createElement("button");
        prevButton.textContent = "Previous";
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderAlerts();
            }
        });
        paginationContainer.appendChild(prevButton);
        
        // Create page info
        const pageInfo = document.createElement("span");
        pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        paginationContainer.appendChild(pageInfo);
        
        // Create next button
        const nextButton = document.createElement("button");
        nextButton.textContent = "Next";
        nextButton.disabled = currentPage === totalPages || totalPages === 0;
        nextButton.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderAlerts();
            }
        });
        paginationContainer.appendChild(nextButton);
    }
    
    document.querySelectorAll("thead th[data-sort]").forEach(th => {
        th.addEventListener("click", function() {
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
            
            // Update icon for clicked header
            const icon = this.querySelector("i");
            if (icon) {
                icon.className = currentSortDirection === 1 ? "bx bx-sort-up" : "bx bx-sort-down";
            }
            
            renderAlerts();
        });
    });
    
    // Show notification popup
    function showPopup(message, type = "success") {
        let popup = document.getElementById("popup");
        if (!popup) {
            popup = document.createElement("div");
            popup.id = "popup";
            popup.className = "popup";
            document.body.appendChild(popup);
        }
        
        // Set appropriate classes based on message type
        popup.className = "popup";
        if (type === "error") {
            popup.classList.add("error");
            popup.innerHTML = '<i class="bx bx-error-circle"></i> ' + message;
        } else {
            popup.innerHTML = '<i class="bx bx-check-circle"></i> ' + message;
        }
        
        popup.classList.add("show");
        
        setTimeout(() => {
            popup.classList.remove("show");
        }, 3000);
    }
});