document.addEventListener("DOMContentLoaded", function () {
    const countOnlineEl = document.getElementById("count-online");
    const countOfflineEl = document.getElementById("count-offline");
    const countUnknownEl = document.getElementById("count-unknown");

    const dateInfo = document.getElementById("date-info");
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateInfo.textContent = today.toLocaleDateString('en-US', options);

    // Data di esempio, in un'applicazione reale dovresti ottenere questi valori da un backend o API
    const onlineDevices = 12;
    const offlineDevices = 5;
    const unknownDevices = 3;

    // Creazione del grafico
    const ctx = document.getElementById('statusChart').getContext('2d');
    const statusChart = new Chart(ctx, {
        type: 'bar',  // Puoi anche usare 'line', 'pie', ecc.
        data: {
            labels: ['Online', 'Offline', 'Unknown'],  // Etichette per le categorie
            datasets: [{
                label: 'Device Status',
                data: [onlineDevices, offlineDevices, unknownDevices],  // Dati dei dispositivi
                backgroundColor: ['#28a745', '#dc3545', '#ffc107'],
                borderColor: ['#28a745', '#dc3545', '#ffc107'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,  // Assicurati che l'asse Y parta da zero
                }
            }
        }
    });

    // Funzione per aggiornare il grafico
    function updateDeviceStatus(online, offline, unknown) {
        statusChart.data.datasets[0].data = [online, offline, unknown];
        statusChart.update();
    }

    // Esegui l'aggiornamento con i dati iniziali
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
