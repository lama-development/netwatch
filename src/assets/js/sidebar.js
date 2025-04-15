// /src/assets/js/sidebar.js

document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.querySelector(".sidebar");
    const sidebarCollapsed = document.querySelector(".sidebar-collapsed");
    const sidebarExpanded = document.querySelector(".sidebar-expanded");
    const mainContent = document.querySelector("main");
    const bodyElement = document.body;

    // Funzione per creare l'overlay mobile
    function createMobileOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "mobile-overlay";
        overlay.addEventListener("click", closeSidebarOnMobile);
        document.body.appendChild(overlay);
    }

    // Funzione per rimuovere l'overlay mobile se esiste
    function removeMobileOverlay() {
        const overlay = document.querySelector(".mobile-overlay");
        if (overlay) {
            overlay.remove();
        }
    }

    // Funzione per chiudere la sidebar su mobile
    function closeSidebarOnMobile() {
        sidebar.classList.add("collapsed");
        removeMobileOverlay();
        localStorage.setItem('sidebarState', 'collapsed');
    }

    // Recupera lo stato salvato della sidebar o usa collapsed come default
    const savedSidebarState = localStorage.getItem('sidebarState') || 'collapsed';
    
    // Imposta lo stato iniziale della sidebar
    if (savedSidebarState === 'collapsed') {
        sidebar.classList.add("collapsed");
        if (window.innerWidth > 768) {
            mainContent.classList.add("sidebar-collapsed");
            bodyElement.classList.add("sidebar-collapsed");
        } else {
            removeMobileOverlay();
        }
    } else {
        sidebar.classList.remove("collapsed");
        if (window.innerWidth > 768) {
            mainContent.classList.remove("sidebar-collapsed");
            bodyElement.classList.remove("sidebar-collapsed");
        } else {
            createMobileOverlay();
        }
    }

    // Aggiungi event listener per il pulsante di collasso
    if (sidebarCollapsed) {
        sidebarCollapsed.addEventListener("click", () => {
            sidebar.classList.add("collapsed");
            if (window.innerWidth > 768) {
                mainContent.classList.add("sidebar-collapsed");
                bodyElement.classList.add("sidebar-collapsed");
            } else {
                removeMobileOverlay();
            }
            localStorage.setItem('sidebarState', 'collapsed');
        });
    }

    // Aggiungi event listener per il pulsante di espansione
    if (sidebarExpanded) {
        sidebarExpanded.addEventListener("click", () => {
            sidebar.classList.remove("collapsed");
            if (window.innerWidth > 768) {
                mainContent.classList.remove("sidebar-collapsed");
                bodyElement.classList.remove("sidebar-collapsed");
            } else {
                createMobileOverlay();
            }
            localStorage.setItem('sidebarState', 'expanded');
        });
    }

    // Evidenzia il link attivo
    const sidebarLinks = document.querySelectorAll(".sidebar-link");
    const currentPath = window.location.pathname;

    sidebarLinks.forEach(link => {
        const linkPath = link.getAttribute("href");

        if (linkPath === currentPath || (linkPath !== "/" && currentPath.startsWith(linkPath))) {
            link.classList.add("active");
            const icon = link.querySelector("i");
            if (icon) {
                convertIconToFilled(icon);
            }
        }
        
        // Aggiungi tooltip sui link quando la sidebar è collassata
        link.addEventListener("mouseenter", function(event) {
            if (sidebar.classList.contains("collapsed")) {
                showTooltip(event, link.querySelector(".sidebar-text").textContent.trim());
            }
        });
        link.addEventListener("mouseleave", hideTooltip);
    });
});

// Funzione per convertire le icone da outline a filled
function convertIconToFilled(icon) {
    const classes = icon.className.split(" ");
    if (classes.length > 1 && classes[1].startsWith("bx-")) {
        classes[1] = classes[1].replace("bx-", "bxs-");
    }
    icon.className = classes.join(" ");
}

// Funzione per creare e posizionare il tooltip
function showTooltip(event, text) {
    let tooltip = document.createElement("div");
    tooltip.className = "sidebar-tooltip";
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = `${rect.top + window.scrollY + rect.height / 2}px`;
    tooltip.style.left = `${rect.right + 10}px`;
    tooltip.style.transform = "translateY(-50%)";
}

// Funzione per rimuovere il tooltip
function hideTooltip() {
    document.querySelectorAll(".sidebar-tooltip").forEach(el => el.remove());
}