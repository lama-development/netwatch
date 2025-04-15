// /src/assets/js/navbar.js

const lightTheme = {
    '--color-bg': '#fff',
    '--color-navbar': '#f5f5f5',
    '--color-hover': '#eaeaec',
    '--color-accent': '#4894e7',
    '--color-text': '#000',
    '--color-text-secondary': '#333',
    '--color-pure': '#fff'
};

const darkTheme = {
    '--color-bg': '#232323',
    '--color-navbar': '#171717',
    '--color-hover': '#2f2f2f',
    '--color-accent': '#4894e7',
    '--color-text': '#fff',
    '--color-text-secondary': '#ccc',
    '--color-pure': '#fff'
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
    // Verifica se c'è un tema salvato nel localStorage
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    // Applica il tema salvato
    setTheme(savedTheme);
    currentTheme = savedTheme;

    // Trova il pulsante del tema direttamente (ora è già presente nel DOM)
    const themeBtn = document.querySelector("#theme");
    if (!themeBtn) {
        console.log("Theme button not found!");
        return;
    }

    // Imposta l'icona del tema in base al tema corrente
    updateThemeIcon(themeBtn, currentTheme);

    // Aggiungi event listener per il cambio tema
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

        // Salva preferenza nel localStorage
        localStorage.setItem('theme', currentTheme);
    });
});

