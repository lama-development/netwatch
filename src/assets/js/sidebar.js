document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.querySelector(".sidebar");
    const sidebarCollapsed = document.querySelector(".sidebar-collapsed");
    const sidebarExpanded = document.querySelector(".sidebar-expanded");
    const mainContent = document.querySelector("main");
    const bodyElement = document.body;

    // Function to create mobile overlay
    function createMobileOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "mobile-overlay";
        overlay.addEventListener("click", closeSidebarOnMobile);
        document.body.appendChild(overlay);
    }

    // Function to remove mobile overlay if it exists
    function removeMobileOverlay() {
        const overlay = document.querySelector(".mobile-overlay");
        if (overlay) {
            overlay.remove();
        }
    }

    // Function to close sidebar on mobile
    function closeSidebarOnMobile() {
        sidebar.classList.add("collapsed");
        removeMobileOverlay();
        localStorage.setItem('sidebarState', 'collapsed');
    }

    // Get saved sidebar state or use collapsed as default
    const savedSidebarState = localStorage.getItem('sidebarState') || 'collapsed';
    
    // Set initial sidebar state
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

    // Add event listener for collapse button
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

    // Add event listener for expand button
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

    // Highlight active link
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
        
        // Add tooltips to links when sidebar is collapsed
        link.addEventListener("mouseenter", function(event) {
            if (sidebar.classList.contains("collapsed")) {
                showTooltip(event, link.querySelector(".sidebar-text").textContent.trim());
            }
        });
        link.addEventListener("mouseleave", hideTooltip);
    });
});

// Function to convert icons from outline to filled
function convertIconToFilled(icon) {
    const classes = icon.className.split(" ");
    if (classes.length > 1 && classes[1].startsWith("bx-")) {
        classes[1] = classes[1].replace("bx-", "bxs-");
    }
    icon.className = classes.join(" ");
}

// Function to create and position tooltip
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

// Function to remove tooltip
function hideTooltip() {
    document.querySelectorAll(".sidebar-tooltip").forEach(el => el.remove());
}