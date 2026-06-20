/**
 * UI Controller - Main file that combines all UI functions
 * Creates window.ui object with all UI functions attached
 */

(function() {
    'use strict';

    // Ensure uiState exists (should be loaded before this file)
    if (!window.uiState) {
        console.error('ui-state.js must be loaded before ui.js');
        window.uiState = {};
    }

    // Ensure uiFunctions exists (should be populated by individual modules)
    if (!window.uiFunctions) {
        console.error('UI function modules must be loaded before ui.js');
        window.uiFunctions = {};
    }

    // Create window.ui object with all functions
    window.ui = {};

    // Attach all functions from uiFunctions to window.ui
    Object.keys(window.uiFunctions).forEach(functionName => {
        window.ui[functionName] = window.uiFunctions[functionName];
    });

    // Add state getter
    Object.defineProperty(window.ui, 'state', {
        get: function() {
            return window.uiState;
        },
        enumerable: false,
        configurable: true
    });

    // Initialize after a short delay to ensure all modules are loaded
    setTimeout(function() {
        if (window.ui.initialize) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    window.ui.initialize();
                });
            } else {
                window.ui.initialize();
            }
        }
    }, 0);

    console.log('UI Controller initialized');
})();

