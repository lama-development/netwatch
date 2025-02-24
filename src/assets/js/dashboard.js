const body = document.querySelector("body");
const darkLight = document.querySelector("#darkLight");
const sidebar = document.querySelector(".sidebar");
const submenuItems = document.querySelectorAll(".submenu_item");
const sidebarOpen = document.querySelector("#sidebarOpen");
const sidebarClose = document.querySelector(".collapse_sidebar");
const sidebarExpand = document.querySelector(".expand_sidebar");

sidebarOpen.addEventListener("click", () => sidebar.classList.toggle("close"));

// Close sidebar on button click
sidebarClose.addEventListener("click", () => {
    sidebar.classList.add("close", "hoverable");
});

// Expand sidebar on button click
sidebarExpand.addEventListener("click", () => {
    sidebar.classList.remove("close", "hoverable");
});

darkLight.addEventListener("click", () => {
    body.classList.toggle("dark");
    if (body.classList.contains("dark")) {
        document.setI
        darkLight.classList.replace("bx-sun", "bx-moon");
    } else {
        darkLight.classList.replace("bx-moon", "bx-sun");
    }
});

if (window.innerWidth < 768) {
    sidebar.classList.add("close");
} else {
    sidebar.classList.remove("close");
}