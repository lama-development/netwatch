document.addEventListener("DOMContentLoaded", function () {
    const countOnlineEl = document.getElementById("count-online");
    const countOfflineEl = document.getElementById("count-offline");
    const countUnknownEl = document.getElementById("count-unknown");

    const dateInfo = document.getElementById("date-info");
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateInfo.textContent = today.toLocaleDateString('en-US', options);

    // Example data - in a real application, you would get these values from a backend or API
    const onlineDevices = 12;
    const offlineDevices = 5;
    const unknownDevices = 3;

    // Create the chart
    const ctx = document.getElementById('statusChart').getContext('2d');
    const statusChart = new Chart(ctx, {
        type: 'pie',  // You can also use 'line', 'pie', etc.
        data: {
            labels: ['Online', 'Offline', 'Unknown'],  // Labels for categories
            datasets: [{
                label: 'Device Status',
                data: [onlineDevices, offlineDevices, unknownDevices],  // Device data
                backgroundColor: ['#28a745', '#dc3545', '#6c757d'],
                borderColor: ['#28a745', '#dc3545', '#6c757d'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,  // Ensure the Y axis starts at zero
                }
            }
        }
    });

    // Function to update the chart
    function updateDeviceStatus(online, offline, unknown) {
        statusChart.data.datasets[0].data = [online, offline, unknown];
        statusChart.update();
    }

    // Perform the update with the initial data
    updateDeviceStatus(onlineDevices, offlineDevices, unknownDevices);

    // Create an EventSource to listen to the SSE endpoint
    const eventSource = new EventSource("/stream/device_status");

    eventSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            // Update the DOM with the new metrics
            countOnlineEl.textContent = data.online;
            countOfflineEl.textContent = data.offline;
            countUnknownEl.textContent = data.unknown;
            updateDeviceStatus(data.online, data.offline, data.unknown)
        } catch (e) {
            console.error("Error parsing event data:", e);
        }
    };

    eventSource.onerror = function (error) {
        console.error("EventSource error:", error);
    };
});
