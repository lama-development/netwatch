function initLogStream() {
    const logElement = document.getElementById("log");
    let autoScroll = true;
    const scrollThreshold = 10; // Pixels threshold to consider "at bottom"

    // Listen for scroll events on the log element
    logElement.addEventListener('scroll', () => {
        // Determine if the log container is scrolled to the bottom (within a threshold)
        const atBottom = logElement.scrollHeight - logElement.scrollTop - logElement.clientHeight < scrollThreshold;
        autoScroll = atBottom;
    });

    const evtSource = new EventSource("/stream");

    evtSource.onmessage = function (event) {
        if (event.data) {
            // Extract timestamp and message from the event data using regex
            const timestamp = event.data.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\] > /);
            const message = event.data.replace(timestamp ? timestamp[0] : '', '').trim();

            // Create new log message and timestamp element
            const newLogMessage = document.createElement("div");
            const timestampElement = document.createElement("span");
            timestampElement.classList.add("log-timestamp");
            timestampElement.textContent = timestamp ? timestamp[0] : '';
            const messageElement = document.createElement("span");

            // Set color based on message content
            if (message.includes("online")) {
                messageElement.classList.add("log-online");
            } else if (message.includes("retrying")) {
                messageElement.classList.add("log-retrying");
            } else if (message.includes("offline")) {
                messageElement.classList.add("log-offline");
            } else {
                messageElement.classList.add("log-default");
            }

            messageElement.textContent = message;

            // Add timestamp and message to the new log message element
            newLogMessage.appendChild(timestampElement);
            newLogMessage.appendChild(messageElement);

            // Add new log message to the log element
            logElement.appendChild(newLogMessage);

            // Auto-scroll to the bottom if autoScroll is true
            if (autoScroll) {
                logElement.scrollTop = logElement.scrollHeight;
            }
        }
    };

    evtSource.onerror = function (err) {
        console.error("EventSource failed:", err);
        evtSource.close();
    };

    window.addEventListener("beforeunload", function () {
        evtSource.close();
    });
}

// Initialize the log stream when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initLogStream);