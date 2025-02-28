document.addEventListener("DOMContentLoaded", function () {
    const countOnlineEl = document.getElementById("count-online");
    const countOfflineEl = document.getElementById("count-offline");
    const countUnknownEl = document.getElementById("count-unknown");

    // Create an EventSource to listen to the SSE endpoint
    const eventSource = new EventSource("/stream/device_status");

    eventSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            // Update the DOM with the new metrics
            countOnlineEl.textContent = data.online;
            countOfflineEl.textContent = data.offline;
            countUnknownEl.textContent = data.unknown;
        } catch (e) {
            console.error("Error parsing event data:", e);
        }
    };

    eventSource.onerror = function (error) {
        console.error("EventSource error:", error);
    };
});
