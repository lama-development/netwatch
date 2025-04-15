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

// Function to update the theme icon
function updateThemeIcon(themeBtn, theme) {
    if (theme === 'dark') {
        themeBtn.classList.replace("bx-sun", "bx-moon");
    } else {
        themeBtn.classList.replace("bx-moon", "bx-sun");
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Check if there's a saved theme in localStorage
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    // Apply the saved theme
    setTheme(savedTheme);
    currentTheme = savedTheme;

    // Find the theme button directly (now it's already in the DOM)
    const themeBtn = document.querySelector("#theme");
    if (!themeBtn) {
        console.log("Theme button not found!");
        return;
    }

    // Set the theme icon based on the current theme
    updateThemeIcon(themeBtn, currentTheme);

    // Add event listener for theme toggle
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

        // Save preference in localStorage
        localStorage.setItem('theme', currentTheme);
    });
});

