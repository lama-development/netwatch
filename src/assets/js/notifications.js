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

    // Chiave per localStorage
    const VIEWED_ALERTS_KEY = 'netwatch_viewed_alerts';

    // Inizializza
    init();

    // Gestione degli eventi
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

    // Funzione di inizializzazione
    function init() {
        // Se siamo nella pagina degli alert, segna tutti gli alert come letti
        if (isOnAlertsPage) {
            markAllAsRead();
        }
        
        // Carica le notifiche
        fetchNotifications();
        
        // Aggiorna le notifiche ogni 30 secondi
        setInterval(fetchNotifications, 30000);
    }

    // Funzione per caricare le notifiche
    async function fetchNotifications() {
        try {
            // Carica solo gli alert attivi e recenti (ultimi 7 giorni)
            const response = await fetch('/api/alerts?status=active&limit=5');
            if (!response.ok) {
                throw new Error('Errore nel caricamento delle notifiche');
            }
            
            const data = await response.json();
            notifications = data.alerts || [];
            
            // Aggiorna l'interfaccia
            updateNotificationUI();
        } catch (error) {
            console.error('Errore nel recupero delle notifiche:', error);
        }
    }

    // Funzione per aggiornare l'interfaccia delle notifiche
    function updateNotificationUI() {
        // Svuota la lista delle notifiche
        notificationList.innerHTML = '';
        
        // Ottieni la lista degli alert già visualizzati
        const viewedAlerts = getViewedAlerts();
        
        // Verifica se ci sono notifiche non lette
        hasUnreadNotifications = notifications.some(notification => 
            !viewedAlerts.includes(notification.id));
        
        // Se siamo nella pagina degli alert, segna tutto come letto
        if (isOnAlertsPage && hasUnreadNotifications) {
            markAllAsRead();
            hasUnreadNotifications = false;
        }
        
        // Aggiorna il badge di notifica
        updateNotificationBadge();
        
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
        
        // Aggiungi event listener
        li.addEventListener('click', () => {
            markAsRead(notification.id);
            window.location.href = `/alerts?id=${notification.id}`;
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
        const viewed = localStorage.getItem(VIEWED_ALERTS_KEY);
        return viewed ? JSON.parse(viewed) : [];
    }

    // Funzione per impostare gli alert visualizzati
    function setViewedAlerts(alertIds) {
        localStorage.setItem(VIEWED_ALERTS_KEY, JSON.stringify(alertIds));
    }

    // Funzione per segnare un alert come letto
    function markAsRead(alertId) {
        const viewedAlerts = getViewedAlerts();
        if (!viewedAlerts.includes(alertId)) {
            viewedAlerts.push(alertId);
            setViewedAlerts(viewedAlerts);
            
            // Aggiorna l'interfaccia
            updateNotificationUI();
        }
    }

    // Funzione per segnare tutti gli alert come letti
    function markAllAsRead() {
        const alertIds = notifications.map(alert => alert.id);
        setViewedAlerts([...getViewedAlerts(), ...alertIds]);
        
        // Svuota la lista delle notifiche - mostrando il messaggio "Nessuna notifica"
        notificationList.innerHTML = '<div class="empty-notification">Nessuna notifica</div>';
        
        // Aggiorna l'interfaccia rimuovendo il badge
        hasUnreadNotifications = false;
        updateNotificationBadge();
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
        event.stopPropagation();
        notificationDropdown.classList.toggle('show');
    }
});