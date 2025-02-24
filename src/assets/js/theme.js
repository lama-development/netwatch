// /src/assets/js/theme.js

const body = document.querySelector("body");
const theme = document.querySelector("#theme");

theme.addEventListener("click", () => {
    body.classList.toggle("dark");
    if (body.classList.contains("dark")) {
        document.setI
        theme.classList.replace("bx-sun", "bx-moon");
    } else {
        theme.classList.replace("bx-moon", "bx-sun");
    }
});