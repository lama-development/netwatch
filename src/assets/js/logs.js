// /src/assets/js/logs.js

function initLogStream() {
    const logElement = document.getElementById("log");
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

            // Auto-scroll to end of page
            // window.scrollTo(0, document.body.scrollHeight);
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

// Init log stream on DOM load
document.addEventListener("DOMContentLoaded", initLogStream);