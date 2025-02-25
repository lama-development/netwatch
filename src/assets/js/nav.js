// /src/assets/js/nav.js

fetch("/sidebar")
    .then(response => response.text())
    .then(data => {
        // Load sidebar.html into the sidebar-component div
        document.getElementById("sidebar-component").innerHTML = data;

        const sidebar = document.querySelector(".sidebar");
        const sidebarCollapsed = document.querySelector(".sidebar-collapsed");
        const sidebarExpanded = document.querySelector(".sidebar-expanded");

        // Check sidebar state in local storage
        const sidebarState = localStorage.getItem('sidebarState') || 'expanded';

        // ISet sidebar state based on the saved state
        if (sidebarState === 'collapsed') {
            sidebar.classList.add("collapsed");
        } else {
            sidebar.classList.remove("collapsed");
        }

        // Collapse sidebar on button click
        sidebarCollapsed.addEventListener("click", () => {
            sidebar.classList.add("collapsed");
            localStorage.setItem('sidebarState', 'collapsed');
        });
        // Expand sidebar on button click
        sidebarExpanded.addEventListener("click", () => {
            sidebar.classList.remove("collapsed");
            localStorage.setItem('sidebarState', 'expanded')
        });
    });