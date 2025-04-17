document.addEventListener("DOMContentLoaded", function() {
    // DOM elements
    const totalAlertsElement = document.getElementById("total-alerts");
    const criticalCountElement = document.querySelector("#level-critical .level-count");
    const warningCountElement = document.querySelector("#level-warning .level-count");
    const infoCountElement = document.querySelector("#level-info .level-count");
    const alertsTableBody = document.getElementById("alerts-table-body");
    const historyTableBody = document.getElementById("history-table-body");
    const noAlertsMessage = document.getElementById("no-alerts-message");
    const noHistoryMessage = document.getElementById("no-history-message");
    const paginationContainer = document.getElementById("pagination");
    const historyPaginationContainer = document.getElementById("history-pagination");
    const filterSeverity = document.getElementById("filter-severity");
    const historySeverity = document.getElementById("history-severity");
    const historyDays = document.getElementById("history-days");
    const alertModal = document.getElementById("alert-modal");
    const activeAlertsBtn = document.getElementById("active-alerts-btn");
    const alertHistoryBtn = document.getElementById("alert-history-btn");
    const activeAlertsSection = document.getElementById("active-alerts-section");
    const alertHistorySection = document.getElementById("alert-history-section");

    // Gestore specifico per il pulsante di chiusura del modale
    document.querySelector(".close-modal").addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation(); // Evita la propagazione dell'evento
        document.getElementById("alert-modal").classList.remove("show");
    });

    // State management
    let allAlerts = []; // Will store all active alerts
    let historyAlerts = []; // Will store historic alerts
    let filteredAlerts = []; // Will store filtered active alerts
    let filteredHistory = []; // Will store filtered history alerts
    let currentPage = 1;
    let historyPage = 1;
    const itemsPerPage = 10;
    let currentAlertId = null;
    let currentView = "active"; // 'active' or 'history'
    
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
    let historySortColumn = "timestamp";
    let historySortDirection = -1;
    
    // Flag to track if alerts are loading for the first time
    let isInitialLoad = true;

    // Load alerts on page load
    loadAlerts();
    
    // Set up automatic refresh interval (every 30 seconds)
    setInterval(loadAlerts, 30000);

    // Event listeners for view switching
    activeAlertsBtn.addEventListener("click", function() {
        switchView("active");
    });
    
    alertHistoryBtn.addEventListener("click", function() {
        switchView("history");
        loadAlertHistory(); // Load history data when switching to that view
    });

    // Event listeners for filters
    filterSeverity.addEventListener("change", function() {
        applyFilters("active");
    });
    
    historySeverity.addEventListener("change", function() {
        applyFilters("history");
    });
    
    historyDays.addEventListener("change", function() {
        loadAlertHistory(); // Reload history with new time frame
    });
    
    // Also close modal when clicking outside of the modal content
    if (alertModal) {
        alertModal.addEventListener("click", (event) => {
            // Close only if clicking on the background, not the modal content
            if (event.target === alertModal) {
                alertModal.classList.remove("show");
            }
        });
    }

    // Function to switch between active alerts and history views
    function switchView(view) {
        currentView = view;
        
        if (view === "active") {
            activeAlertsBtn.classList.add("selected");
            alertHistoryBtn.classList.remove("selected");
            activeAlertsSection.classList.remove("hidden");
            alertHistorySection.classList.add("hidden");
        } else {
            activeAlertsBtn.classList.remove("selected");
            alertHistoryBtn.classList.add("selected");
            activeAlertsSection.classList.add("hidden");
            alertHistorySection.classList.remove("hidden");
        }
    }

    // Load active alerts from the API
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
            
            // Get active alerts
            let apiUrl = "/api/alerts?exclude_resolved=true";
            
            // Fetch all active alerts
            const alertsResponse = await fetch(apiUrl);
            if (!alertsResponse.ok) {
                throw new Error("Failed to fetch alerts");
            }
            
            const data = await alertsResponse.json();
            allAlerts = data.alerts || [];
            
            // Apply any active filters
            applyFilters("active");
            
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
    
    // Load alert history from the API
    async function loadAlertHistory() {
        try {
            // Get selected time frame
            const days = historyDays.value;
            
            // Fetch alert history
            const historyResponse = await fetch(`/api/alerts/history?days=${days}`);
            if (!historyResponse.ok) {
                throw new Error("Failed to fetch alert history");
            }
            
            const data = await historyResponse.json();
            historyAlerts = data.alerts || [];
            
            // Apply any active filters
            applyFilters("history");
            
        } catch (error) {
            console.error("Error loading alert history:", error);
            showPopup("Error loading alert history. Please try again.", "error");
        }
    }
    
    // Update dashboard counts
    function updateDashboardCounts() {
        totalAlertsElement.textContent = summary.total || "0";
        criticalCountElement.textContent = summary.critical || "0";
        warningCountElement.textContent = summary.warning || "0";
        infoCountElement.textContent = summary.info || "0";
    }
    
    // Apply filters to the alerts list
    function applyFilters(viewType) {
        if (viewType === "active") {
            const severityFilter = filterSeverity.value;
            
            filteredAlerts = allAlerts.filter(alert => {
                // Apply severity filter
                if (severityFilter !== "all" && alert.severity !== severityFilter) {
                    return false;
                }
                return true;
            });
            
            // Reset to first page when filtering
            currentPage = 1;
            
            // Render the filtered and sorted alerts
            renderAlerts();
        } else { // history view
            const severityFilter = historySeverity.value;
            
            filteredHistory = historyAlerts.filter(alert => {
                // Apply severity filter
                if (severityFilter !== "all" && alert.severity !== severityFilter) {
                    return false;
                }
                return true;
            });
            
            // Reset to first page when filtering
            historyPage = 1;
            
            // Render the filtered and sorted history
            renderHistory();
        }
    }
    
    // Render active alerts in the table
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
        
        const tableContainer = alertsTableBody.closest('.table-container');
        
        // Show/hide the no alerts message and table elements
        if (filteredAlerts.length === 0) {
            noAlertsMessage.classList.remove("hidden");
            paginationContainer.classList.add("hidden");
            if (tableContainer) tableContainer.classList.add("hidden");
        } else {
            noAlertsMessage.classList.add("hidden");
            paginationContainer.classList.remove("hidden");
            if (tableContainer) tableContainer.classList.remove("hidden");
            
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
                            <button class="detail-button" data-id="${alert.id}" data-tooltip="Details">
                                <i class='bx bx-info-circle'></i>
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
                    showAlertDetails(alertId, "active");
                });
            });
            
            // Render pagination
            renderPagination(filteredAlerts.length, currentPage, paginationContainer, (page) => {
                currentPage = page;
                renderAlerts();
            });
        }
    }
    
    // Render alert history in the table
    function renderHistory() {
        // Sort history if a sort column is selected
        if (historySortColumn) {
            filteredHistory.sort((a, b) => {
                const valA = a[historySortColumn];
                const valB = b[historySortColumn];
                
                if (valA < valB) return -1 * historySortDirection;
                if (valA > valB) return 1 * historySortDirection;
                return 0;
            });
        }
        
        // Clear the table body
        historyTableBody.innerHTML = "";
        
        const tableContainer = historyTableBody.closest('.table-container');
        
        // Show/hide the no history message and table elements
        if (filteredHistory.length === 0) {
            noHistoryMessage.classList.remove("hidden");
            historyPaginationContainer.classList.add("hidden");
            if (tableContainer) tableContainer.classList.add("hidden");
        } else {
            noHistoryMessage.classList.add("hidden");
            historyPaginationContainer.classList.remove("hidden");
            if (tableContainer) tableContainer.classList.remove("hidden");
            
            // Apply pagination
            const startIndex = (historyPage - 1) * itemsPerPage;
            const paginatedHistory = filteredHistory.slice(startIndex, startIndex + itemsPerPage);
            
            // Add rows to the table
            paginatedHistory.forEach(alert => {
                const row = document.createElement("tr");
                
                // Format timestamps
                const startTime = new Date(alert.timestamp);
                const formattedStartDate = startTime.toLocaleDateString();
                const formattedStartTime = startTime.toLocaleTimeString();
                
                let formattedEndDate = "-";
                let formattedEndTime = "";
                if (alert.resolved_at) {
                    const endTime = new Date(alert.resolved_at);
                    formattedEndDate = endTime.toLocaleDateString();
                    formattedEndTime = endTime.toLocaleTimeString();
                }
                
                // Format duration
                const duration = alert.duration || "-";
                
                // Create a badge for the severity
                const severityBadge = `<span class="alert-badge ${alert.severity}">${alert.severity}</span>`;
                
                // Create a badge for the status
                const statusClass = alert.status === "resolved" ? "resolved" : "active";
                const statusBadge = `<span class="status-badge ${statusClass}">${alert.status}</span>`;
                
                row.innerHTML = `
                    <td>${formattedStartDate} ${formattedStartTime}</td>
                    <td>${formattedEndDate} ${formattedEndTime}</td>
                    <td>${duration}</td>
                    <td>${alert.device_name}</td>
                    <td>${severityBadge}</td>
                    <td>${alert.type}</td>
                    <td>${alert.message}</td>
                    <td>${statusBadge}</td>
                `;
                
                row.addEventListener("click", function() {
                    showAlertDetails(alert.id, "history");
                });
                
                historyTableBody.appendChild(row);
            });
            
            // Render pagination
            renderPagination(filteredHistory.length, historyPage, historyPaginationContainer, (page) => {
                historyPage = page;
                renderHistory();
            });
        }
    }
    
    // Handle clicking on alert details button or row
    async function showAlertDetails(alertId, viewType) {
        try {
            // Fetch full alert details
            const response = await fetch(`/api/alerts/${alertId}`);
            if (!response.ok) {
                throw new Error("Failed to fetch alert details");
            }
            
            const alertData = await response.json();
            if (!alertData) {
                showPopup("Alert not found", "error");
                return;
            }
            
            // Store the current alert ID for modal actions
            currentAlertId = alertId;
            
            // Format timestamps for display
            const timestamp = new Date(alertData.timestamp);
            const formattedDateTime = `${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            
            // Update modal content
            document.getElementById("modal-device").textContent = alertData.device_name;
            document.getElementById("modal-time").textContent = formattedDateTime;
            document.getElementById("modal-type").textContent = alertData.type;
            document.getElementById("modal-severity").textContent = alertData.severity;
            document.getElementById("modal-status").textContent = alertData.status;
            document.getElementById("modal-message").textContent = alertData.message;
            document.getElementById("modal-description").textContent = alertData.description || "No additional description available.";
            
            // Show/hide resolved details
            const resolvedDetails = document.querySelectorAll(".resolved-detail");
            if (alertData.status === "resolved" && alertData.resolved_at) {
                resolvedDetails.forEach(el => el.classList.remove("hidden"));
                
                const resolvedTime = new Date(alertData.resolved_at);
                const formattedResolvedTime = `${resolvedTime.toLocaleDateString()} ${resolvedTime.toLocaleTimeString()}`;
                
                document.getElementById("modal-resolved-at").textContent = formattedResolvedTime;
                document.getElementById("modal-duration").textContent = alertData.duration || "Unknown";
                document.getElementById("modal-resolution-note").textContent = alertData.resolution_note || "No notes available";
            } else {
                resolvedDetails.forEach(el => el.classList.add("hidden"));
            }
            
            // Show the modal
            alertModal.classList.add("show");
            
        } catch (error) {
            console.error("Error fetching alert details:", error);
            showPopup("Error fetching alert details", "error");
        }
    }
    
    // Render pagination controls
    function renderPagination(totalItems, currentPageNum, container, callback) {
        if (!container) return;
        
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        container.innerHTML = "";
        
        // Create previous button
        const prevButton = document.createElement("button");
        prevButton.textContent = "Previous";
        prevButton.disabled = currentPageNum === 1;
        prevButton.addEventListener("click", () => {
            if (currentPageNum > 1) {
                callback(currentPageNum - 1);
            }
        });
        container.appendChild(prevButton);
        
        // Create page info
        const pageInfo = document.createElement("span");
        pageInfo.textContent = `Page ${currentPageNum} of ${totalPages || 1}`;
        container.appendChild(pageInfo);
        
        // Create next button
        const nextButton = document.createElement("button");
        nextButton.textContent = "Next";
        nextButton.disabled = currentPageNum === totalPages || totalPages === 0;
        nextButton.addEventListener("click", () => {
            if (currentPageNum < totalPages) {
                callback(currentPageNum + 1);
            }
        });
        container.appendChild(nextButton);
    }
    
    // Add sorting functionality to table headers
    document.querySelectorAll("#active-alerts-section th[data-sort]").forEach(th => {
        th.addEventListener("click", function() {
            const sortKey = this.getAttribute("data-sort");
            
            // Toggle sort direction or set new sort column
            if (currentSortColumn === sortKey) {
                currentSortDirection *= -1;
            } else {
                currentSortColumn = sortKey;
                currentSortDirection = -1; // Default to newest first
            }
            
            // Reset all sort icons to default
            document.querySelectorAll("#active-alerts-section th[data-sort] i").forEach(icon => {
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
    
    // Add sorting functionality to history table headers
    document.querySelectorAll("#alert-history-section th[data-sort]").forEach(th => {
        th.addEventListener("click", function() {
            const sortKey = this.getAttribute("data-sort");
            
            // Toggle sort direction or set new sort column
            if (historySortColumn === sortKey) {
                historySortDirection *= -1;
            } else {
                historySortColumn = sortKey;
                historySortDirection = -1; // Default to newest first
            }
            
            // Reset all sort icons to default
            document.querySelectorAll("#alert-history-section th[data-sort] i").forEach(icon => {
                icon.className = "bx bx-sort";
            });
            
            // Update icon for clicked header
            const icon = this.querySelector("i");
            if (icon) {
                icon.className = historySortDirection === 1 ? "bx bx-sort-up" : "bx bx-sort-down";
            }
            
            renderHistory();
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