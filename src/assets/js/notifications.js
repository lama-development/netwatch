document.addEventListener("DOMContentLoaded", function() {
    // Elementi DOM
    const notificationBell = document.getElementById('notifications-bell');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const notificationList = document.getElementById('notification-list');
    const markAllReadBtn = document.getElementById('mark-all-read');

    // Stato
    let notifications = [];
    let isOnAlertsPage = window.location.pathname === '/alerts';
    let hasUnreadNotifications = false;
    let eventsInitialized = false;

    // Chiave per localStorage
    const VIEWED_ALERTS_KEY = 'netwatch_viewed_alerts';

    // Inizializza
    init();

    // Configura Server-Sent Events per gli alert in tempo reale
    let alertsEventSource = null;
    
    function setupSSE() {
        // Chiudi la connessione esistente se presente
        if (alertsEventSource) {
            alertsEventSource.close();
        }
        
        // Crea una nuova connessione SSE
        alertsEventSource = new EventSource('/stream/alerts');
        
        alertsEventSource.onopen = function() {
            console.log("Connessione SSE stabilita");
        };
        
        alertsEventSource.onerror = function(e) {
            console.error("Errore nella connessione SSE:", e);
            // Riprova a connetterti dopo 5 secondi
            setTimeout(setupSSE, 5000);
        };
        
        alertsEventSource.onmessage = function(event) {
            try {
                const newAlerts = JSON.parse(event.data);
                if (newAlerts && newAlerts.length > 0) {
                    console.log("Ricevuti nuovi alert in tempo reale:", newAlerts);
                    
                    // Forza il pallino rosso a mostrarsi immediatamente
                    hasUnreadNotifications = true;
                    updateNotificationBadge();
                    
                    // Ricarica immediatamente le notifiche
                    fetchNotifications();
                    
                    // Mostra una notifica temporanea
                    showSystemNotification("Nuovo alert", "È stato rilevato un nuovo alert nel sistema.");
                }
            } catch (e) {
                console.error("Errore durante l'elaborazione degli alert in tempo reale:", e);
            }
        };
    }
    
    // Funzione per mostrare notifiche di sistema (browser)
    function showSystemNotification(title, body) {
        // Verifica che le notifiche del browser siano supportate
        if (!("Notification" in window)) {
            return;
        }
        
        // Verifica il permesso per le notifiche
        if (Notification.permission === "granted") {
            new Notification(title, { body: body, icon: '/static/img/netwatch.png' });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, { body: body, icon: '/static/img/netwatch.png' });
                }
            });
        }
    }

    // Gestione degli eventi
    function setupEventListeners() {
        if (eventsInitialized) return;
        
        notificationBell.addEventListener('click', toggleNotificationsDropdown);
        markAllReadBtn.addEventListener('click', markAllAsRead);
        
        // Click fuori dal dropdown per chiuderlo
        document.addEventListener('click', function(event) {
            const isClickInside = notificationBell.contains(event.target) || 
                                notificationDropdown.contains(event.target);
            
            if (!isClickInside && notificationDropdown.classList.contains('show')) {
                notificationDropdown.classList.remove('show');
            }
        });
        
        eventsInitialized = true;
    }

    // Funzione di inizializzazione
    function init() {
        console.log("Inizializzazione del sistema di notifiche...");
        
        // Aggiorna lo stato della pagina corrente
        isOnAlertsPage = window.location.pathname === '/alerts';
        
        // Configura gli event listener
        setupEventListeners();
        
        // Se siamo nella pagina degli alert, segna tutti gli alert come letti
        if (isOnAlertsPage) {
            markAllAsRead();
        }
        
        // Configura la connessione eventi in tempo reale
        setupSSE();
        
        // Carica le notifiche
        fetchNotifications();
        
        // Aggiorna le notifiche ogni 15 secondi (intervallo ridotto)
        setInterval(fetchNotifications, 15000);
    }

    // Funzione per caricare le notifiche
    async function fetchNotifications() {
        try {
            console.log("Recupero notifiche dal server...");
            
            // Carica solo gli alert attivi e recenti
            const response = await fetch('/api/alerts?status=active&limit=10');
            if (!response.ok) {
                throw new Error('Errore nel caricamento delle notifiche');
            }
            
            const data = await response.json();
            notifications = data.alerts || [];
            
            console.log("Notifiche caricate:", notifications.length);
            
            // Aggiorna l'interfaccia
            updateNotificationUI();
        } catch (error) {
            console.error('Errore nel recupero delle notifiche:', error);
        }
    }

    // Funzione per aggiornare l'interfaccia delle notifiche
    function updateNotificationUI() {
        console.log("Aggiornamento UI delle notifiche...");
        
        // Svuota la lista delle notifiche
        notificationList.innerHTML = '';
        
        // Ottieni la lista degli alert già visualizzati
        const viewedAlerts = getViewedAlerts();
        
        // Verifica se ci sono notifiche non lette
        const foundUnread = notifications.some(notification => 
            !viewedAlerts.includes(notification.id));
        
        // Se siamo nella pagina degli alert, segna tutto come letto
        if (isOnAlertsPage) {
            console.log("Ci troviamo nella pagina alert, segno tutti gli alert come letti");
            // Salva gli ID per marcarli come letti, ma non rimuovere la lista
            const alertIds = notifications.map(alert => alert.id);
            if (alertIds.length > 0) {
                setViewedAlerts([...new Set([...getViewedAlerts(), ...alertIds])]);
            }
            hasUnreadNotifications = false;
        } else {
            // Aggiorna lo stato delle notifiche non lette solo se non siamo nella pagina degli alert
            hasUnreadNotifications = foundUnread;
        }
        
        // Aggiorna il badge in base allo stato
        updateNotificationBadge();
        
        console.log("Notifiche non lette:", hasUnreadNotifications);
        console.log("Numero totale di notifiche:", notifications.length);
        
        // Se non ci sono notifiche, mostra messaggio vuoto
        if (notifications.length === 0) {
            notificationList.innerHTML = '<div class="empty-notification">Nessuna notifica</div>';
            return;
        }
        
        // Popola la lista delle notifiche
        notifications.forEach(notification => {
            const isUnread = !viewedAlerts.includes(notification.id);
            const notificationItem = createNotificationItem(notification, isUnread);
            notificationList.appendChild(notificationItem);
        });
    }

    // Funzione per creare un elemento della notifica
    function createNotificationItem(notification, isUnread) {
        const li = document.createElement('li');
        li.className = 'notification-item' + (isUnread ? ' unread' : '');
        li.dataset.id = notification.id; // Aggiungi l'ID come attributo data per facile riferimento
        
        // Formatta la data
        const timestamp = new Date(notification.timestamp);
        const timeAgo = getTimeAgo(timestamp);
        
        // Determina l'icona in base alla severità
        let icon;
        switch(notification.severity) {
            case 'critical':
                icon = '<i class="bx bxs-error-circle notification-icon critical"></i>';
                break;
            case 'warning':
                icon = '<i class="bx bxs-error notification-icon warning"></i>';
                break;
            default:
                icon = '<i class="bx bxs-info-circle notification-icon info"></i>';
        }
        
        // Crea il contenuto HTML
        li.innerHTML = `
            <div class="notification-content">
                ${icon}
                <div class="notification-message">
                    <h4 class="notification-title">${notification.message}</h4>
                    <p class="notification-text">Dispositivo: ${notification.device_name}</p>
                    <div class="notification-time">${timeAgo}</div>
                </div>
            </div>
        `;
        
        // Gestisci il click sulla notifica
        li.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const alertId = notification.id;
            console.log("Click su notifica:", alertId);
            
            // Rimuovi la notifica dall'array e aggiorna UI prima della navigazione
            notifications = notifications.filter(n => n.id !== alertId);
            
            // Marca come letta
            markAsRead(alertId);
            
            // Chiudi il dropdown
            notificationDropdown.classList.remove('show');
            
            // Naviga alla pagina alert con un breve ritardo
            setTimeout(() => {
                window.location.href = `/alerts?id=${alertId}`;
            }, 100);
        });
        
        return li;
    }

    // Funzione per formattare il tempo relativo
    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        let interval = Math.floor(seconds / 31536000);
        if (interval > 1) return `${interval} anni fa`;
        if (interval === 1) return `1 anno fa`;
        
        interval = Math.floor(seconds / 2592000);
        if (interval > 1) return `${interval} mesi fa`;
        if (interval === 1) return `1 mese fa`;
        
        interval = Math.floor(seconds / 86400);
        if (interval > 1) return `${interval} giorni fa`;
        if (interval === 1) return `1 giorno fa`;
        
        interval = Math.floor(seconds / 3600);
        if (interval > 1) return `${interval} ore fa`;
        if (interval === 1) return `1 ora fa`;
        
        interval = Math.floor(seconds / 60);
        if (interval > 1) return `${interval} minuti fa`;
        if (interval === 1) return `1 minuto fa`;
        
        return `${Math.floor(seconds)} secondi fa`;
    }

    // Funzione per ottenere gli alert già visualizzati
    function getViewedAlerts() {
        try {
            const viewed = localStorage.getItem(VIEWED_ALERTS_KEY);
            return viewed ? JSON.parse(viewed) : [];
        } catch (e) {
            console.error("Errore nel recupero degli alert visualizzati:", e);
            return [];
        }
    }

    // Funzione per impostare gli alert visualizzati
    function setViewedAlerts(alertIds) {
        try {
            localStorage.setItem(VIEWED_ALERTS_KEY, JSON.stringify(alertIds));
        } catch (e) {
            console.error("Errore nel salvataggio degli alert visualizzati:", e);
        }
    }

    // Funzione per segnare un alert come letto
    function markAsRead(alertId) {
        console.log("Marcando come letto l'alert:", alertId);
        
        try {
            const viewedAlerts = getViewedAlerts();
            
            // Aggiungi l'ID alla lista solo se non è già presente
            if (!viewedAlerts.includes(alertId)) {
                viewedAlerts.push(alertId);
                setViewedAlerts(viewedAlerts);
            }
            
            // Aggiorna lo stato di hasUnreadNotifications
            updateUnreadState();
            
            // Aggiorna l'interfaccia delle notifiche
            updateNotificationUI();
        } catch (e) {
            console.error("Errore nel marcare l'alert come letto:", e);
        }
    }
    
    // Funzione per aggiornare lo stato di hasUnreadNotifications
    function updateUnreadState() {
        const viewedAlerts = getViewedAlerts();
        hasUnreadNotifications = notifications.some(notification => 
            !viewedAlerts.includes(notification.id));
        
        updateNotificationBadge();
    }

    // Funzione per segnare tutti gli alert come letti
    function markAllAsRead() {
        console.log("Marcando tutti gli alert come letti");
        
        if (notifications.length === 0) {
            return;
        }
        
        try {
            // Ottieni tutti gli ID degli alert e aggiungili alla lista dei visualizzati
            const alertIds = notifications.map(alert => alert.id);
            const viewedAlerts = getViewedAlerts();
            
            // Usa Set per rimuovere duplicati
            const newViewedAlerts = [...new Set([...viewedAlerts, ...alertIds])];
            setViewedAlerts(newViewedAlerts);
            
            // Aggiorna UI
            hasUnreadNotifications = false;
            updateNotificationBadge();
            
            // Aggiorna la lista
            notificationList.innerHTML = '<div class="empty-notification">Nessuna notifica non letta</div>';
        } catch (e) {
            console.error("Errore nel marcare tutti gli alert come letti:", e);
        }
    }

    // Funzione per aggiornare il badge delle notifiche
    function updateNotificationBadge() {
        if (hasUnreadNotifications) {
            notificationBadge.classList.add('show');
        } else {
            notificationBadge.classList.remove('show');
        }
    }

    // Funzione per aprire/chiudere il dropdown delle notifiche
    function toggleNotificationsDropdown(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const isOpen = notificationDropdown.classList.contains('show');
        
        if (!isOpen) {
            // Se stiamo aprendo, forza un aggiornamento delle notifiche
            fetchNotifications();
        }
        
        notificationDropdown.classList.toggle('show');
    }
    
    // Esporta funzioni per test e debug
    window.netwatch = window.netwatch || {};
    window.netwatch.notifications = {
        fetchNotifications,
        updateNotificationUI,
        markAllAsRead,
        getViewedAlerts
    };
});