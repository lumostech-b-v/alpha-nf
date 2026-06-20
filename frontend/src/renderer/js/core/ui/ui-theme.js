/**
 * UI Theme - Theme and settings
 */
(function() {
    'use strict';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme selector if it exists
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.value = theme;
        }
        
        // Update theme toggle button icon
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            const icon = themeToggleBtn.querySelector('.icon');
            if (icon) {
                icon.setAttribute('data-lucide', theme === 'light' ? 'sun' : 'moon');
                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }
        
        // Add smooth transition
        document.body.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 300);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        window.ui.applyTheme(newTheme);
        
        // Update theme toggle button icon
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            const icon = themeToggleBtn.querySelector('.icon');
            if (icon) {
                icon.setAttribute('data-lucide', newTheme === 'light' ? 'sun' : 'moon');
                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }

    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.applyTheme = applyTheme;
    window.uiFunctions.toggleTheme = toggleTheme;
})();