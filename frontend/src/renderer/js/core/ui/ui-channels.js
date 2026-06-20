/**
 * UI Channels - Channel selection and rendering
 */
(function() {
    'use strict';

    function renderChannelSelector() {
        const container = document.getElementById('channelsSelect');
        if (!container) {
            return;
        }
    
        container.innerHTML = '';
    
        const wrapper = document.createElement('div');
        wrapper.className = 'channels-select-wrapper';
    
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'channels-chips';
    
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'channels-dropdown';
    
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'channels-search';
        searchInput.placeholder = 'Search channels...';
    
        const optionsList = document.createElement('div');
        optionsList.className = 'channels-options';
    
        const renderChips = () => {
            chipsContainer.innerHTML = '';
    
            if (window.uiState.selectedChannels.length === 0) {
                const placeholder = document.createElement('span');
                placeholder.className = 'channels-placeholder';
                placeholder.textContent = 'Select channels...';
                chipsContainer.appendChild(placeholder);
                return;
            }
    
            window.uiState.selectedChannels.forEach(channel => {
                const chip = document.createElement('span');
                chip.className = 'channel-chip';
                chip.textContent = channel;
    
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'chip-remove';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = `Remove ${channel}`;
                removeBtn.addEventListener('click', () => {
                    window.uiState.selectedChannels = window.uiState.selectedChannels.filter(item => item !== channel);
                    renderChips();
                    renderOptions();
                });
    
                chip.appendChild(removeBtn);
                chipsContainer.appendChild(chip);
            });
        };
    
        const renderOptions = () => {
            const searchTerm = searchInput.value.trim().toLowerCase();
            optionsList.innerHTML = '';
    
            const filtered = window.uiState.availableChannels.filter(channel =>
                !window.uiState.selectedChannels.includes(channel) && channel.toLowerCase().includes(searchTerm)
            );
    
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'channels-option empty';
                empty.textContent = 'No channels available';
                optionsList.appendChild(empty);
                return;
            }
    
            filtered.forEach(channel => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'channels-option';
                option.textContent = channel;
                option.addEventListener('click', () => {
                    window.uiState.selectedChannels.push(channel);
                    renderChips();
                    renderOptions();
                });
                optionsList.appendChild(option);
            });
        };
    
        searchInput.addEventListener('input', renderOptions);
    
        dropdownContainer.appendChild(searchInput);
        dropdownContainer.appendChild(optionsList);
    
        wrapper.appendChild(chipsContainer);
        wrapper.appendChild(dropdownContainer);
    
        container.appendChild(wrapper);
    
        renderChips();
        renderOptions();
    }

    function renderSessionChannelSelector() {
        const container = document.getElementById('sessionChannelsSelect');
        if (!container) return;
    
        container.innerHTML = '';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'channels-select-wrapper';
    
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'channels-chips';
    
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'channels-dropdown';
    
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'channels-search';
        searchInput.placeholder = 'Search channels...';
    
        const optionsList = document.createElement('div');
        optionsList.className = 'channels-options';
    
        // Use default selected channels for sessions
        const selectedChannels = ['C3', 'C4', 'Cz'];
    
        const renderChips = () => {
            chipsContainer.innerHTML = '';
            selectedChannels.forEach(channel => {
                const chip = document.createElement('span');
                chip.className = 'channel-chip';
                chip.textContent = channel;
    
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'chip-remove';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = `Remove ${channel}`;
                removeBtn.addEventListener('click', () => {
                    const index = selectedChannels.indexOf(channel);
                    if (index > -1) {
                        selectedChannels.splice(index, 1);
                        renderChips();
                        renderOptions();
                    }
                });
    
                chip.appendChild(removeBtn);
                chipsContainer.appendChild(chip);
            });
        };
    
        const renderOptions = () => {
            const searchTerm = searchInput.value.trim().toLowerCase();
            optionsList.innerHTML = '';
    
            const filtered = window.uiState.availableChannels.filter(channel =>
                !selectedChannels.includes(channel) && channel.toLowerCase().includes(searchTerm)
            );
    
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'channels-option empty';
                empty.textContent = 'No channels available';
                optionsList.appendChild(empty);
                return;
            }
    
            filtered.forEach(channel => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'channels-option';
                option.textContent = channel;
                option.addEventListener('click', () => {
                    selectedChannels.push(channel);
                    renderChips();
                    renderOptions();
                });
                optionsList.appendChild(option);
            });
        };
    
        searchInput.addEventListener('input', renderOptions);
    
        dropdownContainer.appendChild(searchInput);
        dropdownContainer.appendChild(optionsList);
    
        wrapper.appendChild(chipsContainer);
        wrapper.appendChild(dropdownContainer);
    
        container.appendChild(wrapper);
    
        renderChips();
        renderOptions();
    }

    function getSelectedChannels() {
        return [...window.uiState.selectedChannels];
    }

    function setSelectedChannels(channels) {
        // Set the selected channels for the live session
        window.uiState.selectedChannels = [...channels];
        
        // Re-render the channel selector to show the selected channels
        window.ui.renderChannelSelector();
        
        console.log('Selected channels set to:', window.uiState.selectedChannels);
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.renderChannelSelector = renderChannelSelector;
    window.uiFunctions.renderSessionChannelSelector = renderSessionChannelSelector;
    window.uiFunctions.getSelectedChannels = getSelectedChannels;
    window.uiFunctions.setSelectedChannels = setSelectedChannels;
})();