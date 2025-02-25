// /src/assets/js/theme.js

const lightTheme = {
    '--color-bg': '#fff',
    '--color-navbar': '#f5f5f5',
    '--color-hover': '#eaeaec',
    '--color-accent': '#4894e7',
    '--color-text': '#000'
};

const darkTheme = {
    '--color-bg': '#232323',
    '--color-navbar': '#171717',
    '--color-hover': '#2f2f2f',
    '--color-accent': '#4894e7',
    '--color-text': '#fff'
};

let currentTheme = 'light';

function setTheme(theme) {
    const themeProperties = theme === 'light' ? lightTheme : darkTheme;
    for (let prop in themeProperties) {
        document.documentElement.style.setProperty(prop, themeProperties[prop]);
    }
}

// Funzione per aggiornare l'icona
function updateThemeIcon(themeBtn, theme) {
    if (theme === 'dark') {
        themeBtn.classList.replace("bx-sun", "bx-moon");
    } else {
        themeBtn.classList.replace("bx-moon", "bx-sun");
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // VCheck if there is a saved theme in local storage
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    // Apply the saved theme
    setTheme(savedTheme);
    currentTheme = savedTheme;

    fetch("/navbar")
        .then(response => response.text())
        .then(data => {
            // Load navbar.html into navbar-component div
            document.getElementById("navbar-component").innerHTML = data;
            // After the navbar is loaded, find the theme button
            const themeBtn = document.querySelector("#theme");
            if (!themeBtn) {
                console.log("Theme button not found!");
                return;
            }

            // Set icon theme based on the current theme
            updateThemeIcon(themeBtn, currentTheme);

            themeBtn.addEventListener("click", () => {
                if (currentTheme === 'light') {
                    setTheme('dark');
                    currentTheme = 'dark';
                    updateThemeIcon(themeBtn, 'dark');
                } else {
                    setTheme('light');
                    currentTheme = 'light';
                    updateThemeIcon(themeBtn, 'light');
                }

                // Save preference to local storage
                localStorage.setItem('theme', currentTheme);
            });
        })
        .catch(error => {
            console.log("Error loading the navbar:", error);
        });
});

