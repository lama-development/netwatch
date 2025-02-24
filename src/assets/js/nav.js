// /src/assets/js/nav.js

const sidebar = document.querySelector(".sidebar");
const sidebarCollapsed = document.querySelector(".sidebar-collapsed");
const sidebarExpanded = document.querySelector(".sidebar-expanded");

// Load navbar.html into the navbar-component div
document.addEventListener("DOMContentLoaded", function () {
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("navbar-component").innerHTML = data;
        });
});

// Load sidebar.html into the sidebar-component div
document.addEventListener("DOMContentLoaded", function () {
    fetch("sidebar.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("sidebar-component").innerHTML = data;
        });
});

// Collapse sidebar on button click
sidebarCollapsed.addEventListener("click", () => {
    sidebar.classList.add("collapsed");
});

// Expand sidebar on button click
sidebarExpanded.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
});

if (window.innerWidth < 768) {
    sidebar.classList.add("collapsed");
} else {
    sidebar.classList.remove("collapsed");
}