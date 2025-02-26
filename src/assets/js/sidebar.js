// /src/assets/js/sidebar.js

fetch("/sidebar")
    .then(response => response.text())
    .then(data => {
        // Load sidebar.html into the sidebar-component div
        document.getElementById("sidebar-component").innerHTML = data;

        const sidebar = document.querySelector(".sidebar");
        const sidebarCollapsed = document.querySelector(".sidebar-collapsed");
        const sidebarExpanded = document.querySelector(".sidebar-expanded");
        const mainContent = document.querySelector("main");

        // Check sidebar state in local storage
        const sidebarState = localStorage.getItem('sidebarState') || 'expanded';

        // ISet sidebar state based on the saved state
        if (sidebarState === 'collapsed') {
            sidebar.classList.add("collapsed");
            mainContent.classList.add("sidebar-collapsed");
        } else {
            sidebar.classList.remove("collapsed");
            mainContent.classList.remove("sidebar-collapsed");
        }

        // Collapse sidebar on button click
        sidebarCollapsed.addEventListener("click", () => {
            sidebar.classList.add("collapsed");
            mainContent.classList.add("sidebar-collapsed");
            localStorage.setItem('sidebarState', 'collapsed');
        });
        // Expand sidebar on button click
        sidebarExpanded.addEventListener("click", () => {
            sidebar.classList.remove("collapsed");
            mainContent.classList.remove("sidebar-collapsed");
            localStorage.setItem('sidebarState', 'expanded')
        });

        // --- Active Link and Icon Modification ---
        const sidebarLinks = document.querySelectorAll(".sidebar-link");
        const currentPath = window.location.pathname;

        sidebarLinks.forEach(link => {
            const linkPath = link.getAttribute("href");

            // Check if the current URL matches the link's href.
            if (linkPath === currentPath || (linkPath !== "/" && currentPath.startsWith(linkPath))) {
                // Mark the link as active.
                link.classList.add("active");

                // Update the icon to the filled version by converting the second "bx" class.
                const icon = link.querySelector("i");
                if (icon) {
                    convertIconToFilled(icon);
                }
            }
        });

        // --- Tooltip Functionality ---
        sidebarLinks.forEach(link => {
            link.addEventListener("mouseenter", function (event) {
                if (sidebar.classList.contains("collapsed")) {
                    showTooltip(event, link.querySelector(".sidebar-text").textContent.trim());
                }
            });

            link.addEventListener("mouseleave", hideTooltip);
        });
    });

// Function to convert icon classes from outline (bx) to filled (bxs)
function convertIconToFilled(icon) {
    // Split the class string into an array of classes.
    const classes = icon.className.split(" ");

    // Ensure there is at least a second class and that it starts with "bx-"
    if (classes.length > 1 && classes[1].startsWith("bx-")) {
        classes[1] = classes[1].replace("bx-", "bxs-");
    }

    // Reassign the updated classes back to the element.
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
    tooltip.style.left = `${rect.right + 10}px`; // Position next to the icon
    tooltip.style.transform = "translateY(-50%)"; // Center vertically
}

// Function to remove tooltip
function hideTooltip() {
    document.querySelectorAll(".sidebar-tooltip").forEach(el => el.remove());
}